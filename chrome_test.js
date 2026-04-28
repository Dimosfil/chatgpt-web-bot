const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome', // использует твой установленный Chrome
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://chatgpt.com/');
})();