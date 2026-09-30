/**
 * JWT issuing and verification, replacing lib/auth.ts.
 *
 * Hand-rolled on WebCrypto rather than pulling in `jose`, because a Deno
 * edge function should not need a 40 KB dependency to check a signature.
 * HS256 only, which is all the Python version ever used.
 */
import { config } from "./config.js";
const enc = new TextEncoder();
function b64url(data) {
    let s = "";
    for (const b of data)
        s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/**
 * Decode base64url into a fresh ArrayBuffer.
 *
 * The `new Uint8Array(n)` constructor yields a Uint8Array<ArrayBufferLike>,
 * which TypeScript refuses to pass to WebCrypto, whose signatures demand a
 * BufferSource backed by a plain ArrayBuffer. Allocating the buffer explicitly
 * and wrapping it is what satisfies the type.
 */
function fromB64url(s) {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const buf = new ArrayBuffer(b.length);
    const out = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 1)
        out[i] = b.charCodeAt(i);
    return out;
}
// Not async: importKey already returns a promise, and wrapping it in an async
// function that never awaits is just a redundant microtask hop on every request.
function key() {
    return crypto.subtle.importKey("raw", enc.encode(config.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function createAccessToken(data, expiresMinutes) {
    const minutes = expiresMinutes ?? config.ACCESS_TOKEN_EXPIRE_MINUTES;
    const header = b64url(enc.encode(JSON.stringify({ alg: config.JWT_ALGORITHM, typ: "JWT" })));
    const payload = b64url(enc.encode(JSON.stringify({
        ...data,
        // Seconds, not milliseconds. Using ms here produces a token that looks
        // valid for 50,000 years.
        exp: Math.floor(Date.now() / 1000) + minutes * 60,
    })));
    const signingInput = `${header}.${payload}`;
    const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(signingInput));
    return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}
export async function decodeAccessToken(token) {
    try {
        const [header, payload, signature] = token.split(".");
        if (!header || !payload || !signature)
            return null;
        const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(signature), enc.encode(`${header}.${payload}`));
        if (!ok)
            return null;
        const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
        const exp = Number(claims.exp ?? 0);
        if (!exp || exp < Math.floor(Date.now() / 1000))
            return null;
        return claims;
    }
    catch {
        return null;
    }
}
// Not async: it only forwards to createAccessToken, which is already async.
// Declaring it async would add a wrapper promise for no benefit, and callers
// get the same thenable either way.
export function createTokenForUser(user, expiresMinutes) {
    return createAccessToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        is_demo: user.is_demo,
        connected_gmail: user.connected_gmail,
    }, expiresMinutes);
}
/**
 * A valid signature is not enough: the token must name a real account.
 * These fields used to fall back to a shared demo identity, so a token missing
 * them was accepted as somebody else.
 */
function profileFrom(payload) {
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || !sub)
        return null;
    if (typeof email !== "string" || !email)
        return null;
    return {
        id: sub,
        email,
        name: payload.name || email.split("@")[0],
        avatar: payload.avatar || "",
        is_demo: Boolean(payload.is_demo),
        connected_gmail: payload.connected_gmail === undefined ? true : Boolean(payload.connected_gmail),
    };
}
export function bearerToken(req) {
    const header = req.headers.get("authorization");
    if (!header || !header.startsWith("Bearer "))
        return null;
    return header.slice(7).trim() || null;
}
export async function requireUser(req) {
    const token = bearerToken(req);
    if (!token)
        throw new HttpError(401, "Not authenticated");
    const payload = await decodeAccessToken(token);
    if (!payload)
        throw new HttpError(401, "Invalid or expired session");
    const user = profileFrom(payload);
    if (!user)
        throw new HttpError(401, "Session is missing an account");
    return user;
}
export class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
