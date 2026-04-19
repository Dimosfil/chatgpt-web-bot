const { PROJECT_NAME } = require('../config');
const { ensureSidebarVisible } = require('./ensureSidebarVisible');

async function openProjectFolder(page, projectName = PROJECT_NAME) {
    await ensureSidebarVisible(page);

    const tryFindAndClick = async () => {
        const candidates = [
            page.getByText(projectName, { exact: true }).first(),
            page.locator(`text="${projectName}"`).first(),
            page.locator(`a:has-text("${projectName}")`).first(),
            page.locator(`button:has-text("${projectName}")`).first(),
            page.locator(`[role="treeitem"]:has-text("${projectName}")`).first(),
            page.locator(`[role="link"]:has-text("${projectName}")`).first(),
            page.locator(`[data-testid*="project"]:has-text("${projectName}")`).first(),
        ];

        for (const loc of candidates) {
            try {
                if (await loc.isVisible({ timeout: 500 })) {
                    await loc.click().catch(() => {});
                    await page.waitForTimeout(1200);
                    return true;
                }
            } catch {}
        }
        return false;
    };

    if (await tryFindAndClick()) return true;

    for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, 700).catch(() => {});
        await page.waitForTimeout(250);
        if (await tryFindAndClick()) return true;
    }

    return false;
}

module.exports = { openProjectFolder };