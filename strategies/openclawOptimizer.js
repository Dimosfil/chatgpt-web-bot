const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';

function extractText(content) {
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .filter(x =>
        x &&
        x.type === 'text' &&
        typeof x.text === 'string' &&
        x.text.trim().length > 0
      )
      .map(x => x.text.trim())
      .join('\n\n')
      .trim();
  }

  return '';
}

function stripTelegramEnvelope(text) {
  return text
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '')
    .replace(/Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '')
    .replace(/\[Startup context loaded by runtime\][\s\S]*?(?=Conversation info|$)/g, '')
    .trim();
}

function optimizeOpenClawRequest(body) {
  if (AGENT_MODE) {
    return {
      ...body,
      stream: false
    };
  }

  const userMessages = (body.messages ?? [])
    .filter(m => m && m.role === 'user')
    .map(m => stripTelegramEnvelope(extractText(m.content)))
    .filter(Boolean);

  const lastUserText = userMessages[userMessages.length - 1] || '';

  return {
    model: body.model || 'chatgpt-web',
    messages: lastUserText
      ? [{ role: 'user', content: lastUserText }]
      : [],
    stream: false
  };
}

module.exports = {
  optimizeOpenClawRequest,
  extractText,
  stripTelegramEnvelope
};