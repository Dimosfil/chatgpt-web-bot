const { log } = require('../core/logger');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { buildAgentPrompt } = require('../strategies/promptBuilder.agentToolMode');
const { handleSpecialRequest } = require('../strategies/specialRequests.openclaw');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { optimizeOpenClawRequest } = require('../strategies/openclawOptimizer');
const { tryParseAgentReply } = require('../strategies/toolParser');

const {
  safeJson,
  jsonSize,
  writeBlock,
  sendCompletionLogged,
  sendToolCallLogged
} = require('./responseHelpers');

const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';
const llmStrategy = new ChatGptWebStrategy();

async function handleOpenClawRequest(req, res, body, requestId) {
  const optimizedBody = optimizeOpenClawRequest(body);

  writeBlock(
    'optimized.log',
    `OPENCLAW OPTIMIZED ${requestId}`,
    safeJson(optimizedBody)
  );

  log(
    'requests.log',
    `[${requestId}] [OPENCLAW SIZE] original=${jsonSize(body)} optimized=${jsonSize(optimizedBody)} saved=${jsonSize(body) - jsonSize(optimizedBody)} agentMode=${AGENT_MODE}`
  );

  const specialReply = handleSpecialRequest(optimizedBody);

  if (specialReply) {
    writeBlock(
      'response.log',
      `OPENCLAW SPECIAL REPLY ${requestId}`,
      specialReply
    );

    return sendCompletionLogged(body, res, specialReply, requestId, 'OPENCLAW');
  }

  const prompt = AGENT_MODE
    ? buildAgentPrompt(optimizedBody)
    : buildPrompt(optimizedBody.messages || []);

  writeBlock(
    'prompt.log',
    `OPENCLAW -> CHATGPT_WEB ${requestId}`,
    prompt || '[EMPTY PROMPT]'
  );

  if (!prompt || !prompt.trim()) {
    log('errors.log', `[${requestId}] OpenClaw empty prompt after filtering`);

    return sendCompletionLogged(
      body,
      res,
      'Я не получил текст запроса.',
      requestId,
      'OPENCLAW'
    );
  }

  try {
    const startedAt = Date.now();

    log('requests.log', `[${requestId}] [OPENCLAW LLM] start`);

    const reply = await llmStrategy.generate(prompt);

    writeBlock(
      'response.log',
      `CHATGPT_WEB -> OPENCLAW SERVER ${requestId}`,
      reply || '[EMPTY REPLY]'
    );

    log(
      'requests.log',
      `[${requestId}] [OPENCLAW LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`
    );

    const parsed = AGENT_MODE ? tryParseAgentReply(reply) : null;

    if (parsed) {
      writeBlock(
        'response.log',
        `OPENCLAW AGENT PARSED ${requestId}`,
        safeJson(parsed)
      );

      if (parsed.type === 'tool_call') {
        return sendToolCallLogged(body, res, parsed.toolCall, requestId, 'OPENCLAW');
      }

      if (parsed.type === 'final') {
        return sendCompletionLogged(
          body,
          res,
          parsed.text || 'Готово.',
          requestId,
          'OPENCLAW'
        );
      }
    }

    return sendCompletionLogged(
      body,
      res,
      reply || 'ChatGPT Web вернул пустой ответ.',
      requestId,
      'OPENCLAW'
    );
  } catch (err) {
    log('errors.log', `[${requestId}] OpenClaw LLM error: ${err.message}\n${err.stack || ''}`);

    return sendCompletionLogged(
      body,
      res,
      'Сервис временно не смог получить ответ от ChatGPT Web.',
      requestId,
      'OPENCLAW'
    );
  }
}

module.exports = {
  handleOpenClawRequest
};