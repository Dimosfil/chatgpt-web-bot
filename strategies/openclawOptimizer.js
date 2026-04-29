const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';

const MAX_AGENT_MESSAGES = parseInt(process.env.OPENCLAW_AGENT_MAX_MESSAGES || '10', 10);
const MAX_SYSTEM_CHARS = parseInt(process.env.OPENCLAW_MAX_SYSTEM_CHARS || '8000', 10);
const MAX_MESSAGE_CHARS = parseInt(process.env.OPENCLAW_MAX_MESSAGE_CHARS || '12000', 10);

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

  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content.content === 'string') return content.content.trim();
  }

  return '';
}

function stripTelegramEnvelope(text) {
  return String(text || '')
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '')
    .replace(/Sender \(untrusted metadata\):\s*```json[\s\S]*?```\s*/g, '')
    .replace(/\[Startup context loaded by runtime\][\s\S]*?(?=Conversation info|$)/g, '')
    .trim();
}

function limitText(text, maxChars) {
  text = String(text || '');
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function getLastUserText(messages) {
  const userMessages = (messages || [])
    .filter(m => m && m.role === 'user')
    .map(m => stripTelegramEnvelope(extractText(m.content)))
    .filter(Boolean);

  return userMessages[userMessages.length - 1] || '';
}

function removeToolCommand(text) {
  return String(text || '')
    .replace(/^!tools\s*/i, '')
    .trim();
}

function hasForceTools(text) {
  return /^!tools\b/i.test(String(text || '').trim());
}

function detectToolIntent(text) {
  const t = String(text || '').toLowerCase();

  if (/^(да|ок|делай|вноси|разрешаю|согласен|go|yes)\b/.test(t)) {
    return 'file_write';
  }

  if (hasForceTools(t)) {
    return 'force_tools';
  }

  if (/почисти|удали|создай|запиши|перепиши|замени|исправь|добавь|отредактируй|сделай правку|внеси правку/.test(t)) {
    return 'file_write';
  }

  if (/прочитай|посмотри|открой|покажи|найди|лог|логи|файл|папк|конфиг|server\.js|json|env|debug|payload|requests|response|optimized|prompt/.test(t)) {
    return 'file_read';
  }

  if (/запусти|выполни|команд|powershell|node|npm|curl|ping|dir|ls|tasklist|process/.test(t)) {
    return 'exec';
  }

  if (/погугли|найди в интернете|сайт|url|http|https|доки|документац|github/.test(t)) {
    return 'web';
  }

  if (/помнишь|вспомни|память|раньше|до этого|мы делали|история/.test(t)) {
    return 'memory';
  }

  return 'chat';
}

function getToolName(tool) {
  return tool?.function?.name || '';
}

function filterToolsByIntent(allTools, intent) {
  const allowed = {
    chat: [],
    force_tools: ['read', 'edit', 'write', 'exec', 'process', 'web_search', 'web_fetch', 'memory_search', 'memory_get'],
    file_read: ['read', 'exec'],
    file_write: ['read', 'edit', 'write', 'exec'],
    exec: ['exec', 'process'],
    web: ['web_search', 'web_fetch'],
    memory: ['memory_search', 'memory_get']
  };

  const names = allowed[intent] || [];

  return (allTools || []).filter(t =>
    names.includes(getToolName(t))
  );
}

function normalizeMessage(message) {
  if (!message || !message.role) return null;

  const role = message.role;
  const rawText = extractText(message.content);
  const cleanText = stripTelegramEnvelope(rawText);

  if (role === 'system') {
    return {
      role,
      content: limitText(cleanText, MAX_SYSTEM_CHARS)
    };
  }

  if (role === 'tool') {
    return {
      role,
      tool_call_id: message.tool_call_id,
      name: message.name,
      content: limitText(cleanText, MAX_MESSAGE_CHARS)
    };
  }

  const result = {
    role,
    content: limitText(removeToolCommand(cleanText), MAX_MESSAGE_CHARS)
  };

  if (message.tool_calls) {
    result.tool_calls = message.tool_calls;
  }

  if (!result.content && !result.tool_calls) return null;

  return result;
}

function optimizeChatMode(body) {
  const lastUserText = removeToolCommand(getLastUserText(body.messages || []));

  return {
    model: body.model || 'chatgpt-web',
    messages: lastUserText
      ? [{ role: 'user', content: lastUserText }]
      : [],
    stream: body.stream === true
  };
}

function optimizeAgentMode(body) {
  const lastUserTextRaw = getLastUserText(body.messages || []);
  const intent = detectToolIntent(lastUserTextRaw);

  const systemMessages = (body.messages || [])
    .filter(m => m.role === 'system')
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-1);

  const recentMessages = (body.messages || [])
    .filter(m => m.role !== 'system')
    .map(normalizeMessage)
    .filter(Boolean)
    .slice(-MAX_AGENT_MESSAGES);

  const tools = filterToolsByIntent(body.tools || [], intent);

  return {
    model: body.model || 'chatgpt-web',
    messages: [
      ...systemMessages,
      ...recentMessages
    ],
    tools,
    tool_choice: tools.length > 0 ? body.tool_choice : undefined,
    stream: body.stream === true,
    _optimizer: {
      agentMode: true,
      forceTools: hasForceTools(lastUserTextRaw),
      intent,
      originalTools: Array.isArray(body.tools) ? body.tools.length : 0,
      selectedTools: tools.length,
      selectedToolNames: tools.map(getToolName),
      originalMessages: Array.isArray(body.messages) ? body.messages.length : 0,
      selectedMessages: systemMessages.length + recentMessages.length
    }
  };
}

function optimizeOpenClawRequest(body) {
  if (AGENT_MODE) {
    return optimizeAgentMode(body);
  }

  return optimizeChatMode(body);
}

module.exports = {
  optimizeOpenClawRequest,
  extractText,
  stripTelegramEnvelope,
  detectToolIntent,
  filterToolsByIntent,
  getLastUserText,
  hasForceTools
};