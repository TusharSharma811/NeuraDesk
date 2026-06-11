"""
indexer.py — Corpus Indexer
============================
Loads all markdown files from data/, chunks them by ## headers,
computes embeddings via sentence-transformers, and builds a FAISS index.

Design decisions documented in Details.md §3.1.
"""

import os
import re
import json
import pickle
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
CACHE_DIR = Path(__file__).parent / ".cache"
INDEX_FILE = CACHE_DIR / "faiss_index.bin"
META_FILE = CACHE_DIR / "metadata.pkl"
HASH_FILE = CACHE_DIR / "corpus_hash.txt"


# ---------------------------------------------------------------------------
# Chunk data class
# ---------------------------------------------------------------------------
class Chunk:
    """A single chunk of corpus text with its metadata."""

    def __init__(
        self,
        text: str,
        source_file: str,
        company: str,
        category: str,
        title: str = "",
    ):
        self.text = text
        self.source_file = source_file
        self.company = company
        self.category = category
        self.title = title

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "source_file": self.source_file,
            "company": self.company,
            "category": self.category,
            "title": self.title,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Chunk":
        return cls(**d)

    def __repr__(self) -> str:
        return f"Chunk(company={self.company}, category={self.category}, title={self.title[:40]}...)"


# ---------------------------------------------------------------------------
# Corpus loading & chunking
# ---------------------------------------------------------------------------
def _infer_company(filepath: str, data_root: str) -> str:
    """Derive company name from the file path relative to data_root.
    
    Example: data/hackerrank/screen/foo.md -> 'hackerrank'
    """
    rel = os.path.relpath(filepath, data_root).replace("\\", "/")
    parts = rel.split("/")
    if len(parts) >= 1:
        return parts[0].lower()
    return "unknown"


def _infer_category(filepath: str, data_root: str) -> str:
    """Derive category from the subdirectory path.
    
    Example: data/hackerrank/screen/tests/foo.md -> 'screen/tests'
    """
    rel = os.path.relpath(filepath, data_root).replace("\\", "/")
    parts = rel.split("/")
    if len(parts) >= 3:
        # Skip company (parts[0]) and filename (parts[-1])
        return "/".join(parts[1:-1])
    elif len(parts) == 2:
        return parts[0]  # Only company + file, category is company-level
    return "general"


def _extract_title(text: str) -> str:
    """Extract the first heading from a chunk as its title."""
    for line in text.strip().split("\n"):
        line = line.strip()
        if line.startswith("#"):
            return re.sub(r"^#+\s*", "", line).strip()
    # No heading found — use first line truncated
    first_line = text.strip().split("\n")[0].strip()
    return first_line[:100] if first_line else "Untitled"


def _chunk_markdown(text: str, min_chunk_length: int = 50) -> List[str]:
    """Split markdown text into chunks by ## headers.
    
    Each chunk includes its heading. Chunks shorter than min_chunk_length
    are merged with the previous chunk to avoid tiny fragments.
    """
    # Split on ## headings (keep the heading with the chunk)
    sections = re.split(r"(?=^## )", text, flags=re.MULTILINE)
    
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) < min_chunk_length and chunks:
            # Merge tiny section with previous chunk
            chunks[-1] = chunks[-1] + "\n\n" + section
        else:
            chunks.append(section)
    
    # If no splits happened, return the whole text as one chunk
    if not chunks and text.strip():
        chunks = [text.strip()]
    
    return chunks


def load_corpus(data_root: str) -> List[Chunk]:
    """Load all markdown files from data_root and chunk them.
    
    Returns a list of Chunk objects with metadata.
    """
    data_path = Path(data_root)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_root}")
    
    chunks: List[Chunk] = []
    md_files = sorted(data_path.rglob("*.md"))
    
    print(f"[indexer] Found {len(md_files)} markdown files in {data_root}")
    
    for filepath in md_files:
        filepath_str = str(filepath)
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except Exception as e:
            print(f"[indexer] WARNING: Could not read {filepath}: {e}")
            continue
        
        if not text.strip():
            continue
        
        company = _infer_company(filepath_str, data_root)
        category = _infer_category(filepath_str, data_root)
        
        # Chunk the file
        raw_chunks = _chunk_markdown(text)
        
        for chunk_text in raw_chunks:
            title = _extract_title(chunk_text)
            chunks.append(
                Chunk(
                    text=chunk_text,
                    source_file=filepath_str,
                    company=company,
                    category=category,
                    title=title,
                )
            )
    
    print(f"[indexer] Created {len(chunks)} chunks from {len(md_files)} files")
    return chunks


# ---------------------------------------------------------------------------
# Corpus hashing (for cache invalidation)
# ---------------------------------------------------------------------------
def _compute_corpus_hash(data_root: str) -> str:
    """Hash all markdown file paths + sizes to detect corpus changes."""
    data_path = Path(data_root)
    md_files = sorted(data_path.rglob("*.md"))
    hasher = hashlib.sha256()
    for f in md_files:
        hasher.update(str(f).encode())
        hasher.update(str(f.stat().st_size).encode())
    return hasher.hexdigest()


# ---------------------------------------------------------------------------
# FAISS index building
# ---------------------------------------------------------------------------
def build_index(
    chunks: List[Chunk],
    model: Optional[SentenceTransformer] = None,
) -> tuple:
    """Build a FAISS index from chunk texts.
    
    Returns:
        (faiss_index, chunk_metadata_list)
    """
    if model is None:
        print(f"[indexer] Loading embedding model: {EMBEDDING_MODEL}")
        model = SentenceTransformer(EMBEDDING_MODEL)
    
    texts = [c.text for c in chunks]
    print(f"[indexer] Computing embeddings for {len(texts)} chunks...")
    embeddings = model.encode(
        texts,
        show_progress_bar=True,
        batch_size=64,
        normalize_embeddings=True,  # For cosine similarity via inner product
    )
    embeddings = np.array(embeddings, dtype=np.float32)
    
    # Build a flat inner-product index (equivalent to cosine similarity
    # when embeddings are L2-normalised)
    index = faiss.IndexFlatIP(EMBEDDING_DIM)
    index.add(embeddings)
    
    metadata = [c.to_dict() for c in chunks]
    
    print(f"[indexer] FAISS index built: {index.ntotal} vectors, {EMBEDDING_DIM}d")
    return index, metadata


# ---------------------------------------------------------------------------
# Cache management
# ---------------------------------------------------------------------------
def save_index(index: faiss.Index, metadata: List[Dict], corpus_hash: str) -> None:
    """Save the FAISS index and metadata to disk."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_FILE))
    with open(META_FILE, "wb") as f:
        pickle.dump(metadata, f)
    with open(HASH_FILE, "w") as f:
        f.write(corpus_hash)
    print(f"[indexer] Index cached to {CACHE_DIR}")


def load_cached_index() -> Optional[tuple]:
    """Load the FAISS index from cache if it exists and is valid."""
    if not (INDEX_FILE.exists() and META_FILE.exists() and HASH_FILE.exists()):
        return None
    
    index = faiss.read_index(str(INDEX_FILE))
    with open(META_FILE, "rb") as f:
        metadata = pickle.load(f)
    with open(HASH_FILE, "r") as f:
        cached_hash = f.read().strip()
    
    return index, metadata, cached_hash


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_or_build_index(data_root: str, force_rebuild: bool = False) -> tuple:
    """Load the FAISS index from cache, or build it from scratch.
    
    Returns:
        (faiss_index, chunk_metadata_list, embedding_model)
    """
    corpus_hash = _compute_corpus_hash(data_root)
    
    # Try loading from cache
    cached = None if force_rebuild else load_cached_index()
    if cached is not None:
        index, metadata, cached_hash = cached
        if cached_hash == corpus_hash:
            print(f"[indexer] Loaded cached index ({index.ntotal} vectors)")
            model = SentenceTransformer(EMBEDDING_MODEL)
            return index, metadata, model
        else:
            print("[indexer] Corpus changed — rebuilding index...")
    else:
        if force_rebuild:
            print("[indexer] Forced rebuild requested — building index from scratch...")
        else:
            print("[indexer] No cache found — building index from scratch...")
    
    # Build fresh
    model = SentenceTransformer(EMBEDDING_MODEL)
    chunks = load_corpus(data_root)
    index, metadata = build_index(chunks, model)
    save_index(index, metadata, corpus_hash)
    
    return index, metadata, model


def clear_index_cache() -> None:
    """Remove cached index artifacts so the next load rebuilds from scratch."""
    for path in (INDEX_FILE, META_FILE, HASH_FILE):
        if path.exists():
            path.unlink()


if __name__ == "__main__":
    # Quick test: build the index and print stats
    data_root = str(Path(__file__).parent.parent / "data")
    index, metadata, model = get_or_build_index(data_root)
    
    # Print company distribution
    from collections import Counter
    companies = Counter(m["company"] for m in metadata)
    print("\nChunks per company:")
    for company, count in companies.most_common():
        print(f"  {company}: {count}")
    
    categories = Counter(m["category"] for m in metadata)
    print(f"\nUnique categories: {len(categories)}")
    for cat, count in categories.most_common(10):
        print(f"  {cat}: {count}")
