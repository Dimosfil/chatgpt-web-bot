const { log } = require('../core/logger');
const { readJsonBody } = require('../core/http');
const { modelsList } = require('../core/openaiResponse');
const { safeJson, jsonSize, writeBlock } = require('../core/safeJson');
const { sendSimpleLogged } = require('./responseHelpers');
const { sendCompletionLogged, sendToolCallLogged } = require('./openaiWriter');
const { buildPrompt } = require('../strategies/promptBuilder.cleanUserOnly');
const { buildAgentPrompt } = require('../strategies/promptBuilder.agentToolMode');
const { handleSpecialRequest } = require('../strategies/specialRequests.openclaw');
const { ChatGptWebStrategy } = require('../strategies/llm.chatgptWeb');
const { optimizeOpenClawRequest } = require('../strategies/openclawOptimizer');
const { tryParseAgentReply } = require('../strategies/toolParser');
const { handleCodexRequest } = require('./handleCodexRequest');

const AGENT_MODE = process.env.CHATGPT_WEB_AGENT_MODE === '1';
const llmStrategy = new ChatGptWebStrategy();

function createRequestHandler() {
  return async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    log('requests.log', `[${requestId}] [REQ] ${req.method} ${req.url}`);

    // CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    // Models list
    if (req.method === 'GET' && req.url === '/v1/models') {
      return sendSimpleLogged(res, 200, modelsList(), requestId);
    }

    // README
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      return sendSimpleLogged(res, 200, {
        service: 'chatgpt-web-bot',
        status: 'running',
        endpoints: ['/v1/models', '/v1/chat/completions', '/v1/responses']
      }, requestId);
    }

    // Only POST endpoints beyond this point
    if (req.method !== 'POST') {
      return sendSimpleLogged(res, 404, { error: 'Not found' }, requestId);
    }

    let body = {};

    try {
      body = await readJsonBody(req);

      writeBlock(
        'payload.log',
        `REQUEST -> SERVER ${requestId} ${req.url}`,
        safeJson(body)
      );

      log(
        'requests.log',
        `[${requestId}] [PAYLOAD] url=${req.url} model=${body.model || 'none'} messages=${body.messages?.length || body.input?.length || 0} tools=${body.tools?.length || 0} input_type=${typeof body.input} stream=${body.stream} chars=${jsonSize(body)} agentMode=${AGENT_MODE}`
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

    // ====== POST /v1/responses — для Codex с wire_api = "responses" ======
    if (req.url === '/v1/responses') {
      return handleCodexRequest(req, res, body, requestId, 'responses');
    }

    // ====== POST /v1/chat/completions — OpenClaw / стандартные клиенты ======

    // Определяем, какой клиент: Codex (есть tools или input как строка) или OpenClaw
    const isCodex = body.input !== undefined;

    if (isCodex) {
      return handleCodexRequest(req, res, body, requestId, 'chat');
    }

    // OpenClaw / стандартный режим
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
