"""
Reranks merged hybrid-search candidates using a local cross-encoder.
Vector/BM25 search is fast but approximate ("does this chunk look related?").
A cross-encoder reads the query AND chunk together and scores relevance much
more precisely - but it's slower, so we only run it on the ~20-40 candidates
hybrid_search already narrowed down, not the whole document set.

NOTE: downloads cross-encoder/ms-marco-MiniLM-L-6-v2 (~80MB) from
huggingface.co on first use - needs internet once, then cached.
"""
from sentence_transformers import CrossEncoder

_model = None
MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def get_reranker():
    global _model
    if _model is None:
        _model = CrossEncoder(MODEL_NAME)
    return _model


def rerank(query: str, candidates: list[dict], top_k: int = 5) -> list[dict]:
    if not candidates:
        return []

    model = get_reranker()
    pairs = [[query, c["text"]] for c in candidates]
    scores = model.predict(pairs)

    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)

    ranked = sorted(candidates, key=lambda c: c["rerank_score"], reverse=True)
    return ranked[:top_k]
