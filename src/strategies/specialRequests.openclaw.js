function isSlugRequest(body) {
  const raw = JSON.stringify(body);
  return raw.includes('generate a short 1-2 word filename slug');
}

function handleSpecialRequest(body) {
  if (isSlugRequest(body)) {
    return 'telegram-chat';
  }

  return null;
}

module.exports = {
  handleSpecialRequest
};