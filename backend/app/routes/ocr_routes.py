from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import Optional
from app.models.schemas import OCRScanResponse, OCRScanRequest
from app.services.ocr_service import ocr_service
from app.database.db import db
from app.auth.auth_handler import get_current_user, UserProfile

router = APIRouter(prefix="/api/ocr", tags=["OCR Scanner"])

@router.post("/upload", response_model=OCRScanResponse)
async def scan_uploaded_file(
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user)
):
    """Upload a PDF file and extract text and structured document insights."""
    contents = await file.read()
    filename = file.filename or "document.pdf"
    
    extracted = ocr_service.extract_text_from_pdf_bytes(contents, filename)
    return ocr_service.analyze_document_content(extracted, filename)

@router.post("/scan-attachment", response_model=OCRScanResponse)
def scan_email_attachment(
    req: OCRScanRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    """Scan and analyze an attachment from an existing email in inbox."""
    if req.raw_text:
        return ocr_service.analyze_document_content(req.raw_text, "document.pdf")
        
    if req.email_id and req.attachment_id:
        email = db.get_email_by_id(req.email_id)
        if not email:
            raise HTTPException(status_code=404, detail="Email not found")
        for att in email.attachments:
            if att.id == req.attachment_id:
                raw_text = att.extracted_text or f"Attachment {att.filename} content scanned."
                return ocr_service.analyze_document_content(raw_text, att.filename)

    raise HTTPException(status_code=400, detail="Attachment or raw text required")
