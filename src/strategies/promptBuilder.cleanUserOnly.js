function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content.map(p => {
      if (!p) return '';
      if (typeof p === 'string') return p;
      if (typeof p.text === 'string') return p.text;
      if (typeof p.content === 'string') return p.content;
      return '';
    }).filter(Boolean).join('\n');
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
    return JSON.stringify(content);
  }

  return String(content);
}

function isGarbage(text) {
  if (!text) return true;

  const bad = [
    'BEGIN_QUOTED_NOTES',
    'END_QUOTED_NOTES',
    'Untrusted daily memory',
    'Startup context loaded by runtime',
    'Based on this conversation, generate a short',
    'Conversation summary:',
    'chat_id',
    'message_id',
    'sender_id',
    'untrusted metadata',
    'Pre-compaction memory flush',
    'NO_REPLY',
    'Store durable memories'
  ];

  return bad.some(x => text.includes(x));
}

function buildPrompt(messages) {
  const userTexts = messages
    .filter(m => m.role === 'user')
    .map(m => extractText(m.content).trim())
    .filter(t => t && !isGarbage(t));

  if (userTexts.length > 0) {
    return userTexts[userTexts.length - 1];
  }

  const anyText = messages
    .map(m => extractText(m.content).trim())
    .filter(t => t && !isGarbage(t));

  return anyText[anyText.length - 1] || '';
}

module.exports = {
  buildPrompt,
  extractText,
  isGarbage
};