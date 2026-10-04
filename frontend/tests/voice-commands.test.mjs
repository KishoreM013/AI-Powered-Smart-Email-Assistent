import assert from 'node:assert/strict';
import { parseVoiceCommand } from '../src/utils/voiceCommands.js';

const cases = [
  ['Read my important emails', { type: 'folder', folder: 'important' }],
  ['show unread emails', { type: 'folder', folder: 'unread' }],
  ['Search for project emails', { type: 'search', query: 'project' }],
  ['find emails from Sam', { type: 'search', query: 'from sam' }],
  ['summarize my inbox', { type: 'summarize' }],
  ['reply to this email', { type: 'reply' }],
  ['open this email', { type: 'open-selected' }],
  ['check for phishing messages', { type: 'phishing' }],
  ['', { type: 'empty' }]
];

for (const [input, expected] of cases) {
  assert.deepEqual(parseVoiceCommand(input), expected, `command: ${input}`);
}

console.log(`  ${cases.length} voice-command checks passed`);
