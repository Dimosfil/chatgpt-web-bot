/**
 * Полный тест handshake с OpenClaw Gateway
 * Использует существующий device identity из OpenClaw
 *
 * Запуск: node test-handshake.js
 * OPENCLAW_DEBUG=1 — подробный вывод
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const TIMEOUT_MS = parseInt(process.env.TIMEOUT || '15000', 10);
const DEBUG = process.env.OPENCLAW_DEBUG === '1';

let step = 0;
function log(msg, obj) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
  if (obj && DEBUG) console.log('  └─', JSON.stringify(obj, null, 2).slice(0, 500));
}

function uuid() { return crypto.randomUUID(); }

// === Device Identity (копия логики OpenClaw) ===
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function derivePublicKeyRaw(publicKeyPem) {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function signDevicePayload(privateKeyPem, payload) {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key));
}

function publicKeyRawBase64UrlFromPem(publicKeyPem) {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function loadDeviceIdentity() {
  const possible = [
    path.join(process.env.USERPROFILE || 'C:\\Users\\Fil-Server', '.openclaw', 'identity', 'device.json'),
    path.join(process.env.APPDATA || 'C:\\Users\\Fil-Server\\AppData\\Roaming', 'openclaw', 'identity', 'device.json'),
  ];
  for (const fp of possible) {
    try {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (raw.version === 1 && raw.deviceId && raw.publicKeyPem && raw.privateKeyPem) {
        console.log(`  loadDeviceIdentity: ${fp}`);
        return {
          deviceId: raw.deviceId,
          publicKeyPem: raw.publicKeyPem,
          privateKeyPem: raw.privateKeyPem,
        };
      }
    } catch {}
  }
  return null;
}

function buildDeviceAuthPayloadV3(params) {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const platform = params.platform || process.platform;
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    params.deviceFamily || "",
  ].join("|");
}

async function main() {
  console.log(`=== Тест handshake с Gateway ===`);
  console.log(`URL: ${GATEWAY_URL}`);
  console.log(`Таймаут: ${TIMEOUT_MS}ms`);
  console.log('');

  const deviceIdentity = loadDeviceIdentity();
  if (!deviceIdentity) {
    console.error('❌ Не найден device identity. Запусти openclaw gateway start сначала');
    process.exit(1);
  }
  console.log(`  deviceId: ${deviceIdentity.deviceId.slice(0, 20)}...`);
  console.log('');

  return new Promise((resolve, reject) => {
    const overallTimer = setTimeout(() => {
      console.log('❌ ГЛОБАЛЬНЫЙ ТАЙМАУТ');
      ws.close();
      reject(new Error('global timeout'));
    }, TIMEOUT_MS);

    let connectSent = false;
    let connectNonce = null;
    const pendingRequests = new Map();
    let resolved = false;

    const ws = new WebSocket(GATEWAY_URL, { maxPayload: 25 * 1024 * 1024 });

    ws.on('open', () => {
      console.log('✅ WebSocket OPEN');
      if (connectNonce && !connectSent) {
        console.log('  → nonce уже есть, отправляем connect сразу');
        sendConnect();
      } else {
        console.log('  → ждём connect.challenge от gateway');
        setTimeout(() => {
          if (!connectSent && !connectNonce && !resolved) {
            console.log('❌ ТАЙМАУТ: gateway не прислал connect.challenge за 10 секунд');
            console.log('  → Это и есть причина зависания CLI!');
            ws.close(1008, 'challenge timeout');
          }
        }, 10000);
      }
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); }
      catch { return; }

      if (msg.type === 'event' || (!msg.type && msg.event)) {
        const eventName = msg.event || msg.payload?.type || '?';
        console.log(`📥 EVENT: ${eventName}`, msg);

        if (eventName === 'connect.challenge') {
          const payload = msg.payload || {};
          const nonce = payload.nonce;
          if (!nonce || typeof nonce !== 'string' || nonce.trim().length === 0) {
            console.log('❌ connect.challenge без nonce!');
            ws.close(1008, 'missing nonce');
            return;
          }
          connectNonce = nonce.trim();
          console.log(`  → nonce получен: ${connectNonce.slice(0, 20)}...`);

          if (ws.readyState === WebSocket.OPEN && !connectSent) {
            sendConnect();
          }
          return;
        }

        if (eventName === 'tick') return;
        return;
      }

      if (msg.type === 'res') {
        console.log(`📥 RESPONSE id=${msg.id} ok=${msg.ok}`,
          msg.ok ? { status: msg.payload?.status || 'ok' } : msg.error);
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          pendingRequests.delete(msg.id);
          if (pending.timeout) clearTimeout(pending.timeout);
          if (msg.ok) pending.resolve(msg.payload);
          else pending.reject(new Error(msg.error?.message || 'unknown error'));
        }
      }
    });

    ws.on('close', (code, reason) => {
      const reasonText = reason ? reason.toString() : '(no reason)';
      console.log(`🔌 WebSocket CLOSED: code=${code}, reason=${reasonText}`);
      clearTimeout(overallTimer);
      if (!resolved) reject(new Error(`closed: ${code} ${reasonText}`));
    });

    ws.on('error', (err) => {
      console.log(`❌ WebSocket ERROR: ${err.message}`);
      clearTimeout(overallTimer);
      if (!resolved) reject(err);
    });

    // --- Вспомогательные функции ---
    function sendRequest(method, params, opts = {}) {
      return new Promise((resolveReq, rejectReq) => {
        if (ws.readyState !== WebSocket.OPEN) {
          rejectReq(new Error('WebSocket не открыт'));
          return;
        }
        const id = uuid();
        const frame = { type: 'req', id, method, params };
        const timeoutMs = opts.timeoutMs || 15000;

        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          rejectReq(new Error(`таймаут ${method} (${timeoutMs}ms)`));
        }, timeoutMs);

        pendingRequests.set(id, { resolve: resolveReq, reject: rejectReq, timeout: timer });
        console.log(`📤 REQ ${method} id=${id.slice(0, 8)}`);
        ws.send(JSON.stringify(frame));
      });
    }

    function sendConnect() {
      if (connectSent) return;
      connectSent = true;
      resolved = false;
      console.log('➡️  Отправляем connect...');

      const role = 'operator';
      const scopes = ['operator.admin'];
      const nonce = connectNonce || '';
      const signedAtMs = Date.now();

      // Собираем device payload
      const payload = buildDeviceAuthPayloadV3({
        deviceId: deviceIdentity.deviceId,
        clientId: 'cli',
        clientMode: 'cli',
        role,
        scopes,
        signedAtMs,
        token: GATEWAY_TOKEN,
        nonce,
        platform: process.platform,
        deviceFamily: '',
      });
      const signature = signDevicePayload(deviceIdentity.privateKeyPem, payload);

      const device = {
        id: deviceIdentity.deviceId,
        publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
        signature,
        signedAt: signedAtMs,
        nonce,
      };

      const connectParams = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'cli',
          displayName: 'test-handshake',
          version: 'unknown',
          platform: process.platform,
          mode: 'cli',
          instanceId: uuid(),
        },
        caps: [],
        auth: GATEWAY_TOKEN ? { token: GATEWAY_TOKEN } : undefined,
        role,
        scopes,
        device,
      };

      console.log('  device:', { id: device.id.slice(0, 20), signature: signature.slice(0, 20) });
      console.log('  auth payload (v3):', buildDeviceAuthPayloadV3({
        deviceId: deviceIdentity.deviceId,
        clientId: 'cli',
        clientMode: 'cli',
        role,
        scopes,
        signedAtMs,
        token: '',
        nonce,
        platform: process.platform,
        deviceFamily: '',
      }));

      sendRequest('connect', connectParams)
        .then((helloOk) => {
          console.log('✅ CONNECT УСПЕШЕН!');
          console.log('  protocol:', helloOk?.protocol);
          console.log('  server:', helloOk?.server);
          console.log('  features:', helloOk?.features?.methods?.slice?.(0, 5));
          clearTimeout(overallTimer);

          // === Сначала посмотрим доступные методы ===
          console.log('\n➡️  Смотрим доступные методы gateway...');
          return sendRequest('gateway.routes', {}, { timeoutMs: 5000 });
        })
        .then((result) => {
          console.log('✅ RESPONSE:');
          console.log('  Результат:', JSON.stringify(result, null, 2).slice(0, 2000));
          
          // === Пробуем узнать методы ===
          console.log('\n➡️  Пробуем ping...');
          return sendRequest('ping', {}, { timeoutMs: 5000 });
        })
        .then((result) => {
          console.log('✅ PONG:', result);
          
          // === Пробуем model.run ===
          console.log('\n➡️  Пробуем model.run через chatgpt-web...');
          return sendRequest('model.run', {
            provider: 'chatgpt-web',
            model: 'chatgpt-web',
            messages: [
              { role: 'user', content: 'Say OK in one word' }
            ]
          }, { timeoutMs: 30000 });
        })
        .then((result) => {
          console.log('✅ MODEL.RUN УСПЕШЕН!');
          console.log('  Результат:', JSON.stringify(result, null, 2).slice(0, 1000));
          resolved = true;
          ws.close();
          resolve(result);
        })
        .catch((err) => {
          console.log(`❌ ОШИБКА: ${err.message}`);
          resolved = true;
          ws.close();
          reject(err);
        });
    }
  });
}

main()
  .then((result) => {
    console.log('\n=== УСПЕХ ===');
    process.exit(0);
  })
  .catch((err) => {
    console.log(`\n=== ПРОВАЛ: ${err.message} ===`);
    process.exit(1);
  });
