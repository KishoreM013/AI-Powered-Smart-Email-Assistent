from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routes import auth_routes, email_routes, ocr_routes, analytics_routes, settings_routes

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Smart Email Assistant REST API with Gemini Generative AI, OCR Document Scanner, and NLP Classification.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Setup CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    # The configured allowlist, not a wildcard. "*" plus allow_credentials
    # makes the browser reject credentialed requests outright, while still
    # letting any site call every unauthenticated endpoint.
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register sub-routers
app.include_router(auth_routes.router)
app.include_router(email_routes.router)
app.include_router(ocr_routes.router)
app.include_router(analytics_routes.router)
app.include_router(settings_routes.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "services": {
            "api": "online",
            "database": "ready",
            "ai_engine": "active"
        }
    }

# ---------------------------------------------------------------------------
# Serve the built UI from this same process.
#
# Single-origin, so the browser makes same-origin requests and CORS is never
# involved. Registered last on purpose: the catch-all must not shadow the API
# routes above, and unknown /api paths must 404 rather than return index.html.
# ---------------------------------------------------------------------------
_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _DIST.is_dir():
    _ASSETS = _DIST / "assets"
    if _ASSETS.is_dir():
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            candidate = (_DIST / full_path).resolve()
            # Keep the lookup inside dist/ even if a path tries to escape it.
            if candidate.is_file() and candidate.is_relative_to(_DIST.resolve()):
                return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
else:  # pragma: no cover
    logger.warning("frontend/dist not found at %s - serving the API only.", _DIST)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
