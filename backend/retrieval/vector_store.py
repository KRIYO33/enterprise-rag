"""
Embeds chunks with a local sentence-transformers model and stores them
in a persistent ChromaDB collection on disk (no external DB needed).

NOTE: the first time this runs, sentence-transformers downloads the
all-MiniLM-L6-v2 model (~90MB) from huggingface.co. Needs internet once;
after that it's cached locally in ~/.cache.
"""
import chromadb
from sentence_transformers import SentenceTransformer

CHROMA_PATH = "./chroma_store"
COLLECTION_NAME = "enterprise_docs"
MODEL_NAME = "all-MiniLM-L6-v2"

_model = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_collection():
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    return client.get_or_create_collection(name=COLLECTION_NAME)


def reset_collection():
    """Deletes and recreates the collection. Called before every full
    re-index so repeated /ingest calls don't accumulate duplicate chunks."""
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass  # collection didn't exist yet - fine
    return client.get_or_create_collection(name=COLLECTION_NAME)


def index_chunks(chunks: list[dict]) -> int:
    """Embeds and stores chunks in ChromaDB. Returns count indexed."""
    if not chunks:
        return 0

    model = get_model()
    collection = get_collection()

    texts = [c["text"] for c in chunks]
    embeddings = model.encode(texts, show_progress_bar=False).tolist()

    collection.add(
        ids=[c["chunk_id"] for c in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{
            "document_id": c["document_id"],
            "title": c["title"],
            "filename": c["filename"],
            "department": c["department"],
            # Chroma metadata values must be primitives -> store roles as CSV string
            "allowed_roles": ",".join(c["allowed_roles"]),
            "page": c["page"],
        } for c in chunks],
    )
    return len(chunks)


def vector_search(query: str, top_k: int = 20) -> list[dict]:
    model = get_model()
    collection = get_collection()
    query_embedding = model.encode([query]).tolist()

    results = collection.query(query_embeddings=query_embedding, n_results=top_k)

    hits = []
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        hits.append({
            "chunk_id": results["ids"][0][i],
            "text": results["documents"][0][i],
            "score": 1 - results["distances"][0][i],  # cosine distance -> similarity
            **meta,
            "allowed_roles": meta["allowed_roles"].split(","),
        })
    return hits
