const { CHATGPT_URL, DEFAULT_TIMEOUT } = require('../config');

async function getChatGPTPage(context) {
    let page = context.pages().find((p) => p.url().includes('chatgpt.com'));

    if (!page) {
        page = await context.newPage();
        await page.goto(CHATGPT_URL, {
            waitUntil: 'domcontentloaded',
            timeout: DEFAULT_TIMEOUT,
        });
        await page.waitForTimeout(1500);
    } else {
        try {
            await page.bringToFront();
        } catch {}
    }

    if (!page.url().includes('chatgpt.com')) {
        await page.goto(CHATGPT_URL, {
            waitUntil: 'domcontentloaded',
            timeout: DEFAULT_TIMEOUT,
        });
        await page.waitForTimeout(1500);
    }

    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);

    return page;
}

module.exports = { getChatGPTPage };