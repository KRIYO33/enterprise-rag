from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import jwt

load_dotenv()

from backend.ingestion.pipeline import run_ingestion, get_last_ingest_stats
from backend.ingestion.document_manager import list_documents, save_upload, delete_document, get_departments, create_department
from backend.auth.auth import authenticate, verify_token, list_users, add_user, delete_user, change_user_password
from backend.retrieval.rag_chat import ask, get_recent_questions

app = FastAPI(title="Enterprise Knowledge Assistant - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    folder_path: str = "data"


class LoginRequest(BaseModel):
    username: str
    password: str


class AddUserRequest(BaseModel):
    username: str
    password: str
    role: str


class ChangePasswordRequest(BaseModel):
    username: str
    new_password: str


class ChatRequest(BaseModel):
    query: str
    session_id: str = "default"


@app.on_event("startup")
def startup_event():
    pass


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


def require_auth(authorization: str = Header(None)) -> str:
    return get_role_from_header(authorization)


@app.get("/admin/documents")
def get_documents(authorization: str = Header(None)):
    user_role = get_role_from_header(authorization)
    all_docs = list_documents()
    all_depts = get_departments()
    if user_role == "Admin":
        return {"departments": all_depts, "documents": all_docs}
    else:
        # Non-admin users can only view documents from their own department
        filtered_docs = [d for d in all_docs if d["department"] == user_role]
        allowed_depts = [d for d in all_depts if d == user_role]
        return {"departments": allowed_depts, "documents": filtered_docs}


@app.post("/admin/departments")
async def add_department(
    department: str = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    require_admin(authorization)
    if not file or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="A valid initial .pdf file is required to create a new department.")

    file_bytes = await file.read()
    try:
        result = create_department(department, file.filename, file_bytes)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/documents/upload")
async def upload_document(
    department: str = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(None),
):
    user_role = get_role_from_header(authorization)
    if user_role != "Admin" and department != user_role:
        raise HTTPException(
            status_code=403,
            detail=f"Privacy policy violation: You can only upload documents to your own department ({user_role})"
        )
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
    user_role = get_role_from_header(authorization)
    if user_role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Privacy restriction: Only Admin users are authorized to delete documents."
        )
    try:
        result = delete_document(department, filename)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def require_admin(authorization: str = Header(None)) -> str:
    user_role = get_role_from_header(authorization)
    if user_role != "Admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user_role


@app.get("/admin/users")
def get_users(authorization: str = Header(None)):
    require_admin(authorization)
    return {"users": list_users()}


@app.post("/admin/users")
def create_user(req: AddUserRequest, authorization: str = Header(None)):
    require_admin(authorization)
    try:
        result = add_user(req.username, req.password, req.role)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/admin/users/{username}")
def remove_user(username: str, authorization: str = Header(None)):
    require_admin(authorization)
    try:
        result = delete_user(username)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/users/change-password")
def update_password(req: ChangePasswordRequest, authorization: str = Header(None)):
    require_admin(authorization)
    try:
        result = change_user_password(req.username, req.new_password)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

