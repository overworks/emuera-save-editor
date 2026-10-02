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

test('binary: resize, edit new cells, review changes, download, reopen and restore size', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'GLOBAL (12)' });
  await page.getByRole('button', { name: '배열 크기 변경', exact: true }).click();
  await expect(page.getByLabel('1차원 길이')).toBeFocused();
  await page.getByLabel('1차원 길이').fill('100000001');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('1억');
  await page.getByLabel('1차원 길이').fill('15');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await page.getByRole('button', { name: 'GLOBAL:14 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9223372036854775807');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByText('값 1개 변경 · 배열 1개 크기 변경')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GLOBAL 배열 크기 변경', exact: true })).toContainText('12');
  await expect(page.getByRole('button', { name: 'GLOBAL 배열 크기 변경', exact: true })).toContainText('15');

  // Failed opens preserve both cell edits and size changes in the Worker.
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'bad.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('값 1개 변경 · 배열 1개 크기 변경')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const path = (await (await pending).path())!;
  const saved = parseSave(new Uint8Array(readFileSync(path)), 'resized.sav');
  expect(saved.variables[0].dimensions).toEqual([15]);
  expect(saved.variables[0].values.get('14')).toBe(9223372036854775807n);
  await page.getByRole('button', { name: 'GLOBAL 배열 크기 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const original = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await original).path())!)).toEqual(readFileSync('tests/fixtures/global-binary.sav'));
  await page.getByLabel('세이브 파일 선택').setInputFiles(path);
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'GLOBAL (15)' });
  await expect(page.getByRole('button', { name: 'GLOBAL:14 값 수정', exact: true })).toContainText('9223372036854775807');
  await page.getByRole('button', { name: '배열 크기 변경', exact: true }).click();
  await page.getByLabel('1차원 길이').fill('0');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'GLOBAL 배열 크기 변경', exact: true })).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'GLOBAL (15)' });
  await expect(page.getByRole('button', { name: 'GLOBAL:14 값 수정', exact: true })).toContainText('9223372036854775807');
});

test('text arrays keep their saved bounds and offer no resizing control', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-text.sav');
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'GLOBAL (11)' });
  await expect(page.getByRole('button', { name: '배열 크기 변경', exact: true })).toHaveCount(0);
});

test('CSV metadata keeps saved bytes, follows edited NO, warns on conflicts and clears with a new save', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByLabel('CSV 파일 선택').setInputFiles(['tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv']);
  await page.getByRole('button', { name: /アオイ/ }).click();
  await expect(page.getByRole('heading', { name: 'アオイ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'NAME 값 수정', exact: true })).toContainText('アオイ');
  await expect(page.getByRole('button', { name: 'NO 값 수정', exact: true })).toContainText('7');
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const original = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await original).path())!)).toEqual(readFileSync('tests/fixtures/normal-binary.sav'));
  await page.getByLabel('CSV 파일 선택').setInputFiles([
    { name: 'Chara8.csv', mimeType: 'text/csv', buffer: Buffer.from('NO,8\nNAME,다른 인물') },
    { name: 'Chara7.csv', mimeType: 'text/csv', buffer: Buffer.from('NO,7\nNAME,덮어쓰기') },
    { name: '_Rename.csv', mimeType: 'text/csv', buffer: Buffer.from('ABL:1,focus') },
  ]);
  await page.locator('.csv-warnings summary').click();
  await expect(page.locator('.csv-warnings')).toContainText('캐릭터 NO 7 중복');
  await expect(page.locator('.csv-warnings')).toContainText('중복 별칭 [[focus]]');
  await page.getByLabel('변수 검색').fill('[[focus]]');
  await expect(page.getByRole('button', { name: 'ABL:0 값 수정', exact: true })).toBeVisible();
  await page.getByLabel('변수 검색').fill('NO');
  await page.getByRole('button', { name: 'NO 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('8');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await page.locator('.character-csv summary').click();
  await expect(page.locator('.character-csv')).toContainText('다른 인물');
  await expect(page.getByRole('heading', { name: 'アオイ', exact: true })).toBeVisible();
  const changed = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const output = readFileSync((await (await changed).path())!);
  const doc = parseSave(new Uint8Array(output), 'save.sav');
  expect(doc.variables.find(v => v.name === 'NO')?.values.get('')).toBe(8n);
  expect(doc.variables.find(v => v.name === 'NAME')?.values.get('')).toBe('アオイ');
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'bad.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.character-csv')).toContainText('다른 인물');
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByRole('button', { name: /アオイ/ }).click();
  await expect(page.locator('.character-csv')).toHaveCount(0);
  await page.getByLabel('변수 검색').fill('[[focus]]');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(0);
  await expect(page.locator('.search-expansion')).toHaveCount(0);
});
