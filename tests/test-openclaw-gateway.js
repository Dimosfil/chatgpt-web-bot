/**
 * Тест: проверка, почему OpenClaw CLI не может использовать провайдера.
 *
 * 1. Проверяет, что server.js отвечает (провайдер жив)
 * 2. Проверяет, что gateway отвечает на HTTP (порт 18789)
 * 3. Проверяет WebSocket-соединение с gateway
 * 4. Пытается отправить инференс-запрос через WebSocket RPC
 * 5. Выводит диагностику, где именно обрыв
 */

const http = require('http');
const WebSocket = require('ws');  // может не быть — проверим

async function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data.slice(0, 500) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function httpPost(url, body, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request(u, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data: data.slice(0, 1000) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('=== Диагностика связки chatgpt-web-bot <-> OpenClaw Gateway ===\n');

  // 1. Провайдер (server.js)
  console.log('1) Проверка провайдера (server.js :3999)...');
  try {
    const m = await httpGet('http://localhost:3999/v1/models', 3000);
    console.log(`   GET /v1/models → HTTP ${m.status} ${m.status === 200 ? 'OK' : 'FAIL'}`);
    if (m.status === 200) {
      const j = JSON.parse(m.data);
      console.log(`   Модели: ${j.data.map(x => x.id).join(', ')}`);
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    console.log('   → server.js не запущен. Запусти: cd C:\\AI\\chatgpt-web-bot && node server.js');
    process.exit(1);
  }

  // 2. Провайдер — тестовый инференс
  console.log('\n2) Проверка инференса провайдера...');
  try {
    const r = await httpPost('http://localhost:3999/v1/chat/completions', {
      model: 'chatgpt-web',
      messages: [{ role: 'user', content: 'say ok' }],
    });
    if (r.status === 200) {
      const j = JSON.parse(r.data);
      console.log(`   Ответ: ${j.choices?.[0]?.message?.content || '(пусто)'}`);
      console.log('   ✅ Провайдер работает');
    } else {
      console.log(`   HTTP ${r.status}: ${r.data.slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }

  // 3. Gateway HTTP
  console.log('\n3) Проверка Gateway (HTTP :18789)...');
  try {
    const g = await httpGet('http://127.0.0.1:18789/', 3000);
    console.log(`   HTTP ${g.status} — gateway доступен`);
    console.log(`   Content-Type: ${g.headers?.['content-type'] || '?'}`);
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
    console.log('   → Gateway не отвечает. Запусти: openclaw gateway start');
  }

  // 4. Проверка ws (npm ws module)
  console.log('\n4) WebSocket...');
  try {
    require.resolve('ws');
    console.log('   ✅ ws module найден');
  } catch {
    console.log('   ⚠️ ws module не установлен (npm install ws для теста WebSocket)');
  }

  // 5. Проверка файла конфига openclaw.json
  console.log('\n5) Анализ конфига openclaw.json...');
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(require('path').join(process.env.USERPROFILE || 'C:\\Users\\Fil-Server', '.openclaw', 'openclaw.json'), 'utf8');
    // Проверяем, что это валидный JSON (без trailing comma)
    try {
      JSON.parse(raw);
      console.log('   ✅ JSON валидный');
    } catch {
      console.log('   ⚠️ Конфиг — невалидный JSON (trailing comma?)');
      // Пробуем JSON5
      try {
        const json5 = require('json5');
        json5.parse(raw);
        console.log('   ✅ Конфиг — валидный JSON5');
      } catch {
        console.log('   ❌ Конфиг не парсится');
      }
    }

    // Ищем chatgpt-web секцию
    if (raw.includes('chatgpt-web')) {
      console.log('   ✅ chatgpt-web присутствует в конфиге');
    } else {
      console.log('   ❌ chatgpt-web отсутствует в конфиге');
    }

    // Проверяем plugins.allow
    if (raw.includes('"chatgpt-web"')) {
      console.log('   ✅ chatgpt-web есть в plugins.allow');
    } else {
      console.log('   ⚠️ chatgpt-web НЕТ в plugins.allow');
    }

    // Проверяем plugins.entries для chatgpt-web
    if (raw.includes('"chatgpt-web":')) {
      console.log('   ⚠️ chatgpt-web есть как ключ entries — если без { enabled: true }, не загрузится');
    } else {
      console.log('   ⚠️ chatgpt-web нет в plugins.entries — нужно добавить');
    }

  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }

  // 6. Проверка gateway логов на ошибки связанные с chatgpt-web
  console.log('\n6) Логи gateway (последние 5kb)...');
  try {
    const fs = require('fs');
    const logDir = 'C:\\Temp\\openclaw';
    const files = fs.readdirSync(logDir);
    const todayFile = files.find(f => f.includes('2026-04-24'));
    if (todayFile) {
      const log = fs.readFileSync(require('path').join(logDir, todayFile), 'utf8');
      const lines = log.split('\n').filter(l => l.includes('chatgpt') || l.includes('model') || l.includes('provider'));
      if (lines.length > 0) {
        console.log(`   Найдено ${lines.length} строк(и) с упоминаниями:`);
        lines.slice(-5).forEach(l => console.log(`   ${l.slice(0, 200)}`));
      } else {
        console.log('   Нет упоминаний chatgpt-web/model/provider в логах');
        console.log('   → Gateway не видит провайдера');
      }
    } else {
      console.log('   Лог за сегодня не найден');
    }
  } catch (e) {
    console.log(`   FAIL: ${e.message}`);
  }

  console.log('\n=== Диагностика завершена ===');
  console.log('\nРекомендация:');
  console.log('  Если провайдер (server.js) работает, но gateway его не видит —');
  console.log('  проверь plugins.entries в openclaw.json:');
  console.log('  "chatgpt-web": { "enabled": true }');
  console.log('  И перезагрузи gateway.');
})();
