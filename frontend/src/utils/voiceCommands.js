const FOLDER_COMMANDS = [
  { folder: 'important', pattern: /\b(important|starred)\b/ },
  { folder: 'unread', pattern: /\bunread\b/ },
  { folder: 'sent', pattern: /\b(sent|outbox)\b/ },
  { folder: 'drafts', pattern: /\bdrafts?\b/ },
  { folder: 'spam', pattern: /\b(spam|junk)\b/ },
  { folder: 'trash', pattern: /\b(trash|deleted)\b/ },
  { folder: 'inbox', pattern: /\binbox\b/ },
  { folder: 'all', pattern: /\b(all mail|all emails|everything)\b/ }
];

export function parseVoiceCommand(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return { type: 'empty' };

  const explicitSearch = /^(?:please\s+)?(?:search|find|look\s+up|look\s+for)\b/.test(text);
  if (explicitSearch) {
    const query = text
      .replace(/^(?:please\s+)?(?:search|find|look\s+up|look\s+for)\s+(?:for\s+)?/, '')
      .replace(/^(?:my\s+)?emails?\s+/, '')
      .replace(/\s+(?:emails?|messages?)$/, '')
      .trim();
    return query ? { type: 'search', query } : { type: 'unknown' };
  }

  if (/\b(phishing|suspicious|scam)\b/.test(text)) return { type: 'phishing' };
  if (/\b(summarize|summary|overview)\b/.test(text)) return { type: 'summarize' };
  if (/\b(reply|respond|answer)\b/.test(text)) return { type: 'reply' };
  if (/\b(read|open|show)\b/.test(text) && /\b(this|selected|current)\b/.test(text)) {
    return { type: 'open-selected' };
  }

  const folderCommand = FOLDER_COMMANDS.find(({ pattern }) => pattern.test(text));
  if (folderCommand) return { type: 'folder', folder: folderCommand.folder };

  const query = text
    .replace(/^(?:show\s+me\s+)/, '')
    .replace(/\s+(?:emails?|messages?)$/, '')
    .trim();
  return query ? { type: 'search', query } : { type: 'unknown' };
}
