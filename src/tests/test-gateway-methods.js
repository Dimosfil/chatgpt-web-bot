/**
 * Тест: подключаемся к gateway и перечисляем доступные методы
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
  const paths = [
    path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'),
    path.join(process.env.APPDATA, 'openclaw', 'identity', 'device.json'),
  ];
  for (const fp of paths) {
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (raw.version === 1 && raw.deviceId) return raw;
    } catch {}
  }
  return null;
})();

if (!device) { console.error('No device identity'); process.exit(1); }
console.log('Device:', device.deviceId.slice(0, 20) + '...');

const pending = new Map();
let nonce = null, resolved = false;

const timer = setTimeout(() => { if (!resolved) { console.log('TIMEOUT'); ws.close(); process.exit(1); } }, 30000);

ws.on('open', () => console.log('WS OPEN'));
ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => { console.log('CLOSED:', c, r?.toString()); clearTimeout(timer); if (!resolved) process.exit(1); });

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
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
      const id = uuid();
      pending.set(id, {});
      ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'cli', displayName: 'test', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
        caps: [], auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
        role, scopes,
        device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
      }}));
      console.log('Sent connect...');
    }
    return;
  }

  if (msg.type === 'res') {
    console.log('RESPONSE:', msg.id?.slice(0, 8), 'ok:', msg.ok, msg.ok ? '' : msg.error?.message);
    if (msg.ok && pending.has(msg.id)) {
      pending.delete(msg.id);
      if (msg.id === 'methods-req') {
        console.log('\n=== AVAILABLE METHODS ===');
        const methods = msg.payload?.methods || [];
        methods.forEach(m => console.log(' -', m));
        resolved = true;
        clearTimeout(timer);
        ws.close();
      }
      if (msg.id?.startsWith('connect')) {
        // После успешного connect, запрашиваем методы
        console.log('\nRequesting methods...');
        const mid = 'methods-req';
        pending.set(mid, {});
        ws.send(JSON.stringify({ type: 'req', id: mid, method: 'gateway.api', params: {} }));
      }
    }
  }
});
