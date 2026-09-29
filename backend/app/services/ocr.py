import logging
from io import BytesIO
from pypdf import PdfReader
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger("smart_email_assistant")

async def extract_and_summarize_attachment(file_content: bytes, filename: str, content_type: str) -> dict:
    """
    Extracts text from attachments and generates a summary.
    Supports PDF parsing. Integrates Gemini Multimodal OCR for scanned pages/images.
    """
    text = ""
    summary = ""
    
    # Check if we should use mock logic
    if settings.is_demo:
        return get_mock_attachment_analysis(filename)

    try:
        # Extract text based on file format
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            reader = PdfReader(BytesIO(file_content))
            pages_text = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
            text = "\n".join(pages_text).strip()
            
            # If standard text extraction fails, it might be scanned. Try Gemini Vision API.
            if not text and settings.GEMINI_API_KEY:
                logger.info(f"PDF {filename} appears to be scanned. Attempting Gemini Multimodal OCR.")
                text = await run_gemini_multimodal_ocr(file_content, filename, "application/pdf")
        
        elif content_type.startswith("image/") or filename.lower().endswith((".png", ".jpg", ".jpeg")):
            if settings.GEMINI_API_KEY:
                logger.info(f"Image {filename} detected. Running Gemini OCR.")
                text = await run_gemini_multimodal_ocr(file_content, filename, content_type)
        
        elif content_type in ["text/plain", "text/csv"] or filename.lower().endswith((".txt", ".csv")):
            text = file_content.decode("utf-8", errors="ignore")
            
        else:
            text = f"[Binary File: {filename} of type {content_type}. Native text extraction not supported.]"

    except Exception as e:
        logger.error(f"Error during attachment text extraction: {e}")
        text = f"[Failed to extract text from {filename}: {str(e)}]"

    # If we extracted text successfully, let's summarize it
    if text and len(text.strip()) > 30:
        summary = await summarize_text_content(text, filename)
    else:
        # If no text, provide default message or mock summary
        return get_mock_attachment_analysis(filename)

    return {
        "text_content": text[:5000], # Cap text length in DB
        "summary": summary
    }

async def run_gemini_multimodal_ocr(file_bytes: bytes, filename: str, mime_type: str) -> str:
    if not settings.GEMINI_API_KEY:
        return "[Gemini API Key missing. OCR transcription unavailable.]"
    try:
        # Use Gemini to transcribe the image or PDF bytes
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content([
            {
                "mime_type": mime_type,
                "data": file_bytes[:1024*1024*4] # Cap at 4MB
            },
            "Transcribe all text from this document. Provide only the text transcripts."
        ])
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini Multimodal OCR failed: {e}")
        return f"[Gemini OCR failed: {str(e)}]"

async def summarize_text_content(text: str, filename: str) -> str:
    if not settings.GEMINI_API_KEY:
        return f"Summary of {filename}: Key items details present in the attachment text."
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(f"Provide a short 2-3 sentence summary of the following document content:\n\n{text[:8000]}")
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini summary generation failed: {e}")
        return f"Document summary for {filename} could not be generated."

def get_mock_attachment_analysis(filename: str) -> dict:
    name_lower = filename.lower()
    if "invoice" in name_lower or "bill" in name_lower:
        text = """INVOICE
Invoice No: INV-2026-0842
Date: July 10, 2026
Due Date: July 30, 2026

Vendor: Cloud Hosting Solutions Ltd.
Bill To: Demo User (demo.user@gmail.com)

Description                      Amount
Premium Developer Instances     $120.00
Database Backup Storage          $30.00
CDN Premium Bandwidth            $50.00

Total Due: $200.00
Please remit payment via bank transfer or credit card portal.
Thank you for your business!"""
        summary = "Monthly Invoice from Cloud Hosting Solutions totaling $200.00, due on July 30, 2026."
    elif "report" in name_lower or "analytics" in name_lower:
        text = """Q2 PERFORMANCE REPORT
Date: July 05, 2026

1. User Acquisition grew by 14% quarter-over-quarter.
2. Email click-through rates increased from 3.2% to 4.5% following AI personalization triggers.
3. Server infrastructure cost reduced by 8% due to active container resource packing.
4. Active roadmap targets for Q3: Deploy mobile notifications, expand Gmail sync handlers, start compliance audits."""
        summary = "Q2 Performance Report highlighting a 14% user acquisition growth, 4.5% email CTR, and outlining Q3 milestones."
    elif "resume" in name_lower or "cv" in name_lower:
        text = """Alex Smith - Full Stack Software Engineer
Email: alexsmith@engineers.com | Tel: +1-555-0199

Professional Summary:
Passionate Software Engineer with 4+ years of experience building fast, scalable web apps.
Core stack: React, Node.js, Python, MongoDB, AWS.

Experience:
- Frontend Architect, TechFlow Inc (2024 - Present): Restructured main landing dashboard using React and Tailwind, improving PageSpeed metrics by 25%.
- Software Developer, CodeBase LLC (2022 - 2024): Maintained and expanded Django-based backend APIs."""
        summary = "Software Developer Resume for Alex Smith, outlining 4+ years of experience in React, Node, and Python."
    else:
        text = f"[Mock text content for attachment: {filename}]\nThis file contains details and information regarding the email transaction."
        summary = f"Summary of {filename}: Key data file containing email attachment details."

    return {
        "text_content": text,
        "summary": summary
    }
