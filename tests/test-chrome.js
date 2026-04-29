const { chromium } = require('playwright');

(async () => {
  try {
    const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = b.contexts()[0];
    console.log('Pages:', ctx.pages().length);
    ctx.pages().forEach(p => console.log('  URL:', p.url().slice(0, 150)));

    let page = ctx.pages().find(p => p.url().includes('chatgpt.com'));
    if (!page) {
      console.log('Opening ChatGPT page...');
      page = await ctx.newPage();
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } else {
      await page.bringToFront();
    }
    console.log('Current URL:', page.url().slice(0, 150));

    // Try to find any visible input area
    const selectors = [
      '#prompt-textarea',
      '[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      'form textarea',
      '.ProseMirror',
      '[data-id="root"]',
    ];
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        console.log('Found visible element:', sel);
        const text = await el.textContent().catch(() => '(no text)');
        console.log('  Content:', JSON.stringify(text).slice(0, 100));
        break;
      }
    }

    await b.close();
  } catch (e) {
    console.log('FAIL:', e.message || e);
  }
  process.exit(0);
})();
