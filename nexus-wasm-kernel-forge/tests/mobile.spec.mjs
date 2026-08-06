import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('VORTEX compiles, simulates, benchmarks, and exports real WASM on a phone viewport', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });

  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('WASM READY', { timeout: 30_000 });
  await expect(page.locator('#fluid')).toBeVisible();
  await expect(page.locator('#grid')).toContainText('×');
  await expect(page.locator('#kernelHash')).toHaveText(/^[a-f0-9]{9}$/);
  await expect(page.locator('#stepMs')).toHaveText(/ms$/);

  const canvas = page.locator('#fluid');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.35, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#energy')).not.toHaveText('—');

  await page.locator('#benchmark').click();
  await expect(page.locator('#reportPanel')).toBeVisible();
  await expect(page.locator('#report')).toContainText('averageMilliseconds', { timeout: 30_000 });
  await page.locator('#closeReport').click();

  const wasmDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportWasm').click();
  const wasmDownload = await wasmDownloadPromise;
  expect(wasmDownload.suggestedFilename()).toMatch(/\.wasm$/);
  const wasmPath = await wasmDownload.path();
  const wasmBytes = new Uint8Array(await readFile(wasmPath));
  expect(WebAssembly.validate(wasmBytes)).toBe(true);

  const contractDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportContract').click();
  const contractDownload = await contractDownloadPromise;
  const contractPath = await contractDownload.path();
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  expect(contract.schema).toBe('nexus.ai-kernel-contract.v1');
  expect(contract.capabilities.imports).toEqual([]);
  expect(contract.binary.sha256).toMatch(/^[a-f0-9]{64}$/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(failures).toEqual([]);
});

test('invalid VORTEX source blocks recompilation and reset restores verified code', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('WASM READY', { timeout: 30_000 });
  await page.locator('#openCompiler').click();
  await expect(page.locator('#compilerPanel')).toBeVisible();
  await page.locator('#vortexSource').fill('engine fluid2d\ngrid 128\npressure 500\nmagic yes');
  await page.locator('#compile').click();
  await expect(page.locator('#status')).toHaveText('BLOCKED');
  await expect(page.locator('#compilerOutput')).toContainText('VORTEX_INVALID');
  await page.locator('#resetSource').click();
  await page.locator('#compile').click();
  await expect(page.locator('#status')).toHaveText('WASM READY', { timeout: 30_000 });
});
