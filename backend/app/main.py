from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
