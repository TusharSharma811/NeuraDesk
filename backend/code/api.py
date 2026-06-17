"""
api.py — FastAPI interface for the support RAG system.

The corpus index is loaded during app startup so requests reuse the same
prebuilt service. Corpus refresh and streaming analysis are exposed as HTTP
endpoints for deployment use.
"""

from contextlib import asynccontextmanager
from pathlib import Path
import json
import sys
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Add the code directory to the path so imports work when launched from the
# project root or via Docker.
sys.path.insert(0, str(Path(__file__).parent))

from service import SupportTicketRAGService


def _parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _resolve_stream_flag(
    request: Request,
    body_stream: Optional[bool],
    header_stream: Optional[str],
) -> bool:
    query_stream = _parse_bool(request.query_params.get("stream"))
    header_value = _parse_bool(header_stream or request.headers.get("stream") or request.headers.get("x-stream"))
    for candidate in (body_stream, query_stream, header_value):
        if candidate is not None:
            return candidate
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.service = SupportTicketRAGService(use_reranker=True)
    yield


app = FastAPI(
    title="Support Ticket RAG API",
    version="1.1.0",
    description="HTTP access to the HackerRank Orchestrate RAG pipeline.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TicketRequest(BaseModel):
    issue: str = Field(..., description="Ticket issue or description")
    subject: str = Field(default="", description="Optional subject line")
    company: Optional[str] = Field(default=None, description="Optional company name")
    provider: Optional[str] = Field(
        default=None,
        description="LLM provider to use: ollama, gemini, or groq",
    )
    use_reranker: bool = Field(
        default=True,
        description="Enable the cross-encoder reranker when retrieving context",
    )
    stream: bool = Field(
        default=False,
        description="Stream progress events instead of returning one JSON response",
    )


class CorpusUpsertRequest(BaseModel):
    path: str = Field(..., description="Relative path under data/ where the markdown file should be written")
    content: str = Field(..., description="Markdown content to write to the corpus")
    force_rebuild: bool = Field(
        default=True,
        description="Force the vector index to rebuild after the write",
    )


class CorpusRefreshRequest(BaseModel):
    force_rebuild: bool = Field(
        default=False,
        description="Force a full cache rebuild instead of loading cached artifacts",
    )


def _get_service(request: Request):
    service = getattr(request.app.state, "service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Service is not ready yet")
    return service


def _stream_ticket_analysis(service, request: TicketRequest) -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        yield f"event: status\ndata: {json.dumps({'stage': 'retrieving'})}\n\n"
        retrieved_docs = service.retrieve(
            issue=request.issue,
            subject=request.subject,
            company=request.company,
        )
        yield f"event: retrieval\ndata: {json.dumps({'count': len(retrieved_docs), 'documents': retrieved_docs})}\n\n"

        max_score = service.retriever.get_max_relevance_score(retrieved_docs)
        guidance = service.build_classification_guidance(
            issue=request.issue,
            subject=request.subject,
            company=request.company,
            retrieved_docs=retrieved_docs,
        )
        yield f"event: guidance\ndata: {json.dumps(guidance)}\n\n"

        result = service.analyse_ticket_from_docs(
            issue=request.issue,
            subject=request.subject,
            company=request.company,
            retrieved_docs=retrieved_docs,
            provider=request.provider,
        )
        yield f"event: result\ndata: {json.dumps(result)}\n\n"
        yield "event: done\ndata: {\"status\": \"complete\"}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/health")
def health(request: Request) -> Dict[str, Any]:
    service = _get_service(request)
    return {
        "status": "ok",
        "documents": len(service.metadata),
        "companies": sorted(service.retriever._company_indices.keys()),
        "reranker": "on" if service.retriever.reranker is not None else "off",
    }


@app.post("/rag/retrieve")
def retrieve_context(http_request: Request, request: TicketRequest) -> Dict[str, Any]:
    service = _get_service(http_request).with_reranker(request.use_reranker)
    documents = service.retrieve(
        issue=request.issue,
        subject=request.subject,
        company=request.company,
    )
    return {
        "ticket": {
            "issue": request.issue,
            "subject": request.subject,
            "company": request.company or "",
        },
        "documents": documents,
    }


@app.post("/rag/analyse")
def analyse_ticket(
    http_request: Request,
    request: TicketRequest,
    stream: Optional[str] = Header(default=None),
) -> Any:
    service = _get_service(http_request).with_reranker(request.use_reranker)
    should_stream = _resolve_stream_flag(http_request, request.stream, stream)
    if should_stream:
        return _stream_ticket_analysis(service, request)
    return service.analyse_ticket(
        issue=request.issue,
        subject=request.subject,
        company=request.company,
        provider=request.provider,
    )


@app.post("/rag/analyze")
def analyze_ticket(
    http_request: Request,
    request: TicketRequest,
    stream: Optional[str] = Header(default=None),
) -> Any:
    """US-spelled alias for clients that prefer analyze over analyse."""
    return analyse_ticket(http_request, request, stream=stream)


@app.post("/rag/batch")
def batch_analyse(http_request: Request, requests: List[TicketRequest]) -> Dict[str, Any]:
    if not requests:
        raise HTTPException(status_code=400, detail="At least one ticket is required")

    first = requests[0]
    service = _get_service(http_request)
    results = []
    for request in requests:
        results.append(
            service.with_reranker(request.use_reranker).analyse_ticket(
                issue=request.issue,
                subject=request.subject,
                company=request.company,
                provider=request.provider,
            )
        )

    return {"count": len(results), "results": results}


@app.post("/corpus/refresh")
def refresh_corpus(http_request: Request, request: CorpusRefreshRequest) -> Dict[str, Any]:
    service = _get_service(http_request)
    stats = service.refresh_index(force_rebuild=request.force_rebuild)
    return {"status": "refreshed", **stats}


@app.post("/corpus/upsert")
def upsert_corpus_document(http_request: Request, request: CorpusUpsertRequest) -> Dict[str, Any]:
    service = _get_service(http_request)
    try:
        return {"status": "updated", **service.upsert_corpus_document(
            relative_path=request.path,
            content=request.content,
            force_rebuild=request.force_rebuild,
        )}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
