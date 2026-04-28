const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];

    let page = ctx.pages().find(p => p.url().includes('chatgpt.com'));
    if (!page) {
      page = await ctx.newPage();
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }
    await page.bringToFront();
    console.log('URL:', page.url().slice(0, 120));

    // Inspect the prompt textarea element
    const info = await page.evaluate(() => {
      const el = document.querySelector('#prompt-textarea');
      if (!el) return 'NOT FOUND';
      return {
        tag: el.tagName,
        contenteditable: el.getAttribute('contenteditable'),
        role: el.getAttribute('role'),
        id: el.id,
        classes: Array.from(el.classList).join('.'),
        parentClasses: Array.from(el.parentElement?.classList || []).join('.'),
        placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder'),
      };
    });
    console.log('Prompt textarea info:', JSON.stringify(info, null, 2));

    // Check what selectors match
    for (const sel of ['textarea', '[contenteditable="true"]', 'div[role="textbox"]', '#prompt-textarea', '.ProseMirror']) {
      const count = await page.locator(sel).count().catch(() => -1);
      console.log(`  '${sel}' count: ${count}`);
    }

    await browser.close();
  } catch (e) {
    console.log('FAIL:', e.message || e);
  }
  process.exit(0);
})();
