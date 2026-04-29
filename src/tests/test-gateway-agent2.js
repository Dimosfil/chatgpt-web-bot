/**
 * Gateway: handshake → agent call
 * 
 * После connect → сразу вызываем "agent"
 * Параметры: { agentId, message, provider, model, idempotencyKey }
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

function uuid() { return crypto.randomUUID(); }
function base64Url(buf) {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

const device = JSON.parse(fs.readFileSync(
  path.join(process.env.USERPROFILE, '.openclaw', 'identity', 'device.json'), 'utf8'
));

console.log('=== Gateway Agent Call ===');

const ws = new WebSocket('ws://127.0.0.1:18789', { maxPayload: 50 * 1024 * 1024 });
const pending = new Map();

const globalTimer = setTimeout(() => {
  console.log('❌ TIMEOUT 120s');
  ws.close();
  process.exit(1);
}, 120000);

function sendReq(method, params) {
  return new Promise((resolve, reject) => {
    const id = uuid();
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout: ${method}`)); }, 90000);
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
    caps: ['agent.run'],
    auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
    role, scopes,
    device: { id: device.deviceId, publicKey: base64Url(rawPub), signature: sig, signedAt, nonce },
  };
}

ws.on('open', () => console.log('✅ WS OPEN'));
ws.on('error', (e) => console.log('ERR:', e.message));
ws.on('close', (c, r) => { console.log(`CLOSED: ${c}`); clearTimeout(globalTimer); });

const events = [];
const agentStreams = new Map();

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // Events
  if (msg.type === 'event' || msg.event) {
    const ev = msg.event || msg.payload?.type || '?';
    if (ev === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      if (nonce) {
        console.log(`Challenge: ${nonce.slice(0, 16)}...`);
        sendReq('connect', buildConnectParams(nonce));
      }
      return;
    }
    if (ev === 'tick') return;

    // Agent streaming events
    if (ev === 'agent' && msg.payload) {
      const runId = msg.payload.runId;
      if (!agentStreams.has(runId)) {
        agentStreams.set(runId, []);
        console.log(`\n📦 Agent run started: ${runId.slice(0, 12)}...`);
      }
      agentStreams.get(runId).push(msg.payload);

      const data = msg.payload.data || {};
      if (data.phase === 'delta' && data.output) {
        process.stdout.write(data.output);
        return;
      }
      if (data.status) {
        console.log(`[${data.kind || '?'}] ${data.status}: ${data.title || data.progressText || ''}`);
      }
      return;
    }
    events.push({ ev, payload: msg.payload });
    console.log(`EVT: ${ev}`);
    return;
  }

  // Responses
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
      console.log(`RES(unknown): id=${msg.id?.slice(0,8)} ok=${msg.ok}`);
    }
  }
});

async function main() {
  const connectPromise = new Promise((resolve, reject) => {
    const listener = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type !== 'res') return;
      // Look for connect response
      for (const [id, p] of pending.entries()) {
        if (id === msg.id && p.label === 'connect') {
          // Already being processed by main handler
          return;
        }
      }
    };
    ws.on('message', listener);
    // Timeout safety
    setTimeout(() => {
      ws.removeListener('message', listener);
      reject(new Error('connect timeout'));
    }, 30000);
  });

  // Wait for connect to resolve (main handler will resolve it)
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (pending.size > 0) {
        // The pending map will eventually get a 'connect' entry
      }
      resolve(); // Let the pending map handle it
      clearInterval(check);
    }, 15000);
  });

  // Wait connect to finish
  await new Promise(r => setTimeout(r, 1000));

  // We'll just wait for all pending to settle
  const waitForConnect = new Promise((resolve, reject) => {
    const check = setInterval(() => {
      const connectPending = [...pending.entries()].find(([_, p]) => p.label === 'connect');
      if (!connectPending) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => { clearInterval(check); reject(new Error('connect did not settle')); }, 25000);
  });

  try {
    await waitForConnect;
    console.log('✅ Connected!');

    // Agent call
    console.log('\n--- Agent call ---');
    const result = await sendReq('agent', {
      agentId: 'main',
      message: 'Say just OK in one word',
      provider: 'chatgpt-web',
      model: 'chatgpt-web',
      idempotencyKey: uuid(),
    });

    // Print agent output
    const payloads = result?.result?.payloads || [];
    if (payloads.length > 0) {
      console.log('\n=== Agent response ===');
      for (const p of payloads) {
        if (p.text) console.log(p.text);
      }
    } else {
      console.log('\n=== Raw result ===');
      console.log(JSON.stringify(result, null, 2).slice(0, 2000));
    }

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
