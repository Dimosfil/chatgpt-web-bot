/**
 * Прокси-сервер для логирования запросов OpenClaw к DeepSeek.
 * Слушает порт 3990, логирует всё, проксирует на api.deepseek.com.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, 'debug');
try { fs.mkdirSync(DEBUG_DIR, { recursive: true }); } catch {}

function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(DEBUG_DIR, 'proxy-deepseek.log'), line + '\n');
}

const PORT = 3990;
const TARGET_HOST = 'api.deepseek.com';
// API-ключ DeepSeek должен быть передан через переменную окружения DEEPSEEK_API_KEY
// или указан ниже
const API_KEY = process.env.DEEPSEEK_API_KEY || '';

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');

    debugLog(`=== INCOMING REQUEST ===`);
    debugLog(`${req.method} ${req.url}`);
    debugLog(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        debugLog(`Body (parsed): ${JSON.stringify(parsed, null, 2)}`);
      } catch {
        debugLog(`Body (raw): ${rawBody.slice(0, 2000)}`);
      }
    }
    debugLog(`========================`);

    // Проксируем на DeepSeek
    const pathWithQuery = req.url;
    const proxyReq = https.request({
      hostname: TARGET_HOST,
      path: pathWithQuery,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
        'content-length': Buffer.byteLength(rawBody),
      },
      rejectUnauthorized: true,
    }, (proxyRes) => {
      debugLog(`=== RESPONSE from ${TARGET_HOST}${pathWithQuery} ===`);
      debugLog(`Status: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
      debugLog(`Response headers: ${JSON.stringify(proxyRes.headers, null, 2)}`);

      // Передаём статус и заголовки обратно
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Собираем тело ответа для логирования (только если не streaming)
      const isStreaming = proxyRes.headers['content-type']?.includes('text/event-stream');
      if (isStreaming) {
        debugLog(`[STREAMING response — logging first 2000 bytes]`);
        let loggedSize = 0;
        proxyRes.on('data', (chunk) => {
          if (loggedSize < 2000) {
            debugLog(`[chunk] ${chunk.toString('utf8').slice(0, 500)}`);
            loggedSize += chunk.length;
          }
          res.write(chunk);
        });
        proxyRes.on('end', () => {
          debugLog(`=== STREAM END ===`);
          res.end();
        });
      } else {
        const resChunks = [];
        proxyRes.on('data', c => resChunks.push(c));
        proxyRes.on('end', () => {
          const resBody = Buffer.concat(resChunks).toString('utf8');
          debugLog(`Body (first 2000 chars): ${resBody.slice(0, 2000)}`);
          debugLog(`=== RESPONSE END ===`);
          res.end(resBody);
        });
      }
    });

    proxyReq.on('error', (err) => {
      debugLog(`[PROXY ERROR] ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Proxy error: ${err.message}` } }));
    });

    proxyReq.write(rawBody);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`\n=== DeepSeek Debug Proxy running on http://localhost:${PORT} ===`);
  console.log(`    Proxying to https://${TARGET_HOST}`);
  console.log(`    Logging to: ${path.join(DEBUG_DIR, 'proxy-deepseek.log')}`);
  console.log(`\n    To use, set deepseek baseUrl to: http://localhost:3990`);
  console.log(`    (and keep the original apiKey)`);
  console.log(`\n    Press Ctrl+C to stop.\n`);
});
