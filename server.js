/**
 * HTTP-сервер-обёртка для chatgpt-web-bot.
 * Принимает POST /v1/chat/completions в формате OpenAI API.
 * Пересылает запросы в ChatGPT через Playwright + Chrome CDP.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { CDP_URL, CHATGPT_URL, DEFAULT_TIMEOUT } = require('./config');

const DEBUG_DIR = path.join(__dirname, 'debug');
try { fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {}

function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { console.log(line); } catch {}
  try { fs.appendFileSync(path.join(DEBUG_DIR, 'requests.log'), line + '\n'); } catch {}
}

// ============================================================
// Основная функция — отправить промпт в ChatGPT и получить ответ
// ============================================================
async function runChatGPTConversation(prompt) {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No browser context found');

  let page = context.pages().find(p => p.url().includes('chatgpt.com'));
  if (!page) {
    debugLog('Opening new ChatGPT page...');
    page = await context.newPage();
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
    await page.waitForTimeout(2000);
  } else {
    try { await page.bringToFront(); } catch {}
  }
  page.setDefaultTimeout(DEFAULT_TIMEOUT);
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);

  // Ждём поле ввода
  await page.waitForSelector('#prompt-textarea', { state: 'visible', timeout: 15000 });
  const composer = page.locator('#prompt-textarea').first();

  // Вводим текст
  await composer.click();
  await page.waitForTimeout(300);
  await composer.fill(prompt);
  await page.waitForTimeout(300);

  // Считаем текущие сообщения ассистента
  const msgBefore = await page.locator('[data-message-author-role="assistant"]').count();

  // Отправляем через Enter
  await page.keyboard.press('Enter');

  // Ждём появления нового ответа ассистента
  const started = Date.now();
  const timeoutMs = parseInt(process.env.CHATGPT_WEB_TIMEOUT || '60000', 10);
  let lastText = '';
  while (Date.now() - started < timeoutMs) {
    const count = await page.locator('[data-message-author-role="assistant"]').count();
    if (count > msgBefore) {
      lastText = await page.locator('[data-message-author-role="assistant"]').last().textContent();
      if (lastText && lastText.length > 5) break;
    }
    await page.waitForTimeout(500);
  }

  try { await browser.close(); } catch {}
  if (!lastText) throw new Error('No reply from ChatGPT (timeout)');
  return lastText;
}

// ============================================================
// HTTP сервер
// ============================================================
const PORT = parseInt(process.env.CHATGPT_WEB_PORT || '3999', 10);

function sendJSON(res, status, data) {
  const body = JSON.stringify(data) + '\n';
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

const MODELS = [
  { id: 'chatgpt-web', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'chatgpt-web-bot' },
];

// Обработчики ошибок — только в файл, без console.log (чтобы избежать EPIPE)
process.on('uncaughtException', (err) => {
  try { fs.appendFileSync(path.join(DEBUG_DIR, 'errors.log'), `[${new Date().toISOString()}] UNCAUGHT: ${err.message}\n${err.stack}\n`); } catch {}
});
process.on('unhandledRejection', (reason) => {
  try { fs.appendFileSync(path.join(DEBUG_DIR, 'errors.log'), `[${new Date().toISOString()}] UNHANDLED: ${reason instanceof Error ? reason.message : reason}\n`); } catch {}
});

const server = http.createServer(async (req, res) => {
  debugLog(`[REQ] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/v1/models') {
    return sendJSON(res, 200, { object: 'list', data: MODELS });
  }

  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body;
    try { body = JSON.parse(rawBody); } catch {
      return sendJSON(res, 400, { error: { message: 'Invalid JSON', type: 'invalid_request_error' } });
    }

    const messages = body.messages || [];
    let userPrompt = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userPrompt = typeof messages[i].content === 'string'
          ? messages[i].content
          : (Array.isArray(messages[i].content)
            ? messages[i].content.map(p => p.text || '').join('\n')
            : '');
        break;
      }
    }
    if (!userPrompt) {
      return sendJSON(res, 400, { error: { message: 'No user message found', type: 'invalid_request_error' } });
    }

    const isStream = body.stream === true;
    try {
      const replyText = await runChatGPTConversation(userPrompt);
      const modelId = body.model || 'chatgpt-web';
      const completionId = `chatcmpl-${Date.now()}`;

      if (isStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        for (let i = 0; i < replyText.length; i += 3) {
          const chunk = replyText.slice(i, i + 3);
          const data = JSON.stringify({
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelId,
            choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
          });
          res.write(`data: ${data}\n\n`);
        }

        const finalData = JSON.stringify({
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        res.write(`data: ${finalData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const response = {
          id: completionId,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: replyText },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
        return sendJSON(res, 200, response);
      }
    } catch (err) {
      debugLog(`[ERROR] ChatGPT request failed: ${err.message}`);
      if (isStream) {
        const errData = JSON.stringify({ error: { message: err.message, type: 'server_error' } });
        res.write(`data: ${errData}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        return sendJSON(res, 503, { error: { message: err.message, type: 'server_error' } });
      }
    }
  }

  sendJSON(res, 404, { error: { message: 'Not found', type: 'not_found' } });
});

server.listen(PORT, () => {
  console.log(`\n=== ChatGPT Web Bot API server running on http://localhost:${PORT} ===`);
  console.log(`    Endpoints:`);
  console.log(`      GET  /v1/models`);
  console.log(`      POST /v1/chat/completions`);
  console.log(`    Model ref: chatgpt-web/chatgpt-web`);
  console.log(`    Press Ctrl+C to stop.\n`);
});
