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
const { safeJson, writeBlock, sendCompletionLogged } = require('../handlers/responseHelpers');

const deepSeek = new DeepSeekStrategy();

async function handleCursorChat(req, res, body, requestId) {
  const payload = buildCursorRequest(body);

  if (!payload.messages.length) {
    return send(res, 400, { error: { message: 'messages cannot be empty' } });
  }

  writeBlock('payload.log', `CURSOR -> DEEPSEEK ${requestId}`, safeJson(payload));

  if (body.stream === true) {
    await deepSeek.streamToResponse(payload, res, requestId);
    return;
  }

  const upstream = await deepSeek.chatCompletion(payload, requestId);
  writeBlock('response.log', `DEEPSEEK -> CURSOR ${requestId}`, safeJson(upstream));
  return send(res, 200, upstream);
}

module.exports = { handleCursorChat };
