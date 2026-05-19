const CURSOR_USER_AGENT = 'cursor';
const CURSOR_HEADERS = ['x-cursor-client', 'x-cursor-version', 'x-client'];

/**
 * Детектит Cursor-клиент.
 * Cursor шлёт стандартные /v1/chat/completions с messages и tools.
 * Специфичный заголовок: x-cursor-client или user-agent содержащий "cursor".
 */
function isCursorRequest(req, body) {
  const headers = req.headers || {};

  for (const h of CURSOR_HEADERS) {
    const val = String(headers[h] || headers[h.toLowerCase()] || '').trim().toLowerCase();
    if (val) return true;
  }

  const userAgent = String(headers['user-agent'] || '').toLowerCase();
  if (userAgent.includes(CURSOR_USER_AGENT)) return true;

  const model = String(body?.model || '').toLowerCase();
  if (model.startsWith('cursor/') || model === 'cursor' || model === 'custom_cursor') return true;

  return false;
}

module.exports = { isCursorRequest };
