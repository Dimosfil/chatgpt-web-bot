/**
 * Gateway: Connect → Agent call (clean)
 * 
 * Копируем работающие функции из test-handshake.js
 * После connect → agent { agentId, message, provider, model, idempotencyKey }
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

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function derivePublicKeyRaw(pem) {
  const spki = crypto.createPublicKey(pem).export({ type: "spki", format: "der" });
  if (spki.length === 12 + 32 && spki.subarray(0, 12).equals(ED25519_SPKI_PREFIX))
    return spki.subarray(12);
  return spki;
}
function signPayload(pem, text) {
  return base64Url(crypto.sign(null, Buffer.from(text, 'utf8'), crypto.createPrivateKey(pem)));
}
function pubKeyB64(pem) { return base64Url(derivePublicKeyRaw(pem)); }

function buildV3Payload(deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce, platform) {
  return [ 'v3', deviceId, clientId, clientMode, role, scopes.join(','),
    String(signedAtMs), token || '', nonce || '', platform || process.platform, '' ].join('|');
}

const device = JSON.parse(fs.readFileSync(
  path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'), 'utf8'
));

console.log('=== Gateway Agent ===');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 50 * 1024 * 1024 });
const pending = new Map();
let nonce = null;
let resolved = false;

const overallTimer = setTimeout(() => {
  if (!resolved) { console.log('❌ TIMEOUT'); ws.close(); process.exit(1); }
}, TIMEOUT_MS);

function sendReq(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 60000);
    pending.set(id, { resolve, reject, timer: t, label: method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    console.log(`→ ${method}`);
  });
}

function doConnect() {
  const role = 'operator', scopes = ['operator.admin'];
  const signedAt = Date.now();
  const payload = buildV3Payload(device.deviceId, 'cli', 'cli', role, scopes, signedAt, GATEWAY_TOKEN, nonce);
  const sig = signPayload(device.privateKeyPem, payload);

  return sendReq('connect', {
    minProtocol: 3, maxProtocol: 3,
    client: { id: 'cli', displayName: 'agent-test', version: '1', platform: process.platform, mode: 'cli', instanceId: uuid() },
    caps: ['agent.run'],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: pubKeyB64(device.publicKeyPem), signature: sig, signedAt, nonce },
  });
}

ws.on('open', () => {
  console.log('WS OPEN');
  if (nonce) doConnect();
  else console.log('Waiting for challenge...');
});

ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => {
  console.log(`CLOSED: ${c} ${(r||'').toString().slice(0,60)}`); 
  clearTimeout(overallTimer);
});

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // Event handling
  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      nonce = msg.payload?.nonce;
      if (nonce && ws.readyState === WebSocket.OPEN) doConnect();
      return;
    }
    // Agent streaming events — log them
    if (ev === 'agent' && msg.payload?.data) {
      const d = msg.payload.data;
      if (d.phase === 'delta' && d.output) process.stdout.write(d.output);
      else if (d.status) console.log(`[${d.kind||'?'}] ${d.status}: ${d.title||d.progressText||''}`);
      else console.log(`[agent] ${JSON.stringify(d).slice(0,200)}`);
      return;
    }
    if (ev !== 'tick') console.log(`EVT: ${ev}`);
    return;
  }

  // Response handling
  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        console.log(`✅ ${p.label}`);
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
    // Phase 1: Connect (wait for pending to clear)
    const connectResult = await new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const found = [...pending.entries()].find(([_, p]) => p.label === 'connect');
        if (!found) {
          clearInterval(check);
          // Check if we got hello features
          resolve({ ok: true });
        }
      }, 50);
      setTimeout(() => {
        clearInterval(check);
        // Maybe resolved before we could catch it
        resolve({ ok: true });
      }, 25000);
    });

    console.log('✅ Connected!');
    
    // Phase 2: Agent call
    console.log('\n--- Agent request (chatgpt-web) ---');
    const agentResult = await sendReq('agent', {
      agentId: 'main',
      message: 'Say just OK in one word',
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      idempotencyKey: uuid(),
    });

    console.log('\n=== Agent result ===');
    const payloads = agentResult?.result?.payloads || [];
    if (payloads.length > 0) {
      for (const p of payloads) console.log(p.text || JSON.stringify(p));
    } else {
      console.log(JSON.stringify(agentResult, null, 2).slice(0, 2000));
    }

    resolved = true;
    clearTimeout(overallTimer);
    ws.close();
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    console.log(`\n❌ ${e.message}`);
    resolved = true;
    clearTimeout(overallTimer);
    ws.close();
    setTimeout(() => process.exit(1), 300);
  }
}

main();
