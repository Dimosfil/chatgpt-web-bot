async function getAssistantCount(page) {
    const selectors = [
        '[data-message-author-role="assistant"]',
        'article',
        '.markdown',
        '[class*="markdown"]',
    ];

    for (const sel of selectors) {
        try {
            const loc = page.locator(sel);
            const count = await loc.count();
            if (count > 0) return { sel, count };
        } catch {}
    }

    return { sel: '[data-message-author-role="assistant"]', count: 0 };
}

module.exports = { getAssistantCount };