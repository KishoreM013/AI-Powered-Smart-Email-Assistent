/**
 * Route contract parity against the frozen Python spec.
 *
 * contract/openapi.json was captured from the running FastAPI app before the
 * port. This asserts that every operation in it is still registered, so a route
 * cannot be dropped during a refactor without a test failing.
 *
 * The check is deliberately static: it reads the route source and does not
 * import index.ts, because importing that initialises the Firebase Admin SDK.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// This test runs from lib/test/, but the route source is TypeScript and is not
// copied into the build output, so point at src/ rather than the sibling
// directory. Reading lib/routes would find only .js files, which the filter
// below skips, and the route set would come back empty.
// __dirname is lib/test at runtime. ../src/routes is the TypeScript source;
// reading lib/routes would find only .js, which the .ts filter skips, leaving
// the route set empty.
const ROUTES_DIR = join(__dirname, "..", "..", "src", "routes");
// lib/test -> lib -> functions -> project root.
const CONTRACT = join(__dirname, "..", "..", "..", "contract", "openapi.json");

/** Normalise both `:param` and `{param}` to a single placeholder. */
function norm(path: string): string {
  return path.replace(/\{[^}]*\}/g, "{}").replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "{}");
}

function tsRoutes(): Set<string> {
  const out = new Set<string>();
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(ROUTES_DIR, file), "utf8");
    for (const m of source.matchAll(/api\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
      out.add(`${m[1].toUpperCase()} /api${norm(m[2])}`);
    }
  }
  return out;
}

test("the frozen contract is present", () => {
  assert.ok(existsSync(CONTRACT), `missing ${CONTRACT}; cannot verify parity`);
});

test("every operation in the Python contract is registered in the port", () => {
  const spec = JSON.parse(readFileSync(CONTRACT, "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const implemented = tsRoutes();
  const missing: string[] = [];

  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) {
      const key = `${method.toUpperCase()} ${norm(path)}`;
      if (!implemented.has(key)) missing.push(key);
    }
  }

  assert.deepEqual(
    missing,
    [],
    `routes present in the Python contract but not in the port:\n  ${missing.join("\n  ")}`,
  );
});

test("the port registers no route the contract does not describe", () => {
  // Allowed additions are deliberate and documented: aliases for client call
  // sites that disagreed with the contract, and the /api/health probe.
  const spec = JSON.parse(readFileSync(CONTRACT, "utf8")) as {
    paths: Record<string, unknown>;
  };
  const contracted = new Set<string>();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops as Record<string, unknown>)) {
      contracted.add(`${method.toUpperCase()} ${norm(path)}`);
    }
  }

  const intentional = new Set([
    // The React client POSTs here; the Python backend never had this route.
    "POST /api/auth/google-login",
    "GET /api/auth/google",
    "POST /api/auth/google",
    // Health probe for the load balancer and the deploy script.
    "GET /api/health",
    // Superset of the contract: used by api.js in preference to the old
    // toggle endpoints, which were wrappers over this.
    "PATCH /api/emails/{}",
    "POST /api/emails/{}/summarize",
    "POST /api/emails/{}/purge",
    // Same operation, second verb. The contract has GET for the OAuth
    // redirect (what Google actually calls) and the SPA used POST.
    "POST /api/auth/callback",
    // Same operation, second name/verb: api.js uses one of each.
    "POST /api/ocr/scan",
    "POST /api/settings",
    // The contract's /settings is POST; PUT is the verb api.js actually wants
    // for a full-document update. Both are served.
    "PUT /api/settings",
    "GET /api/emails/{}/suggest-reply",
    "POST /api/emails/{}/suggest-reply",
    "POST /api/emails/{}/phishing-check",
  ]);

  const undocumented = [...tsRoutes()].filter(
    (r) => !contracted.has(r) && !intentional.has(r),
  );
  assert.deepEqual(
    undocumented,
    [],
    `routes added without a note in the intentional list:\n  ${undocumented.join("\n  ")}`,
  );
});

test("every route sits under /api", () => {
  for (const route of tsRoutes()) {
    assert.ok(route.includes(" /api/"), `route outside /api: ${route}`);
  }
});
