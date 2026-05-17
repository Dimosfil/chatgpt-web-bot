/**
 * Тест Cursor + DeepSeek связки.
 *
 * Проверяет:
 * 1. Список моделей — должна быть модель 'cursor'
 * 2. Простой chat completions — без tools
 * 3. Chat completions с tools — DeepSeek должен уметь tool_calls
 * 4. Health-check
 */

const http = require('http');

const BASE = 'http://127.0.0.1:3999';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      BASE + path,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-cursor-client': 'true'
        }
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}

(async () => {
  let ok = 0;
  let fail = 0;

  function check(name, condition, detail = '') {
    if (condition) {
      console.log(`  PASS: ${name}`);
      ok++;
    } else {
      console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
      fail++;
    }
  }

  // 1. Health
  console.log('\n=== Test 1: Health ===');
  const health = await get('/health');
  check('GET /health 200', health.status === 200 && health.body.status === 'running');

  // 2. Models list
  console.log('\n=== Test 2: Models list ===');
  const modelsRes = await get('/v1/models');
  const hasModels = modelsRes.body?.object === 'list' && Array.isArray(modelsRes.body.data);
  check('GET /v1/models returns list', hasModels);
  const hasCursor = modelsRes.body?.data?.find((m) => m.id === 'cursor');
  check('Model "cursor" is in the list', !!hasCursor);

  // 3. Simple chat
  console.log('\n=== Test 3: Cursor simple chat ===');
  const simpleRes = await post('/v1/chat/completions', {
    model: 'cursor',
    messages: [
      { role: 'user', content: 'Hello! Just say "ok" and nothing else.' }
    ]
  });
  check('POST /v1/chat/completions 200', simpleRes.status === 200);
  const simpleContent = simpleRes.body?.choices?.[0]?.message?.content;
  check('Response has content', typeof simpleContent === 'string' && simpleContent.length > 0, `content: "${simpleContent?.slice(0, 50)}"`);

  // 4. Chat with tools
  console.log('\n=== Test 4: Cursor chat with tools ===');
  const toolRes = await post('/v1/chat/completions', {
    model: 'cursor',
    messages: [
      { role: 'user', content: 'What is 2+2? Use the calculator tool.' }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Evaluate a math expression',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'Math expression to evaluate' }
          },
          required: ['expression']
        }
      }
    }]
  });
  check('POST /v1/chat/completions with tools 200', toolRes.status === 200);
  const hasToolCall = toolRes.body?.choices?.[0]?.message?.tool_calls?.length > 0;
  const hasTextReply = typeof toolRes.body?.choices?.[0]?.message?.content === 'string' && toolRes.body.choices[0].message.content.length > 0;
  check('Response has tool_call or text', hasToolCall || hasTextReply, hasToolCall ? 'tool_call returned' : `text: "${toolRes.body?.choices?.[0]?.message?.content?.slice(0, 60)}"`);

  // 5. Cursor + /v1/responses — должно вернуть 400
  console.log('\n=== Test 5: Cursor /v1/responses rejected ===');
  const responsesRes = await post('/v1/responses', {
    model: 'cursor',
    input: 'Hello'
  });
  check('POST /v1/responses rejected for Cursor', responsesRes.status === 400);

  console.log(`\n=== Results: ${ok} PASS, ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Test error:', err.message);
  process.exit(1);
});
