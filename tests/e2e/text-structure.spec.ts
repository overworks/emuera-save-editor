import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';
import { textCharacterFixture } from '../text-character-fixture';

test.setTimeout(90_000);
async function edit(page: Page, cell: string, value: string) {
  await page.getByRole('button', { name: `${cell} 값 수정`, exact: true }).click();
  await page.getByLabel('새로운 값', { exact: true }).fill(value);
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  return (await (await pending).path())!;
}

for (const encoding of ['utf-8', 'shift_jis'] as const) test(`text records ${encoding}: add, edit, delete, copy, recover, export and reset`, async ({ page }, testInfo) => {
  const bytes = textCharacterFixture({ encoding, newline: 'mixed', trailingNewline: false });
  await page.goto('/?lang=ko');
  await page.getByRole('checkbox', { name: '이 브라우저에 작업 저장' }).check();
  await page.getByLabel('텍스트 인코딩', { exact: true }).selectOption(encoding);
  await page.getByLabel('세이브 파일 선택', { exact: true }).setInputFiles({ name: 'text.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'DAY (1)' });
  await expect(page.getByRole('button', { name: '변수 삭제', exact: true })).toHaveCount(0);
  await expect(page.getByText('기본 구역의 고정 순서 변수입니다.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('변수 이름', { exact: true })).toBeFocused();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NEW_NUMBER');
  await dialog.getByLabel('확장 변수 종류').selectOption('builtin');
  await dialog.getByLabel('배열 차원 수').selectOption('0');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await edit(page, 'NEW_NUMBER', '9223372036854775807');
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await edit(page, 'NICKNAME', '保存:編集');
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'NICKNAME (1)' });
  await page.getByRole('button', { name: '변수 삭제', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '변수 삭제', exact: true }).click();
  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  await expect(dialog.getByLabel('확장 변수 종류').locator('option')).toHaveCount(1);
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NEW_ARRAY');
  await dialog.getByLabel('배열 차원 수').selectOption('2');
  await dialog.getByLabel('1차원 길이').fill('2'); await dialog.getByLabel('2차원 길이').fill('2');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await edit(page, 'NEW_ARRAY:1:1', '-9223372036854775808');
  await page.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await dialog.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await expect(page.getByRole('button', { name: /#3 · NO 7/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'NICKNAME 값 수정', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('COPY_NOTE');
  await dialog.getByLabel('값 자료형').selectOption('string');
  await expect(dialog.getByLabel('배열 차원 수').locator('option')).toHaveCount(2);
  await dialog.getByLabel('배열 차원 수').selectOption('0');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click();
  await edit(page, 'COPY_NOTE', '複製だけ');
  await expect(page.getByRole('status')).toHaveText('브라우저에 저장됨');
  const exported = readFileSync(await download(page));
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('브라우저에 저장됨');
  await expect(page.getByRole('button', { name: 'COPY_NOTE 값 수정', exact: true })).toContainText('複製だけ');
  expect(readFileSync(await download(page))).toEqual(exported);
  const saved = parseSave(new Uint8Array(exported), 'edited.sav', encoding);
  expect(saved.variables.find(v => v.name === 'NEW_NUMBER')?.values.get('')).toBe(9223372036854775807n);
  expect(saved.variables.filter(v => v.name === 'NEW_ARRAY').map(v => v.values.get('1,1'))).toEqual([-9223372036854775808n, -9223372036854775808n]);
  expect(saved.variables.some(v => v.scope === 3 && v.name === 'NICKNAME')).toBe(false);
  expect(saved.variables.find(v => v.name === 'COPY_NOTE')?.values.get('')).toBe('複製だけ');
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await page.getByRole('button', { name: 'NICKNAME 삭제 되돌리기', exact: true }).click();
  await expect(page.getByRole('button', { name: 'NICKNAME 값 수정', exact: true })).toContainText('保存:編集');
  await page.screenshot({ path: testInfo.outputPath(`text-variables-${encoding}-ko.png`), fullPage: true });
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  expect(readFileSync(await download(page))).toEqual(Buffer.from(bytes));
  await page.reload(); await expect(page.getByRole('status')).toHaveText('브라우저에 저장됨');
  expect(readFileSync(await download(page))).toEqual(Buffer.from(bytes));
});

test('text format controls respect legacy, historical and global groups; failed opens preserve additions offline', async ({ page, context }) => {
  await page.goto('/?lang=en'); await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  const open = async (version: number) => page.getByLabel('Select save file', { exact: true }).setInputFiles({ name: 'old.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(textCharacterFixture({ version })) });
  await open(0); await expect(page.getByRole('button', { name: 'Add variable', exact: true })).toHaveCount(0);
  await open(1700); await page.getByRole('button', { name: 'Add variable', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Extension variable type').locator('option')).toHaveCount(1);
  await expect(dialog.getByLabel('Array dimensions').locator('option')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Select save file', { exact: true }).setInputFiles('tests/fixtures/global-text.sav');
  await page.getByRole('button', { name: 'Add variable', exact: true }).click();
  await expect(dialog.getByLabel('Extension variable type')).toHaveValue('user');
  await expect(dialog.getByLabel('Array dimensions').locator('option')).toHaveCount(3);
  await dialog.getByLabel('Value type').selectOption('string');
  await expect(dialog.getByLabel('Array dimensions').locator('option')).toHaveCount(1);
  await dialog.getByLabel('Variable name', { exact: true }).fill('EMPTY'); await dialog.getByLabel('Dimension 1 length').fill('0');
  await dialog.getByRole('button', { name: 'Add variable', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  page.once('dialog', d => d.accept());
  await page.getByLabel('Select save file', { exact: true }).setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await page.getByRole('button', { name: /変更履歴/ }).click();
  await page.getByRole('button', { name: 'EMPTY の追加を取り消す', exact: true }).click();
  await expect(page.getByText('変更なし', { exact: true })).toBeVisible();
});

for (const l of [
  { lang: 'en', open: 'Select save file', add: 'Add variable', name: 'Variable name', first: 'Dimension 1 length', changes: 'Changes', undo: 'Undo adding MOBILE_TEXT', kind: 'Value type' },
  { lang: 'ko', open: '세이브 파일 선택', add: '변수 추가', name: '변수 이름', first: '1차원 길이', changes: '변경 내역', undo: 'MOBILE_TEXT 추가 되돌리기', kind: '값 자료형' },
  { lang: 'ja', open: 'セーブファイルを選択', add: '変数を追加', name: '変数名', first: '第 1 次元の長さ', changes: '変更履歴', undo: 'MOBILE_TEXT の追加を取り消す', kind: '値の型' },
]) test(`${l.lang}: text addition dialog validates limits and fits mobile`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`/?lang=${l.lang}`);
  await page.getByLabel(l.open, { exact: true }).setInputFiles('tests/fixtures/global-text.sav');
  await page.getByRole('button', { name: l.add, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel(l.name, { exact: true })).toBeFocused();
  await dialog.getByLabel(l.name, { exact: true }).fill('MOBILE_TEXT');
  await dialog.getByLabel(l.first).fill('1000001');
  await dialog.getByRole('button', { name: l.add, exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath(`text-variable-${l.lang}-mobile.png`) });
  await dialog.getByLabel(l.kind).selectOption('string'); await dialog.getByLabel(l.first).fill('2');
  await dialog.getByRole('button', { name: l.add, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(l.changes) }).click();
  await page.getByRole('button', { name: l.undo, exact: true }).click();
  await expect(page.getByRole('button', { name: l.undo, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
