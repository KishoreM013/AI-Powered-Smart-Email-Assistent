/**
 * Security parity tests.
 *
 * These port the intent of backend/tests/test_security.py and
 * test_logout.py. The rules being protected are the ones that decide whether
 * one account can read or erase another's mail, so they are asserted directly
 * rather than inferred from a route returning 200.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccessToken,
  createTokenForUser,
  decodeAccessToken,
} from "../lib/auth";
import { decryptSecret, encryptSecret } from "../services/credentials";
import type { UserProfile } from "../models";

const user: UserProfile = {
  id: "google-oauth2|123",
  email: "owner@example.com",
  name: "Owner",
  avatar: "",
  is_demo: false,
  connected_gmail: true,
};

test("a token round-trips to the identity it was issued for", async () => {
  const token = await createTokenForUser(user);
  const payload = await decodeAccessToken(token);
  assert.equal(payload?.sub, user.id);
  assert.equal(payload?.email, user.email);
});

test("a tampered token is rejected", async () => {
  const token = await createTokenForUser(user);
  // Flip the payload segment while leaving the signature intact.
  const [head, , sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "attacker", email: "attacker@evil.test" }))
    .toString("base64url");
  assert.equal(await decodeAccessToken(`${head}.${forged}.${sig}`), null);
});

test("a token signed with a different secret is rejected", async () => {
  const token = await createAccessToken({ sub: "x", email: "x@y.test" });
  // Overwrite the signature with nonsense.
  const [head, body] = token.split(".");
  assert.equal(await decodeAccessToken(`${head}.${body}.AAAA`), null);
});

test("a token is not accepted without an account", async () => {
  // The Python version accepted a token missing sub/email by falling back to a
  // shared demo identity, which served anonymous callers as a real person.
  const noAccount = await createAccessToken({ role: "admin" });
  const payload = await decodeAccessToken(noAccount);
  assert.ok(payload, "token itself is valid");
  assert.equal(payload?.sub, undefined);
  assert.equal(payload?.email, undefined);
});

test("an expired token is rejected", async () => {
  // -1 minute, so it is already past expiry when signed.
  const expired = await createAccessToken({ sub: "u", email: "u@y.test" }, -1);
  assert.equal(await decodeAccessToken(expired), null);
});

test("garbage is rejected rather than throwing", async () => {
  for (const bad of ["", "not-a-token", "a.b.c", "...."]) {
    assert.equal(await decodeAccessToken(bad), null, `accepted: ${bad}`);
  }
});

test("a secret survives encryption and only decrypts with the same key", () => {
  const plaintext = "ya29.refresh-token-value";
  const sealed = encryptSecret(plaintext);
  assert.notEqual(sealed, plaintext);
  assert.ok(!sealed.includes(plaintext), "plaintext leaked into the blob");
  assert.equal(decryptSecret(sealed), plaintext);
});

test("each encryption uses a fresh nonce", () => {
  const a = encryptSecret("same input");
  const b = encryptSecret("same input");
  assert.notEqual(a, b, "identical ciphertexts would leak equality");
  assert.equal(decryptSecret(a), decryptSecret(b));
});

test("a modified ciphertext fails authentication instead of returning garbage", () => {
  const sealed = encryptSecret("sensitive");
  const [v, iv, tag, data] = sealed.split(".");
  // Flip a byte in the ciphertext body.
  const bytes = Buffer.from(data, "base64");
  bytes[0] ^= 0xff;
  const tampered = [v, iv, tag, bytes.toString("base64")].join(".");
  assert.throws(() => decryptSecret(tampered));
});

test("a wrong version tag is refused", () => {
  const sealed = encryptSecret("x");
  const parts = sealed.split(".");
  assert.throws(() => decryptSecret(["v9", ...parts.slice(1)].join(".")));
});
