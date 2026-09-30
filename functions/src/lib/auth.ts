/**
 * Port of app/auth/auth_handler.py.
 *
 * Fails closed throughout. The Python version used to fall back to a shared
 * demo account when a token was missing or invalid, which served an
 * unauthenticated request as a real person; that behaviour is not reproduced.
 */

import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";
import type { UserProfile } from "../models";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}

const ALG = "HS256";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function createAccessToken(
  data: Record<string, unknown>,
  expiresMinutes?: number,
): Promise<string> {
  const minutes = expiresMinutes ?? config.ACCESS_TOKEN_EXPIRE_MINUTES;
  return new SignJWT(data as Record<string, string>)
    .setProtectedHeader({ alg: ALG })
    .setExpirationTime(`${minutes}m`)
    .sign(secretKey());
}

export async function decodeAccessToken(
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createTokenForUser(
  user: UserProfile,
  expiresMinutes?: number,
): Promise<string> {
  return createAccessToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      is_demo: user.is_demo,
      connected_gmail: user.connected_gmail,
    },
    expiresMinutes,
  );
}

function profileFrom(payload: Record<string, unknown>): UserProfile | null {
  // A valid signature is not enough: the token must actually name an account.
  // These fields used to fall back to a shared demo identity, so a token
  // missing them was accepted as somebody else.
  const subject = payload.sub;
  const email = payload.email;
  if (typeof subject !== "string" || !subject) return null;
  if (typeof email !== "string" || !email) return null;
  return {
    id: subject,
    email,
    name: (payload.name as string) || email.split("@")[0],
    avatar: (payload.avatar as string) || "",
    is_demo: Boolean(payload.is_demo),
    connected_gmail: payload.connected_gmail === undefined
      ? true
      : Boolean(payload.connected_gmail),
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/** Reject unless the request carries a valid session naming a real account. */
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({ detail: "Not authenticated" });
    return;
  }
  const payload = await decodeAccessToken(token);
  if (!payload) {
    res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({ detail: "Invalid or expired session" });
    return;
  }
  const user = profileFrom(payload);
  if (!user) {
    res.status(401).json({ detail: "Session is missing an account" });
    return;
  }
  req.user = user;
  next();
}

/**
 * Attach the caller if a valid session is present, otherwise continue.
 *
 * Still has to identify somebody: falling back to a shared address would hand
 * an anonymous caller a real identity.
 */
export async function optionalUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  if (token) {
    const payload = await decodeAccessToken(token);
    if (payload) {
      const user = profileFrom(payload);
      if (user) req.user = user;
    }
  }
  next();
}
