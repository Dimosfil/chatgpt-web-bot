async function ensureSidebarVisible(page) {
    const sidebarSelectors = [
        'nav',
        'aside',
        '[data-testid*="sidebar"]',
        '[class*="sidebar"]',
    ];

    for (const sel of sidebarSelectors) {
        try {
            const loc = page.locator(sel).first();
            if (await loc.isVisible({ timeout: 300 })) return true;
        } catch {}
    }

    const toggleSelectors = [
        'button[aria-label*="sidebar" i]',
        'button[aria-label*="menu" i]',
        'button[aria-label*="бок" i]',
        'button[data-testid*="sidebar"]',
    ];

    for (const sel of toggleSelectors) {
        try {
            const btn = page.locator(sel).first();
            if (await btn.isVisible({ timeout: 500 })) {
                await btn.click().catch(() => {});
                await page.waitForTimeout(800);
                break;
            }
        } catch {}
    }

    for (const sel of sidebarSelectors) {
        try {
            const loc = page.locator(sel).first();
            if (await loc.isVisible({ timeout: 500 })) return true;
        } catch {}
    }

    return false;
}

module.exports = { ensureSidebarVisible };