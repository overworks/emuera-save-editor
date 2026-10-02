import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';
import { presetFixture } from '../preset-fixture';

test('presets preserve CSV names, edits and bytes across navigation, language changes and failed opens', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const bytes = Buffer.from(presetFixture());
  const requests: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('blob:')) requests.push(request.url()); });
  await page.goto('/?lang=ko');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'preset.sav', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.getByRole('combobox', { name: '게임 프리셋', exact: true })).toHaveValue('');
  await expect(page.getByText(/게임 코드에 해당하는 후보는 eraMegaten KR/)).toBeVisible();
  await page.getByRole('combobox', { name: '게임 프리셋', exact: true }).selectOption('megaten-kr');
  await page.locator('.preset-fields summary').click();
  await expect(page.getByRole('button', { name: 'HP 항목 열기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '소지금 항목 열기', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true })).toBeVisible();
  const untouched = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await untouched).path())!)).toEqual(bytes);

  await page.getByRole('button', { name: /Preset character 0/ }).click();
  await page.locator('.preset-fields summary').click();
  await page.getByRole('button', { name: 'HP 항목 열기', exact: true }).click();
  await expect(page.getByLabel('변수 검색')).toHaveValue('BASE:5');
  await expect(page.getByRole('button', { name: 'BASE:5 값 수정', exact: true })).toContainText('123');
  await page.getByLabel('CSV 파일 선택').setInputFiles({ name: 'Base.csv', mimeType: 'text/csv', buffer: Buffer.from('5,My CSV label') });
  await expect(page.locator('.data-table .cell-label')).toContainText('My CSV label');
  await expect(page.locator('.data-table .cell-label')).toContainText('프리셋 · HP');
  await page.getByRole('button', { name: 'BASE:5 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9223372036854775807');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('presets-desktop-ko.png'), fullPage: true });
  await page.getByRole('combobox', { name: '언어', exact: true }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'Game preset', exact: true })).toHaveValue('megaten-kr');
  await expect(page.locator('.data-table .cell-label')).toContainText('My CSV label');
  await expect(page.locator('.data-table .cell-label')).toContainText('Preset · HP');
  await expect(page.getByRole('button', { name: 'Edit BASE:5', exact: true })).toContainText('9223372036854775807');
  await page.getByRole('combobox', { name: 'Game preset', exact: true }).selectOption('tohok');
  await expect(page.getByText('1 value changed', { exact: true })).toBeVisible();
  await expect(page.getByText(/The save has a different game code/)).toBeVisible();
  await expect(page.locator('.data-table .cell-label')).toContainText('My CSV label');
  await expect(page.locator('.preset-value-label')).toHaveCount(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Select save file').setInputFiles({ name: 'bad.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Game preset', exact: true })).toHaveValue('tohok');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save', exact: true }).click();
  const edited = parseSave(new Uint8Array(readFileSync((await (await download).path())!)), 'edited.sav');
  expect(edited.variables.find(variable => variable.scope === 0 && variable.name === 'BASE')?.values.get('5')).toBe(9223372036854775807n);
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Select save file').setInputFiles({ name: 'new.sav', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.getByRole('combobox', { name: 'Game preset', exact: true })).toHaveValue('');
  expect(requests).toEqual([]);
});

for (const language of [
  { lang: 'en', open: 'Select save file', preset: 'Game preset', search: 'Search variables', cooking: 'Cooking' },
  { lang: 'ko', open: '세이브 파일 선택', preset: '게임 프리셋', search: '변수 검색', cooking: '요리' },
  { lang: 'ja', open: 'セーブファイルを選択', preset: 'ゲームプリセット', search: '変数を検索', cooking: '料理' },
]) {
  test(`${language.lang}: mobile preset names search the correct edition coordinates`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?lang=${language.lang}`);
    await page.getByLabel(language.open).setInputFiles({ name: 'preset.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(presetFixture('666', '509309154')) });
    await page.getByRole('button', { name: /Preset character 0/ }).click();
    await page.getByLabel(language.search).fill(language.cooking);
    for (const [preset, key] of [['megaten-kr', '12'], ['twkr-textbung', '44'], ['tohok', '61'], ['shin-era-tensei-p', '12']]) {
      await page.getByRole('combobox', { name: language.preset, exact: true }).selectOption(preset);
      await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
      await expect(page.locator('.data-table tbody tr')).toContainText(`ABL:${key}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: testInfo.outputPath(`presets-${language.lang}.png`), fullPage: true });
    await page.locator('.preset-fields summary').click();
    await page.locator('.game-presets').screenshot({ path: testInfo.outputPath(`preset-fields-${language.lang}.png`) });
    await page.getByRole('combobox', { name: language.preset, exact: true }).selectOption('');
    await expect(page.locator('.data-table tbody tr')).toHaveCount(0);
  });
}

test('ShinEraTenseiP uses its version for the suggestion and preserves bytes when opening shortcuts', async ({ page }, testInfo) => {
  const bytes = Buffer.from(presetFixture('666', '509309154'));
  await page.goto('/?lang=ko');
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'shin.sav', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.getByText(/게임 코드에 해당하는 후보는 ShinEraTenseiP/)).toBeVisible();
  const select = page.getByRole('combobox', { name: '게임 프리셋', exact: true });
  await expect(select).toHaveValue('');
  await select.selectOption('shin-era-tensei-p');
  await expect(page.getByText(/게임 코드와 버전이 자료와 일치합니다/)).toBeVisible();
  await page.getByRole('button', { name: /Preset character 1/ }).click();
  await page.locator('.preset-fields summary').click();
  await page.getByRole('button', { name: 'HP 항목 열기', exact: true }).click();
  await expect(page.getByLabel('변수 검색')).toHaveValue('BASE:5');
  await expect(page.getByRole('button', { name: 'BASE:5 값 수정', exact: true })).toContainText('123');
  await expect(page.getByRole('heading', { name: 'Preset character 1', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('shin-era-tensei-p-ko.png'), fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await download).path())!)).toEqual(bytes);

  await select.selectOption('megaten-kr');
  await expect(page.getByText(/이 프리셋으로 확인한 세이브 버전이 아닙니다/)).toBeVisible();
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'unknown.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(presetFixture('666', '999')) });
  await expect(select).toHaveValue('');
  await expect(page.locator('.game-presets')).not.toContainText('게임 코드에 해당하는 후보는');
});
