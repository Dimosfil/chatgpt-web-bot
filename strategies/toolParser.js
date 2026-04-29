function tryParseToolCall(text) {
  if (!text) return null;

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const json = JSON.parse(match[0]);

    if (json.tool_call) {
      return json.tool_call;
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = {
  tryParseToolCall
};