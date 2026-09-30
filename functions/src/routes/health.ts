import type { Request, Response, Router } from "express";
import { config, isLiveGoogleConfigured } from "../config";

/**
 * Port of the /api/health handler in app/main.py.
 *
 * Unauthenticated on purpose: Render and Railway poll it as a readiness
 * probe, and Cloud Run's startup probe hits it.
 */
export function registerHealth(api: Router): void {
  api.get("/health", async (_req: Request, res: Response) => {
    let database: "ready" | "unreachable" = "ready";
    try {
      // A cheap read that proves the connection and the credentials, without
      // writing anything.
      const { getFirestore } = await import("firebase-admin/firestore");
      await getFirestore().collection("emails").limit(1).get();
    } catch {
      database = "unreachable";
    }
    res.json({
      status: "healthy",
      environment: config.ENVIRONMENT,
      services: {
        api: "online",
        database,
        ai_engine: config.GEMINI_API_KEY ? "active" : "unconfigured",
      },
      google_oauth: isLiveGoogleConfigured() ? "configured" : "unconfigured",
      demo_mode: config.DEMO_MODE,
    });
  });
}
