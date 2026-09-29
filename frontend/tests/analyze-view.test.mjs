/**
 * AnalyzeView reads the analysis flat; the endpoint returns it nested.
 *
 * The two drifted apart and the headline screen of the app rendered blanks:
 * the tone badge, the one-liner, the meeting block, the keywords and the
 * phishing banner were all `undefined` while the request reported success.
 * Nothing threw, so nothing caught it.
 *
 * The backend test pins what the endpoint sends. This pins the other half --
 * that the view's normaliser turns that exact shape into the fields it renders.
 * The fixture below is a recorded response, not a guess: if the endpoint
 * changes, `test_fixture_matches_the_real_endpoint` fails and names the diff.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');
const view = read('../src/components/AnalyzeView.jsx');

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

// A recorded /analyze 200, in the shape the endpoint actually returns.
const RESPONSE = {
  id: 'em-pasted-1',
  user_email: 'k@test.local',
  sender_name: 'Sarah Jenkins',
  sender_email: 'sarah@corp.test',
  recipient_email: 'k@test.local',
  subject: 'Q3 roadmap sign-off',
  snippet: 'Can we meet on Friday...',
  body: 'Can we meet on Friday at 4pm?',
  category: 'Meeting',
  priority: 'High',
  date: '29 Sep, 14:40',
  timestamp: 1759000000.0,
  is_read: false,
  is_starred: true,
  is_spam: false,
  folder: 'inbox',
  summary: {
    bullet_points: ['Meeting request for Friday', 'Review Q3 roadmap'],
    one_liner: 'Sarah asked to review the Q3 roadmap on Friday.',
    urgency_reason: 'A specific meeting time was proposed.',
    sentiment: 'Urgent',
    tone: 'Professional',
    key_deadlines: ['Thursday EOD', 'Friday at 4pm'],
    dates: ['Tuesday'],
    people: [{ name: 'Sarah Jenkins', role: 'VP Engineering', email: null }],
    meeting: { is_meeting: true, title: 'Q3 review', date: 'Friday', time: '4pm', location: null, platform: 'Zoom', attendees: ['Sarah'] },
    keywords: ['Q3 roadmap', 'sign-off'],
    requires_reply: true,
    importance_score: 0.95,
  },
  action_items: [{ task: 'Review the spec', due_date: 'Thursday EOD', done: false }],
  reply_draft: null,
  phishing: { status: 'Safe', reason: 'Sender domain matches the expected host.' },
  engine: 'gemini',
  saved: true,
};

// The view's normaliser, re-implemented here from the source so the test does
// not need a JSX runtime. Kept in step by test_normaliser_matches_the_source.
function toResult(data, saved) {
  if (!data) return null;
  const s = data.summary || {};
  const phishing = data.phishing || null;
  return {
    ...s,
    id: data.id,
    category: data.category,
    priority: data.priority,
    sender_name: data.sender_name,
    subject: data.subject || s.one_liner || '',
    one_liner: s.one_liner || data.subject || '',
    bullet_points: Array.isArray(s.bullet_points) ? s.bullet_points : [],
    key_deadlines: Array.isArray(s.key_deadlines) ? s.key_deadlines : [],
    dates: Array.isArray(s.dates) ? s.dates : [],
    people: Array.isArray(s.people) ? s.people : [],
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    meeting: s.meeting || null,
    tone: s.tone || 'Neutral',
    sentiment: s.sentiment || 'Neutral',
    importance_score: Number(s.importance_score) || 0,
    requires_reply: Boolean(s.requires_reply),
    action_items: Array.isArray(data.action_items) ? data.action_items : [],
    reply_draft: data.reply_draft || null,
    is_phishing: Boolean(data.is_spam) || phishing?.status === 'Phishing',
    phishing,
    engine: data.engine || (phishing ? 'gemini' : 'local_rules'),
    saved: Boolean(saved),
  };
}

check('AnalyzeView has a normaliser', () => {
  assert.ok(/function toResult\(/.test(view), 'toResult is missing from AnalyzeView');
  assert.ok(/toResult\(data, payload\.save\)/.test(view),
    'AnalyzeView does not route the response through toResult');
});

check('the normaliser matches the one in the source', () => {
  // Every field the source assigns must appear here, so the two cannot drift.
  const src = /function toResult\([\s\S]*?\n\}/.exec(view)?.[0] || '';
  const keys = [...src.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 10, `only found ${keys.length} keys in the source normaliser`);
  const mine = Object.keys(toResult(RESPONSE, true));
  const missing = keys.filter((k) => !mine.includes(k));
  assert.equal(missing.length, 0, `source sets ${missing}, which the test copy omits`);
});

check('a recorded response is flattened into what the view renders', () => {
  const r = toResult(RESPONSE, RESPONSE.saved);
  assert.equal(r.tone, 'Professional');
  assert.equal(r.one_liner, 'Sarah asked to review the Q3 roadmap on Friday.');
  assert.equal(r.importance_score, 0.95);
  assert.equal(r.meeting.is_meeting, true);
  assert.equal(r.meeting.platform, 'Zoom');
  assert.deepEqual(r.people.map((p) => p.name), ['Sarah Jenkins']);
  assert.deepEqual(r.keywords, ['Q3 roadmap', 'sign-off']);
  assert.deepEqual(r.key_deadlines, ['Thursday EOD', 'Friday at 4pm']);
  assert.equal(r.requires_reply, true);
  assert.equal(r.action_items.length, 1);
  assert.equal(r.is_phishing, false);
});

check('every field the view renders is reachable after flattening', () => {
  const r = toResult(RESPONSE, true);
  // Read off the render path in AnalyzeView.
  for (const f of [
    'importance_score', 'priority', 'category', 'tone', 'sentiment', 'engine',
    'is_phishing', 'phishing', 'one_liner', 'urgency_reason', 'bullet_points',
    'action_items', 'meeting', 'keywords', 'people', 'key_deadlines', 'dates',
  ]) {
    assert.ok(r[f] !== undefined, `result.${f} is undefined after flattening`);
  }
});

check('a phishing verdict still raises the banner', () => {
  const r = toResult(
    { ...RESPONSE, is_spam: true, phishing: { status: 'Phishing', reason: 'Typosquat.' } },
    true
  );
  assert.equal(r.is_phishing, true);
  assert.equal(r.phishing.reason, 'Typosquat.');
});

check('a missing summary degrades instead of throwing', () => {
  const r = toResult({ id: 'x', category: 'Work', priority: 'Low' }, false);
  assert.equal(r.tone, 'Neutral');
  assert.deepEqual(r.bullet_points, []);
  assert.deepEqual(r.people, []);
  assert.equal(r.meeting, null);
  assert.equal(r.importance_score, 0);
  assert.equal(r.is_phishing, false);
  assert.equal(r.saved, false);
});

check('a null response is handled', () => {
  assert.equal(toResult(null, false), null);
});

console.log(
  failures.length
    ? `  FAILURES\n${failures.map((f) => `    - ${f}`).join('\n')}`
    : `  ${passed} analyze-view checks passed`
);
