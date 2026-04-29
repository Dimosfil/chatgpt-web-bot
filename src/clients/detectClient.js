function getHeader(req, name) {
  return String(req.headers[String(name).toLowerCase()] || '').trim();
}

function normalizeClient(value) {
  const v = String(value || '').trim().toLowerCase();

  if (v === 'openclaw') return 'openclaw';
  if (v === 'codex') return 'codex';
  if (v === 'default') return 'default';

  return '';
}

function detectClient(req, body) {
  const explicitHeader =
    normalizeClient(getHeader(req, 'x-chatgpt-web-client')) ||
    normalizeClient(getHeader(req, 'x-client')) ||
    normalizeClient(getHeader(req, 'x-llm-client'));

  if (explicitHeader) {
    return explicitHeader;
  }

  if (getHeader(req, 'x-openclaw-client')) {
    return 'openclaw';
  }

  if (getHeader(req, 'x-codex-client')) {
    return 'codex';
  }

  const metadataClient =
    normalizeClient(body?.metadata?.client) ||
    normalizeClient(body?.client) ||
    normalizeClient(body?.user);

  if (metadataClient) {
    return metadataClient;
  }

  const userAgent = getHeader(req, 'user-agent').toLowerCase();

  if (userAgent.includes('openclaw')) {
    return 'openclaw';
  }

  if (userAgent.includes('codex')) {
    return 'codex';
  }

  const model = String(body?.model || '').toLowerCase();

  if (model.includes('openclaw')) {
    return 'openclaw';
  }

  if (model.includes('codex')) {
    return 'codex';
  }

  return normalizeClient(process.env.CHATGPT_WEB_DEFAULT_CLIENT) || 'default';
}

module.exports = {
  detectClient
};