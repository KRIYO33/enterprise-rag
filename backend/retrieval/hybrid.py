"""
Combines ChromaDB (semantic/vector) results with BM25 (keyword) results.
Vector search catches meaning-based matches ("time off" -> "leave policy").
BM25 catches exact-term matches (error codes, exact policy names, numbers).
Merging both and deduping by chunk_id gives better coverage than either alone.
"""
from backend.retrieval.vector_store import vector_search
from backend.retrieval.bm25_store import bm25_search


def hybrid_search(query: str, top_k_each: int = 20) -> list[dict]:
    vector_results = vector_search(query, top_k=top_k_each)
    keyword_results = bm25_search(query, top_k=top_k_each)

    merged = {}
    for r in vector_results + keyword_results:
        cid = r["chunk_id"]
        if cid not in merged:
            merged[cid] = r
        else:
            # keep the higher score if a chunk appears in both result sets
            merged[cid]["score"] = max(merged[cid]["score"], r["score"])

    return list(merged.values())
