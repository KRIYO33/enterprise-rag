"""
BM25 keyword index, saved to disk as a pickle alongside chroma_store/.
Combined with vector_store.py's semantic search in Phase 2 for hybrid retrieval.
"""
import pickle
import os
from rank_bm25 import BM25Okapi

BM25_PATH = "./chroma_store/bm25_index.pkl"


def build_bm25_index(chunks: list[dict]):
    tokenized = [c["text"].lower().split() for c in chunks]
    bm25 = BM25Okapi(tokenized)

    # Keep chunk metadata alongside the index so we can map results back
    payload = {
        "bm25": bm25,
        "chunks": chunks,  # same order as tokenized corpus
    }
    os.makedirs(os.path.dirname(BM25_PATH), exist_ok=True)
    with open(BM25_PATH, "wb") as f:
        pickle.dump(payload, f)


def bm25_search(query: str, top_k: int = 20) -> list[dict]:
    if not os.path.exists(BM25_PATH):
        return []

    with open(BM25_PATH, "rb") as f:
        payload = pickle.load(f)

    bm25 = payload["bm25"]
    chunks = payload["chunks"]

    scores = bm25.get_scores(query.lower().split())
    ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)[:top_k]

    return [{
        "chunk_id": c["chunk_id"],
        "text": c["text"],
        "score": float(score),
        "document_id": c["document_id"],
        "title": c["title"],
        "filename": c["filename"],
        "department": c["department"],
        "allowed_roles": c["allowed_roles"],
        "page": c["page"],
    } for c, score in ranked]
