import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';
import { textCharacterFixture } from '../text-character-fixture';

const edit = async (page: Page, cell: string, value: string) => {
  await page.getByRole('button', { name: `${cell} 값 수정`, exact: true }).click();
  await page.getByLabel('새로운 값', { exact: true }).fill(value);
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `${cell} 값 수정`, exact: true })).toContainText(value);
};

for (const encoding of ['utf-8', 'shift_jis'] as const) test(`text characters ${encoding}: edit both sections, duplicate, delete, download, reset and reopen`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bytes = textCharacterFixture({ encoding, newline: 'mixed', trailingNewline: false });
  await page.goto('/?lang=ko');
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'text.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await edit(page, 'ABL:2', '9223372036854775807'); await edit(page, 'NICKNAME', '長い別名:編集');
  await edit(page, 'C2D:3:2', '-9223372036854775808');
  await page.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await expect(page.getByRole('button', { name: /#3 · NO 7/ })).toBeVisible();
  await edit(page, 'NAME', '複製'); await edit(page, 'CSTR:0', '複製の文字');
  await expect(page.getByRole('button', { name: '변수 추가', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '배열 크기 변경', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /#1 · NO 8/ }).click();
  await page.getByRole('button', { name: '캐릭터 삭제', exact: true }).click();
  await expect(dialog).toContainText('텍스트 세이브에 저장된 참조 셀만 조정합니다.');
  await expect(dialog.locator('.reference-preview dl > div')).toHaveCount(3);
  await dialog.screenshot({ path: testInfo.outputPath(`text-delete-${encoding}-ko.png`) });
  await dialog.getByRole('button', { name: '캐릭터 삭제', exact: true }).click();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await expect(page.getByRole('button', { name: 'TARGET:0 값 수정', exact: true })).toContainText('1');
  await expect(page.getByRole('button', { name: 'ASSI:0 값 수정', exact: true })).toContainText('-1');
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const path = (await (await pending).path())!, doc = parseSave(new Uint8Array(readFileSync(path)), 'edited.sav', encoding);
  expect(doc).toMatchObject({ characterCount: 3, format: 'text', encoding, formatVersion: 1808 });
  const values = (name: string) => doc.variables.find(v => v.scope === 2 && v.name === name)!.values;
  expect(values('NAME').get('')).toBe('複製'); expect(values('ABL').get('2')).toBe(9223372036854775807n);
  expect(values('NICKNAME').get('')).toBe('長い別名:編集'); expect(values('CSTR').get('0')).toBe('複製の文字');
  expect(values('C2D').get('3,2')).toBe(-9223372036854775808n); expect(values('C2D').has('1,0')).toBe(false);
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const reset = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await reset).path())!)).toEqual(Buffer.from(bytes));
  await page.getByLabel('세이브 파일 선택').setInputFiles(path);
  await page.getByRole('button', { name: /複製.*#2 · NO 7/ }).click();
  await expect(page.getByRole('button', { name: 'CSTR:0 값 수정', exact: true })).toContainText('複製の文字');
  await page.screenshot({ path: testInfo.outputPath(`text-reopened-${encoding}-ko.png`), fullPage: true });
});

test('last text character deletion, restoration and clone cancellation survive offline language changes and failed opens', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('/?lang=en'); await page.waitForLoadState('networkidle'); await context.setOffline(true);
  await page.getByLabel('Select save file').setInputFiles('tests/fixtures/normal-text.sav');
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: 'Delete character', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete character', exact: true }).click();
  await expect(page.locator('.character-list')).toHaveCount(0);
  const empty = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download save', exact: true }).click();
  expect(parseSave(new Uint8Array(readFileSync((await (await empty).path())!)), 'empty.sav').characterCount).toBe(0);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await page.getByRole('button', { name: /変更履歴/ }).click();
  await page.getByRole('button', { name: 'キャラクター アオイ の削除を取り消す', exact: true }).click();
  await expect(page.getByText('変更なし', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: 'キャラクターを複製', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'キャラクターを複製', exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByLabel('セーブファイルを選択').setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('ko');
  await expect(page.getByRole('button', { name: /#1 · NO 7/ })).toBeVisible();
  await page.getByRole('button', { name: /변경 내역/ }).click();
  await page.getByRole('button', { name: 'アオイ 복제 되돌리기', exact: true }).click();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await pending).path())!)).toEqual(readFileSync('tests/fixtures/normal-text.sav'));
});

for (const l of [
  { lang: 'en', open: 'Select save file', clone: 'Duplicate character', remove: 'Delete character', cancel: 'Cancel' },
  { lang: 'ko', open: '세이브 파일 선택', clone: '캐릭터 복제', remove: '캐릭터 삭제', cancel: '취소' },
  { lang: 'ja', open: 'セーブファイルを選択', clone: 'キャラクターを複製', remove: 'キャラクターを削除', cancel: 'キャンセル' },
]) test(`${l.lang}: text character dialogs fit a narrow screen`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto(`/?lang=${l.lang}`);
  await page.getByLabel(l.open).setInputFiles({ name: 'text.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(textCharacterFixture()) });
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByRole('button', { name: l.clone, exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: l.cancel, exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: l.clone, exact: true }).click();
  await page.getByRole('button', { name: /#1 · NO 8/ }).click();
  await page.getByRole('button', { name: l.remove, exact: true }).click();
  await expect(dialog.locator('.reference-preview dl > div')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: l.cancel, exact: true })).toBeFocused();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await dialog.screenshot({ path: testInfo.outputPath(`text-delete-${l.lang}-mobile.png`) });
  await dialog.getByRole('button', { name: l.remove, exact: true }).click();
  await expect(page.getByRole('button', { name: /#2 · NO 7/ })).toBeVisible();
});
