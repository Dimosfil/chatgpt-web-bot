/**
 * Handler для Cursor-клиента.
 *
 * Cursor шлёт стандартные OpenAI /v1/chat/completions запросы с:
 * - messages: [{role, content}]
 * - tools: [{type: "function", function: {name, description, parameters}}]
 * - stream: true/false
 *
 * В отличие от Codex:
 * - Нет input-массива (только messages)
 * - Нет /v1/responses формата
 * - Нет prompt-склейки (DeepSeek нативно понимает tools)
 *
 * Архитектура полностью повторяет Codex + DeepSeek:
 *   Cursor → router.js → handleCursorRequest.js → deepseekRequestBuilder → llm.deepseek.js → DeepSeek API
 *
 * DeepSeek нативно возвращает tool_calls в choices[0].message.tool_calls —
 * парсить ответ не нужно, просто пробрасываем.
 */

const { send } = require('../core/http');
const { DeepSeekStrategy } = require('../strategies/llm.deepseek');
const { buildCursorRequest } = require('../strategies/cursorRequestBuilder');
const { safeJson, writeBlock } = require('../handlers/responseHelpers');
const {
  cloneWithoutDeepSeekReasoning,
  deepSeekDialogManager
} = require('../strategies/deepseekDialogManager');

const deepSeek = new DeepSeekStrategy();

function sendCursorStreamError(res, message) {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
  }

  res.write(`data: ${JSON.stringify({
    error: {
      message,
      type: 'deepseek_error'
    }
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

async function handleCursorChat(req, res, body, requestId) {
  try {
    const payload = buildCursorRequest(body);
    payload.messages = deepSeekDialogManager.rehydrateMessages(payload.messages);

    if (!payload.messages.length) {
      return send(res, 400, { error: { message: 'messages cannot be empty' } });
    }

    writeBlock('payload.log', `CURSOR -> DEEPSEEK ${requestId}`, safeJson(payload));

    if (body.stream === true) {
      await deepSeek.streamToResponse(payload, res, requestId);
      return;
    }

    const upstream = await deepSeek.chatCompletion(payload, requestId);
    deepSeekDialogManager.captureResponse(upstream);
    const safeUpstream = cloneWithoutDeepSeekReasoning(upstream);
    writeBlock('response.log', `DEEPSEEK -> CURSOR ${requestId}`, safeJson(safeUpstream));
    return send(res, 200, safeUpstream);
  } catch (err) {
    writeBlock('errors.log', `CURSOR DEEPSEEK ERROR ${requestId}`, err.stack || err.message);

    if (body.stream === true) {
      sendCursorStreamError(res, err.message || 'DeepSeek request failed');
      return;
    }

    return send(res, 500, {
      error: {
        message: err.message || 'DeepSeek request failed',
        type: 'deepseek_error'
      }
    });
  }
}

module.exports = { handleCursorChat };
