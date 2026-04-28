/**
 * capture-proxy.js — временно встаёт на порт 3999,
 * логирует все HTTP-запросы от OpenClaw в файл,
 * потом отвечает заглушкой (чтобы OpenClaw не висел).
 * 
 * Запуск: node capture-proxy.js
 * Лог:    C:\AI\chatgpt-web-bot\debug\captured-requests.log
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3999;
const LOG_DIR = path.join(__dirname, 'debug');
const LOG_FILE = path.join(LOG_DIR, 'captured-requests.log');

// Создаём папку debug если нет
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  fs.appendFileSync(LOG_FILE, line);
}

function logRequest(req, body) {
  const lines = [];
  lines.push('');
  lines.push('━'.repeat(60));
  lines.push(`ВРЕМЯ: ${new Date().toISOString()}`);
  lines.push(`МЕТОД: ${req.method}`);
  lines.push(`URL:   ${req.url}`);
  lines.push(`HEADERS:`);
  for (const [k, v] of Object.entries(req.headers)) {
    lines.push(`  ${k}: ${v}`);
  }
  if (body) {
    lines.push(`BODY (${body.length} bytes):`);
    // Печатаем первые 2000 символов тела
    const preview = body.length > 2000 ? body.substring(0, 2000) + '\n  ... (truncated)' : body;
    lines.push(preview);
  }
  lines.push('━'.repeat(60));
  lines.push('');
  fs.appendFileSync(LOG_FILE, lines.join('\n'));
}

function sendStubResponse(res, req) {
  // Эмулируем SSE-стрим с заглушечным ответом
  const acceptHeader = req.headers['accept'] || '';
  const isStream = acceptHeader.includes('text/event-stream');
  
  if (isStream) {
    // SSE streaming ответ
    const model = 'chatgpt-web';
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    // stream start
    res.write(`data: {"id":"${id}","object":"chat.completion.chunk","created":${created},"model":"${model}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`);
    
    // content
    res.write(`data: {"id":"${id}","object":"chat.completion.chunk","created":${created},"model":"${model}","choices":[{"index":0,"delta":{"content":"Привет! Это заглушка от capture-proxy. OpenClaw: запрос получен ✅"},"finish_reason":null}]}\n\n`);
    
    // stream end
    res.write(`data: {"id":"${id}","object":"chat.completion.chunk","created":${created},"model":"${model}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
    
    log('→ Ответ: SSE streaming заглушка');
  } else {
    // Non-streaming ответ
    const body = JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'chatgpt-web',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Привет! Это заглушка от capture-proxy. OpenClaw: запрос получен ✅' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    log('→ Ответ: JSON заглушка');
  }
}

// Чистим лог при старте
fs.writeFileSync(LOG_FILE, `=== capture-proxy STARTED at ${new Date().toISOString()} ===\n`);

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    logRequest(req, body);
    
    // GET /v1/models — отдаём список моделей
    if (req.method === 'GET' && req.url === '/v1/models') {
      const data = JSON.stringify({
        object: 'list',
        data: [{
          id: 'chatgpt-web',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'openai',
        }],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
      log('→ Ответ: список моделей');
      return;
    }
    
    // POST /v1/chat/completions — отвечаем заглушкой
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      sendStubResponse(res, req);
      return;
    }
    
    // Всё остальное — 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    log(`→ Ответ: 404 (${req.url})`);
  });
});

server.listen(PORT, () => {
  log(`🟢 capture-proxy слушает порт ${PORT}`);
  log(`🟢 Лог: ${LOG_FILE}`);
  log(`🟢 Жду запросы от OpenClaw...`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('\n🟡 capture-proxy остановлен');
  process.exit(0);
});
