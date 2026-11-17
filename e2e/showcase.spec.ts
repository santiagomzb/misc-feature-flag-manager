import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('create a flag, change its state, and find it after reloading', async ({ page }) => {
  await mkdir('frontend/docs/screenshots', { recursive: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Feature flags', exact: true })).toBeVisible();
  await expect(page.getByText('No flags yet', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'frontend/docs/screenshots/01-empty.png', fullPage: true });

  await page.getByLabel('Key', { exact: true }).fill('new_checkout');
  await page.getByLabel('Description', { exact: true }).fill('Try the new checkout experience.');
  await page.getByRole('button', { name: 'Create flag', exact: true }).click();
  const state = page.getByRole('switch', { name: /new_checkout/ });
  await expect(state).not.toBeChecked();
  await page.screenshot({ path: 'frontend/docs/screenshots/02-created.png', fullPage: true });

  await state.click();
  await expect(state).toBeChecked();
  await page.reload();
  await expect(state).toBeChecked();
  await page.screenshot({ path: 'frontend/docs/screenshots/03-enabled.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(state).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create flag', exact: true })).toBeVisible();
  await page.screenshot({ path: 'frontend/docs/screenshots/04-mobile.png', fullPage: true });
  await state.click();
  await expect(state).not.toBeChecked();
  await page.reload();
  await expect(state).not.toBeChecked();
});
