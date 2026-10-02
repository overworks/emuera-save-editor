import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';

test('binary variables: add in both scopes, delete, export, reset exactly and reopen', async ({ page }, testInfo) => {
  await page.goto('/?lang=ko');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('변수 이름', { exact: true })).toBeFocused();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('MONEY');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('이미 있습니다');
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NEW_NUMBER');
  await dialog.getByLabel('배열 차원 수').selectOption('0');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await page.getByRole('button', { name: 'NEW_NUMBER 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9223372036854775807');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();

  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NEW_TEXT');
  await dialog.getByLabel('변수 범위').selectOption('0');
  await expect(dialog.getByLabel('캐릭터 변수 종류')).toHaveValue('user');
  await expect(dialog.getByLabel('배열 차원 수').locator('option')).toHaveCount(2);
  await dialog.getByLabel('값 자료형').selectOption('string');
  await dialog.getByLabel('배열 차원 수').selectOption('2');
  await dialog.getByLabel('1차원 길이').fill('2'); await dialog.getByLabel('2차원 길이').fill('2');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await page.getByRole('button', { name: 'NEW_TEXT:1:1 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('추가😀'); await page.getByRole('button', { name: '변경 적용', exact: true }).click();

  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NICKNAME');
  await dialog.getByLabel('캐릭터 변수 종류').selectOption('builtin');
  await dialog.getByLabel('값 자료형').selectOption('string');
  await dialog.getByLabel('배열 차원 수').selectOption('0');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'ABL (5)' });
  await page.getByRole('button', { name: '변수 삭제', exact: true }).click();
  await expect(dialog.locator('.edit-meta code')).toHaveText('ABL');
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '변수 삭제', exact: true }).click();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'ABL 삭제 되돌리기', exact: true })).toBeVisible();
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'ABL · #0 (5)' });
  await page.getByRole('button', { name: '전체 보기', exact: true }).click();
  await expect(page.getByLabel('변수 그룹', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'NEW_NUMBER 추가 되돌리기', exact: true })).toBeVisible();
  await expect(page.getByText('값 2개 · 크기 0개 · 변수 추가 3개 · 삭제 1개', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('binary-variable-changes-ko.png'), fullPage: true });
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const path = (await (await pending).path())!;
  const doc = parseSave(new Uint8Array(readFileSync(path)), 'edited.sav');
  expect(doc.variables.find(v => v.name === 'NEW_NUMBER')?.values.get('')).toBe(9223372036854775807n);
  expect(doc.variables.find(v => v.name === 'NEW_TEXT')).toMatchObject({ scope: 0, kind: 'string', section: 'user', dimensions: [2, 2] });
  expect(doc.variables.find(v => v.name === 'NEW_TEXT')?.values.get('1,1')).toBe('추가😀');
  expect(doc.variables.find(v => v.name === 'NICKNAME')?.section).toBe('builtin');
  expect(doc.variables.some(v => v.name === 'ABL')).toBe(false);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const original = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await original).path())!)).toEqual(readFileSync('tests/fixtures/normal-binary.sav'));
  await page.getByLabel('세이브 파일 선택').setInputFiles(path);
  await page.getByLabel('변수 검색').fill('NEW_NUMBER');
  await expect(page.getByRole('button', { name: 'NEW_NUMBER 값 수정', exact: true })).toContainText('9223372036854775807');
});

test('structural changes survive failed opens and offline language changes, with individual undo', async ({ page, context }) => {
  await page.goto('/?lang=en'); await page.waitForLoadState('networkidle'); await context.setOffline(true);
  await page.getByLabel('Select save file', { exact: true }).setInputFiles('tests/fixtures/global-binary.sav');
  await page.getByRole('button', { name: 'Add variable', exact: true }).click();
  await page.getByLabel('Variable name', { exact: true }).fill('EMPTY_ADDED');
  await page.getByLabel('Dimension 1 length').fill('0');
  await page.getByRole('dialog').getByRole('button', { name: 'Add variable', exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByLabel('Select save file', { exact: true }).setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Variable group').locator('option:checked')).toHaveText('EMPTY_ADDED (0)');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await page.getByLabel('変数グループ', { exact: true }).selectOption({ label: 'GLOBAL (12)' });
  await page.getByRole('button', { name: '変数を削除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '変数を削除', exact: true }).click();
  await page.getByRole('button', { name: /変更履歴/ }).click();
  await expect(page.getByRole('button', { name: 'EMPTY_ADDED の追加を取り消す', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('ko');
  await expect(page.getByRole('button', { name: 'GLOBAL 삭제 되돌리기', exact: true })).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const doc = parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'changed.sav');
  expect(doc.variables.some(v => v.name === 'GLOBAL')).toBe(false);
  expect(doc.variables.find(v => v.name === 'EMPTY_ADDED')?.dimensions).toEqual([0]);
  await page.getByRole('button', { name: 'EMPTY_ADDED 추가 되돌리기', exact: true }).click();
  await page.getByRole('button', { name: 'GLOBAL 삭제 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const original = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await original).path())!)).toEqual(readFileSync('tests/fixtures/global-binary.sav'));
});

for (const l of [
  { lang: 'en', open: 'Select save file', add: 'Add variable', name: 'Variable name', rank: 'Array dimensions', first: 'Dimension 1 length', third: 'Dimension 3 length', changes: 'Changes', undo: 'Undo adding MOBILE_ARRAY' },
  { lang: 'ko', open: '세이브 파일 선택', add: '변수 추가', name: '변수 이름', rank: '배열 차원 수', first: '1차원 길이', third: '3차원 길이', changes: '변경 내역', undo: 'MOBILE_ARRAY 추가 되돌리기' },
  { lang: 'ja', open: 'セーブファイルを選択', add: '変数を追加', name: '変数名', rank: '配列の次元数', first: '第 1 次元の長さ', third: '第 3 次元の長さ', changes: '変更履歴', undo: 'MOBILE_ARRAY の追加を取り消す' },
]) test(`${l.lang}: narrow add-variable dialog validates size and shows reversible structural changes`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`/?lang=${l.lang}`);
  await page.getByLabel(l.open, { exact: true }).setInputFiles('tests/fixtures/global-binary.sav');
  await page.getByRole('button', { name: l.add, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel(l.name, { exact: true })).toBeFocused();
  await dialog.getByLabel(l.name, { exact: true }).fill('MOBILE_ARRAY'); await dialog.getByLabel(l.rank).selectOption('3');
  await dialog.getByLabel(l.first).fill('100000001');
  await dialog.getByRole('button', { name: l.add, exact: true }).click(); await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath(`add-${l.lang}.png`) });
  await dialog.getByLabel(l.first).fill('2'); await dialog.getByLabel(l.third).fill('0');
  await dialog.getByRole('button', { name: l.add, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(l.changes) }).click();
  await expect(page.getByRole('button', { name: l.undo, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.locator('.editor-main').screenshot({ path: testInfo.outputPath(`structure-${l.lang}.png`) });
  await page.getByRole('button', { name: l.undo, exact: true }).click();
  await expect(page.getByRole('button', { name: l.undo, exact: true })).toHaveCount(0);
});
