import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseSave } from '../../src/core/editor';

const languages = [
  { locale: 'en-US', lang: 'en', label: 'Language', title: 'Open your save.', open: 'Select save file', search: 'Search variables', edit: 'Edit GLOBAL:0', value: 'New value', apply: 'Apply change', invalid: 'signed 64-bit', changed: '1 value changed', download: 'Download save', sample: 'Explore sample', help: 'Help', helpTitle: 'File information and help', close: 'Close', money: 'Edit MONEY:0' },
  { locale: 'ko-KR', lang: 'ko', label: '언어', title: '세이브를 열고,', open: '세이브 파일 선택', search: '변수 검색', edit: 'GLOBAL:0 값 수정', value: '새로운 값', apply: '변경 적용', invalid: '64비트', changed: '1개 값 변경됨', download: '세이브 다운로드', sample: '샘플로 둘러보기', help: '사용 안내', helpTitle: '파일 정보와 사용 안내', close: '닫기', money: 'MONEY:0 값 수정' },
  { locale: 'ja-JP', lang: 'ja', label: '言語', title: 'セーブを開いて、', open: 'セーブファイルを選択', search: '変数を検索', edit: 'GLOBAL:0 を編集', value: '新しい値', apply: '変更を適用', invalid: '64 ビット', changed: '1 個の値を変更', download: 'セーブをダウンロード', sample: 'サンプルを見る', help: '使い方', helpTitle: 'ファイル情報と使い方', close: '閉じる', money: 'MONEY:0 を編集' },
] as const;
const resizeLabels = {
  en: { group: 'Variable group', resize: 'Resize array', first: 'Dimension 1 length' },
  ko: { group: '변수 그룹', resize: '배열 크기 변경', first: '1차원 길이' },
  ja: { group: '変数グループ', resize: '配列サイズを変更', first: '第 1 次元の長さ' },
};

for (const language of languages) {
  test.describe(language.lang, () => {
    test.use({ locale: language.locale });

    test('detects browser language and validates, edits, and downloads a text save', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', language.lang);
      await expect(page.getByRole('combobox', { name: language.label, exact: true })).toHaveValue(language.lang);
      await expect(page.getByRole('heading', { name: language.title })).toBeVisible();
      await expect(page).toHaveTitle(/Emuera Save Studio/);
      await page.getByLabel(language.open, { exact: true }).setInputFiles('tests/fixtures/global-text.sav');
      await page.getByRole('button', { name: language.edit, exact: true }).click();
      await expect(page.getByLabel(language.value, { exact: true })).toBeFocused();
      await page.getByLabel(language.value, { exact: true }).fill('9223372036854775808');
      await page.getByRole('button', { name: language.apply, exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(language.invalid);
      await page.getByLabel(language.value, { exact: true }).fill('-9223372036854775808');
      await page.getByRole('button', { name: language.apply, exact: true }).click();
      await expect(page.getByText(language.changed, { exact: true })).toBeVisible();
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: language.download, exact: true }).click();
      const downloaded = await pending;
      expect(downloaded.suggestedFilename()).toBe('global-text.edited.sav');
      const doc = parseSave(new Uint8Array(readFileSync((await downloaded.path())!)), 'global.sav');
      expect(doc.variables.find(v => v.name === 'GLOBAL')?.values.get('0')).toBe(-9223372036854775808n);
    });

    test('fits a narrow screen and retains accessible sample and dialog flows', async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      await expect(page.getByRole('combobox', { name: language.label, exact: true })).toBeVisible();
      await page.getByRole('button', { name: language.sample, exact: true }).click();
      await page.getByRole('button', { name: language.help, exact: true }).click();
      await expect(page.getByRole('dialog', { name: language.helpTitle })).toBeVisible();
      await page.getByRole('button', { name: language.close, exact: true }).click();
      await page.getByLabel(language.search, { exact: true }).fill('MONEY');
      await page.getByRole('button', { name: language.money, exact: true }).click();
      await expect(page.getByLabel(language.value, { exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      const resize = resizeLabels[language.lang];
      await page.getByLabel(language.search, { exact: true }).fill('');
      await page.getByLabel(resize.group, { exact: true }).selectOption({ label: 'TA (80)' });
      await page.getByRole('button', { name: resize.resize, exact: true }).click();
      await expect(page.getByLabel(resize.first, { exact: true })).toBeFocused();
      await expect(page.getByRole('dialog').locator('input')).toHaveCount(3);
      await page.screenshot({ path: testInfo.outputPath(`resize-${language.lang}.png`) });
      expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.getByLabel(resize.first, { exact: true }).fill('5');
      await page.getByRole('button', { name: language.apply, exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.getByLabel(resize.group, { exact: true }).locator('option:checked')).toHaveText('TA (100)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      await page.locator('input[type="file"][multiple]').setInputFiles(['tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv']);
      await page.getByRole('button', { name: /アオイ/ }).click();
      await page.locator('.character-csv summary').click();
      await expect(page.locator('.character-csv')).toContainText('青い旅人');
      await expect(page.locator('.character-csv')).toContainText('隊長');
      await page.getByLabel(language.search, { exact: true }).fill('[[focus]]');
      await expect(page.locator('.search-expansion')).toContainText('ABL:0');
      await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
      await page.locator('.editor-main').screenshot({ path: testInfo.outputPath(`csv-${language.lang}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    });
  });
}

test('falls back to English and retains a URL language choice without browser storage', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'de-DE'] }));
  await page.goto('/?from=bookmark#editor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  expect(new URL(page.url()).searchParams.get('from')).toBe('bookmark');
  expect(new URL(page.url()).searchParams.get('lang')).toBe('ja');
  expect(new URL(page.url()).hash).toBe('#editor');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveTitle('Emuera Save Studio — セーブエディター');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ファイルは送信されません/);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.goto('/?lang=constructor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('keeps resized arrays and new values while switching languages offline', async ({ page, context }) => {
  await page.goto('/?lang=en');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.getByLabel('Select save file', { exact: true }).setInputFiles('tests/fixtures/global-binary.sav');
  await page.getByLabel('Variable group', { exact: true }).selectOption({ label: 'GLOBALS (5)' });
  await page.getByRole('button', { name: 'Resize array', exact: true }).click();
  await page.getByLabel('Dimension 1 length').fill('6');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await page.getByRole('button', { name: 'Edit GLOBALS:5', exact: true }).click();
  await page.getByLabel('New value', { exact: true }).fill('새 칸😀');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await page.getByRole('button', { name: /変更履歴/ }).click();
  await expect(page.getByRole('button', { name: 'GLOBALS の配列サイズを変更', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GLOBALS:5 を編集', exact: true })).toContainText('새 칸😀');
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('ko');
  await expect(page.getByText('값 1개 변경 · 배열 1개 크기 변경')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const doc = parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'resized.sav');
  const v = doc.variables.find(v => v.name === 'GLOBALS')!;
  expect(v.dimensions).toEqual([6]); expect(v.values.get('5')).toBe('새 칸😀');
});

test('switches languages offline without losing edits, search, CSV labels, or live diagnostics', async ({ page, context }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?lang=en');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  const loadedRequests = requests.length;
  await page.getByLabel('Select save file', { exact: true }).setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByLabel('Select CSV files', { exact: true }).setInputFiles(['tests/fixtures/ABL.csv', 'tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv']);
  await page.getByLabel('Select CSV files', { exact: true }).setInputFiles({ name: 'ABL.csv', mimeType: 'text/csv', buffer: Buffer.from('0,Replacement\nbad') });
  await page.locator('.csv-warnings summary').click();
  await expect(page.locator('.csv-warnings')).toContainText('Duplicate index 0');
  await page.getByRole('button', { name: /アオイ/ }).click();
  await page.getByLabel('Search variables', { exact: true }).fill('[[focus]]');
  await page.getByRole('button', { name: 'Edit ABL:0', exact: true }).click();
  await page.getByLabel('New value', { exact: true }).fill('9223372036854775807');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(page.getByText('1 value changed', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja');
  await expect(page.getByLabel('変数を検索', { exact: true })).toHaveValue('[[focus]]');
  await expect(page.locator('.search-expansion')).toHaveText('置換後の検索: ABL:0');
  await expect(page.locator('.character-csv summary')).toContainText('キャラクター CSV');
  await page.locator('.character-csv summary').click();
  await expect(page.locator('.character-csv')).toContainText('青い旅人');
  await expect(page.getByRole('heading', { name: 'アオイ', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ABL:0 を編集', exact: true })).toContainText('9223372036854775807');
  await expect(page.locator('.csv-warnings')).toContainText('インデックス 0 が重複しています');
  await expect(page.getByText('CSV ラベルを適用しました。', { exact: true })).toBeVisible();

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('現在の作業を閉じてファイルを開きますか');
    await dialog.accept();
  });
  await page.getByLabel('セーブファイルを選択', { exact: true }).setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('符号付き 64 ビット整数が不正です。 (バイト 0)');
  await page.getByRole('combobox', { name: '言語', exact: true }).selectOption('ko');
  await expect(page.getByRole('alert')).toContainText('올바른 64비트 정수가 아닙니다. (바이트 0)');
  await expect(page.getByText('1개 값 변경됨', { exact: true })).toBeVisible();
  await expect(page.getByLabel('변수 검색', { exact: true })).toHaveValue('[[focus]]');
  await expect(page.locator('.search-expansion')).toHaveText('치환 후 검색: ABL:0');
  await expect(page.locator('.character-csv summary')).toContainText('캐릭터 CSV');
  await expect(page.locator('.csv-warnings')).toContainText('중복 인덱스 0');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const doc = parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'save.sav');
  expect(doc.variables.find(v => v.name === 'ABL' && v.scope === 0)?.values.get('0')).toBe(9223372036854775807n);
  expect(doc.variables.find(v => v.name === 'NAME')?.values.get('')).toBe('アオイ');
  expect(requests).toHaveLength(loadedRequests);
});
