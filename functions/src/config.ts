/**
 * Port of app/config.py.
 *
 * On Cloud Functions there is no .env file. Values come from the process
 * environment, and anything secret should be attached with
 * `firebase functions:secrets:set` rather than committed. See README.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const text = v.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to comma splitting */
    }
  }
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  APP_NAME: "AI-Powered Smart Email Assistant",
  ENVIRONMENT: str("ENVIRONMENT", "development"),

  DEMO_MODE: bool("DEMO_MODE", true),

  // ---- Security
  JWT_SECRET: str("JWT_SECRET", "smart_email_secret_key_change_in_production_2026_jwt_token"),
  JWT_ALGORITHM: "HS256" as const,
  ACCESS_TOKEN_EXPIRE_MINUTES: int("ACCESS_TOKEN_EXPIRE_MINUTES", 1440),

  // ---- Google OAuth
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET"),
  GOOGLE_REDIRECT_URI: str("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback"),

  // ---- Gemini AI
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),
  GEMINI_MODEL: str("GEMINI_MODEL", "gemini-2.0-flash"),
  GEMINI_TIMEOUT_SECONDS: int("GEMINI_TIMEOUT_SECONDS", 30),

  // ---- Firebase
  GCP_PROJECT_ID: optional("GCLOUD_PROJECT") ?? optional("GCP_PROJECT_ID"),
  FIREBASE_CONFIG: optional("FIREBASE_CONFIG"),

  /**
   * Where encrypted OAuth refresh tokens live. Uses AES-256-GCM via the Node
   * crypto module, the same construction as the Python credential_store, so a
   * token sealed by one implementation cannot be silently misread by the other.
   */
  CREDENTIAL_ENCRYPTION_KEY: optional("CREDENTIAL_ENCRYPTION_KEY"),

  // ---- Frontend
  FRONTEND_URL: str("FRONTEND_URL", "http://localhost:5173"),
  CORS_ORIGINS: list("CORS_ORIGINS", [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ]),

  MAX_SYNC_EMAILS: int("MAX_SYNC_EMAILS", 50),
  IMAP_MAX_EMAILS: int("IMAP_MAX_EMAILS", 50),
} as const;

/**
 * Starlette matches allow_origins by exact string, so a value like
 * "https://*.web.app" matches nothing and silently allows nobody. Deployment
 * hostnames are not known in advance, so Firebase domains are matched by regex
 * instead.
 */
const FIREBASE_HOST_REGEX =
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:web\.app|firebaseapp\.com)$/;

/** Origins allowed in addition to the explicit list. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl
  const cleaned = origin.replace(/\/$/, "");
  if (config.CORS_ORIGINS.some((o) => o.replace(/\/$/, "") === cleaned)) return true;
  if (config.FRONTEND_URL.replace(/\/$/, "") === cleaned) return true;
  if (FIREBASE_HOST_REGEX.test(cleaned)) return true;
  if (config.ENVIRONMENT !== "production") {
    // Vite dev server on any port during local development.
    return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(cleaned);
  }
  return false;
}

export function isLiveGoogleConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}
