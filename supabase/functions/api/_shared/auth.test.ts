/**
 * Auth and credential-encryption parity tests, run on Deno.
 *
 * Mirrors functions/src/test/security.test.ts. The rules protected here decide
 * whether one account can read or erase another's mail, so they are asserted
 * directly rather than inferred from a route returning 200.
 */

import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  createAccessToken,
  createTokenForUser,
  decodeAccessToken,
} from "./auth.ts";
import { decryptSecret, encryptSecret } from "./credentials.ts";
import type { UserProfile } from "./types.ts";

const user: UserProfile = {
  id: "google-oauth2|123",
  email: "owner@example.com",
  name: "Owner",
  avatar: "",
  is_demo: false,
  connected_gmail: true,
};

Deno.test("a token round-trips to the identity it was issued for", async () => {
  const payload = await decodeAccessToken(await createTokenForUser(user));
  assertEquals(payload?.sub, user.id);
  assertEquals(payload?.email, user.email);
});

Deno.test("a tampered token is rejected", async () => {
  const token = await createTokenForUser(user);
  const [head, , sig] = token.split(".");
  const forged = btoa(
    JSON.stringify({ sub: "attacker", email: "attacker@evil.test" }),
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEquals(await decodeAccessToken(`${head}.${forged}.${sig}`), null);
});

Deno.test("a token with a broken signature is rejected", async () => {
  const token = await createAccessToken({ sub: "x", email: "x@y.test" });
  const [head, body] = token.split(".");
  assertEquals(await decodeAccessToken(`${head}.${body}.AAAA`), null);
});

Deno.test("a token is not accepted without an account", async () => {
  // The Python version accepted a token missing sub/email by falling back to a
  // shared demo identity, which served anonymous callers as a real person.
  const payload = await decodeAccessToken(await createAccessToken({ role: "admin" }));
  assert(payload, "token itself is valid");
  assertEquals(payload?.sub, undefined);
  assertEquals(payload?.email, undefined);
});

Deno.test("an expired token is rejected", async () => {
  assertEquals(await decodeAccessToken(
    await createAccessToken({ sub: "u", email: "u@y.test" }, -1),
  ), null);
});

Deno.test("garbage is rejected rather than throwing", async () => {
  for (const bad of ["", "not-a-token", "a.b.c", "...."]) {
    assertEquals(await decodeAccessToken(bad), null, `accepted: ${bad}`);
  }
});

Deno.test("a secret survives encryption and decrypts back", async () => {
  const plaintext = "ya29.refresh-token-value";
  const sealed = await encryptSecret(plaintext);
  assert(sealed !== plaintext);
  assert(!sealed.includes(plaintext), "plaintext leaked into the blob");
  assertEquals(await decryptSecret(sealed), plaintext);
});

Deno.test("each encryption uses a fresh nonce", async () => {
  const a = await encryptSecret("same input");
  const b = await encryptSecret("same input");
  assert(a !== b, "identical ciphertexts would leak equality");
  assertEquals(await decryptSecret(a), await decryptSecret(b));
});

Deno.test("a modified ciphertext fails authentication instead of returning garbage", async () => {
  const sealed = await encryptSecret("sensitive");
  const [v, iv, tag, data] = sealed.split(".");
  const bytes = Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0));
  bytes[0] ^= 0xff;
  const tampered = [v, iv, tag, btoa(String.fromCharCode(...bytes))].join(".");
  await assertRejects(() => decryptSecret(tampered));
});

Deno.test("a wrong version tag is refused", async () => {
  const sealed = await encryptSecret("x");
  const parts = sealed.split(".");
  await assertRejects(() => decryptSecret(["v9", ...parts.slice(1)].join(".")));
});
