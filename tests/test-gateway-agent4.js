/**
 * Gateway: Connect → agent call
 * Добавляем флаг GATEWAY_INTERNAL_EXEC чтобы избежать рекурсии
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Защита от рекурсии: если нас уже запустил gateway, не подключаемся
if (process.env.OPENCLAW_GATEWAY_EXEC) {
  console.log('[guard] already inside gateway, sleeping...');
  setTimeout(() => process.exit(0), 5000);
  return;
}

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function loadDevice() {
  const fp = path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function buildConnectParams(device, nonce) {
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
  const rawPub = spki.subarray(ED25519_SPKI_PREFIX.length); // 44-12=32
  return {
    minProtocol: 3, maxProtocol: 3,
    client: { id: 'cli', displayName: 'agent-test', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
    caps: [],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
  };
}

const device = loadDevice();
console.log('=== Gateway Agent Call ===');
console.log('Device:', device.deviceId.slice(0, 20) + '...');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 50 * 1024 * 1024 });
const pending = new Map();
let connected = false;

const globalTimer = setTimeout(() => {
  console.log('❌ TIMEOUT'); ws.close(); process.exit(1);
}, 120000);

function sendReq(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 90000);
    pending.set(id, { resolve, reject, timer: t, label: method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    console.log(`→ ${method}`);
  });
}

let challengeReceived = false;

ws.on('open', () => console.log('✅ WS OPEN'));
ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => { console.log(`CLOSED: ${c}`); clearTimeout(globalTimer); });

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      if (challengeReceived) return;
      challengeReceived = true;
      const nonce = msg.payload?.nonce;
      if (nonce) {
        console.log(`Challenge: ${nonce.slice(0, 16)}...`);
        sendReq('connect', buildConnectParams(device, nonce));
      }
      return;
    }
    if (ev === 'tick') return; // heartbeat
    // Agent streaming events — but we handle these separately
    if (ev === 'agent') {
      // Just log streaming events
      const d = msg.payload?.data || {};
      if (d.phase === 'delta' && d.output) process.stdout.write(d.output);
      else if (d.status) console.log(`[stream] ${d.status}: ${(d.progressText || d.title || '').slice(0, 80)}`);
      return;
    }
    console.log(`EVT: ${ev}`);
    return;
  }

  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        console.log(`✅ ${p.label}`);
        connected = connected || p.label === 'connect';
        p.resolve(msg.payload);
      } else {
        console.log(`❌ ${p.label}: ${msg.error?.message}`);
        p.reject(new Error(msg.error?.message || 'fail'));
      }
    }
  }
});

async function main() {
  try {
    // Wait for connect to resolve
    console.log('Waiting for connect...');
    const connectResult = await new Promise((resolve, reject) => {
      const check = setInterval(() => {
        for (const [id, p] of pending) {
          if (p.label === 'connect') return; // still pending
        }
        clearInterval(check);
        resolve({ ok: true });
      }, 100);
      // Also check on message
      const handler = (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.type === 'res') {
          const p = pending.get(msg.id);
          if (p && p.label === 'connect' && !msg.ok) {
            ws.removeListener('message', handler);
            clearInterval(check);
            reject(new Error(msg.error?.message || 'connect failed'));
          }
        }
      };
      ws.on('message', handler);
      setTimeout(() => {
        ws.removeListener('message', handler);
        clearInterval(check);
        if (!connected) reject(new Error('connect did not settle in reasonable time'));
        else resolve({ ok: true });
      }, 30000);
    });

    if (!connected) {
      console.log('Connect status:', JSON.stringify(connectResult));
    }
    
    console.log('✅ Connected! Features:', connectResult?.features?.methods?.slice(0, 5));

    // Agent call
    console.log('\n--- Agent call (chatgpt-web) ---');
    const result = await sendReq('agent', {
      agentId: 'main',
      message: 'Say just OK in one word',
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      idempotencyKey: uuid(),
    });

    // Parse result
    const text = result?.result?.payloads?.[0]?.text || 
                 result?.payloads?.[0]?.text ||
                 JSON.stringify(result, null, 2).slice(0, 1000);
    console.log('\n=== Result ===');
    console.log(text);

    console.log('\n✅ SUCCESS');
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    console.log(`\n❌ ${e.message}`);
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(1), 500);
  }
}

main();
