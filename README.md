# Enterprise Knowledge Assistant

RAG system that answers questions from company PDFs, with role-based access,
cited sources, hybrid search, and an admin dashboard.

## Architecture
```
data/ (16 PDFs, 5 departments)
   -> parse (pdfplumber) -> chunk -> embed (sentence-transformers)
   -> ChromaDB (vector) + BM25 (keyword) index
   -> on query: hybrid search -> cross-encoder rerank -> RBAC filter -> Groq LLM -> answer + citations
```

## Data structure
```
data/
  HR/ Engineering/ Finance/ IT/ Training/
```
Department + allowed roles inferred from subfolder name. Training docs readable by all roles.

## Setup (local, no Docker)
```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```
Copy `.env.example` to `.env`, add your Groq key (console.groq.com):
```
GROQ_API_KEY=gsk_your_key_here
```
Start backend:
```bash
uvicorn backend.api.main:app --reload
```
Ingest documents (first run downloads embedding + reranker models, needs internet once):
```bash
curl -X POST http://localhost:8000/ingest -H "Content-Type: application/json" -d "{\"folder_path\": \"data\"}"
```
Start frontend (separate terminal):
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## Setup (Docker)
```bash
docker compose up --build
```
Backend: http://localhost:8000 · Frontend: http://localhost:3000
Then run the `/ingest` curl command above once, against port 8000.
Note: Docker setup is written but not run-tested in this build (no Docker available in the dev sandbox) - if `docker compose up` errors out, share the exact error and it'll get fixed.

## Test users
| username | password | role |
|---|---|---|
| admin | admin123 | Admin (sees everything, only role with dashboard access) |
| hr_user | hr123 | HR |
| eng_user | eng123 | Engineering |
| finance_user | finance123 | Finance |
| it_user | it123 | IT |

## What's tested and confirmed working
- PDF parsing + chunking: 16/16 files, correct department/role tagging from folder structure
- BM25 keyword search: correctly routes queries to right department
- JWT auth: valid login issues token; wrong password, missing token, and tampered token all correctly rejected
- RBAC filtering: verified end-to-end on a real machine - Engineering user asking an HR question gets zero results, no data leak
- Hybrid search + reranking + Groq chat: verified end-to-end on a real machine, correct cited answers
- Admin stats endpoint: returns document/chunk counts + recent questions for Admin; returns 403 for any other role
- React frontend: builds clean with `npm run build`, zero errors
- Duplicate-source bug (same page appearing twice in citations) found and fixed

## What needs YOUR machine/Docker to verify (this dev sandbox has no internet to huggingface.co/api.groq.com, and no Docker)
- Embedding + reranker model downloads
- Groq LLM calls
- Full `docker compose up` run

## Folder structure
```
backend/
  parsers/      - PDF -> page text + metadata
  chunking/     - page text -> overlapping chunks
  retrieval/    - vector_store.py, bm25_store.py, hybrid.py, reranker.py, rag_chat.py
  auth/         - JWT login + verification
  ingestion/    - pipeline.py + last-run stats
  api/          - FastAPI app (/, /ingest, /login, /chat, /admin/stats)
frontend/       - React (Vite) - login, chat, admin dashboard
data/           - 16 sample docs across 5 departments
Dockerfile, frontend/Dockerfile, docker-compose.yml
```

## Deliberately cut from scope (documented, not oversights)
Document versioning, Elasticsearch, Kubernetes, Keycloak/OAuth, multi-tenant,
per-user cost monitoring, streaming responses.

## Admin document management (upload/delete via UI)
Logged in as Admin, go to "Manage Documents" in the nav bar:
- **Upload**: pick a department + PDF file, click Upload. Saves the file into the
  right `data/<department>/` folder and automatically re-indexes everything
  (parses, chunks, rebuilds ChromaDB + BM25) - no terminal needed.
- **Delete**: click Delete next to any document, confirms, removes the file and
  re-indexes automatically.

Only PDFs are accepted, only known departments (HR/Engineering/Finance/IT/Training)
are valid upload targets, and both endpoints are Admin-only (verified via the same
JWT role check as everything else - a non-Admin gets a 403, not a hidden button
that still works if called directly).

Note: every upload/delete triggers a FULL re-index of all documents, not an
incremental update - simple and always-correct, but means re-indexing gets
slower as your document count grows. Fine at this project's scale (a few dozen
PDFs); a real production system would index only the changed file.

**Bug fixed in this pass**: `/ingest` was previously additive - calling it
multiple times kept stacking duplicate chunks into ChromaDB with no way to
clear them. Every ingestion (including the ones triggered by upload/delete)
now resets the vector store first, so the index always reflects exactly the
current files, never accumulates.

## Admin document management (upload/delete)
Log in as `admin`, go to "Manage Documents". Pick a department, choose a PDF, upload —
it saves to the right `data/<department>/` folder and triggers a full re-index
automatically (parse -> chunk -> embed -> BM25 rebuild). Delete works the same way.

**Bug fixed in this version:** repeated `/ingest` calls used to duplicate every chunk
in the vector store instead of replacing them. Fixed by clearing the ChromaDB
collection before every re-index (`reset_collection()` in vector_store.py).

Tested and confirmed working:
- Non-admin roles get 403 on all `/admin/documents*` routes
- Admin can list all 16 real documents correctly
- Invalid department name on upload is rejected with a clear error
- Frontend builds clean with the new upload/delete panel
