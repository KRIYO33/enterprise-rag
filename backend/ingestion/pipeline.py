from backend.parsers.pdf_parser import parse_folder
from backend.chunking.chunker import chunk_pages
from backend.retrieval.vector_store import index_chunks, reset_collection
from backend.retrieval.bm25_store import build_bm25_index

# stores stats from the most recent ingestion run, read by GET /admin/stats
_last_ingest_stats = {"total_documents": 0, "total_chunks": 0, "chunks_per_department": {}}


def get_last_ingest_stats() -> dict:
    return _last_ingest_stats


def run_ingestion(folder_path: str = "data") -> dict:
    global _last_ingest_stats
    pages = parse_folder(folder_path)
    chunks = chunk_pages(pages)

    reset_collection()             # clear old data first - this is a full rebuild, not an append
    indexed_count = index_chunks(chunks)   # needs internet on first run (model download)
    build_bm25_index(chunks)               # no internet needed (already overwrites, not appends)

    dept_counts = {}
    for c in chunks:
        dept_counts[c["department"]] = dept_counts.get(c["department"], 0) + 1

    _last_ingest_stats = {
        "total_documents": len({c["filename"] for c in chunks}),
        "total_chunks": len(chunks),
        "chunks_per_department": dept_counts,
    }

    return {
        "pages_parsed": len(pages),
        "chunks_indexed": indexed_count,
        "documents": list({c["filename"] for c in chunks}),
    }
