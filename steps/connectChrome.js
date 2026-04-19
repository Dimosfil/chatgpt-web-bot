const { chromium } = require('playwright');
const { CDP_URL } = require('../config');

async function connectChrome() {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    if (!context) {
        throw new Error('Не найден context в подключённом Chrome.');
    }

    return { browser, context };
}

module.exports = { connectChrome };