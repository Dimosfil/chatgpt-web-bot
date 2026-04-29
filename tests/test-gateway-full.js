/**
 * Тест: handshake + model.run через WebSocket Gateway
 * Запуск: node test-gateway-full.js (через cmd с GATEWAY_TOKEN)
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

console.log('========== GATEWAY TEST ==========');
console.log('Token:', GATEWAY_TOKEN.slice(0, 12) + '...');
console.log('');

const devicePath = path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json');
const device = JSON.parse(fs.readFileSync(devicePath, 'utf8'));
console.log('Device:', device.deviceId.slice(0, 20) + '...');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });

// Состояние
let nonce = null;
let step = 0;
let connectResolve = null;
const pending = new Map();

// Таймаут
const globalTimer = setTimeout(() => {
  console.log('❌ GLOBAL TIMEOUT');
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

function log(prefix, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${prefix} ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300)}`);
}

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    log('→', `REQ ${method} (${id.slice(0, 8)})`);
  });
}

function buildDeviceAuth(nonce) {
  const role = 'operator';
  const scopes = ['operator.admin'];
  const signedAt = Date.now();
  const payload = ['v3', device.deviceId, 'cli', 'cli', role, scopes.join(','), String(signedAt), GATEWAY_TOKEN, nonce, process.platform, ''].join('|');
  const key = crypto.createPrivateKey(device.privateKeyPem);
  const sig = base64Url(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
  const pubKey = crypto.createPublicKey(device.publicKeyPem);
  const spki = pubKey.export({ type: 'spki', format: 'der' });
  const rawPub = spki.subarray(spki.length - 32);
  return {
    minProtocol: 3, maxProtocol: 3,
    client: { id: 'cli', displayName: 'test', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
    caps: [],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
  };
}

ws.on('open', () => log('✅', 'WebSocket OPEN'));

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // Events
  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      nonce = msg.payload?.nonce;
      log('📥', `Challenge: ${nonce?.slice(0, 20)}...`);
      // Сразу отправляем connect
      send('connect', buildDeviceAuth(nonce));
      return;
    }
    if (ev === 'tick') {
      // heartbeat — просто игнорируем
      // Можно отправить pong если нужно
      return;
    }
    log('📥', `EVENT: ${ev}`);
    return;
  }

  // Responses
  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        log('✅', `${p.method} OK`);
        p.resolve(msg.payload);
      } else {
        log('❌', `${p.method} FAIL: ${msg.error?.message}`);
        p.reject(new Error(msg.error?.message || 'RPC error'));
      }
    } else {
      log('📥', `UNSOLICITED RES: ${msg.id?.slice(0, 8)} ok=${msg.ok}`);
    }
  }
});

ws.on('close', (code, reason) => {
  log('🔌', `CLOSED code=${code} reason=${reason?.toString() || ''}`);
  clearTimeout(globalTimer);
});

ws.on('error', (err) => {
  log('❌', `ERROR: ${err.message}`);
});

async function main() {
  try {
    // Ждём connect.challenge + ответ connect
    await waitConnect();

    log('', '=== CONNECTED ===');
    log('', '');

    // Теперь model.run
    log('', '>>> model.run (provider=chatgpt-web, model=chatgpt-web)');
    const result = await send('model.run', {
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      messages: [{ role: 'user', content: 'Say just OK in one word' }],
      max_tokens: 10,
      stream: false,
    });
    log('✅', 'RESPONSE:');
    console.log(JSON.stringify(result, null, 2).slice(0, 1000));

    log('', '=== ALL DONE ===');
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    log('❌', `FATAL: ${e.message}`);
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(1), 200);
  }
}

function waitConnect() {
  return new Promise((resolve, reject) => {
    connectResolve = resolve;
    const timeout = setTimeout(() => reject(new Error('connect: no challenge received')), 30000);

    // Подписываемся на ответ connect
    const check = setInterval(() => {
      if (nonce) clearInterval(check);
    }, 50);

    // Хук: когда первый res приходит с ok=true — это connect
    const origMsg = ws.listeners('message');
    ws.removeAllListeners('message');

    ws.on('message', function handler(raw) {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'event' || msg.event) {
        const ev = msg.event || msg.payload?.type || '?';
        if (ev === 'connect.challenge') {
          nonce = msg.payload?.nonce;
          log('📥', `Challenge: ${nonce?.slice(0, 20)}...`);
          send('connect', buildDeviceAuth(nonce));
          return;
        }
        return;
      }

      if (msg.type === 'res') {
        const p = pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(msg.id);
          if (msg.ok) {
            log('✅', `CONNECT OK`);
            clearTimeout(timeout);
            // Restore original handler
            ws.removeListener('message', handler);
            for (const h of origMsg) ws.on('message', h);
            resolve(msg.payload);
          } else {
            clearTimeout(timeout);
            reject(new Error(msg.error?.message || 'connect failed'));
          }
        }
      }
    });
  });
}

main();
