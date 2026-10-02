import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';
import { characterFixture } from '../character-fixture';

const input = () => ({ name: 'characters.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(characterFixture()) });
const edit = async (page: Page, cell: string, value: string) => {
  await page.getByRole('button', { name: `${cell} 값 수정`, exact: true }).click();
  await page.getByLabel('새로운 값', { exact: true }).fill(value);
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
};

test('characters: duplicate edited values, edit the copy, delete and remap, download, reset and reopen', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/?lang=ko'); await page.getByLabel('세이브 파일 선택').setInputFiles(input());
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await edit(page, 'ABL:0', '9223372036854775807');
  await page.getByLabel('변수 그룹', { exact: true }).selectOption({ label: 'ABL (5)' });
  await page.getByRole('button', { name: '배열 크기 변경', exact: true }).click();
  await page.getByLabel('1차원 길이').fill('8'); await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await page.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await expect(page.getByRole('button', { name: /#3 · NO 7/ })).toBeVisible();
  await edit(page, 'NAME', '복제😀');
  await page.getByRole('button', { name: '변수 추가', exact: true }).click();
  await dialog.getByLabel('변수 이름', { exact: true }).fill('NEW_COPY'); await dialog.getByLabel('값 자료형').selectOption('string');
  await dialog.getByRole('button', { name: '변수 추가', exact: true }).click(); await edit(page, 'NEW_COPY:0', '추가😀');
  await page.getByRole('button', { name: /#1 · NO 8/ }).click();
  await page.getByRole('button', { name: '캐릭터 삭제', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await expect(dialog.locator('.reference-preview dl > div')).toHaveCount(3);
  await expect(dialog.locator('.reference-preview')).toContainText('TARGET:0');
  await expect(dialog.locator('.reference-preview')).toContainText('ASSI:0');
  await dialog.screenshot({ path: testInfo.outputPath('character-delete-preview-ko.png') });
  await dialog.getByRole('button', { name: '캐릭터 삭제', exact: true }).click();
  await expect(page.getByRole('button', { name: /복제😀.*#2 · NO 7/ })).toBeVisible();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: '복제😀 복제 되돌리기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '人物1😀 캐릭터 삭제 되돌리기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'TARGET:0 값 수정', exact: true })).toContainText('1');
  await expect(page.getByRole('button', { name: 'TARGET:0 되돌리기', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('character-changes-ko.png'), fullPage: true });
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const path = (await (await pending).path())!, doc = parseSave(new Uint8Array(readFileSync(path)), 'edited.sav');
  expect(doc.characterCount).toBe(3);
  expect(doc.variables.find(v => v.scope === 2 && v.name === 'NAME')?.values.get('')).toBe('복제😀');
  expect(doc.variables.find(v => v.scope === 2 && v.name === 'ABL')).toMatchObject({ dimensions: [8], values: new Map([['0', 9223372036854775807n]]) });
  expect(doc.variables.find(v => v.scope === 2 && v.name === 'NEW_COPY')?.values.get('0')).toBe('추가😀');
  expect(doc.variables.find(v => v.scope === -1 && v.name === 'TARGET')?.values.get('0')).toBe(1n);
  expect(doc.variables.find(v => v.scope === -1 && v.name === 'ASSI')?.values.get('0')).toBe(-1n);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const reset = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await reset).path())!)).toEqual(Buffer.from(characterFixture()));
  await page.getByLabel('세이브 파일 선택').setInputFiles(path);
  await page.getByRole('button', { name: /복제😀.*#2 · NO 7/ }).click();
  await expect(page.getByRole('button', { name: 'NEW_COPY:0 값 수정', exact: true })).toContainText('추가😀');
});

test('character changes and reference previews survive offline language switching and failed opens', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('/?lang=en'); await page.waitForLoadState('networkidle'); await context.setOffline(true);
  await page.getByLabel('Select save file').setInputFiles(input());
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: 'Duplicate character', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate character', exact: true }).click();
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await page.getByRole('button', { name: 'キャラクターを削除', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('参照の変更', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'キャラクターを削除', exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByLabel('セーブファイルを選択').setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('ko');
  await expect(page.getByRole('button', { name: /#2 · NO 7/ })).toBeVisible();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'MASTER:0 값 수정', exact: true })).toContainText('-1');
  await page.getByRole('button', { name: '人物0😀 복제 되돌리기', exact: true }).click();
  await page.getByRole('button', { name: '人物0😀 캐릭터 삭제 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await pending).path())!)).toEqual(Buffer.from(characterFixture()));
});

test('deleting the last character leaves a restorable save and text/global files offer no character operations', async ({ page }) => {
  await page.goto('/?lang=en'); await page.getByLabel('Select save file').setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: 'Delete character', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete character', exact: true }).click();
  await expect(page.locator('.character-list')).toHaveCount(0);
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download save', exact: true }).click();
  expect(parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'empty.sav').characterCount).toBe(0);
  await page.getByRole('button', { name: /Changes/ }).click();
  await page.getByRole('button', { name: 'Restore character アオイ', exact: true }).click();
  await expect(page.getByText('Unmodified', { exact: true })).toBeVisible();
  await page.getByLabel('Select save file').setInputFiles('tests/fixtures/normal-text.sav');
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await expect(page.getByRole('button', { name: 'Duplicate character', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete character', exact: true })).toHaveCount(0);
  await page.getByLabel('Select save file').setInputFiles('tests/fixtures/global-binary.sav');
  await expect(page.getByRole('button', { name: 'Duplicate character', exact: true })).toHaveCount(0);
});

for (const l of [
  { lang: 'en', open: 'Select save file', clone: 'Duplicate character', remove: 'Delete character', cancel: 'Cancel', original: 'Unmodified' },
  { lang: 'ko', open: '세이브 파일 선택', clone: '캐릭터 복제', remove: '캐릭터 삭제', cancel: '취소', original: '원본 상태' },
  { lang: 'ja', open: 'セーブファイルを選択', clone: 'キャラクターを複製', remove: 'キャラクターを削除', cancel: 'キャンセル', original: '変更なし' },
]) test(`${l.lang}: character dialogs and controls fit a narrow screen`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`/?lang=${l.lang}`);
  await page.getByLabel(l.open).setInputFiles(input()); await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: l.clone, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: l.cancel, exact: true })).toBeFocused();
  await dialog.screenshot({ path: testInfo.outputPath(`clone-${l.lang}.png`) });
  await dialog.getByRole('button', { name: l.clone, exact: true }).click();
  await expect(page.getByRole('button', { name: /#3 · NO 7/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: l.remove, exact: true }).click();
  await expect(dialog.getByRole('button', { name: l.cancel, exact: true })).toBeFocused();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath(`delete-${l.lang}.png`) });
  await dialog.getByRole('button', { name: l.remove, exact: true }).click();
  await expect(page.getByText(l.original, { exact: true })).toBeVisible();
});
