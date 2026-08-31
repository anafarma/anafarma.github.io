const { test, expect } = require('@playwright/test');

test('DEV login boot renders without splash lock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/index.html');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('.login-card')).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.locator('#splash')).toBeHidden();
  const metrics = await page.evaluate(() => ({
    width: document.querySelector('.login-box')?.getBoundingClientRect().width || 0,
    cardWidth: document.querySelector('.login-card')?.getBoundingClientRect().width || 0,
    overflow: document.documentElement.scrollWidth - window.innerWidth
  }));
  expect(metrics.width).toBeGreaterThan(300);
  expect(metrics.cardWidth).toBeGreaterThan(300);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
});

test('DEV login remains usable on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:4173/index.html');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('.login-card')).toBeVisible();
  await expect(page.locator('input[name="username"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

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
