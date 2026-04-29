// Тест: отправить сообщение через OpenClaw к chatgpt-web модели
const http = require('http');

const body = JSON.stringify({
  model: 'chatgpt-web/chatgpt-web',
  messages: [{ role: 'user', content: 'Привет! Который час?' }]
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 18789,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('Raw:', data);
    }
  });
});
req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
