import type { Request, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { config, isLiveGoogleConfigured } from "../config";
import { createTokenForUser, decodeAccessToken } from "../lib/auth";
import { encryptSecret } from "../services/credentials";
import type { Store } from "../db/store";
import type { UserProfile } from "../models";

/**
 * Port of app/routes/auth_routes.py.
 *
 * The Google OAuth flow is unchanged in shape: exchange the code, keep the
 * refresh token sealed, issue our own JWT. What changed is that the refresh
 * token now lives in Firestore encrypted with AES-256-GCM, because there is no
 * process memory to hold it between invocations.
 */
export function registerAuth(
  api: Router,
  deps: { rateLimit: any; store: Store },
): void {
  const { rateLimit, store } = deps;

  const oauth = new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );

  /** Public: tells the login page which provider and redirect to use. */
  api.get("/auth/config", (_req: Request, res: Response) => {
    res.json({
      google_client_id: config.GOOGLE_CLIENT_ID ?? "",
      google_redirect_uri: config.GOOGLE_REDIRECT_URI,
      is_live_configured: isLiveGoogleConfigured(),
      demo_mode: config.DEMO_MODE,
    });
  });

  api.get("/auth/login-url", (_req: Request, res: Response) => {
    if (!isLiveGoogleConfigured()) {
      res.status(503).json({ detail: "Google OAuth is not configured" });
      return;
    }
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      // Without this, Google returns no refresh token on a second consent and
      // the account silently stops syncing.
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
    res.json({ url });
  });

  const finishLogin = async (res: Response, code: string) => {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) {
      res.status(400).json({ detail: "Google did not return an id_token" });
      return;
    }
    const ticket = await oauth.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(400).json({ detail: "Google account has no email" });
      return;
    }

    const user: UserProfile = {
      id: payload.sub ?? payload.email,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email.split("@")[0],
      avatar: payload.picture ?? "",
      is_demo: false,
      connected_gmail: true,
    };

    if (tokens.refresh_token) {
      // Sealed before it is written. A refresh token outlives the session
      // that created it, so it must never sit in Firestore in the clear.
      await store.setUserCredentials(user.email, {
        refresh_token: encryptSecret(tokens.refresh_token),
        access_token: tokens.access_token ? encryptSecret(tokens.access_token) : null,
        scope: tokens.scope ?? null,
        expiry_date: tokens.expiry_date ?? null,
      });
    }

    const access_token = await createTokenForUser(user);
    res.json({ access_token, token_type: "bearer", user });
  };

  api.post("/auth/callback", rateLimit(20, 60), async (req: Request, res: Response) => {
    const code = (req.body?.code ?? req.query.code) as string | undefined;
    if (!code) {
      res.status(400).json({ detail: "Missing authorization code" });
      return;
    }
    try {
      await finishLogin(res, code);
    } catch (err) {
      res.status(400).json({
        detail: `Google sign-in failed: ${(err as Error).message}`,
      });
    }
  });

  /**
   * Exchange a Google id_token obtained client-side.
   * Verified against the configured client id, so a token minted for another
   * app cannot be used to create a session here.
   *
   * NOTE: the React client POSTs to /auth/google-login, not /auth/google. The
   * Python backend had no such route, so Google sign-in through the UI has
   * been failing against this contract. Both paths are registered here so the
   * client works either way; the alias can be dropped once api.js is updated.
   */
  const exchangeIdToken = async (req: Request, res: Response) => {
    const idToken = req.body?.id_token as string | undefined;
    if (!idToken) {
      res.status(400).json({ detail: "Missing id_token" });
      return;
    }
    try {
      const clientId = config.GOOGLE_CLIENT_ID;
      if (!clientId) throw new Error("Google OAuth is not configured");
      const ticket = await oauth.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error("Google account has no email");
      const user: UserProfile = {
        id: payload.sub ?? payload.email,
        email: payload.email.toLowerCase(),
        name: payload.name ?? payload.email.split("@")[0],
        avatar: payload.picture ?? "",
        is_demo: false,
        connected_gmail: true,
      };
      res.json({
        access_token: await createTokenForUser(user),
        token_type: "bearer",
        user,
      });
    } catch (err) {
      res.status(401).json({ detail: `Invalid Google token: ${(err as Error).message}` });
    }
  };

  /**
   * OAuth redirect target, kept from the contract as GET.
   *
   * Google redirects the browser here with ?code=. A GET handler that exchanges
   * the code and then redirects to the SPA is what makes the flow work from a
   * plain browser navigation; the POST variant is kept for the SPA flow.
   */
  api.get("/auth/callback", rateLimit(20, 60), async (req: Request, res: Response) => {
    const code = (req.query.code as string) ?? undefined;
    if (!code) {
      res.status(400).json({ detail: "Missing authorization code" });
      return;
    }
    try {
      await finishLogin(res, code);
    } catch (err) {
      res.status(400).json({
        detail: `Google sign-in failed: ${(err as Error).message}`,
      });
    }
  });

  const idTokenLimit = rateLimit(20, 60);
  api.post("/auth/google", idTokenLimit, exchangeIdToken);
  api.post("/auth/google-login", idTokenLimit, exchangeIdToken);

  /**
   * IMAP sign-in, kept from the contract.
   *
   * Deliberately NOT implemented: it would mean holding a user's raw app
   * password in Firestore so the server can log into their mailbox on every
   * request. Google already deprecated password-based sign-in for most
   * accounts, and a server-side plaintext mail password is a much worse
   * exposure than a revocable OAuth grant. Refusing is the safer behaviour, and
   * it is a refusal rather than a silent 500 so the client can explain itself.
   */
  const imapRejected = (_req: Request, res: Response) => {
    res.status(501).json({
      detail:
        "IMAP password sign-in has been removed. Use Google OAuth: it is revocable and does not require storing a mailbox password.",
    });
  };
  api.post("/auth/imap-login", rateLimit(5, 300), imapRejected);

  api.get("/auth/me", async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ detail: "Not authenticated" });
      return;
    }
    const payload = await decodeAccessToken(header.slice(7).trim());
    if (!payload?.email || !payload.sub) {
      res.status(401).json({ detail: "Invalid or expired session" });
      return;
    }
    res.json({
      id: payload.sub,
      email: payload.email,
      name: (payload.name as string) ?? (payload.email as string).split("@")[0],
      avatar: (payload.avatar as string) ?? "",
      is_demo: Boolean(payload.is_demo),
      connected_gmail: payload.connected_gmail === undefined ? true : Boolean(payload.connected_gmail),
    });
  });

  /**
   * Sign out: drop the stored Google grant as well as the session.
   *
   * Leaving the refresh token behind would keep mailbox access alive after the
   * user asked to be forgotten.
   */
  api.post("/auth/logout", async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const payload = await decodeAccessToken(header.slice(7).trim());
      if (payload?.email) {
        await store.setUserCredentials(payload.email as string, {});
      }
    }
    res.json({ status: "success" });
  });
}
