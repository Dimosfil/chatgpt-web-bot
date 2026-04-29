async function sendMessage(page, composer) {
    await composer.press('Enter').catch(() => {});
    await page.waitForTimeout(250);

    const sendSelectors = [
        'button[aria-label*="Send" i]',
        'button[aria-label*="Отправ" i]',
        'button[data-testid*="send"]',
    ];

    for (const sel of sendSelectors) {
        const btn = page.locator(sel).first();
        try {
            if (await btn.isVisible({ timeout: 200 })) {
                await btn.click().catch(() => {});
                return;
            }
        } catch {}
    }
}

module.exports = { sendMessage };