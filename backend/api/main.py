from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import jwt

load_dotenv()

from backend.ingestion.pipeline import run_ingestion, get_last_ingest_stats
from backend.ingestion.document_manager import list_documents, save_upload, delete_document, ALLOWED_DEPARTMENTS
from backend.auth.auth import authenticate, verify_token
from backend.retrieval.rag_chat import ask, get_recent_questions

app = FastAPI(title="Enterprise Knowledge Assistant - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite dev + Docker frontend
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    folder_path: str = "data"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    query: str
    session_id: str = "default"


@app.get("/")
def health():
    return {"status": "ok"}


@app.post("/ingest")
def ingest(req: IngestRequest):
    try:
        result = run_ingestion(req.folder_path)
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Folder not found: {req.folder_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/login")
def login(req: LoginRequest):
    token = authenticate(req.username, req.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": token, "token_type": "bearer"}


def get_role_from_header(authorization: str = Header(None)) -> str:
    """Extracts and verifies the JWT from the Authorization header.
    The role ALWAYS comes from this verified token, never from the request body -
    this is what makes the RBAC unspoofable by the client."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = verify_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload["role"]


@app.post("/chat")
def chat(req: ChatRequest, authorization: str = Header(None)):
    user_role = get_role_from_header(authorization)
    try:
        result = ask(req.query, user_role, req.session_id)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/stats")
def admin_stats(authorization: str = Header(None)):
    user_role = get_role_from_header(authorization)
    if user_role != "Admin":
        raise HTTPException(status_code=403, detail="Admin access only")

    ingest_stats = get_last_ingest_stats()
    recent_questions = get_recent_questions()

    return {
        **ingest_stats,
        "recent_questions": recent_questions,
    }


def require_admin(authorization: str = Header(None)) -> str:
    user_role = get_role_from_header(authorization)
    if user_role != "Admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user_role


@app.get("/admin/documents")
def get_documents(authorization: str = Header(None)):
    require_admin(authorization)
    return {"departments": ALLOWED_DEPARTMENTS, "documents": list_documents()}


@app.post("/admin/documents/upload")
async def upload_document(
    department: str = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    require_admin(authorization)
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are allowed")

    file_bytes = await file.read()
    try:
        result = save_upload(department, file.filename, file_bytes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/admin/documents/{department}/{filename}")
def remove_document(department: str, filename: str, authorization: str = Header(None)):
    require_admin(authorization)
    try:
        result = delete_document(department, filename)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

