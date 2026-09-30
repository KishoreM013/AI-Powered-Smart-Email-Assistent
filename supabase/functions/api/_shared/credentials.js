/**
 * Credential encryption, replacing services/credentials.ts (Node crypto) and
 * the original Python Fernet store.
 *
 * AES-256-GCM on WebCrypto, which Deno exposes. GCM is authenticated, so a
 * tampered blob fails to decrypt rather than yielding garbage -- that matters
 * here, because these are OAuth refresh tokens.
 *
 * Format: v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
 */
import { config } from "./config.js";
const VERSION = "v1";
const IV_BYTES = 12;
const SALT = new TextEncoder().encode("smart-email-assistant/v1");
const enc = new TextEncoder();
const dec = new TextDecoder();
function b64url(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let s = "";
    for (const b of bytes)
        s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** See auth.ts: the explicit ArrayBuffer is what makes it a BufferSource. */
function fromB64url(s) {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(new ArrayBuffer(b.length));
    for (let i = 0; i < b.length; i += 1)
        out[i] = b.charCodeAt(i);
    return out;
}
/**
 * Derive a full-length key from whatever passphrase is configured.
 *
 * PBKDF2 because the configured value is human-supplied, and a 20-character
 * passphrase fed straight to AES would be a 160-bit key at best.
 */
async function key() {
    const secret = config.CREDENTIAL_ENCRYPTION_KEY || config.JWT_SECRET;
    if (!secret) {
        throw new Error("No encryption key available. Set CREDENTIAL_ENCRYPTION_KEY in production.");
    }
    const material = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, [
        "deriveKey",
    ]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptSecret(plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plaintext));
    // WebCrypto appends the tag to the ciphertext; split them out so the stored
    // format is explicit about both halves.
    const all = new Uint8Array(ciphertext);
    const tag = all.slice(all.length - 16);
    const body = all.slice(0, all.length - 16);
    return [VERSION, b64url(iv), b64url(tag), b64url(body)].join(".");
}
export async function decryptSecret(blob) {
    const parts = (blob || "").split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error("Unrecognised credential format");
    }
    const iv = fromB64url(parts[1]);
    const tag = fromB64url(parts[2]);
    const body = fromB64url(parts[3]);
    const combined = new Uint8Array(body.length + tag.length);
    combined.set(body, 0);
    combined.set(tag, body.length);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, await key(), combined);
    return dec.decode(plaintext);
}
