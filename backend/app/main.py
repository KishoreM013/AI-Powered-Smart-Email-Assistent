import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.middleware.rate_limit import hit
from app.routes import auth_routes, email_routes, ocr_routes, analytics_routes, settings_routes

logger = logging.getLogger("smart_email_assistant")

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

# Auth endpoints mint credentials, so they get the tightest budget.
_RATE_LIMITED_PATHS = {"/api/auth/exchange", "/api/auth/imap-login", "/api/auth/callback"}
_AUTH_LIMIT = 10
_AUTH_WINDOW = 60

@app.middleware("http")
async def security_headers(request, call_next):
    """Baseline hardening headers on every response.

    A browser rendering a JSON API does not need most of these, but the SPA
    and the OAuth callback are both served from here, so they do.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-XSS-Protection", "0")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    # This server also serves the SPA, so a CSP is worth having. It is sent in
    # every environment so the policy can actually be tested, but relaxed in
    # development because the Vite dev server needs inline scripts and eval
    # for hot reload.
    if settings.ENVIRONMENT == "production":
        csp = (
            "default-src 'self'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
            "font-src 'self' data:; connect-src 'self'; form-action 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
        )
    else:
        csp = (
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
            "font-src 'self' data:; connect-src 'self' ws: wss: http://localhost:* "
            "http://127.0.0.1:*; form-action 'self'; frame-ancestors 'none'; "
            "base-uri 'self'; object-src 'none'"
        )
    response.headers.setdefault("Content-Security-Policy", csp)

    if settings.ENVIRONMENT == "production":
        # Only meaningful once everything is served over TLS.
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.middleware("http")
async def rate_limit(request, call_next):
    """Coarse per-IP limit to blunt scripted abuse of the auth endpoints.

    Per-user limits on the expensive AI paths are applied by the routes, where
    the authenticated account is known and the budget can be tighter.
    """
    if request.url.path in _RATE_LIMITED_PATHS:
        client = request.client.host if request.client else "unknown"
        allowed, retry_after = hit(f"ip:{client}", _AUTH_LIMIT, _AUTH_WINDOW)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many attempts. Try again shortly."},
                headers={"Retry-After": str(retry_after)},
            )
    return await call_next(request)

# Register sub-routers
app.include_router(auth_routes.router)
app.include_router(email_routes.router)
app.include_router(ocr_routes.router)
app.include_router(analytics_routes.router)
app.include_router(settings_routes.router)

@app.get("/api/health")
def health_check():
    """Liveness plus configuration *status*, never configuration values.

    Booleans only. Knowing whether a credential is present is enough to
    diagnose a misconfigured deployment; knowing the credential is not.
    """
    return {
        "status": "healthy",
        "services": {"api": "online", "database": "ready", "ai_engine": "active"},
        "auth": {
            "google_oauth": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
            "demo_mode": bool(settings.DEMO_MODE),
        },
        "ai": {"gemini_key": bool((settings.GEMINI_API_KEY or "").strip())},
        "environment": settings.ENVIRONMENT,
    }

# ---------------------------------------------------------------------------
# Serve the built UI from this same process.
#
# Single-origin, so the browser makes same-origin requests and CORS is never
# involved. Registered last on purpose: the catch-all must not shadow the API
# routes above, and unknown /api paths must 404 rather than return index.html.
# ---------------------------------------------------------------------------
# An unknown /api path is a 404 whatever the method. Without this the SPA
# catch-all below would claim the path for GET only and report 405 for the
# rest, which reads as "wrong method" rather than "this endpoint is gone".
@app.api_route(
    "/api/{rest:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
async def api_not_found(rest: str):
    raise HTTPException(status_code=404, detail="Not Found")

_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _DIST.is_dir():
    _ASSETS = _DIST / "assets"
    if _ASSETS.is_dir():
        # Vite fingerprints asset filenames, so they can be cached hard. The
        # entry document must never be cached, or a browser keeps requesting
        # an old bundle hash after a deploy and renders nothing.
        assets = StaticFiles(directory=_ASSETS)

        @app.middleware("http")
        async def _asset_cache(request, call_next):
            if request.url.path.startswith("/assets/"):
                response = await call_next(request)
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                return response
            return await call_next(request)

        app.mount("/assets", assets, name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        if full_path:
            candidate = (_DIST / full_path).resolve()
            # Keep the lookup inside dist/ even if a path tries to escape it.
            if candidate.is_file() and candidate.is_relative_to(_DIST.resolve()):
                return FileResponse(
                    candidate, headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
                )
        # Never cached: see the note on the assets mount above.
        return FileResponse(
            _DIST / "index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
else:  # pragma: no cover
    logger.warning("frontend/dist not found at %s - serving the API only.", _DIST)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
