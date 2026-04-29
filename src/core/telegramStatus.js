const https = require('https');
const { log } = require('./logger');

const ENABLED = process.env.TELEGRAM_STATUS_ENABLED === '1';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MIN_INTERVAL_MS = parseInt(
  process.env.TELEGRAM_STATUS_MIN_INTERVAL_MS || '1200',
  10
);

const lastSentByRequest = new Map();

function shouldSend(requestId) {
  if (!ENABLED) return false;
  if (!BOT_TOKEN) return false;

  const now = Date.now();
  const last = lastSentByRequest.get(requestId) || 0;

  if (now - last < MIN_INTERVAL_MS) {
    return false;
  }

  lastSentByRequest.set(requestId, now);
  return true;
}

function postTelegram(chatId, text) {
  return new Promise(resolve => {
    if (!chatId) return resolve();

    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      },
      res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      }
    );

    req.on('error', err => {
      log('errors.log', `[telegram-status] ${err.message}`);
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.write(payload);
    req.end();
  });
}

async function sendTelegramStatus(requestId, chatId, text) {
  try {
    if (!shouldSend(requestId)) return;

    const safeText = String(text || '').trim();
    if (!safeText) return;

    await postTelegram(chatId, safeText);
  } catch (err) {
    log(
      'errors.log',
      `[telegram-status] unexpected: ${err.message}\n${err.stack || ''}`
    );
  }
}

function cleanupTelegramStatus(requestId) {
  lastSentByRequest.delete(requestId);
}

module.exports = {
  sendTelegramStatus,
  cleanupTelegramStatus
};