import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../../src/core/editor';

test.use({ locale: 'ko-KR' });

test('binary: open, CSV, edit, changes, undo, download, reopen entirely offline', async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/') || request.method() !== 'GET') externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '세이브를 열고,' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  await expect(page.getByRole('heading', { name: '세이브 편집기', exact: true })).toBeVisible();
  await page.getByLabel('CSV 파일 선택').setInputFiles('tests/fixtures/ABL.csv');
  await page.getByRole('button', { name: /アオイ/ }).click();
  await page.getByLabel('변수 검색').fill('집중력');
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ABL:0 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9223372036854775807');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByText('1개 값 변경됨')).toBeVisible();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'ABL:0 값 수정', exact: true })).toContainText('9223372036854775807');
  await page.getByLabel('ABL:0 되돌리기', { exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  await page.getByLabel('변수 검색').fill('MONEY');
  await page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9876543210');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  const waitDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const download = await waitDownload;
  expect(download.suggestedFilename()).toBe('normal-binary.edited.sav');
  const path = (await download.path())!;
  const saved = parseSave(new Uint8Array(readFileSync(path)), 'save.sav');
  expect(saved.variables.find(v => v.name === 'MONEY')?.values.get('0')).toBe(9876543210n);
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles(path);
  await page.getByLabel('변수 검색').fill('MONEY');
  await expect(page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true })).toContainText('9876543210');
  expect(externalRequests).toEqual([]);
});

test('global text: rejects out-of-range integers, preserves original on invalid file', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-text.sav');
  await expect(page.getByRole('heading', { name: '글로벌 변수', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'GLOBAL:0 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9223372036854775808');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('64비트');
  await page.getByLabel('새로운 값').fill('-9223372036854775808');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  const waitDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const download = await waitDownload;
  const e = new Editor(parseSave(new Uint8Array(readFileSync((await download.path())!)), 'global.sav'));
  expect(e.document.variables[0].values.get('0')).toBe(-9223372036854775808n);
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('global-text.sav', { exact: true })).toBeVisible();
});

test('Shift-JIS text: encoding override, string edit and exact original reset', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('텍스트 인코딩').selectOption('shift_jis');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-sjis.sav');
  await page.getByRole('button', { name: /アオイ/ }).click();
  await page.getByRole('button', { name: 'NAME 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('한글');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('인코딩');
  await page.getByLabel('새로운 값').fill('日本語');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('heading', { name: '日本語', exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const file = await pending;
  expect(readFileSync((await file.path())!)).toEqual(readFileSync('tests/fixtures/normal-sjis.sav'));
});

test('mobile: working sample, navigable dialog and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '샘플로 둘러보기' }).click();
  await page.getByLabel('변수 검색').fill('money');
  await page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true }).click();
  await expect(page.getByLabel('새로운 값')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
