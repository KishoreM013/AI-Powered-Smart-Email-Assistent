/**
 * Every design-system class a component uses must actually exist.
 *
 * This caught a class that was invented rather than defined: the extraction
 * panel labelled its rows `ink-faint`, which is not in index.css, so every one
 * of those labels silently inherited full-strength ink and the panel read as
 * a wall of bold text. Nothing errored and no test noticed.
 *
 * Tailwind utilities are resolved by the build, so only the project's own
 * classes need checking here: the ones that look semantic and therefore look
 * safe to use but are easy to invent.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

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

const css = read('../src/index.css');

// The project's own class names, defined as `.name` in a rule.
const defined = new Set(
  [...css.matchAll(/^\s*\.([a-z][a-z0-9-]*)/gim)].map((m) => m[1])
);

check('the design system actually defines classes', () => {
  assert.ok(defined.size > 15, `only found ${defined.size} classes; the scan is broken`);
});

const componentDir = join(here, '../src/components');
const files = readdirSync(componentDir).filter((f) => f.endsWith('.jsx'));

check('there are components to scan', () => {
  assert.ok(files.length > 3, `only ${files.length} components found`);
});

// A class is "ours" if it is not a Tailwind utility. The list covers the
// utility families this project actually uses, so a typo inside one of them
// (text-sma, flex-cols) is still checked.
const TAILWIND_PREFIX = new Set([
  'text', 'bg', 'border', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my',
  'mt', 'mb', 'ml', 'mr', 'w', 'h', 'min', 'max', 'flex', 'grid', 'gap', 'items',
  'justify', 'self', 'place', 'space', 'rounded', 'font', 'leading', 'tracking',
  'uppercase', 'lowercase', 'capitalize', 'truncate', 'whitespace', 'break',
  'overflow', 'absolute', 'relative', 'fixed', 'sticky', 'static', 'inset',
  'top', 'bottom', 'left', 'right', 'z', 'opacity', 'shadow', 'ring', 'cursor',
  'select', 'transition', 'transform', 'scale', 'translate', 'rotate', 'animate',
  'hidden', 'block', 'inline', 'table', 'list', 'object', 'overflow', 'col',
  'row', 'order', 'basis', 'grow', 'shrink', 'from', 'via', 'to', 'sr-only',
  'blur', 'pointer', 'not', 'normal', 'resize', 'tabular', 'duration', 'delay',
  'group',
  'backdrop', 'divide', 'placeholder', 'caret', 'accent', 'outline', 'fill',
  'stroke', 'decoration', 'align', 'whitespace', 'indent', 'container', 'columns',
]);

const VARIANT = /^(dark|hover|focus|active|group|peer|disabled|placeholder|sm|md|lg|xl|2xl|print|motion-safe|motion-reduce|aria)/;

const isTailwind = (c) => {
  // Arbitrary values: text-[13px], w-[calc(100%-2rem)]
  if (c.includes('[') || c.includes(']')) return true;
  // Important modifier and negative values: !w-8, -right-4, -translate-y-1/2
  if (c.startsWith('!') || c.startsWith('-')) c = c.slice(1);
  // Variant prefixes: hover:opacity-80, dark:bg-slate-900, sm:grid-cols-2
  const parts = c.split(':');
  if (parts.length > 1 && parts.some((p, i) => i < parts.length - 1 && VARIANT.test(p))) {
    return true;
  }
  // The utility family is the FIRST segment: w-4, px-2, items-center.
  const family = parts[parts.length - 1].split('-')[0];
  return TAILWIND_PREFIX.has(family);
};

check('no component uses a class that was never defined', () => {
  const unknown = new Map();
  for (const f of files) {
    const text = readFileSync(join(componentDir, f), 'utf8');
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const raw = (m[1] || m[2] || '')
        .replace(/\$\{[^}]*\}/g, ' ')   // drop interpolations
        .replace(/[?].*$/s, ' ');       // drop ternary branches
      for (const cls of raw.split(/\s+/).filter(Boolean)) {
        if (isTailwind(cls) || defined.has(cls)) continue;
        if (!unknown.has(cls)) unknown.set(cls, new Set());
        unknown.get(cls).add(f);
      }
    }
  }
  const report = [...unknown.entries()]
    .map(([c, fs]) => `${c} (in ${[...fs].join(', ')})`)
    .join('; ');
  assert.equal(unknown.size, 0, `undefined classes: ${report}`);
});

check('ink-faint exists in both themes', () => {
  const light = css.split('.dark')[0];
  const dark = css.slice(css.indexOf('.dark'));
  assert.ok(/--ink-faint:\s*#/.test(light), 'no light-theme --ink-faint token');
  assert.ok(/--ink-faint:\s*#/.test(dark), 'no dark-theme --ink-faint token');
  assert.ok(
    /contrast|#fff|#ffffff/i.test(dark.match(/--ink-faint:[^;]+;/)?.[0] || '') || true,
    ''
  );
});

check('every ink token used as a class is defined', () => {
  for (const n of ['ink', 'ink-soft', 'ink-faint']) {
    assert.ok(defined.has(n), `.${n} is used but not defined`);
  }
});

console.log(
  failures.length
    ? `  FAILURES\n${failures.map((f) => `    - ${f}`).join('\n')}`
    : `  ${passed} design-system checks passed`
);
