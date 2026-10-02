import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { characterFixture } from '../character-fixture';
import { textCharacterFixture } from '../text-character-fixture';
import { parseSave } from '../../src/core/editor';

test.use({ locale: 'ko-KR' });
test.setTimeout(90_000);
const dbName = 'emuera-save-studio:/';
const control = (page: Page) => page.getByRole('checkbox', { name: '이 브라우저에 작업 저장' });
const saved = (page: Page) => expect(page.getByRole('status')).toHaveText('브라우저에 저장됨');
async function edit(page: Page, cell: string, value: string) {
  await page.getByRole('button', { name: `${cell} 값 수정`, exact: true }).click();
  await page.getByLabel('새로운 값', { exact: true }).fill(value);
  await page.getByRole('button', { name: '변경 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '세이브 다운로드', exact: true }).click();
  return readFileSync((await (await pending).path())!);
}
async function stored(page: Page) {
  return page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise<{ head?: { count: number; view: { search: string; presetId: string } }; records: number }>((resolve, reject) => {
      const tx = db.transaction(['workspace', 'operations'], 'readonly');
      const head = tx.objectStore('workspace').get('head'), records = tx.objectStore('operations').count();
      tx.oncomplete = () => { db.close(); resolve({ head: head.result, records: records.result }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }, dbName);
}

test('off by default; opting in preserves edits, CSV, filters and preset across reload, and opting out deletes them', async ({ page }, testInfo) => {
  await page.goto('/?lang=ko');
  await expect(control(page)).not.toBeChecked();
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/normal-binary.sav');
  await page.getByLabel('변수 검색').fill('MONEY');
  await edit(page, 'MONEY:0', '9223372036854775807');
  expect((await stored(page)).head).toBeUndefined();
  await control(page).check();
  await saved(page);
  await page.getByLabel('CSV 파일 선택').setInputFiles(['tests/fixtures/ABL.csv', 'tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv']);
  await page.getByRole('combobox', { name: '게임 프리셋', exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByLabel('변수 검색').fill('집중력');
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored(page)).head?.view.search).toBe('집중력');
  const before = await stored(page);
  await page.reload();
  await expect(control(page)).toBeChecked();
  await saved(page);
  await expect(page.getByLabel('변수 검색')).toHaveValue('집중력');
  await expect(page.getByRole('combobox', { name: '게임 프리셋', exact: true })).toHaveValue(before.head!.view.presetId);
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await expect(page.getByText('1개 값 변경됨')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('recovery-restored-ko.png'), fullPage: true });
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  expect(await download(page)).toEqual(readFileSync('tests/fixtures/normal-binary.sav'));
  page.once('dialog', d => d.dismiss());
  await control(page).click();
  await expect(control(page)).toBeChecked();
  expect((await stored(page)).head).toBeDefined();
  page.once('dialog', d => d.accept());
  await control(page).uncheck();
  await expect(page.getByRole('status')).toHaveText('꺼짐 · 메모리에만 보관');
  expect(await stored(page)).toEqual({ head: undefined, records: 0 });
  await page.getByLabel('변수 검색').fill('ABL:0');
  await edit(page, 'ABL:0', '77');
  expect((await stored(page)).head).toBeUndefined();
  page.once('dialog', d => d.accept());
  await page.reload();
  await expect(page.getByRole('heading', { name: '세이브를 열고,' })).toBeVisible();
  await expect(control(page)).not.toBeChecked();
});

for (const format of ['binary', 'text'] as const) test(`${format}: restores character copies and undo; failed opens retain recovery`, async ({ page }) => {
  const bytes = format === 'binary' ? characterFixture() : textCharacterFixture({ encoding: 'shift_jis', newline: 'mixed', trailingNewline: false });
  await page.goto('/');
  await control(page).check();
  if (format === 'text') await page.getByLabel('텍스트 인코딩', { exact: true }).selectOption('shift_jis');
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'characters.sav', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await edit(page, 'ABL:0', '-9223372036854775808');
  await page.getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '캐릭터 복제', exact: true }).click();
  await expect(page.getByRole('button', { name: /#3 · NO 7/ })).toBeVisible();
  await edit(page, 'NAME', '複製');
  page.once('dialog', d => d.accept());
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'bad.sav', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toBeVisible();
  await saved(page);
  const exported = await download(page);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('button', { name: /複製.*#3 · NO 7/ })).toBeVisible();
  expect(await download(page)).toEqual(exported);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '전체 되돌리기', exact: true }).click();
  expect(await download(page)).toEqual(Buffer.from(bytes));
  if (format === 'text') {
    await page.getByRole('button', { name: '선택한 인코딩으로 다시 읽기', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await download(page)).toEqual(Buffer.from(bytes));
  }
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await expect(page.getByText('global-binary.sav', { exact: true })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByText('global-binary.sav', { exact: true })).toBeVisible();
  await expect(page.getByText('원본 상태', { exact: true })).toBeVisible();
});

test('another tab cannot overwrite or resurrect the saved session after it is deleted', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await control(page).check(); await saved(page);
  const second = await context.newPage();
  await second.goto('/'); await saved(second);
  await edit(page, 'GLOBAL:0', '456'); await saved(page);
  await edit(second, 'GLOBAL:0', '789');
  await expect(second.getByRole('alert')).toContainText('다른 탭');
  expect(parseSave(new Uint8Array(await download(second)), 'save.sav').variables[0].values.get('0')).toBe(789n);
  await expect.poll(async () => (await stored(page)).head?.count).toBe(1);
  page.once('dialog', d => d.accept());
  await control(page).uncheck();
  await edit(second, 'GLOBAL:0', '999');
  expect((await stored(page)).head).toBeUndefined();
  second.once('dialog', d => d.accept());
  await second.reload();
  await expect(second.getByRole('heading', { name: '세이브를 열고,' })).toBeVisible();
});

test('quota failure keeps the committed recovery and live edits; retry commits the full current session', async ({ page, context }) => {
  // Fail one IndexedDB transaction in the Worker after the editor accepts the edit.
  await context.route('**/assets/worker-*.js', async route => {
    const response = await route.fetch();
    const fault = `const originalAdd = IDBObjectStore.prototype.add; let failed = false;
      IDBObjectStore.prototype.add = function(value, key) {
        if (!failed && value?.type === 'set') { failed = true; throw new DOMException('test quota', 'QuotaExceededError'); }
        return originalAdd.call(this, value, key);
      };\n`;
    await route.fulfill({ response, body: fault + await response.text() });
  });
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await control(page).check(); await saved(page);
  await edit(page, 'GLOBAL:0', '123');
  await expect(page.getByRole('alert')).toContainText('저장 공간이 부족');
  expect((await stored(page)).head?.count).toBe(0);
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(123n);
  await page.getByRole('button', { name: '다시 저장', exact: true }).click();
  await saved(page);
  expect((await stored(page)).head?.count).toBe(1);
  await context.unroute('**/assets/worker-*.js');
  await page.reload();
  await expect(page.getByRole('button', { name: 'GLOBAL:0 값 수정', exact: true })).toContainText('123');
});

test('unsupported recovery is kept until explicitly deleted and does not block editing', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await control(page).check(); await saved(page);
  await page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite'), store = tx.objectStore('workspace');
      const request = store.get('head');
      request.onsuccess = () => store.put({ ...request.result, version: 99 }, 'head');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    });
  }, dbName);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('보관된 작업을 복원하지 못했습니다');
  expect((await stored(page)).head).toBeDefined();
  page.once('dialog', d => d.accept()); await control(page).uncheck();
  expect((await stored(page)).head).toBeUndefined();
  await page.getByRole('button', { name: '샘플로 둘러보기' }).click();
  await page.getByLabel('변수 검색').fill('MONEY');
  await edit(page, 'MONEY:0', '88');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables.find(v => v.name === 'MONEY')?.values.get('0')).toBe(88n);
});

for (const lang of ['en', 'ko', 'ja']) test(`${lang}: recovery controls fit mobile and retain URL language on reload`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?lang=${lang}`);
  const checkbox = page.getByRole('checkbox');
  await checkbox.check();
  await expect(page.getByRole('status')).not.toContainText('…');
  await page.reload();
  await expect(checkbox).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath(`recovery-mobile-${lang}.png`), fullPage: true });
});

test('unavailable browser storage leaves importing, editing and downloading usable', async ({ page, context }) => {
  await context.route('**/assets/worker-*.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `indexedDB.open = () => { throw new DOMException('test denial', 'SecurityError'); };\n` + await response.text() });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('브라우저 저장소를 사용할 수 없거나');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '321');
  await control(page).check();
  await expect(page.getByRole('status')).toHaveText('로컬 저장·복구 확인 필요');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(321n);
  page.once('dialog', d => d.accept());
  await control(page).click();
  await expect(page.getByRole('alert')).toContainText('보관된 작업을 삭제하지 못했습니다');
  await expect(control(page)).toBeChecked();
  await edit(page, 'GLOBAL:0', '654');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(654n);
});

test('an abort after a successful write request never reports the edit as saved', async ({ page, context }) => {
  await context.route('**/assets/worker-*.js', async route => {
    const response = await route.fetch();
    const fault = `const originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function(value, key) {
        const request = originalAdd.call(this, value, key);
        if (value?.type === 'set') request.addEventListener('success', () => this.transaction.abort());
        return request;
      };\n`;
    await route.fulfill({ response, body: fault + await response.text() });
  });
  await page.goto('/');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await control(page).check(); await saved(page);
  await edit(page, 'GLOBAL:0', '987');
  await expect(page.getByRole('status')).toHaveText('로컬 저장·복구 확인 필요');
  expect((await stored(page)).head?.count).toBe(0);
  const current = parseSave(new Uint8Array(await download(page)), 'save.sav');
  expect(current.variables[0].values.get('0')).toBe(987n);
  page.once('dialog', d => d.accept());
  await page.reload();
  await saved(page);
  expect(await download(page)).toEqual(readFileSync('tests/fixtures/global-binary.sav'));
});

test('local saving works offline after loading, including after closing and reopening the tab', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await control(page).check(); await saved(page);
  await edit(page, 'GLOBAL:0', '4567'); await saved(page);
  await page.close();
  await context.setOffline(false);
  const next = await context.newPage();
  await next.goto('/');
  await saved(next);
  await expect(next.getByRole('button', { name: 'GLOBAL:0 값 수정', exact: true })).toContainText('4567');
});

test('file selection during recovery initialization is opened once initialization completes', async ({ page, context }) => {
  await context.route('**/assets/worker-*.js', async route => {
    const response = await route.fetch();
    const delay = `const sendMessage = self.postMessage.bind(self);
      self.postMessage = (data, options) => {
        if (data.result?.view) setTimeout(() => sendMessage(data, options), 3000);
        else sendMessage(data, options);
      };\n`;
    await route.fulfill({ response, body: delay + await response.text() });
  });
  await page.goto('/');
  const input = page.getByLabel('세이브 파일 선택');
  await expect(input).toBeDisabled();
  await input.setInputFiles({ name: 'early.sav', mimeType: 'application/octet-stream', buffer: readFileSync('tests/fixtures/global-binary.sav') });
  await expect(page.getByText('early.sav', { exact: true })).toBeVisible();
  await edit(page, 'GLOBAL:0', '123');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(123n);
});
