/**
 * Финальный тест: connect → agent request через WebSocket Gateway
 *
 * Использует:
 * - connect.challenge handshake (v3)
 * - После connect → метод "agent"
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

console.log('=== GATEWAY AGENT TEST ===');
console.log('Token:', GATEWAY_TOKEN.slice(0, 16) + '...');
console.log('Device:', device.deviceId.slice(0, 20) + '...');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 25 * 1024 * 1024 });

// Pending RPC calls
const pending = new Map();
let seq = 0;

const globalTimer = setTimeout(() => {
  console.log('\n❌ GLOBAL TIMEOUT');
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

function sendReq(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
      ws.close();
    }, 60000);
    pending.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
    console.log(`→ ${method}`);
  });
}

function buildAuthPayload(nonce) {
  const role = 'operator';
  const scopes = ['operator.admin'];
  const signedAt = Date.now();
  const payload = [
    'v3', device.deviceId, 'cli', 'agent-test', role, scopes.join(','),
    String(signedAt), GATEWAY_TOKEN, nonce, process.platform, ''
  ].join('|');
  const key = crypto.createPrivateKey(device.privateKeyPem);
  const sig = base64Url(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
  const pubKey = crypto.createPublicKey(device.publicKeyPem);
  const spki = pubKey.export({ type: 'spki', format: 'der' });
  const rawPub = spki.subarray(spki.length - 32);

  return {
    minProtocol: 3, maxProtocol: 3,
    client: {
      id: 'cli',
      displayName: 'agent-test',
      version: '1.0',
      platform: process.platform,
      mode: 'cli',
      instanceId: uuid(),
    },
    caps: [],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role,
    scopes,
    device: {
      id: device.deviceId,
      publicKey: base64Url(rawPub),
      signature: sig,
      signedAt,
      nonce,
    },
  };
}

let connected = false;

ws.on('open', () => console.log('✅ WebSocket OPEN'));

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      console.log('>> Challenge received');
      sendReq('connect', buildAuthPayload(nonce));
      return;
    }
    if (ev === 'tick') return; // heartbeat
    if (ev === 'agent') {
      // Streaming event — от нашего agent запроса
      const d = msg.payload?.data;
      if (d) {
        if (d.phase === 'delta' || d.phase === 'update') {
          if (d.output) process.stdout.write(d.output);
          else if (d.progressText) console.log(`[progress] ${d.progressText}`);
        }
        if (d.status) console.log(`[status: ${d.status}]`);
      }
      return;
    }
    console.log(`EVENT: ${ev} ${JSON.stringify(msg.payload || msg.data || {}).slice(0, 200)}`);
    return;
  }

  if (msg.type === 'res') {
    const p = pending.get(msg.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        console.log(`✅ ${p.method} OK`);
        if (p.method === 'connect') connected = true;
        p.resolve(msg.payload);
      } else {
        console.log(`❌ ${p.method} FAIL: ${msg.error?.message}`);
        p.reject(new Error(msg.error?.message || `RPC failed: ${p.method}`));
      }
    } else {
      console.log(`UNSOLICITED RESPONSE: ${msg.id?.slice(0, 8)} ok=${msg.ok}`, msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : '');
    }
  }
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 CLOSED: code=${code} reason=${reason?.toString() || ''}`);
  clearTimeout(globalTimer);
});

ws.on('error', (err) => console.log(`❌ WS ERROR: ${err.message}`));

// Main flow
async function main() {
  try {
    // 1. Connect
    console.log('\n--- Phase 1: Connect ---');
    const hello = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no challenge within 15s')), 15000);
      ws.on('message', function handler(raw) {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        if (msg.type === 'event' || msg.event) {
          if (msg.event === 'connect.challenge') {
            const nonce = msg.payload?.nonce;
            if (!nonce) return;
            clearTimeout(timeout);
            ws.removeListener('message', handler);

            // Отправляем connect
            sendReq('connect', buildAuthPayload(nonce)).then(resolve).catch(reject);
            return;
          }
        }

        if (msg.type === 'res') {
          const p = pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(msg.id);
            if (msg.ok) {
              console.log(`✅ ${p.method} OK`);
              connected = true;
              resolve(msg.payload);
            } else {
              reject(new Error(msg.error?.message || 'connect failed'));
            }
          }
        }
      });
    });

    console.log('Server:', JSON.stringify(hello).slice(0, 200));

    // 2. Agent request
    console.log('\n--- Phase 2: Agent request ---');
    const agentResult = await sendReq('agent', {
      agentId: 'main',
      message: 'Say just OK',
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      idempotencyKey: uuid(),
    });

    console.log('\nAgent result:');
    console.log(JSON.stringify(agentResult, null, 2).slice(0, 1000));

    console.log('\n✅ SUCCESS');
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(0), 500);

  } catch (e) {
    console.log(`\n❌ FAIL: ${e.message}`);
    clearTimeout(globalTimer);
    ws.close();
    setTimeout(() => process.exit(1), 500);
  }
}

main();
