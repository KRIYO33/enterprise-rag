"""
Parses PDFs into page-level text with metadata.
Department + allowed_roles are inferred from the PARENT FOLDER name, e.g.
data/HR/Leave_Policy.pdf -> department "HR". This matches a real company's
folder layout and needs no filename convention.
This keeps the ingestion pipeline generic: to add a new source type later
(GitHub, Google Drive, etc.), write a new parser here that returns the
same list-of-dicts shape, and the rest of the pipeline doesn't change.
"""
import pdfplumber
import os
import uuid

# department -> allowed_roles. "Training" is readable by everyone (onboarding docs).
ROLE_MAP = {
    "HR": ["HR", "Admin"],
    "Engineering": ["Engineering", "Admin"],
    "Finance": ["Finance", "Admin"],
    "IT": ["IT", "Admin"],
    "Training": ["HR", "Engineering", "Finance", "IT", "Admin"],
}


def infer_department(filepath: str):
    department = os.path.basename(os.path.dirname(filepath))
    allowed_roles = ROLE_MAP.get(department, ["Admin"])
    return department, allowed_roles


def parse_pdf(filepath: str) -> list[dict]:
    """Returns one dict per page: text + metadata."""
    filename = os.path.basename(filepath)
    department, allowed_roles = infer_department(filepath)
    document_id = str(uuid.uuid4())[:8]

    pages = []
    with pdfplumber.open(filepath) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if not text.strip():
                continue
            pages.append({
                "document_id": document_id,
                "title": filename.replace(".pdf", "").replace("_", " "),
                "filename": filename,
                "department": department,
                "allowed_roles": allowed_roles,
                "page": page_num,
                "text": text,
            })
    return pages


def parse_folder(folder_path: str) -> list[dict]:
    """Parses every PDF under folder_path, including department subfolders.
    Returns flat list of page-dicts."""
    all_pages = []
    for root, _, files in os.walk(folder_path):
        for fname in files:
            if fname.lower().endswith(".pdf"):
                all_pages.extend(parse_pdf(os.path.join(root, fname)))
    return all_pages
