const { log } = require('../core/logger');
const { readJsonBody } = require('../core/http');
const { modelsList } = require('../core/openaiResponse');
const { safeJson, jsonSize, writeBlock } = require('../core/safeJson');
const { sendCompletionLogged, sendSimpleLogged, sendToolCallLogged } = require('./openaiWriter');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { buildAgentPrompt } = require('../strategies/promptBuilder.agentToolMode');
const { handleSpecialRequest } = require('../strategies/specialRequests.openclaw');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { optimizeOpenClawRequest } = require('../strategies/openclawOptimizer');
const { tryParseAgentReply } = require('../strategies/toolParser');

const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';
const llmStrategy = new ChatGptWebStrategy();

function createRequestHandler() {
  return async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    log('requests.log', `[${requestId}] [REQ] ${req.method} ${req.url}`);

    if (req.method === 'OPTIONS') {
      return sendSimpleLogged(res, 200, { ok: true }, requestId);
    }

    if (req.method === 'GET' && req.url === '/v1/models') {
      return sendSimpleLogged(res, 200, modelsList(), requestId);
    }

    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      return sendSimpleLogged(res, 200, { ok: true }, requestId);
    }

    let body = {};

    try {
      body = await readJsonBody(req);

      writeBlock(
        'payload.log',
        `OPENCLAW -> SERVER ${requestId}`,
        safeJson(body)
      );

      log(
        'requests.log',
        `[${requestId}] [PAYLOAD] model=${body.model || 'none'} messages=${body.messages?.length || 0} tools=${body.tools?.length || 0} stream=${body.stream} chars=${jsonSize(body)} agentMode=${AGENT_MODE}`
      );
    } catch (err) {
      log('errors.log', `[${requestId}] Invalid JSON: ${err.message}`);

      return sendCompletionLogged(
        body,
        res,
        'Я не смог прочитать JSON запроса.',
        requestId
      );
    }

    const optimizedBody = optimizeOpenClawRequest(body);

    writeBlock(
      'optimized.log',
      `SERVER OPTIMIZED ${requestId}`,
      safeJson(optimizedBody)
    );

    log(
      'requests.log',
      `[${requestId}] [SIZE] original=${jsonSize(body)} optimized=${jsonSize(optimizedBody)} saved=${jsonSize(body) - jsonSize(optimizedBody)}`
    );

    const specialReply = handleSpecialRequest(optimizedBody);

    if (specialReply) {
      writeBlock(
        'response.log',
        `SPECIAL REPLY ${requestId}`,
        specialReply
      );

      return sendCompletionLogged(body, res, specialReply, requestId);
    }

    const prompt = AGENT_MODE
      ? buildAgentPrompt(optimizedBody)
      : buildPrompt(optimizedBody.messages || []);

    writeBlock(
      'prompt.log',
      `SERVER -> CHATGPT_WEB ${requestId}`,
      prompt || '[EMPTY PROMPT]'
    );

    log('requests.log', `[${requestId}] [PROMPT] chars=${prompt?.length || 0}`);

    if (!prompt || !prompt.trim()) {
      log('errors.log', `[${requestId}] Empty prompt after filtering`);

      return sendCompletionLogged(
        body,
        res,
        'Я не получил текст запроса.',
        requestId
      );
    }

    try {
      const startedAt = Date.now();

      log('requests.log', `[${requestId}] [LLM] start`);

      const reply = await llmStrategy.generate(prompt);

      writeBlock(
        'response.log',
        `CHATGPT_WEB -> SERVER ${requestId}`,
        reply || '[EMPTY REPLY]'
      );

      log(
        'requests.log',
        `[${requestId}] [LLM] ok durationMs=${Date.now() - startedAt} replyChars=${reply?.length || 0}`
      );

      const parsed = AGENT_MODE ? tryParseAgentReply(reply) : null;

      if (parsed) {
        writeBlock(
          'response.log',
          `AGENT PARSED ${requestId}`,
          safeJson(parsed)
        );

        if (parsed.type === 'tool_call') {
          return sendToolCallLogged(body, res, parsed.toolCall, requestId);
        }

        if (parsed.type === 'final') {
          return sendCompletionLogged(
            body,
            res,
            parsed.text || 'Готово.',
            requestId
          );
        }
      }

      return sendCompletionLogged(
        body,
        res,
        reply || 'ChatGPT Web вернул пустой ответ.',
        requestId
      );
    } catch (err) {
      log('errors.log', `[${requestId}] LLM error: ${err.message}\n${err.stack || ''}`);

      return sendCompletionLogged(
        body,
        res,
        'Сервис временно не смог получить ответ от ChatGPT Web.',
        requestId
      );
    }
  };
}

module.exports = { createRequestHandler };
