const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const pages = browser.contexts()[0]?.pages();
  if (!pages || pages.length === 0) { console.log('NO PAGES'); await browser.close(); return; }
  const page = pages.find(p => p.url().includes('chatgpt.com')) || pages[0];
  await page.bringToFront();
  
  const dalleCheck = await page.evaluate(() => {
    const checks = {};
    checks.url = window.location.href;
    checks.title = document.title;
    
    // Check for imagegen containers
    const imagegenDivs = document.querySelectorAll('div[class*="imagegen"]');
    checks.imagegenDivs = imagegenDivs.length;
    
    // Check for estuary image URLs
    const estuaryImgs = document.querySelectorAll('img[src*="estuary"]');
    checks.estuaryImgs = estuaryImgs.length;
    if (estuaryImgs.length > 0) {
      checks.firstImgSrc = estuaryImgs[0].src.substring(0, 150);
      checks.firstImgAlt = estuaryImgs[0].alt.substring(0, 100);
    }
    
    // Check for DALL-E mention in page
    checks.bodyHasDalle = document.body.innerText.includes('DALL-E') || document.body.innerText.includes('DALL·E');
    
    // Look for GPT selector/explorer (where DALL-E lives)
    const gptSelectors = document.querySelectorAll('[class*="gpt"]');
    checks.gptSelectors = gptSelectors.length;
    
    // Check for "Create" buttons
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.substring(0, 30));
    checks.buttons = buttons.filter(b => b.toLowerCase().includes('create') || b.toLowerCase().includes('image') || b.toLowerCase().includes('dall'));
    
    checks.bodyPreview = document.body.innerText.substring(0, 1000);
    return checks;
  });
  console.log(JSON.stringify(dalleCheck, null, 2));
  await browser.close();
})();
