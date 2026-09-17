"""
Admin document management: list, upload, delete PDFs.
Any change (upload/delete) triggers a full re-ingest (parse + chunk + reset
vector store + rebuild BM25) rather than trying to incrementally patch the
indexes. Slower on a large corpus, but simple and correct - matches the
deliberate scope decision to skip document versioning.
"""
import os
from backend.parsers.pdf_parser import ROLE_MAP
from backend.ingestion.pipeline import run_ingestion

DATA_DIR = "data"
ALLOWED_DEPARTMENTS = list(ROLE_MAP.keys())


def list_documents() -> list[dict]:
    docs = []
    if not os.path.exists(DATA_DIR):
        return docs
    for dept in os.listdir(DATA_DIR):
        dept_path = os.path.join(DATA_DIR, dept)
        if not os.path.isdir(dept_path):
            continue
        for fname in os.listdir(dept_path):
            if fname.lower().endswith(".pdf"):
                fpath = os.path.join(dept_path, fname)
                docs.append({
                    "filename": fname,
                    "department": dept,
                    "size_kb": round(os.path.getsize(fpath) / 1024, 1),
                })
    return docs


def get_departments() -> list[str]:
    depts = set(ALLOWED_DEPARTMENTS)
    if os.path.exists(DATA_DIR):
        for item in os.listdir(DATA_DIR):
            if os.path.isdir(os.path.join(DATA_DIR, item)):
                depts.add(item)
    return sorted(list(depts))


def save_upload(department: str, filename: str, file_bytes: bytes) -> dict:
    allowed = get_departments()
    if department not in allowed:
        raise ValueError(f"Unknown department '{department}'. Allowed: {allowed}")
    if not filename.lower().endswith(".pdf"):
        raise ValueError("Only .pdf files are allowed")

    dept_dir = os.path.join(DATA_DIR, department)
    os.makedirs(dept_dir, exist_ok=True)
    fpath = os.path.join(dept_dir, filename)

    with open(fpath, "wb") as f:
        f.write(file_bytes)

    ingest_result = run_ingestion(DATA_DIR)
    return {"saved": filename, "department": department, "ingest": ingest_result}


def create_department(department: str, filename: str, file_bytes: bytes) -> dict:
    department = department.strip()
    if not department:
        raise ValueError("Department name cannot be empty.")
    if not filename or not filename.lower().endswith(".pdf") or not file_bytes:
        raise ValueError("Creating a new department requires at least one initial PDF document.")

    dept_dir = os.path.join(DATA_DIR, department)
    os.makedirs(dept_dir, exist_ok=True)
    fpath = os.path.join(dept_dir, filename)

    with open(fpath, "wb") as f:
        f.write(file_bytes)

    ingest_result = run_ingestion(DATA_DIR)
    return {"department": department, "initial_file": filename, "ingest": ingest_result}


def delete_document(department: str, filename: str) -> dict:
    fpath = os.path.join(DATA_DIR, department, filename)
    if not os.path.exists(fpath):
        raise FileNotFoundError(f"{department}/{filename} not found")

    os.remove(fpath)
    ingest_result = run_ingestion(DATA_DIR)
    return {"deleted": filename, "department": department, "ingest": ingest_result}
