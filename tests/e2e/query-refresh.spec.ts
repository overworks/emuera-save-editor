import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';

for (const format of ['binary', 'text']) test(`${format}: stale rows stay disabled while a character view refreshes`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/?lang=en');
  await page.getByLabel('Select save file', { exact: true }).setInputFiles(`tests/fixtures/normal-${format}.sav`);
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  const name = page.getByRole('button', { name: 'Edit NAME', exact: true });
  await name.click();
  await page.getByLabel('New value', { exact: true }).fill('Original');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(name).toContainText('Original');
  await expect(name).toBeEnabled();

  // Hold the debounce window open even on slow machines.
  await page.clock.pauseAt(new Date('2026-01-01T00:10:00Z'));
  await page.getByRole('button', { name: 'Duplicate character', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate character', exact: true }).click();
  await expect(page.getByRole('button', { name: /#1 · NO 7/ })).toBeVisible();
  await expect(name).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Revert NAME', exact: true })).toBeDisabled();
  await expect(page.locator('.data-table-wrap')).toHaveAttribute('aria-busy', 'true');
  await page.clock.resume();

  await name.click();
  await page.getByLabel('New value', { exact: true }).fill('Copy');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(name).toContainText('Copy');
  await expect(name).toBeEnabled();

  await page.clock.pauseAt(new Date('2026-01-01T00:20:00Z'));
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await expect(name).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Revert NAME', exact: true })).toBeDisabled();
  await page.clock.resume();
  await expect(name).toContainText('Original');
  await expect(name).not.toContainText('Copy');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save', exact: true }).click();
  const saved = parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'edited.sav');
  expect(saved.characterCount).toBe(2);
  expect(saved.variables.find(v => v.name === 'NAME' && v.scope === 0)?.values.get('')).toBe('Original');
  expect(saved.variables.find(v => v.name === 'NAME' && v.scope === 1)?.values.get('')).toBe('Copy');
});
