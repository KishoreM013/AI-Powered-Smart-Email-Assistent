/**
 * Cloud Functions entry point.
 *
 * ONE deployed function exposing the whole API, rather than 33 separate
 * functions. Reasons specific to this app:
 *
 *  - The React client calls many endpoints per screen (inbox + counts +
 *    analytics). N functions means N cold starts and N round trips.
 *  - Every function would need the same Firestore client, rate limiter and
 *    auth wiring; a single process also keeps the in-memory rate limiter
 *    coherent, which is the one thing it still gets right.
 *  - Deploying 33 functions costs 33 build invocations per deploy.
 *
 * Firebase Hosting rewrites /api/** here, so the browser sees a single origin
 * and CORS is not involved in normal use.
 */

import express, { type Request, type Response } from "express";
import cors from "cors";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";
import { config, isAllowedOrigin } from "./config";
import { optionalUser, requireUser } from "./lib/auth";
import { hit, clientKey } from "./lib/rateLimit";
import { Store } from "./db/store";
import { registerHealth } from "./routes/health";
import { registerAuth } from "./routes/auth";
import { registerEmails } from "./routes/emails";
import { registerAnalytics } from "./routes/analytics";
import { registerSettings } from "./routes/settings";
import { registerOcr } from "./routes/ocr";

setGlobalOptions({
  region: "us-central1",
  // Gmail sync and Gemini summarisation both make outbound calls that can
  // take a while on a large mailbox.
  timeoutSeconds: 540,
  memory: "1GiB",
  // Reuse a warm instance between requests. Without this a cold start (a few
  // seconds of module loading) lands in front of every request after idle.
  minInstances: 0,
});

function initAdmin() {
  if (getApps().length) return;
  const projectId = config.GCP_PROJECT_ID;
  if (projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId });
    return;
  }
  // On Cloud Functions and when ADC is present locally.
  initializeApp({ credential: applicationDefault(), projectId });
}

initAdmin();

export const store = new Store(getFirestore());

const app = express();
app.disable("x-powered-by");

// ---- CORS -----------------------------------------------------------------
// Same-origin in production, because Hosting rewrites /api/** to this
// function. The allow-list exists for local dev and for direct calls.
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- request log ----------------------------------------------------------
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    logger.info({
      msg: "request",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
    });
  });
  next();
});

/** Reject before doing any work, rather than after a Gemini call. */
function rateLimit(limit: number, windowSeconds: number) {
  return (req: Request, res: Response, next: () => void) => {
    const verdict = hit(clientKey(req), limit, windowSeconds);
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
      res.status(429).json({ detail: "Too many requests" });
      return;
    }
    next();
  };
}

// ---- routes ---------------------------------------------------------------
// Mirrors the frozen contract in contract/openapi.json.
const api = express.Router();

// Exposed on app.locals so route modules can be tested against a stub store
// without importing Firebase at module load time.
app.locals.store = store;

api.use(rateLimit(300, 60)); // broad default

registerHealth(api);
registerAuth(api, { rateLimit, store });
registerEmails(api, { requireUser, optionalUser, rateLimit, store });
registerAnalytics(api, { requireUser, store });
registerSettings(api, { requireUser, rateLimit, store });
registerOcr(api, { requireUser, rateLimit, store });

app.use("/api", api);

// Anything unmatched is a 404 in the same shape FastAPI produced, so the
// frontend's error handling does not need a special case.
app.use((_req, res) => {
  res.status(404).json({ detail: "Not Found" });
});

// Express 4 does not catch rejected promises from async handlers, which would
// hang the request instead of returning a 500.
app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
  logger.error({ msg: "unhandled", error: err.message, stack: err.stack });
  if (res.headersSent) return;
  res.status(500).json({ detail: "Internal Server Error" });
});

export const api_ = onRequest(
  {
    // Bound the request body and invocation count a single deploy can absorb.
    invoker: "public",
    cors: true,
  },
  app,
);
