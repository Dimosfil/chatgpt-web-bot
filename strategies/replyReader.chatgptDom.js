async function readReply(page, msgBefore, timeoutMs) {
  const started = Date.now();
  let lastText = '';
  let prevText = '';
  let stable = 0;

  while (Date.now() - started < timeoutMs) {
    const count = await page.locator('[data-message-author-role="assistant"]').count();

    if (count > msgBefore) {
      const last = page.locator('[data-message-author-role="assistant"]').last();

      try {
        lastText = await last.innerText();
      } catch {
        lastText = await last.textContent();
      }

      if (lastText && lastText.trim().length > 3) {
        if (lastText === prevText) {
          stable++;
        } else {
          stable = 0;
          prevText = lastText;
        }

        if (stable >= 3) break;
      }
    }

    await page.waitForTimeout(700);
  }

  return (lastText || '').trim();
}

module.exports = {
  readReply
};