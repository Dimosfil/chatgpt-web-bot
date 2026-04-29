const { getAssistantCount } = require('./getAssistantCount');

async function waitForAssistantReply(page, previousCount = 0) {
    const started = Date.now();
    const timeoutMs = 120000;
    const pollMs = 250;
    const stableMsToFinish = 1800;

    let bestText = '';
    let lastSeenText = '';
    let unchangedForMs = 0;

    while (Date.now() - started < timeoutMs) {
        const info = await getAssistantCount(page);
        const selector = info.sel;
        const count = info.count;

        if (count > 0) {
            const index = Math.max(previousCount, count - 1);
            const last = page.locator(selector).nth(index);
            const text = (await last.innerText().catch(() => '')).trim();

            if (text.length > 0) {
                bestText = text;

                if (text !== lastSeenText) {
                    lastSeenText = text;
                    unchangedForMs = 0;
                } else {
                    unchangedForMs += pollMs;
                }

                if (count > previousCount && unchangedForMs >= stableMsToFinish) {
                    return {
                        text: bestText,
                        time: Date.now() - started,
                        selector,
                    };
                }

                if (previousCount === 0 && unchangedForMs >= stableMsToFinish) {
                    return {
                        text: bestText,
                        time: Date.now() - started,
                        selector,
                    };
                }
            }
        }

        await page.waitForTimeout(pollMs);
    }

    if (bestText) {
        return {
            text: bestText,
            time: Date.now() - started,
            selector: 'fallback',
        };
    }

    throw new Error('Не дождался ответа ассистента.');
}

module.exports = { waitForAssistantReply };