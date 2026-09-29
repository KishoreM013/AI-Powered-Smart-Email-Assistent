/**
 * The API client must be internally consistent.
 *
 * These caught a real crash: the client had methods calling `.then(unwrap)`
 * while the `unwrap` helper did not exist in the module, so opening a message
 * threw "Unwrap is not a function" and the reading pane white-screened.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');

let passed = 0;
const fail = (name, message) => {
  console.error(`  FAIL ${name}: ${message}`);
  process.exitCode = 1;
};
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    fail(name, e.message);
  }
};

check('unwrap helper is defined', () => {
  assert.ok(
    /function\s+unwrap\s*\(/.test(source),
    'api.js calls .then(unwrap) but never defines unwrap'
  );
});

check('unwrap is not shadowed by a differently-cased name', () => {
  const defined = /function\s+(unwrap)\s*\(/.exec(source)?.[1];
  const used = new Set([...source.matchAll(/\.then\(\s*(\w+)\s*\)/g)].map((m) => m[1]));
  assert.ok(defined, 'no unwrap definition found');
  for (const name of used) {
    assert.ok(
      new RegExp(`function\\s+${name}\\s*\\(`).test(source),
      `client uses .then(${name}) but ${name} is not defined`
    );
  }
});

check('every method referenced by a component exists on the client', () => {
  const client = source;
  const files = [
    '../src/components/EmailList.jsx',
    '../src/components/EmailDetail.jsx',
    '../src/components/AnalyzeView.jsx',
    '../src/components/HistoryView.jsx',
    '../src/components/ComposeModal.jsx',
    '../src/App.jsx',
  ];
  const missing = new Set();
  for (const rel of files) {
    let text;
    try {
      text = readFileSync(new URL(rel, import.meta.url), 'utf8');
    } catch {
      continue; // an optional view that is not present in this build
    }
    for (const m of text.matchAll(/\b(\w+API)\.(\w+)\s*\(/g)) {
      const [, obj, method] = m;
      if (!new RegExp(`export const ${obj}`).test(client)) continue;
      if (!new RegExp(`${obj}\\s*=\\s*\\{[\\s\\S]*?\\b${method}\\s*:`).test(client)) {
        missing.add(`${obj}.${method}`);
      }
    }
  }
  assert.equal(missing.size, 0, `missing client methods: ${[...missing].join(', ')}`);
});

check('no hardcoded localhost fallback in the production bundle path', () => {
  const base = /const API_BASE = .*?;/.exec(source)?.[0] ?? '';
  assert.ok(
    !/localhost:8000/.test(base),
    `API_BASE still falls back to localhost:8000: ${base}`
  );
});

console.log(`  ${process.exitCode ? 'FAILURES' : `${passed} client-consistency checks passed`}`);
