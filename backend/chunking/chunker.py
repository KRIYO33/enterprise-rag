"""
Splits page-level text into overlapping chunks (~500 tokens, ~50 token overlap).
Uses word-count as a cheap proxy for tokens - fine for this project's scale.
Every chunk keeps a reference back to its parent page's metadata.
"""
import uuid

CHUNK_SIZE_WORDS = 350   # ~500 tokens
OVERLAP_WORDS = 40       # ~50 tokens


def chunk_pages(pages: list[dict]) -> list[dict]:
    chunks = []
    for page in pages:
        words = page["text"].split()
        if not words:
            continue

        start = 0
        while start < len(words):
            end = start + CHUNK_SIZE_WORDS
            chunk_words = words[start:end]
            chunk_text = " ".join(chunk_words)

            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "document_id": page["document_id"],
                "title": page["title"],
                "filename": page["filename"],
                "department": page["department"],
                "allowed_roles": page["allowed_roles"],
                "page": page["page"],
                "text": chunk_text,
            })

            if end >= len(words):
                break
            start = end - OVERLAP_WORDS

    return chunks
