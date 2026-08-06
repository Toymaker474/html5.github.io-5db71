import { test, expect } from '@playwright/test';

test('Generation One forges and previews all four product classes on a phone viewport', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });

  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('PASS');
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.frameLocator('#preview').locator('body')).toContainText('NEXUS Generation One');

  const cases = [
    ['Simulation', 'Living Particle Field', 'canvas#world'],
    ['Game', 'Touch / drag to move', 'canvas#game'],
    ['AI model', 'Local neural model', 'canvas#field'],
    ['Web app', 'Idea board', '.app-grid'],
  ];

  for (const [buttonName, previewText, selector] of cases) {
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await expect(page.locator('#status')).toHaveText('PASS');
    await expect(page.locator('#download')).toBeEnabled();
    const frame = page.frameLocator('#preview');
    await expect(frame.locator('body')).toContainText(previewText);
    await expect(frame.locator(selector)).toBeVisible();
    await expect(page.locator('#evidence')).toContainText('rootSha256');
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(failures).toEqual([]);
});

test('edited invalid LUMEN fails closed instead of silently generating', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('PASS');
  await page.locator('summary').click();
  await page.locator('#lumen').fill('world "Unsafe"\nkind game\ngoal "test"\ntarget universal-web\nquality balanced\nunknown yes');
  await page.locator('#compile').click();
  await expect(page.locator('#status')).toHaveText('FAIL');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#evidence')).toContainText('LUMEN_INVALID');
});
