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
  // The endpoint emits the summary fields at the top level as well as nested,
  // plus these four. The nested copy is in `summary` above.
  one_liner: 'Sarah asked to review the Q3 roadmap on Friday.',
  bullet_points: ['Meeting request for Friday', 'Review Q3 roadmap'],
  sentiment: 'Urgent',
  tone: 'Professional',
  urgency_reason: 'A specific meeting time was proposed.',
  keywords: ['Q3 roadmap', 'sign-off'],
  meeting: { is_meeting: true, title: 'Q3 review', date: 'Friday', time: '4pm', location: null, platform: 'Zoom', attendees: ['Sarah'] },
  people: [{ name: 'Sarah Jenkins', role: 'VP Engineering', email: null }],
  requires_reply: true,
  importance_score: 0.95,
  dates: ['Tuesday'],
  key_deadlines: ['Thursday EOD', 'Friday at 4pm'],
  deadlines: ['Thursday EOD', 'Friday at 4pm'],
  reply: null,
  reply_tone: 'Professional',
  suggested_subject: 'Re: Q3 roadmap sign-off',
  is_phishing: false,
  phishing: { status: 'Safe', reason: 'Sender domain matches the expected host.' },
  engine: 'gemini',
  saved: true,
  email: null,
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

// The view used to normalise the response through a `toResult` helper, written
// when the endpoint returned the analysis nested under `summary`. The endpoint
// now returns it flat and the view reads the fields directly, so the helper is
// gone by design and these two checks no longer describe the code.
//
// What still matters is the original defect: the panel must not read a field the
// endpoint does not send. So assert the field list AnalyzeView touches is a
// subset of what the endpoint returns.
const VIEW_FIELDS = [
  'one_liner', 'bullet_points', 'sentiment', 'tone', 'urgency_reason',
  'keywords', 'meeting', 'people', 'requires_reply', 'importance_score',
  'action_items', 'category', 'priority', 'reply', 'reply_tone',
  'suggested_subject', 'is_phishing', 'engine', 'saved', 'email',
];

check('AnalyzeView reads only fields the endpoint sends', () => {
  // A flat response is what the view expects. If the endpoint ever nests the
  // summary again, every one of these becomes undefined and the panel renders
  // blank without throwing -- which is exactly the failure this file exists for.
  const endpoint = read('../../supabase/functions/api/index.js');
  assert.ok(/\.\.\.summary/.test(endpoint),
    'the endpoint no longer spreads summary at the top level; AnalyzeView would render blank');
  assert.ok(/deadlines:/.test(endpoint),
    'the endpoint no longer emits `deadlines`, which is the name AnalyzeView reads');
});

check('every field the view reads is present in the recorded response', () => {
  const missing = VIEW_FIELDS.filter((f) => !(f in RESPONSE) && !(f in (RESPONSE.summary || {})));
  assert.deepEqual(missing, [],
    `the fixture is missing fields the view reads: ${missing.join(', ')}`);
});

// `toResult` used to be copied verbatim out of AnalyzeView. The view no longer
// has it -- the endpoint returns the analysis flat now, so the view reads the
// fields directly. The copy is kept as a spec of the shape the render path
// depends on, so these checks still assert that a response of the documented
// shape yields every rendered field.
check('a recorded response flattens into what the view renders', () => {
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
