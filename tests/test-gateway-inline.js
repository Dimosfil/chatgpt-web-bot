/**
 * Минимальный тест: handshake + model.run через gateway WebSocket
 * Запуск: node test-gateway-inline.js
 * Переменные окружения: GATEWAY_TOKEN (обязательно), TIMEOUT (опц.)
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_URL = 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const TIMEOUT_MS = parseInt(process.env.TIMEOUT || '60000', 10);

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function loadDeviceIdentity() {
  const paths = [
    path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'),
    path.join(process.env.APPDATA, 'openclaw', 'identity', 'device.json'),
  ];
  for (const fp of paths) {
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (raw.version === 1 && raw.deviceId && raw.publicKeyPem && raw.privateKeyPem) {
        return raw;
      }
    } catch {}
  }
  return null;
}

const device = loadDeviceIdentity();
if (!device) {
  console.error('FATAL: device identity not found');
  process.exit(1);
}

console.log('Device:', device.deviceId.slice(0, 20) + '...');

function buildAuthPayload(nonce) {
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
    params: {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'cli', displayName: 'test-gateway', version: '1.0', platform: process.platform, mode: 'cli', instanceId: uuid() },
      caps: [],
      auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
      role, scopes,
      device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
    }
  };
}

async function main() {
  const ws = new WebSocket(GATEWAY_URL, { maxPayload: 25 * 1024 * 1024 });
  const pending = new Map();
  let nonce = null;
  let resolved = false;
  let seq = 0;

  const timer = setTimeout(() => {
    if (!resolved) { console.log('TIMEOUT'); ws.close(); process.exit(1); }
  }, TIMEOUT_MS);

  ws.on('open', () => console.log('WS OPEN'));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // EVENT
    if (msg.type === 'event' || msg.event) {
      const ev = msg.event || msg.payload?.type || '?';
      if (ev === 'connect.challenge') {
        nonce = msg.payload?.nonce;
        if (nonce) {
          console.log('Challenge nonce:', nonce.slice(0, 20) + '...');
          const auth = buildAuthPayload(nonce);
          const id = uuid();
          pending.set(id, { resolve: () => {}, reject: () => {} });
          ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params: auth.params }));
          console.log('Sent connect...');
        }
      } else if (ev === 'tick') {
        // heartbeat — игнорируем
      } else {
        console.log('EVENT:', ev);
      }
      return;
    }

    // RESPONSE
    if (msg.type === 'res') {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.payload);
        else p.reject(new Error(msg.error?.message || 'unknown error'));
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log('CLOSED:', code, reason?.toString() || '');
    clearTimeout(timer);
    if (!resolved) process.exit(1);
  });

  ws.on('error', (e) => console.log('ERR:', e.message));

  // Ждём connect, затем отправляем model.run
  function waitForConnect() {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (nonce) clearInterval(checkInterval);
      }, 100);

      const origOnMsg = ws.listeners('message')[0];
      ws.removeListener('message', origOnMsg);

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'res' && msg.ok && msg.id) {
          console.log('CONNECT OK');
          clearTimeout(timer);
          resolve(msg);
        } else if (msg.type === 'res' && !msg.ok) {
          reject(new Error(msg.error?.message || 'connect failed'));
        }
      });
    });
  }

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('connect timeout')), 30000);
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'res' && msg.ok) {
          clearTimeout(timeout);
          resolve();
        } else if (msg.type === 'res' && !msg.ok) {
          clearTimeout(timeout);
          reject(new Error(msg.error?.message || 'connect failed'));
        }
      });
    });

    // Теперь model.run
    console.log('\n--- model.run (chatgpt-web) ---');
    const modelId = uuid();
    pending.set(modelId, { resolve: (v) => { resolved = true; console.log('MODEL RUN OK:', JSON.stringify(v).slice(0, 500)); clearTimeout(timer); ws.close(); }, reject: (e) => { resolved = true; console.log('MODEL RUN FAIL:', e.message); clearTimeout(timer); ws.close(); } });

    ws.send(JSON.stringify({
      type: 'req',
      id: modelId,
      method: 'model.run',
      params: {
        provider: 'chatgpt-web',
        model: 'chatgpt-web',
        messages: [{ role: 'user', content: 'Say just: OK' }],
        max_tokens: 10
      }
    }));
    console.log('Sent model.run...');
  } catch (e) {
    console.log('FAIL:', e.message);
    resolved = true;
    clearTimeout(timer);
    ws.close();
  }
}

main();
