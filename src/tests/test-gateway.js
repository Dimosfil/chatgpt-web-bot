// Прямой RPC запрос к Gateway для запуска inference через chatgpt-web
const http = require('http');

const body = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'model.run',
  params: {
    provider: 'chatgpt-web',
    model: 'chatgpt-web',
    messages: [
      { role: 'user', content: 'Привет! Сколько будет 2+2? Ответь одной цифрой.' }
    ]
  }
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 18789,
  path: '/rpc',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try { console.log(JSON.stringify(JSON.parse(data), null, 2)); }
    catch { console.log('Raw:', data); }
  });
});
req.on('error', e => console.error('Error:', e.message));
req.write(body);
req.end();
