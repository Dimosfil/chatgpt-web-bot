/**
 * Правильный тест: connect -> model.run -> chatgpt-web
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const TIMEOUT_MS = 60000;

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const device = JSON.parse(fs.readFileSync(
  path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'), 'utf8'
));

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });
const pending = new Map();
let nonce = null;

let globalTimer = setTimeout(() => { console.log('TIMEOUT'); ws.close(); process.exit(1); }, TIMEOUT_MS);

ws.on('open', () => console.log('CONNECTED'));
ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => { console.log('CLOSED:', c, r?.toString()); clearTimeout(globalTimer); });

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      nonce = msg.payload?.nonce;
      if (!nonce) return;
      sendRequest('connect', buildConnectParams(nonce));
      console.log('Sent: connect');
    } else if (ev === 'tick') {
      console.log('♥ tick');
      ws.send(JSON.stringify({ type: 'event', event: 'pong' }));
    } else {
      console.log('EVENT:', ev, JSON.stringify(msg.payload || {}).slice(0, 200));
    }
    return;
  }

  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        console.log('✅', p.label, '- OK');
        p.resolve(msg.payload);
      } else {
        console.log('❌', p.label, '-', msg.error?.message || 'unknown error');
        p.reject(new Error(msg.error?.message || 'RPC error'));
      }
    }
  }
});

function buildConnectParams(nonce) {
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
    client: { id: 'cli', displayName: 'test-model', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
    caps: [],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
  };
}

function sendRequest(method, params, label) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer, label: label || method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

async function main() {
  // Ждём connect
  console.log('Waiting for connect...');
  await waitForRpc('connect');
  console.log('--- CONNECTED ---\n');

  // model.run
  console.log('>>> model.run (chatgpt-web)...');
  try {
    const result = await sendRequest('model.run', {
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      messages: [{ role: 'user', content: 'Say just OK' }],
      max_tokens: 10,
      stream: false,
    }, 'model.run');
    console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
  } catch (e) {
    console.log('model.run FAILED:', e.message);
  }

  clearTimeout(globalTimer);
  ws.close();
  setTimeout(() => process.exit(0), 500);
}

function waitForRpc(expectedMethod) {
  return new Promise((resolve, reject) => {
    // После connect.challenge, ответ придёт как res
    const timeout = setTimeout(() => reject(new Error('connect timeout')), 30000);
    const origHandler = ws.listeners('message')[0];
    ws.removeListener('message', origHandler);
    ws.on('message', function handler(raw) {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'res' && msg.ok) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        ws.on('message', origHandler);
        resolve(msg.payload);
      } else if (msg.type === 'res' && !msg.ok) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        ws.on('message', origHandler);
        reject(new Error(msg.error?.message || 'connect failed'));
      }
    });
  });
}

main();
