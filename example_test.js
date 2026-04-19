const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);

  await page.goto('https://example.com', { waitUntil: 'load' });
  console.log(await page.title());

  await page.goto('https://chatgpt.com', { waitUntil: 'commit', timeout: 120000 });
  console.log('opened chatgpt');
})();