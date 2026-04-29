const { log } = require('../core/logger');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { tryParseAgentReply } = require('../strategies/toolParser');

const {
  safeJson,
  writeBlock,
  sendCompletionLogged,
  sendToolCallLogged
} = require('./responseHelpers');

const llmStrategy = new ChatGptWebStrategy();

function simplifyTools(tools) {
  return (tools || [])
    .filter(t => t && t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {}
    }));
}

function buildCodexPrompt(body) {
  const messages = body.messages || [];
  const userPrompt = buildPrompt(messages);
  const tools = simplifyTools(body.tools || []);

  if (!tools.length) {
    return userPrompt;
  }

  return [
    'Ты backend-модель для Codex CLI.',
    '',
    'Если задача требует вызова инструмента, верни только JSON:',
    '{',
    '  "tool_call": {',
    '    "name": "tool_name",',
    '    "arguments": {}',
    '  }',
    '}',
    '',
    'Если инструмент не нужен, верни обычный финальный ответ текстом.',
    'Не добавляй markdown вокруг JSON.',
    '',
    'Доступные tools:',
    safeJson(tools),
    '',
    'Запрос пользователя:',
    userPrompt
  ].join('\n');
}

async function handleCodexRequest(req, res, body, requestId) {
  const prompt = buildCodexPrompt(body);

  writeBlock(
    'prompt.log',
    `CODEX -> CHATGPT_WEB ${requestId}`,
    prompt || '[EMPTY PROMPT]'
  );

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] Codex empty prompt`);

    return sendCompletionLogged(
      body,
      res,
      'Empty prompt.',
      requestId,
      'CODEX'
    );
  }

  try {
    const startedAt = Date.now();

    log('requests.log', `[${requestId}] [CODEX LLM] start`);

    const reply = await llmStrategy.generate(prompt);

    writeBlock(
      'response.log',
      `CHATGPT_WEB -> CODEX SERVER ${requestId}`,
      reply || '[EMPTY REPLY]'
    );

    log(
      'requests.log',
      `[${requestId}] [CODEX LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`
    );

    if (Array.isArray(body.tools) && body.tools.length > 0) {
      const parsed = tryParseAgentReply(reply);

      if (parsed && parsed.type === 'tool_call') {
        return sendToolCallLogged(body, res, parsed.toolCall, requestId, 'CODEX');
      }

      if (parsed && parsed.type === 'final' && parsed.text !== reply) {
        return sendCompletionLogged(body, res, parsed.text, requestId, 'CODEX');
      }
    }

    return sendCompletionLogged(
      body,
      res,
      reply || 'Empty reply from ChatGPT Web.',
      requestId,
      'CODEX'
    );
  } catch (err) {
    log('errors.log', `[${requestId}] Codex LLM error: ${err.message}\n${err.stack || ''}`);

    return sendCompletionLogged(
      body,
      res,
      'ChatGPT Web backend error.',
      requestId,
      'CODEX'
    );
  }
}

module.exports = {
  handleCodexRequest
};