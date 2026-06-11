"""
service.py — Shared RAG Service
===============================
Initialises the corpus index and exposes a reusable ticket analysis helper
for both the CLI and FastAPI layers.
"""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Add the code directory to the path so imports work when launched from
# either the project root or the code/ directory.
sys.path.insert(0, str(Path(__file__).parent))

from indexer import get_or_build_index, clear_index_cache
from retriever import HybridRetriever
from classifier import get_classification_guidance
from agent import process_ticket


PROJECT_ROOT = Path(__file__).parent.parent
DATA_ROOT = PROJECT_ROOT / "data"


class SupportTicketRAGService:
    """Lazy-initialised RAG service shared by the CLI and API."""

    def __init__(self, use_reranker: bool = True):
        self.use_reranker = use_reranker
        self.data_root = DATA_ROOT
        self._load_environment()
        self.index = None
        self.metadata = []
        self.embedding_model = None
        self.retriever = None
        self.refresh_index(force_rebuild=False)

    def _load_environment(self) -> None:
        env_path = PROJECT_ROOT / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        else:
            load_dotenv()

    def _build_retriever(self) -> None:
        self.retriever = HybridRetriever(
            self.index,
            self.metadata,
            self.embedding_model,
            use_reranker=self.use_reranker,
        )

    def with_reranker(self, use_reranker: bool) -> "SupportTicketRAGService":
        """Create a lightweight view over the loaded corpus with a new reranker mode."""
        if use_reranker == self.use_reranker:
            return self

        clone = object.__new__(SupportTicketRAGService)
        clone.use_reranker = use_reranker
        clone.data_root = self.data_root
        clone.index = self.index
        clone.metadata = self.metadata
        clone.embedding_model = self.embedding_model
        clone.retriever = HybridRetriever(
            clone.index,
            clone.metadata,
            clone.embedding_model,
            use_reranker=use_reranker,
        )
        return clone

    def refresh_index(self, force_rebuild: bool = False) -> Dict[str, Any]:
        """Load or rebuild the corpus index and refresh the retriever."""
        if force_rebuild:
            clear_index_cache()

        self.index, self.metadata, self.embedding_model = get_or_build_index(
            str(self.data_root),
            force_rebuild=force_rebuild,
        )
        self._build_retriever()

        return {
            "documents": len(self.metadata),
            "companies": sorted(self.retriever._company_indices.keys()),
            "reranker": "on" if self.retriever.reranker is not None else "off",
        }

    def upsert_corpus_document(
        self,
        relative_path: str,
        content: str,
        force_rebuild: bool = True,
    ) -> Dict[str, Any]:
        """Write a corpus document under data/ and refresh the index."""
        root = self.data_root.resolve()
        destination = (root / relative_path).resolve()

        try:
            destination.relative_to(root)
        except ValueError as exc:
            raise ValueError("Corpus path must stay inside the data directory") from exc

        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")

        refresh_stats = self.refresh_index(force_rebuild=force_rebuild)
        refresh_stats["path"] = str(destination)
        refresh_stats["updated"] = True
        return refresh_stats

    def retrieve(
        self,
        issue: str,
        subject: str = "",
        company: Optional[str] = None,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """Return the most relevant documents for a ticket."""
        company_for_search = company if company and company.lower() not in ("none", "") else None
        query = f"{subject} {issue}".strip()
        return self.retriever.retrieve(query=query, company=company_for_search, top_k=top_k)

    def analyse_ticket(
        self,
        issue: str,
        subject: str = "",
        company: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run retrieval, safety guidance, and generation for one ticket."""
        retrieved_docs = self.retrieve(issue=issue, subject=subject, company=company)
        return self.analyse_ticket_from_docs(
            issue=issue,
            subject=subject,
            company=company,
            retrieved_docs=retrieved_docs,
            provider=provider,
        )

    def analyse_ticket_from_docs(
        self,
        issue: str,
        subject: str,
        company: Optional[str],
        retrieved_docs: List[Dict[str, Any]],
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a response for pre-retrieved documents."""
        provider_name = provider or os.environ.get("LLM_PROVIDER", "ollama")
        max_score = self.retriever.get_max_relevance_score(retrieved_docs)
        guidance = self.build_classification_guidance(
            issue=issue,
            subject=subject,
            company=company,
            retrieved_docs=retrieved_docs,
        )

        result = process_ticket(
            issue=issue,
            subject=subject,
            company=company,
            retrieved_docs=retrieved_docs,
            classification_guidance=guidance,
            provider=provider_name,
        )

        response = {
            "ticket": {
                "issue": issue,
                "subject": subject,
                "company": company or "",
            },
            "retrieval": {
                "max_relevance_score": max_score,
                "documents": retrieved_docs,
            },
            "classification_guidance": guidance,
            "result": result,
        }
        return response

    def build_classification_guidance(
        self,
        issue: str,
        subject: str,
        company: Optional[str],
        retrieved_docs: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Expose the same safety guidance used by the generation path."""
        max_score = self.retriever.get_max_relevance_score(retrieved_docs)
        return get_classification_guidance(
            issue=issue,
            subject=subject,
            company=company,
            retrieval_results=retrieved_docs,
            max_relevance_score=max_score,
        )

