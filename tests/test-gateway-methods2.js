/**
 * Сканирование возможных методов gateway
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const device = (() => {
  for (const fp of [
    path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'),
    path.join(process.env.APPDATA, 'openclaw', 'identity', 'device.json'),
  ]) {
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (raw.version === 1 && raw.deviceId) return raw;
    } catch {}
  }
  return null;
})();
if (!device) { console.error('No device identity'); process.exit(1); }

const TIMEOUT = 15000;
const connId = uuid();
let step = 0;

// Методы для теста
const testMethods = [
  'gateway.routes',
  'gateway.api',
  'api',
  'infer',
  'chat',
  'llm.chat',
  'model.run',
  'model.infer',
  'model.chat',
  'agent.run',
  'session.infer',
  'session.run',
];

function tryMethod(method) {
  return new Promise((resolve) => {
    const ws2 = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });
    let nonce = null;
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; ws2.close(); resolve({ method, ok: false, error: 'timeout' }); } }, TIMEOUT);

    ws2.on('open', () => {});
    ws2.on('error', () => {});
    ws2.on('close', () => {
      if (!done) { done = true; clearTimeout(t); resolve({ method, ok: false, error: 'closed' }); }
    });

    ws2.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.event === 'connect.challenge') {
        nonce = msg.payload?.nonce;
        if (!nonce) return;
        const role = 'operator';
        const scopes = ['operator.admin'];
        const signedAt = Date.now();
        const payload = ['v3', device.deviceId, 'cli', 'cli', role, scopes.join(','), String(signedAt), GATEWAY_TOKEN, nonce, process.platform, ''].join('|');
        const key = crypto.createPrivateKey(device.privateKeyPem);
        const sig = base64Url(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
        const pubKey = crypto.createPublicKey(device.publicKeyPem);
        const spki = pubKey.export({ type: 'spki', format: 'der' });
        const rawPub = spki.subarray(spki.length - 32);
        ws2.send(JSON.stringify({ type: 'req', id: uuid(), method: 'connect', params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: 'cli', displayName: 'scan', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
          caps: [], auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined, role, scopes,
          device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
        }}));
        return;
      }

      if (msg.type === 'res') {
        if (msg.ok) {
          if (done) return;
          done = true;
          clearTimeout(t);
          ws2.close();
          resolve({ method, ok: true, data: msg.payload });
        } else if (msg.error) {
          // method not found — это нормально для сканирования
          if (!done) {
            done = true;
            clearTimeout(t);
            ws2.close();
            resolve({ method, ok: false, error: msg.error?.message || 'unknown' });
          }
        }
      }
    });
  });
}

async function main() {
  // Сначала connect
  const results = [];
  for (const method of testMethods) {
    const r = await tryMethod(method);
    console.log(r.ok ? '✅' : '❌', method, r.ok ? JSON.stringify(r.data).slice(0, 100) : r.error);
    results.push(r);
  }
  console.log('\n=== Summary ===');
  console.log('Available methods:');
  results.filter(r => r.ok).forEach(r => console.log(' ✅', r.method));
  process.exit(0);
}

main();
