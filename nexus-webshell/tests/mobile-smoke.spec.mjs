import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 430, height: 932 },
  hasTouch: true,
  isMobile: true,
});

test('WebShell runs safe commands and persists a virtual file', async ({ page }) => {
  await page.goto('http://127.0.0.1:4176/', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('NEXUS WebShell');
  await expect(page.locator('.notice')).toContainText('not native pwsh.exe');
  await expect(page.locator('#runtime-status')).toHaveText('READY');

  const input = page.locator('#command-input');
  await input.fill('Set-Content notes.txt "hello agents"');
  await page.locator('#command-form button[type="submit"]').click();

  await input.fill('Get-Content notes.txt');
  await page.locator('#command-form button[type="submit"]').click();
  await expect(page.locator('#terminal')).toContainText('hello agents');

  await input.fill('Get-ChildItem | Select-Object name,type | ConvertTo-Json');
  await page.locator('#command-form button[type="submit"]').click();
  await expect(page.locator('#terminal')).toContainText('welcome.txt');

  await input.fill('Invoke-Tool word-count "agents build useful tools"');
  await page.locator('#command-form button[type="submit"]').click();
  await expect(page.locator('#terminal')).toContainText('"words": 4');

  const horizontalOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  expect(horizontalOverflow).toBe(0);

  const smallestButton = await page.locator('button').evaluateAll(buttons =>
    Math.min(...buttons.filter(button => button.offsetParent !== null).map(button => button.getBoundingClientRect().height)));
  expect(smallestButton).toBeGreaterThanOrEqual(44);
});
