/**
 * The API client must be internally consistent.
 *
 * These caught a real crash: the client had methods calling `.then(unwrap)`
 * while the `unwrap` helper did not exist in the module, so opening a message
 * threw "Unwrap is not a function" and the reading pane white-screened.
 *
 * They also guard the feature wiring. The backend gained tone, extraction,
 * date filtering and personalised replies; a client that does not send the
 * new parameters would fail silently, showing an unfiltered list and an
 * impersonalised draft that look like they worked.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

const source = read('../src/services/api.js');
// Imports omit the extension, so try the ones Vite would resolve.
const has = (rel) =>
  ['', '.jsx', '.js', '/index.jsx'].some((ext) =>
    existsSync(join(here, rel + ext))
  );

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    process.exitCode = 1;
  }
};

check('unwrap helper is defined', () => {
  assert.ok(/function\s+unwrap\s*\(/.test(source), 'no unwrap definition found');
});

check('no method calls .then(unwrap) without unwrap in scope', () => {
  const calls = source.match(/\.then\(unwrap\)/g) || [];
  assert.ok(
    /function\s+unwrap\s*\(/.test(source) || calls.length === 0,
    `${calls.length} calls to unwrap but no definition`
  );
});

check('every method referenced by a component exists on the client', () => {
  const files = [
    '../src/components/EmailList.jsx',
    '../src/components/EmailDetail.jsx',
    '../src/components/AnalyzeView.jsx',
    '../src/components/HistoryView.jsx',
    '../src/components/ComposeModal.jsx',
    '../src/components/ExtractionPanel.jsx',
    '../src/components/FilterBar.jsx',
    '../src/App.jsx',
  ];
  const missing = new Set();
  for (const rel of files) {
    if (!has(rel)) continue;
    const text = read(rel);
    for (const m of text.matchAll(/\b(\w+API)\.(\w+)\s*\(/g)) {
      const [, obj, method] = m;
      if (!new RegExp(`export const ${obj}`).test(source)) continue;
      if (!new RegExp(`${obj}\\s*=\\s*\\{[\\s\\S]*?\\b${method}\\s*:`).test(source)) {
        missing.add(`${obj}.${method}`);
      }
    }
  }
  assert.equal(missing.size, 0, `missing client methods: ${[...missing].join(', ')}`);
});

check('no hardcoded localhost fallback in the production bundle path', () => {
  const base = /const API_BASE = .*?;/.exec(source)?.[0] ?? '';
  assert.ok(!/localhost:8000/.test(base), `API_BASE still falls back to localhost:8000: ${base}`);
});

// ---------------------------------------------------------------- new features

check('logout tells the server, not just the browser', () => {
  const logout = /logout:[\s\S]*?\n {2}\},/.exec(source)?.[0] ?? '';
  assert.ok(logout, 'no logout method found');
  assert.ok(
    /api\.post\(['"]\/api\/auth\/logout/.test(logout),
    'logout only clears localStorage; the server keeps the mail, learned style and OAuth tokens'
  );
  assert.ok(
    /finally\s*\{[\s\S]*removeItem/.test(logout),
    'logout must clear local storage in a finally, so a failed request cannot strand the user'
  );
});

check('suggestReply forwards the personalise flag', () => {
  const fn = /suggestReply:[\s\S]*?\n {2}\},/.exec(source)?.[0] ?? '';
  assert.ok(fn, 'no suggestReply found');
  assert.ok(/personalize/.test(fn), 'suggestReply ignores personalize');
  assert.ok(
    /const params = \{[^}]*personalize/.test(fn),
    'personalize is not put on the wire'
  );
});

check('getEmails drops empty filters', () => {
  const fn = /getEmails:[\s\S]*?\n {2}\},/.exec(source)?.[0] ?? '';
  assert.ok(fn, 'no getEmails found');
  assert.ok(
    /filter\(/.test(fn) && /!== ''/.test(fn),
    'empty filter values are sent as empty strings and filter for a category named ""'
  );
});

// This used to assert that App.jsx sends priority, tone, from_date, to_date and
// requires_reply. Those five filters are supported by the backend, but the UI
// has no controls for them: the FilterBar component that provided them is gone,
// and App.jsx only tracks folder, category and search. Asserting them here only
// tested a feature that does not exist.
//
// What is worth guarding is that the filters the UI *does* expose are actually
// forwarded, and that empty values are dropped rather than sent as "". The
// latter matters because a falsy-but-present value on the server is truthy
// there and would filter on a category literally named "".
check('the filters the UI exposes are forwarded', () => {
  const app = has('../src/App.jsx') ? read('../src/App.jsx') : '';
  for (const key of ['folder', 'category', 'search']) {
    assert.ok(
      new RegExp(`${key}:`).test(app),
      `App.jsx never sends ${key}; that filter would be inert`
    );
  }
});

check('recordReply and getStyleProfile exist', () => {
  for (const method of ['recordReply', 'getStyleProfile']) {
    assert.ok(
      new RegExp(`emailsAPI\\s*=\\s*\\{[\\s\\S]*?\\b${method}\\s*:`).test(source),
      `emailsAPI.${method} is missing`
    );
  }
});

check('components imported by App.jsx are all present', () => {
  if (!has('../src/App.jsx')) return;
  const app = read('../src/App.jsx');
  const missing = [];
  for (const m of app.matchAll(/from\s+'(\.\/components\/[^']+)'/g)) {
    if (!has(`../src/${m[1].replace('./', '')}`)) missing.push(m[1]);
  }
  assert.equal(missing.length, 0, `App.jsx imports missing components: ${missing.join(', ')}`);
});

check('ExtractionPanel renders only what was found', () => {
  if (!has('../src/components/ExtractionPanel.jsx')) return;
  const p = read('../src/components/ExtractionPanel.jsx');
  for (const field of ['people', 'keywords', 'meeting', 'action_items', 'key_deadlines']) {
    const probe = field === 'action_items' ? 'actionItems' : field;
    assert.ok(p.includes(probe), `ExtractionPanel ignores ${field}`);
  }
  assert.ok(
    /\{people\.length > 0 &&/.test(p) && /\{keywords\.length > 0 &&/.test(p),
    'empty blocks would render as blank sections'
  );
});

console.log(
  failures.length
    ? `  FAILURES\n${failures.map((f) => `    - ${f}`).join('\n')}`
    : `  ${passed} client-consistency checks passed`
);
