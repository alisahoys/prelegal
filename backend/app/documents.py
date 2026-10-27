import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user
from app.database import database_connection
from app.schemas import SavedDocument, SavedDocumentRequest, SavedDocumentSummary

router = APIRouter(prefix="/api/documents", tags=["documents"])


def document_from_row(row, include_state: bool):
    item = {
        "id": row["id"],
        "title": row["title"],
        "templateId": row["template_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if include_state:
        item["state"] = json.loads(row["state_json"])
        return SavedDocument.model_validate(item)
    return SavedDocumentSummary.model_validate(item)


@router.get("")
def list_documents(request: Request, user: dict = Depends(get_current_user)) -> dict:
    with database_connection(request.app.state.database_path) as connection:
        rows = connection.execute(
            "SELECT id, title, template_id, created_at, updated_at FROM saved_documents WHERE user_id = ? ORDER BY updated_at DESC, id",
            (user["id"],),
        ).fetchall()
    return {"items": [document_from_row(row, False) for row in rows]}


@router.post("", status_code=201, response_model=SavedDocument)
def create_document(payload: SavedDocumentRequest, request: Request, user: dict = Depends(get_current_user)) -> SavedDocument:
    document_id = str(uuid.uuid4())
    state_json = payload.state.model_dump_json()
    with database_connection(request.app.state.database_path) as connection:
        row = connection.execute(
            "INSERT INTO saved_documents (id, user_id, title, template_id, state_json) VALUES (?, ?, ?, ?, ?) RETURNING *",
            (document_id, user["id"], payload.title, payload.state.templateId, state_json),
        ).fetchone()
    return document_from_row(row, True)


@router.get("/{document_id}", response_model=SavedDocument)
def get_document(document_id: str, request: Request, user: dict = Depends(get_current_user)) -> SavedDocument:
    with database_connection(request.app.state.database_path) as connection:
        row = connection.execute(
            "SELECT * FROM saved_documents WHERE id = ? AND user_id = ?",
            (document_id, user["id"]),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document_from_row(row, True)


@router.put("/{document_id}", response_model=SavedDocument)
def update_document(document_id: str, payload: SavedDocumentRequest, request: Request, user: dict = Depends(get_current_user)) -> SavedDocument:
    with database_connection(request.app.state.database_path) as connection:
        row = connection.execute(
            "UPDATE saved_documents SET title = ?, template_id = ?, state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? RETURNING *",
            (payload.title, payload.state.templateId, payload.state.model_dump_json(), document_id, user["id"]),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document_from_row(row, True)
