/**
 * КОНТЕКСТ: Парсит ответ ChatGPT, пытаясь извлечь tool_call JSON.
 * Отдельный модуль для Codex, не влияет на OpenClaw.
 */

/**
 * Пытается найти JSON-объект в тексте любым доступным способом.
 */
function extractJson(text) {
  if (!text) return null;

  // 1. Поиск в ```json ... ```
  const jsonFence = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (jsonFence) {
    const parsed = tryParse(jsonFence[1]);
    if (parsed) return parsed;
  }

  // 2. Поиск первого { ... } во всём тексте
  let first = text.indexOf('{');
  let last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    const parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  // 3. Поиск { ... } внутри строки (если всё на одной строке с экранированием)
  const escapedMatch = text.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/);
  if (escapedMatch) {
    const parsed = tryParse(escapedMatch[0]);
    if (parsed) return parsed;
  }

  // 4. Пробуем весь текст как JSON
  const parsed = tryParse(text);
  if (parsed) return parsed;

  return null;
}

/**
 * Пытается распарсить строку как JSON с восстановлением.
 */
function tryParse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Пробуем восстановить
  }

  // Repair Windows paths: C:\Users -> C:\\Users
  try {
    const repaired = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
    return JSON.parse(repaired);
  } catch {
    // Пробуем unescape
  }

  // Unescape литералов
  try {
    const unescaped = text
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
    return JSON.parse(unescaped);
  } catch {}

  return null;
}

/**
 * Основной парсер ответа ChatGPT.
 * Возвращает { type: "tool_call", toolCall: {...} } или { type: "final", text: "..." }
 */
function parseReply(text) {
  const raw = String(text || '').trim();

  if (!raw) {
    return { type: 'final', text: '' };
  }

  // Пробуем найти JSON
  const json = extractJson(raw);

  if (!json) {
    return { type: 'final', text: raw };
  }

  // Формат: { "tool_call": { "name": "...", "arguments": {...} } }
  if (json.tool_call && json.tool_call.name) {
    const tc = json.tool_call;
    const name = tc.name;
    const args = typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {});

    return {
      type: 'tool_call',
      toolCall: {
        name,
        arguments: args
      }
    };
  }

  // Формат: { "name": "...", "arguments": {...} } — плоский tool_call
  if (json.name && !json.final && !json.tool_call) {
    return {
      type: 'tool_call',
      toolCall: {
        name: json.name,
        arguments: typeof json.arguments === 'string'
          ? json.arguments
          : JSON.stringify(json.arguments || {})
      }
    };
  }

  // Формат: { "final": "текст" }
  if (json.final !== undefined) {
    return {
      type: 'final',
      text: String(json.final)
    };
  }

  // Формат: { "tool_calls": [...] } — массив tool_calls (берём первый)
  if (json.tool_calls && Array.isArray(json.tool_calls) && json.tool_calls.length > 0) {
    const tc = json.tool_calls[0];
    return {
      type: 'tool_call',
      toolCall: {
        name: tc.name || tc.function?.name || '',
        arguments: typeof tc.arguments === 'string'
          ? tc.arguments
          : JSON.stringify(tc.arguments || tc.function?.arguments || {})
      }
    };
  }

  // Формат choices[0].message.tool_calls (OpenAI-совместимый)
  if (json.choices && Array.isArray(json.choices)) {
    const msg = json.choices[0]?.message;
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const tc = msg.tool_calls[0];
      return {
        type: 'tool_call',
        toolCall: {
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '{}'
        }
      };
    }
    if (msg?.content) {
      return { type: 'final', text: msg.content };
    }
  }

  // Если JSON есть, но не похож на tool_call — считаем финальным ответом
  return { type: 'final', text: raw };
}

module.exports = {
  parseReply,
  extractJson,
  tryParse
};
