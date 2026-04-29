/**
 * Тестовый скрипт: проверяет связку chatgpt-web-bot + OpenClaw.
 *
 * Эмулирует то, как OpenClaw шлёт запросы к провайдеру:
 *   POST http://localhost:3999/v1/chat/completions
 *
 * Использует те же заголовки и структуру тела, что openai-completions.
 * Минимум лишнего — только диагностика.
 */

const http = require('http');

const PROVIDER_URL = 'http://localhost:3999/v1/chat/completions';
const TIMEOUT_MS = 120_000;

function request(body, desc) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(PROVIDER_URL);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          // OpenClaw добавляет Authorization — оставим пустым, как в конфиге
          'Authorization': '',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          console.log(`[${desc}] HTTP ${res.statusCode} ${ok ? 'OK' : 'FAIL'}`);
          if (!ok) {
            console.log(`  Response body: ${data.slice(0, 500)}`);
          }
          resolve({ ok, status: res.statusCode, body: data });
        });
      }
    );
    req.on('error', (e) => {
      console.log(`[${desc}] ERROR: ${e.message}`);
      reject(e);
    });
    req.on('timeout', () => {
      req.destroy();
      console.log(`[${desc}] TIMEOUT (${TIMEOUT_MS}ms)`);
      reject(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('=== Тест связки chatgpt-web-bot <-> OpenClaw ===\n');

  // 1. Проверка GET /v1/models
  console.log('1) GET /v1/models ...');
  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:3999/v1/models', { timeout: 10_000 }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          const ok = r.statusCode >= 200 && r.statusCode < 300;
          console.log(`   HTTP ${r.statusCode} ${ok ? 'OK' : 'FAIL'}`);
          if (ok) {
            const j = JSON.parse(d);
            console.log(`   Модели: ${j.data.map((m) => m.id).join(', ')}`);
          }
          resolve({ ok, body: d });
        });
      }).on('error', (e) => {
        console.log(`   ERROR: ${e.message}`);
        reject(e);
      });
    });
  } catch (e) {
    console.log(`   FAIL: сервер не отвечает на localhost:3999`);
    console.log(`   Убедись, что server.js запущен.`);
    process.exit(1);
  }

  // 2. Запрос chat.completions (короткий промпт)
  console.log('\n2) POST /v1/chat/completions (простой запрос)...');
  const req1 = {
    model: 'chatgpt-web',
    messages: [
      { role: 'user', content: 'Ответь одним словом: "тест"' },
    ],
    max_tokens: 50,
  };

  try {
    const r1 = await request(req1, 'простой запрос');
    if (r1.ok) {
      const j = JSON.parse(r1.body);
      const text = j.choices?.[0]?.message?.content || '(нет content)';
      console.log(`   Ответ: ${text.slice(0, 200)}`);
      console.log(`   Model ID в ответе: ${j.model}`);
      console.log(`   Finish reason: ${j.choices?.[0]?.finish_reason}`);
    } else {
      console.log(`   Body: ${r1.body.slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }

  // 3. Запрос с таким же форматом, как у OpenClaw (с заголовком Authorization пустым)
  console.log('\n3) POST /v1/chat/completions (OpenClaw-формат)...');
  const req2 = {
    model: 'chatgpt-web',
    messages: [
      { role: 'system', content: 'Ты полезный ассистент.' },
      { role: 'user', content: 'Ответь "ок" одной буквой.' },
    ],
    stream: false,
    max_tokens: 10,
    temperature: 0,
  };

  try {
    const r2 = await request(req2, 'OpenClaw-формат');
    if (r2.ok) {
      const j = JSON.parse(r2.body);
      const text = j.choices?.[0]?.message?.content || '(нет content)';
      console.log(`   Ответ: ${text.slice(0, 200)}`);
      console.log(`   Model ID: ${j.model}`);
    } else {
      console.log(`   Body: ${r2.body.slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }

  // Итог
  console.log('\n=== Тест завершён ===');
  console.log('Если все шаги OK — провайдер работает корректно.');
  console.log('Если OpenClaw всё равно не использует его — проблема в openclaw.json');
  console.log('  (неправильный api, modelRef, или chatgpt-web нет в plugins.allow)');
})();
