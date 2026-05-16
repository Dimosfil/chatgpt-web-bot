const { log } = require('../core/logger');
const { safeJson, writeBlock } = require('../core/safeJson');

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

class DeepSeekStrategy {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || '';
    this.baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = Number(options.timeoutMs || process.env.DEEPSEEK_TIMEOUT || 120000);
  }

  ensureConfigured() {
    if (!this.apiKey.trim()) {
      throw new Error('DEEPSEEK_API_KEY is not set.');
    }
  }

  async chatCompletion(payload, requestId) {
    this.ensureConfigured();
    return this.requestJson('/chat/completions', payload, requestId);
  }

  async requestJson(path, payload, requestId) {
    const res = await this.fetch(path, payload, requestId);
    const text = await res.text();

    if (!res.ok) {
      log('errors.log', `[${requestId}] DeepSeek HTTP ${res.status}: ${text.slice(0, 1000)}`);
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      log('errors.log', `[${requestId}] DeepSeek invalid JSON: ${err.message}`);
      throw err;
    }
  }

  async streamToResponse(payload, res, requestId) {
    this.ensureConfigured();
    const upstream = await this.fetch('/chat/completions', payload, requestId);

    if (!upstream.ok) {
      const text = await upstream.text();
      log('errors.log', `[${requestId}] DeepSeek stream HTTP ${upstream.status}: ${text.slice(0, 1000)}`);
      throw new Error(`DeepSeek HTTP ${upstream.status}`);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }

    res.end();
  }

  async fetch(path, payload, requestId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    writeBlock('payload.log', `SERVER -> DEEPSEEK ${requestId}`, safeJson({
      ...payload,
      messages: `[${payload.messages?.length || 0} messages]`
    }));

    try {
      const startedAt = Date.now();
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      log(
        'requests.log',
        `[${requestId}] [DEEPSEEK] status=${response.status} durationMs=${Date.now() - startedAt}`
      );

      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { DeepSeekStrategy };
