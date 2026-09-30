/**
 * Credential encryption, replacing app/services/credential_store.py.
 *
 * The Python version used Fernet from `cryptography`. Cloud Functions has no
 * native module support, so this uses AES-256-GCM from Node's built-in crypto.
 *
 * Stored format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 *
 * GCM is authenticated, so a tampered or truncated blob fails to decrypt rather
 * than yielding garbage. That matters here: these are OAuth refresh tokens.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SALT = "smart-email-assistant/v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = config.CREDENTIAL_ENCRYPTION_KEY || config.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "No encryption key available. Set CREDENTIAL_ENCRYPTION_KEY in production.",
    );
  }
  // scrypt so a short or reused secret still yields a full-length key.
  cachedKey = scryptSync(secret, SALT, KEY_BYTES);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(blob: string): string {
  const parts = (blob || "").split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised credential format");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Constant-time compare, so a caller cannot learn a secret byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
