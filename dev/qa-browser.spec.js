const { test, expect } = require('@playwright/test');

test('DEV visual QA harness has no mobile overflow and all modules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/qa-visual.html');
  await expect(page.locator('#status')).toContainText('QA PASS');
  await expect(page.locator('.module')).toHaveCount(12);
  await expect(page.locator('tbody td[data-label]')).toHaveCount(18);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('DEV visual QA harness remains usable on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:4173/qa-visual.html');
  await expect(page.locator('#status')).toContainText('QA PASS');
  await expect(page.locator('table')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
