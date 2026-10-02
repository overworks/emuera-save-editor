import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseSave } from '../../src/core/editor';

test.use({ locale: 'ko-KR' });

async function transfer(page: Page, files: (string | { name: string; text: string })[]) {
  const data = files.map(file => typeof file === 'string'
    ? { name: basename(file), bytes: [...readFileSync(file)] }
    : { name: file.name, bytes: [...Buffer.from(file.text)] });
  // File managers may supply an empty MIME type; routing uses the filename.
  return page.evaluateHandle(files => {
    const data = new DataTransfer();
    for (const file of files) data.items.add(new File([new Uint8Array(file.bytes)], file.name));
    return data;
  }, data);
}

async function drop(target: Locator, dataTransfer: Awaited<ReturnType<typeof transfer>>) {
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
}

test('separate drop areas load multiple CSVs offline without replacing the save or its edits', async ({ page, context }, testInfo) => {
  await page.goto('/');
  const save = await transfer(page, ['tests/fixtures/normal-binary.sav']);
  await drop(page.locator('.drop-zone strong'), save);
  await expect(page.locator('.file-details')).toContainText('normal-binary.sav');
  await page.getByLabel('변수 검색').fill('MONEY');
  await page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true }).click();
  await page.getByLabel('새로운 값').fill('9876543210');
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByText('1개 값 변경됨')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);

  const csv = await transfer(page, [
    { name: 'ABL.CSV', text: '0,집중력\n1,관찰력' },
    'tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv',
    { name: 'ABL.csv', text: '0,Replacement' },
  ]);
  const zone = page.getByRole('group', { name: '게임 CSV 이름표', exact: true });
  const hint = zone.locator('.csv-drop-hint');
  await zone.dispatchEvent('dragenter', { dataTransfer: csv });
  await hint.dispatchEvent('dragenter', { dataTransfer: csv });
  await zone.dispatchEvent('dragleave', { dataTransfer: csv });
  await expect(zone).toHaveClass(/drag-active/);
  await expect(page.locator('.file-bar')).not.toHaveClass(/drag-active/);
  await page.screenshot({ path: testInfo.outputPath('csv-drop-active-ko.png'), fullPage: true });
  await hint.dispatchEvent('dragleave', { dataTransfer: csv });
  await expect(zone).not.toHaveClass(/drag-active/);
  // A drop on a child button must still belong only to the CSV area.
  await drop(zone.getByRole('button'), csv);
  await expect(page.getByText('CSV 이름표를 적용했습니다.', { exact: true })).toBeVisible();
  await expect(zone).not.toHaveClass(/drag-active/);
  await expect(page.locator('.file-details')).toContainText('normal-binary.sav');
  await expect(page.getByRole('button', { name: 'MONEY:0 값 수정', exact: true })).toContainText('9876543210');
  await page.locator('.csv-warnings summary').click();
  await expect(page.locator('.csv-warnings')).toContainText('중복 인덱스 0');
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByLabel('변수 검색').fill('[[focus]]');
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await expect(page.locator('.search-expansion')).toContainText('ABL:0');
  await page.locator('.character-csv summary').click();
  await expect(page.locator('.character-csv')).toContainText('青い旅人');
  await expect(page.getByText('1개 값 변경됨')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  const document = parseSave(new Uint8Array(readFileSync((await (await pending).path())!)), 'edited.sav');
  expect(document.variables.find(v => v.name === 'MONEY')?.values.get('0')).toBe(9876543210n);
});

test('rejects misplaced and mixed files, preserves byte-identical data, and replaces saves only in the save area', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  const zone = page.getByRole('group', { name: '게임 CSV 이름표', exact: true });
  await expect(zone).toBeVisible();
  const csv = await transfer(page, ['tests/fixtures/ABL.csv']);
  await drop(page.locator('.file-bar'), csv);
  await expect(page.getByRole('alert')).toContainText('.sav 파일 하나');
  await drop(zone, await transfer(page, ['tests/fixtures/ABL.csv', 'tests/fixtures/global-text.sav']));
  await expect(page.getByRole('alert')).toContainText('.csv 파일만');
  await expect(zone).not.toContainText('이름표가 연결되었습니다');
  await drop(page.locator('.file-bar'), await transfer(page, ['tests/fixtures/normal-binary.sav', 'tests/fixtures/global-text.sav']));
  await expect(page.getByRole('alert')).toContainText('.sav 파일 하나');
  const nextSave = await transfer(page, ['tests/fixtures/global-text.sav']);
  await drop(page.locator('.editor-title'), nextSave);
  await expect(page.getByRole('alert')).toContainText('파일을 세이브 영역에 놓아 주세요');
  await expect(page.locator('.file-details')).toContainText('normal-binary.sav');
  await drop(zone, csv);
  await expect(zone).toContainText('5개 이름표가 연결되었습니다');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  expect(readFileSync((await (await pending).path())!)).toEqual(readFileSync('tests/fixtures/normal-binary.sav'));
  await drop(page.locator('.file-details strong'), nextSave);
  await expect(page.locator('.file-details')).toContainText('global-text.sav');
  await expect(zone).not.toContainText('이름표가 연결되었습니다');
});

test('blocks further drops while reading CSV files and enforces the batch size limit', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  const zone = page.getByRole('group', { name: '게임 CSV 이름표', exact: true });
  await expect(zone).toBeVisible();
  const oversized = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    const bytes = new Uint8Array(33 * 1024 * 1024);
    data.items.add(new File([bytes], 'ABL.csv'));
    data.items.add(new File([bytes], 'TALENT.csv'));
    return data;
  });
  await drop(zone, oversized);
  await expect(page.getByRole('alert')).toContainText('64 MiB');
  await expect(zone).not.toContainText('이름표가 연결되었습니다');
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      if (this.name === 'ABL.csv') await new Promise<void>(resolve => {
        Object.defineProperty(window, 'releaseCsvRead', { value: resolve });
      });
      return bytes;
    };
  });
  await drop(zone, await transfer(page, ['tests/fixtures/ABL.csv']));
  await expect(zone).toHaveAttribute('aria-disabled', 'true');
  await drop(zone, await transfer(page, ['tests/fixtures/_Rename.csv']));
  await drop(page.locator('.file-bar'), await transfer(page, ['tests/fixtures/global-text.sav']));
  await expect(zone).not.toHaveClass(/drag-active/);
  await page.evaluate(() => (window as typeof window & { releaseCsvRead: () => void }).releaseCsvRead());
  await expect(zone).toHaveAttribute('aria-disabled', 'false');
  await expect(zone).toContainText('5개 이름표가 연결되었습니다');
  await expect(zone).not.toContainText('검색 치환 규칙');
  await expect(page.locator('.file-details')).toContainText('normal-binary.sav');
});

for (const language of [
  { lang: 'en', group: 'Game CSV labels', hint: 'Drop CSV files here', load: 'Load CSV' },
  { lang: 'ko', group: '게임 CSV 이름표', hint: 'CSV 파일을 여기에 놓으세요', load: 'CSV 불러오기' },
  { lang: 'ja', group: 'ゲーム CSV ラベル', hint: 'CSV ファイルをここにドロップ', load: 'CSV を読み込む' },
]) test(`${language.lang}: narrow drop area keeps instructions and keyboard file selection visible`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/?lang=${language.lang}`);
  await page.locator('input[type="file"][accept=".sav"]').setInputFiles('tests/fixtures/normal-binary.sav');
  const zone = page.getByRole('group', { name: language.group, exact: true });
  await expect(zone.getByText(language.hint)).toBeVisible();
  const button = zone.getByRole('button', { name: language.load, exact: true });
  await button.focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(['tests/fixtures/ABL.csv', 'tests/fixtures/Chara999.csv']);
  await expect(zone.locator('.csv-counts')).toContainText('5');
  await page.screenshot({ path: testInfo.outputPath(`csv-drop-mobile-${language.lang}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
