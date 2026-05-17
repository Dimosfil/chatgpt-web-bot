const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;
const REDACTED_REASONING = '[redacted reasoning_content]';

function isObject(value) {
  return value && typeof value === 'object';
}

function cloneWithoutDeepSeekReasoning(value, { redact = false } = {}) {
  if (Array.isArray(value)) {
    return value.map(item => cloneWithoutDeepSeekReasoning(item, { redact }));
  }

  if (!isObject(value)) return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'reasoning_content') {
      if (redact) output[key] = REDACTED_REASONING;
      continue;
    }
    output[key] = cloneWithoutDeepSeekReasoning(item, { redact });
  }
  return output;
}

class DeepSeekDialogManager {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.reasoningByToolCallId = new Map();
  }

  captureResponse(upstream) {
    for (const choice of upstream?.choices || []) {
      this.captureAssistantMessage(choice?.message);
    }
  }

  captureAssistantMessage(message) {
    const reasoning = message?.reasoning_content;
    if (typeof reasoning !== 'string' || !reasoning.trim()) return;

    for (const toolCall of message.tool_calls || []) {
      const id = toolCall?.id;
      if (!id) continue;
      this.reasoningByToolCallId.set(id, {
        reasoning,
        expiresAt: Date.now() + this.ttlMs
      });
    }

    this.prune();
  }

  rehydrateMessages(messages) {
    this.prune();
    return (messages || []).map(message => this.rehydrateMessage(message));
  }

  rehydrateMessage(message) {
    if (message?.role !== 'assistant' || message.reasoning_content) {
      return message;
    }

    for (const toolCall of message.tool_calls || []) {
      const id = toolCall?.id;
      const record = id ? this.reasoningByToolCallId.get(id) : null;
      if (record) {
        return {
          ...message,
          reasoning_content: record.reasoning
        };
      }
    }

    return message;
  }

  prune() {
    const now = Date.now();
    for (const [id, record] of this.reasoningByToolCallId.entries()) {
      if (!record || record.expiresAt <= now) {
        this.reasoningByToolCallId.delete(id);
      }
    }

    while (this.reasoningByToolCallId.size > this.maxEntries) {
      const oldestId = this.reasoningByToolCallId.keys().next().value;
      this.reasoningByToolCallId.delete(oldestId);
    }
  }
}

const deepSeekDialogManager = new DeepSeekDialogManager();

module.exports = {
  DeepSeekDialogManager,
  cloneWithoutDeepSeekReasoning,
  deepSeekDialogManager
};
