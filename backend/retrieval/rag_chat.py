"""
Core RAG answer generation:
1. Hybrid search -> rerank -> top 5 chunks
2. RBAC FILTER (critical - this happens BEFORE the LLM ever sees the text):
   drop any chunk whose allowed_roles doesn't include the user's role.
   This is enforced server-side from the verified JWT role, never from
   anything the client sends - so it can't be bypassed by editing the request.
3. Build a prompt with only the allowed chunks, ask the LLM to answer using
   ONLY that context and cite [document, page] for every claim.
4. Keep last 5 turns of conversation per session in memory for follow-ups.
"""
import os
import datetime
from groq import Groq
from backend.retrieval.hybrid import hybrid_search
from backend.retrieval.reranker import rerank

GROQ_MODEL = "llama-3.3-70b-versatile"
_client = None

# session_id -> list of {"role": "user"/"assistant", "content": str}
_conversation_memory: dict[str, list[dict]] = {}
MAX_TURNS = 5

# in-memory log of recent questions, for the admin stats endpoint
_question_log: list[dict] = []
MAX_LOG_SIZE = 10


def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set. Add it to your .env file.")
        _client = Groq(api_key=api_key)
    return _client


def filter_by_role(chunks: list[dict], user_role: str) -> list[dict]:
    return [c for c in chunks if user_role in c["allowed_roles"]]


def build_context(chunks: list[dict]) -> str:
    blocks = []
    for c in chunks:
        blocks.append(f"[Source: {c['filename']}, page {c['page']}]\n{c['text']}")
    return "\n\n---\n\n".join(blocks)


def ask(query: str, user_role: str, session_id: str = "default") -> dict:
    # 1. retrieve candidates via hybrid search
    candidates = hybrid_search(query, top_k_each=20)

    # 2. RBAC enforcement BEFORE reranking - ensure top_k selections are permitted
    allowed_candidates = filter_by_role(candidates, user_role)
    top_chunks = rerank(query, allowed_candidates, top_k=5)
    allowed_chunks = top_chunks

    _question_log.append({
        "query": query,
        "role": user_role,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "had_answer": bool(allowed_chunks),
    })
    del _question_log[:-MAX_LOG_SIZE]

    if not allowed_chunks:
        return {
            "answer": "I couldn't find any information you have access to for that question.",
            "sources": [],
        }

    context = build_context(allowed_chunks)

    # 3. conversation memory
    history = _conversation_memory.get(session_id, [])

    system_prompt = (
        "You are an internal company knowledge assistant. Answer the user's question "
        "using ONLY the information in the provided context. If the context doesn't "
        "contain the answer, say so clearly - do not make anything up. "
        "After your answer, do not repeat the sources - they are tracked separately."
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages += history
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {query}",
    })

    client = get_client()
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=0.2,
    )
    answer = response.choices[0].message.content

    # update memory
    history.append({"role": "user", "content": query})
    history.append({"role": "assistant", "content": answer})
    _conversation_memory[session_id] = history[-(MAX_TURNS * 2):]

    sources = []
    seen = set()
    for c in allowed_chunks:
        key = (c["filename"], c["page"])
        if key not in seen:
            seen.add(key)
            sources.append({"document": c["filename"], "page": c["page"], "department": c["department"]})

    return {"answer": answer, "sources": sources}


def get_recent_questions() -> list[dict]:
    return list(reversed(_question_log))
