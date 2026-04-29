/**
 * Финальный тест: handshake + agent через WebSocket Gateway
 * 
 * Логика:
 * 1. ws.on('message') — единственный обработчик всех сообщений
 * 2. connect.challenge → sendReq('connect', ...)
 * 3. connect OK → sendReq('agent', ...)
 * 
 * Запуск: cmd /c "set GATEWAY_TOKEN=... && node test-gateway-clean.js"
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const TIMEOUT_MS = 120000;

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

const device = JSON.parse(fs.readFileSync(
  path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'), 'utf8'
));

console.log('=== GATEWAY AGENT TEST (clean) ===');
console.log('Token:', GATEWAY_TOKEN.slice(0, 16) + '...');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });
const pending = new Map();

let step = 0;
let connected = false;

const timer = setTimeout(() => {
  console.log('❌ TIMEOUT');
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

function sendReq(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer: t, label: method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    console.log(`→ ${method}`);
  });
}

function buildConnectParams(nonce) {
  const role = 'operator';
  const scopes = ['operator.admin'];
  const signedAt = Date.now();
  const payload = [
    'v3', device.deviceId, 'cli', 'cli', role, scopes.join(','),
    String(signedAt), GATEWAY_TOKEN, nonce, process.platform, ''
  ].join('|');
  const key = crypto.createPrivateKey(device.privateKeyPem);
  const sig = base64Url(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
  const pubKey = crypto.createPublicKey(device.publicKeyPem);
  const spki = pubKey.export({ type: 'spki', format: 'der' });
  const rawPub = spki.subarray(spki.length - 32);
  return {
    minProtocol: 3, maxProtocol: 3,
    client: { id: 'cli', displayName: 'agent-test', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
    caps: [],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
  };
}

ws.on('open', () => console.log('✅ WS OPEN'));
ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => { console.log(`CLOSED: ${c}`); clearTimeout(timer); });

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      if (!nonce) return;
      console.log(`Challenge: ${nonce.slice(0, 16)}...`);
      sendReq('connect', buildConnectParams(nonce));
      return;
    }
    if (ev === 'tick') return; // heartbeat
    console.log(`EVENT: ${ev}`);
    return;
  }

  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        console.log(`✅ ${p.label} OK`);
        p.resolve(msg.payload);
      } else {
        console.log(`❌ ${p.label} FAIL: ${msg.error?.message}`);
        p.reject(new Error(msg.error?.message || 'fail'));
      }
    } else {
      console.log(`UNSOLICITED RES: ${msg.id?.slice(0, 8)} ok=${msg.ok}`);
    }
  }
});

async function main() {
  try {
    // Connect
    const hello = await sendReq('connect', { _wait: true }); // dummy — настоящий connect из обработчика

    // Ждём connect через promise
    const connectResult = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('connect timeout')), 30000);
      // Слушаем ответ connect — он придёт как res с ok=true
      const handler = (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'res') {
          const id = msg.id;
          const p = pending.get(id);
          if (!p || !['connect'].includes(p.label)) return;
          // Уже обработано в основном обработчике
        }
      };
    });

    // На самом деле connect уже обработан выше в on('message'),
    // нам нужно дождаться что pending Map получит connect с ok=true
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (connected || pending.size > 0) {
          // Есть активные запросы
        }
        if (connected) { clearInterval(check); resolve(); }
      }, 100);
      // fail-safe
      setTimeout(() => { clearInterval(check); resolve(); }, 30000);
    });

    // Подождем небольшую паузу
    await new Promise(r => setTimeout(r, 500));

    // Проверяем connected через pending promises
    // После того как connect resolved, connected=true
    // Дождёмся
    for (let i = 0; i < 30 && !connected; i++) {
      await new Promise(r => setTimeout(r, 200));
    }

    if (!connected) {
      throw new Error('connect did not resolve');
    }

    // Agent call
    console.log('\n--- Agent request ---');
    const result = await sendReq('agent', {
      agentId: 'main',
      message: 'Say just OK',
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      idempotencyKey: uuid(),
    });

    console.log('\n✅ Result:');
    const output = result?.result?.payloads?.[0]?.text || JSON.stringify(result).slice(0, 500);
    console.log(output);

    clearTimeout(timer);
    ws.close();
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    console.log(`\n❌ ${e.message}`);
    clearTimeout(timer);
    ws.close();
    setTimeout(() => process.exit(1), 200);
  }
}

main();
