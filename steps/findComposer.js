async function findComposer(page) {
    const selectors = [
        'textarea',
        '[contenteditable="true"]',
        'div[role="textbox"]',
        '[data-testid*="composer"]',
    ];

    const started = Date.now();
    const timeoutMs = 15000;

    while (Date.now() - started < timeoutMs) {
        for (const sel of selectors) {
            const locator = page.locator(sel).first();
            try {
                if (await locator.isVisible({ timeout: 250 })) {
                    return locator;
                }
            } catch {}
        }
        await page.waitForTimeout(200);
    }

    throw new Error('Не нашёл поле ввода ChatGPT.');
}

module.exports = { findComposer };