const { normalizeChatMessages, normalizeTools, resolveDeepSeekModel } = require('./deepseekRequestBuilder');

/**
 * Строит DeepSeek-запрос из Cursor-сообщений.
 * Cursor шлёт стандартные OpenAI /v1/chat/completions с:
 * - messages: [{role, content}]
 * - tools: [{type: "function", function: {name, description, parameters}}]
 * - model, temperature, max_tokens, stream
 *
 * В отличие от Codex, Cursor НЕ шлёт input-массив или responses-формат.
 * Поэтому просто нормализуем messages + tools и отправляем в DeepSeek.
 */
function buildCursorRequest(body, { stream = body.stream === true } = {}) {
  const payload = {
    model: resolveDeepSeekModel(body),
    messages: normalizeChatMessages(body),
    stream
  };

  const tools = normalizeTools(body.tools || body.functions);
  if (tools.length > 0) {
    payload.tools = tools;
    if (body.tool_choice) payload.tool_choice = body.tool_choice;
  }

  if (typeof body.temperature === 'number') payload.temperature = body.temperature;
  if (typeof body.max_tokens === 'number') payload.max_tokens = body.max_tokens;
  if (typeof body.top_p === 'number') payload.top_p = body.top_p;

  return payload;
}

module.exports = { buildCursorRequest };
