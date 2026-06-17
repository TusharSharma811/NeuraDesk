"""
retriever.py — Hybrid Retriever
=================================
Combines FAISS semantic search with BM25 keyword search using
Reciprocal Rank Fusion (RRF). Optionally reranks with a cross-encoder.

Design decisions documented in Details.md §3.2.
"""

import re
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import faiss
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer, CrossEncoder

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
DEFAULT_TOP_K = 5
INITIAL_CANDIDATES = 20  # Retrieve this many before reranking
RRF_K = 60  # Reciprocal Rank Fusion constant (standard value)
MIN_RELEVANCE_SCORE = 0.25  # Below this, the corpus likely doesn't cover the topic


# ---------------------------------------------------------------------------
# Tokeniser for BM25
# ---------------------------------------------------------------------------
def _tokenize(text: str) -> List[str]:
    """Simple whitespace + punctuation tokeniser for BM25."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return [t for t in text.split() if len(t) > 1]


# ---------------------------------------------------------------------------
# Hybrid Retriever class
# ---------------------------------------------------------------------------
class HybridRetriever:
    """Combines FAISS vector search with BM25 keyword search.
    
    Features:
    - Company-scoped search when company is known
    - Reciprocal Rank Fusion to merge ranked lists
    - Cross-encoder reranking for final top-K selection
    """

    def __init__(
        self,
        faiss_index: faiss.Index,
        metadata: List[Dict[str, Any]],
        embedding_model: SentenceTransformer,
        use_reranker: bool = True,
    ):
        self.faiss_index = faiss_index
        self.metadata = metadata
        self.embedding_model = embedding_model
        
        # Build BM25 index over all chunk texts
        print("[retriever] Building BM25 index...")
        self.corpus_tokens = [_tokenize(m["text"]) for m in metadata]
        self.bm25 = BM25Okapi(self.corpus_tokens)
        
        # Build per-company indices for scoped search
        self._company_indices: Dict[str, List[int]] = {}
        for i, m in enumerate(metadata):
            company = m["company"].lower()
            if company not in self._company_indices:
                self._company_indices[company] = []
            self._company_indices[company].append(i)
        
        # Load cross-encoder reranker
        self.reranker: Optional[CrossEncoder] = None
        if use_reranker:
            print(f"[retriever] Loading reranker: {RERANKER_MODEL}")
            self.reranker = CrossEncoder(RERANKER_MODEL)
        
        print(f"[retriever] Ready. {len(metadata)} chunks, "
              f"{len(self._company_indices)} companies, "
              f"reranker={'ON' if use_reranker else 'OFF'}")

    def _semantic_search(
        self, query: str, top_k: int, candidate_ids: Optional[List[int]] = None
    ) -> List[Tuple[int, float]]:
        """Perform FAISS semantic search.
        
        Returns list of (chunk_index, similarity_score) tuples.
        """
        query_embedding = self.embedding_model.encode(
            [query], normalize_embeddings=True
        ).astype(np.float32)
        
        if candidate_ids is not None and len(candidate_ids) < len(self.metadata):
            # Scoped search: search only within candidate_ids
            # Create a temporary index with only the candidate vectors
            # This is more efficient than searching the full index and filtering
            n_candidates = len(candidate_ids)
            search_k = min(top_k, n_candidates)
            
            # Search the full index and filter
            scores, indices = self.faiss_index.search(query_embedding, len(self.metadata))
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx in set(candidate_ids):
                    results.append((int(idx), float(score)))
                    if len(results) >= top_k:
                        break
            return results
        else:
            scores, indices = self.faiss_index.search(query_embedding, top_k)
            return [(int(idx), float(score)) for idx, score in zip(indices[0], scores[0])]

    def _bm25_search(
        self, query: str, top_k: int, candidate_ids: Optional[List[int]] = None
    ) -> List[Tuple[int, float]]:
        """Perform BM25 keyword search.
        
        Returns list of (chunk_index, bm25_score) tuples.
        """
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []
        
        scores = self.bm25.get_scores(query_tokens)
        
        if candidate_ids is not None:
            # Only consider candidate indices
            scored = [(i, scores[i]) for i in candidate_ids if scores[i] > 0]
        else:
            scored = [(i, s) for i, s in enumerate(scores) if s > 0]
        
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    def _reciprocal_rank_fusion(
        self,
        semantic_results: List[Tuple[int, float]],
        bm25_results: List[Tuple[int, float]],
    ) -> List[Tuple[int, float]]:
        """Merge two ranked lists using Reciprocal Rank Fusion.
        
        RRF score = sum(1 / (k + rank)) across all lists.
        This is more robust than simple score averaging because FAISS and BM25
        use incomparable score scales.
        """
        rrf_scores: Dict[int, float] = {}
        
        for rank, (idx, _) in enumerate(semantic_results):
            rrf_scores[idx] = rrf_scores.get(idx, 0) + 1.0 / (RRF_K + rank + 1)
        
        for rank, (idx, _) in enumerate(bm25_results):
            rrf_scores[idx] = rrf_scores.get(idx, 0) + 1.0 / (RRF_K + rank + 1)
        
        merged = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        return merged

    def _rerank(
        self, query: str, candidates: List[Tuple[int, float]], top_k: int
    ) -> List[Tuple[int, float]]:
        """Rerank candidates using the cross-encoder.
        
        The cross-encoder processes (query, document) pairs together,
        producing much more accurate relevance scores than bi-encoder search.
        """
        if self.reranker is None or not candidates:
            return candidates[:top_k]
        
        pairs = [(query, self.metadata[idx]["text"]) for idx, _ in candidates]
        rerank_scores = self.reranker.predict(pairs)
        
        reranked = [
            (candidates[i][0], float(rerank_scores[i]))
            for i in range(len(candidates))
        ]
        reranked.sort(key=lambda x: x[1], reverse=True)
        return reranked[:top_k]

    def retrieve(
        self,
        query: str,
        company: Optional[str] = None,
        top_k: int = DEFAULT_TOP_K,
    ) -> List[Dict[str, Any]]:
        """Retrieve the most relevant corpus chunks for a query.
        
        Args:
            query: The ticket's issue text.
            company: Optional company filter ('hackerrank', 'claude', 'visa').
            top_k: Number of chunks to return.
        
        Returns:
            List of dicts with keys: text, source_file, company, category,
            title, relevance_score.
        """
        # Determine candidate pool
        candidate_ids = None
        if company and company.lower() not in ("none", ""):
            company_key = company.lower()
            if company_key in self._company_indices:
                candidate_ids = self._company_indices[company_key]
        
        # Run both retrieval strategies
        n_candidates = INITIAL_CANDIDATES
        semantic_results = self._semantic_search(query, n_candidates, candidate_ids)
        bm25_results = self._bm25_search(query, n_candidates, candidate_ids)
        
        # Fuse results
        fused = self._reciprocal_rank_fusion(semantic_results, bm25_results)
        
        # If company-scoped search returned too few results, broaden to all
        if candidate_ids is not None and len(fused) < top_k:
            semantic_all = self._semantic_search(query, n_candidates)
            bm25_all = self._bm25_search(query, n_candidates)
            fused_all = self._reciprocal_rank_fusion(semantic_all, bm25_all)
            # Add global results not already present
            existing_ids = {idx for idx, _ in fused}
            for idx, score in fused_all:
                if idx not in existing_ids:
                    fused.append((idx, score))
                    existing_ids.add(idx)
                if len(fused) >= n_candidates:
                    break
        
        # Rerank top candidates
        top_candidates = fused[:n_candidates]
        reranked = self._rerank(query, top_candidates, top_k)
        
        # Build result dicts
        results = []
        for idx, score in reranked:
            meta = self.metadata[idx].copy()
            meta["relevance_score"] = score
            results.append(meta)
        
        return results

    def get_max_relevance_score(self, results: List[Dict[str, Any]]) -> float:
        """Get the highest relevance score from retrieval results.
        
        Used by the classifier to determine if the corpus covers the topic.
        """
        if not results:
            return 0.0
        return max(r.get("relevance_score", 0.0) for r in results)


if __name__ == "__main__":
    # Quick test: retrieve docs for a sample query
    from indexer import get_or_build_index
    from pathlib import Path
    
    data_root = str(Path(__file__).parent.parent / "data")
    index, metadata, model = get_or_build_index(data_root)
    
    retriever = HybridRetriever(index, metadata, model, use_reranker=True)
    
    test_queries = [
        ("How to add extra time for candidates?", "HackerRank"),
        ("Delete my Claude conversation", "Claude"),
        ("Lost Visa card in India", "Visa"),
        ("it's not working, help", None),
    ]
    
    for query, company in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        print(f"Company: {company}")
        results = retriever.retrieve(query, company, top_k=3)
        for i, r in enumerate(results):
            print(f"\n  [{i+1}] score={r['relevance_score']:.3f}")
            print(f"      company={r['company']}, category={r['category']}")
            print(f"      title={r['title'][:60]}")
            print(f"      text={r['text'][:100]}...")
