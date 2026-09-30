import type { Request, Response, Router } from "express";
import type { Store } from "../db/store";
import { DEFAULT_SETTINGS, type SettingsUpdateRequest } from "../models";

/**
 * Port of app/routes/settings_routes.py.
 *
 * The Python version mutated a process-wide dict, which meant one user's
 * settings were visible to the next and nothing survived a cold start. Here
 * settings are per-account documents in Firestore.
 */
export function registerSettings(
  api: Router,
  deps: { requireUser: any; rateLimit: any; store: Store },
): void {
  const { requireUser, rateLimit, store } = deps;

  api.get("/settings", requireUser, async (req: Request, res: Response) => {
    res.json(await store.getSettings(req.user!.email));
  });

  /**
   * Save settings.
   *
   * Registered for both PUT and POST: the contract says PUT, but the React
   * client calls POST. Rather than leave a 405 behind a working-looking button,
   * both are served by one handler.
   */
  const saveSettings = async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as SettingsUpdateRequest;
    const updates: Partial<typeof DEFAULT_SETTINGS> = {};
    // Only the fields the schema declares are accepted, so a caller cannot
    // smuggle extra keys into the document.
    if (typeof body.gemini_api_key === "string") updates.gemini_api_key = body.gemini_api_key;
    if (typeof body.demo_mode === "boolean") updates.demo_mode = body.demo_mode;
    if (typeof body.auto_reply_enabled === "boolean") {
      updates.auto_reply_enabled = body.auto_reply_enabled;
    }
    if (typeof body.default_reply_tone === "string") {
      updates.default_reply_tone = body.default_reply_tone;
    }
    const merged = await store.setSettings(req.user!.email, updates);
    res.json({ status: "success", settings: merged });
  };

  api.put("/settings", requireUser, rateLimit(30, 60), saveSettings);
  api.post("/settings", requireUser, rateLimit(30, 60), saveSettings);
}
