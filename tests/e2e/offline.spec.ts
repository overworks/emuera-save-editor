import { test as base, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { offlineWorker } from '../../scripts/build-offline';
import { parseSave } from '../../src/core/editor';

interface Site {
  url: string;
  release(version: string): void;
  failAsset?: string;
  corruptAsset?: string;
}

// Real HTTP responses exercise service worker installation, integrity checks and
// updates; Playwright route mocks cannot replace service worker script requests.
const test = base.extend<{ site: Site }>({
  site: async ({}, use) => {
    const original = new Map<string, Uint8Array>();
    const collect = (directory = '') => {
      for (const entry of readdirSync(`dist/${directory}`, { withFileTypes: true })) {
        const name = directory + entry.name;
        if (entry.isDirectory()) collect(`${name}/`);
        else if (name !== 'sw.js') original.set(name, readFileSync(`dist/${name}`));
      }
    };
    collect();
    const template = readFileSync('scripts/offline-worker.js', 'utf8');
    let files = new Map(original), script = '';
    const site: Site = { url: '', release(version) {
      files = new Map(original);
      const html = Buffer.from(files.get('index.html')!).toString().replace('<html ', `<html data-test-release="${version}" `);
      files.set('index.html', Buffer.from(html));
      script = offlineWorker(files, template);
    } };
    site.release('v1');
    const types: Record<string, string> = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    const server = createServer((request, response) => {
      const path = new URL(request.url!, 'http://localhost').pathname;
      const name = path.replace(/^\/(?:app\/|other\/)?/, '') || 'index.html';
      const bytes = name === 'sw.js' ? Buffer.from(script) : files.get(name);
      response.setHeader('Cache-Control', 'no-store');
      if (!bytes || site.failAsset === name) { response.writeHead(404); response.end('Not found'); return; }
      response.setHeader('Content-Type', types[name.split('.').at(-1)!] ?? 'application/octet-stream');
      response.end(site.corruptAsset === name ? Buffer.from('mismatched deployment') : bytes);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server');
    site.url = `http://127.0.0.1:${address.port}`;
    try { await use(site); }
    finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
  },
});

test.use({ locale: 'ko-KR' });
test.setTimeout(90_000);
const panel = (page: Page) => page.locator('.offline-panel');
const ready = (page: Page) => expect(panel(page).locator('summary')).toContainText('오프라인 재접속 준비됨');
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
async function check(page: Page, retry = false) {
  const details = panel(page).locator('details');
  if (!await details.evaluate(element => element.hasAttribute('open'))) await details.locator('summary').click();
  await panel(page).getByRole('button', { name: retry ? '오프라인 준비 다시 시도' : '업데이트 확인', exact: true }).click();
}
async function cacheNames(page: Page, path = '/app/') {
  return page.evaluate(async path => (await caches.keys()).filter(name => name.startsWith(`emuera-save-studio:app:${location.origin}${path}:`)), path);
}

test('subpath: offline tab reopening restores edits, CSV, filters, preset and URL language', async ({ page, context, site }) => {
  await page.goto(`${site.url}/app/?lang=ko`);
  await ready(page);
  await page.getByLabel('세이브 파일 선택').setInputFiles({ name: 'private.sav', mimeType: '', buffer: readFileSync('tests/fixtures/normal-binary.sav') });
  await page.getByRole('checkbox').check();
  await page.getByLabel('변수 검색').fill('MONEY');
  await edit(page, 'MONEY:0', '9223372036854775807');
  await page.getByLabel('CSV 파일 선택').setInputFiles(['tests/fixtures/ABL.csv', 'tests/fixtures/Chara999.csv', 'tests/fixtures/_Rename.csv']);
  await page.getByRole('combobox', { name: '게임 프리셋', exact: true }).selectOption({ index: 1 });
  const preset = await page.getByRole('combobox', { name: '게임 프리셋', exact: true }).inputValue();
  await page.getByRole('button', { name: /#0 · NO 7/ }).click();
  await page.getByLabel('변수 검색').fill('집중력');
  await expect(page.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  await saved(page);
  const before = await download(page);
  // No input file, view parameter or language preference enters the app cache.
  const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat());
  expect(keys.some(key => /private|Chara999|ABL\.csv|\?/.test(key))).toBe(false);
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${site.url}/app/?lang=ko`);
  await ready(reopened); await saved(reopened);
  await expect(reopened.getByLabel('변수 검색')).toHaveValue('집중력');
  await expect(reopened.getByRole('combobox', { name: '게임 프리셋', exact: true })).toHaveValue(preset);
  await expect(reopened.getByRole('cell', { name: '집중력', exact: true })).toBeVisible();
  expect(await download(reopened)).toEqual(before);
  await reopened.getByRole('combobox', { name: '언어', exact: true }).selectOption('ja');
  await reopened.reload();
  await expect(reopened.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(reopened.getByRole('checkbox')).toBeChecked();
});

test('root: offline shell and sample work with session recovery disabled', async ({ page, context, site }) => {
  await page.goto(`${site.url}/?lang=ko`);
  await ready(page);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!;
    return { url: link.href, data: await (await fetch(link.href)).json() };
  });
  expect(new URL(manifest.data.start_url, manifest.url).href).toBe(`${site.url}/`);
  expect(manifest.data.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
  for (const icon of manifest.data.icons) {
    const dimensions = await page.evaluate(async url => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      return `${bitmap.width}x${bitmap.height}`;
    }, new URL(icon.src, manifest.url).href);
    expect(dimensions).toBe(icon.sizes);
  }
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '9876');
  await context.setOffline(true);
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await ready(page);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByRole('heading', { name: '세이브를 열고,' })).toBeVisible();
  await page.getByRole('button', { name: '샘플로 둘러보기', exact: true }).click();
  await expect(page.locator('.file-details')).toContainText('sample.sav');
  expect(await download(page)).toEqual(readFileSync('src/assets/demo.sav'));
  await page.goto(`${site.url}/index.html?lang=en`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, cookies: '' });
});

test('updates wait for every app tab, retain live dialogs and leave other scopes intact', async ({ page, context, site }, testInfo) => {
  await page.goto(`${site.url}/app/?lang=ko`); await ready(page);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await page.getByRole('checkbox').check();
  await edit(page, 'GLOBAL:0', '9223372036854775807'); await saved(page);
  const second = await context.newPage();
  await second.goto(`${site.url}/app/?lang=ko`); await ready(second); await saved(second);
  await second.getByRole('button', { name: 'GLOBAL:0 값 수정', exact: true }).click();
  await second.getByLabel('새로운 값', { exact: true }).fill('unapplied input');
  const other = await context.newPage();
  await other.goto(`${site.url}/other/?lang=ko`); await ready(other);
  const otherNames = await cacheNames(other, '/other/');
  const oldNames = await cacheNames(page);
  await other.evaluate(async () => { await caches.open('unrelated-app-cache'); });
  site.release('v2');
  await check(page);
  await expect(panel(page).locator('.offline-update')).toContainText('새 버전이 준비되었습니다');
  await expect(panel(second).locator('.offline-update')).toBeVisible();
  await expect(second.getByLabel('새로운 값', { exact: true })).toHaveValue('unapplied input');
  await expect(page.locator('html')).toHaveAttribute('data-test-release', 'v1');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(9223372036854775807n);
  await page.screenshot({ path: testInfo.outputPath('offline-update-ko.png'), fullPage: true });
  expect(await cacheNames(page)).toHaveLength(2);
  await page.close();
  expect(await second.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await second.close();
  await expect.poll(async () => cacheNames(other)).toHaveLength(1);
  expect(await cacheNames(other)).not.toEqual(oldNames);
  expect(await cacheNames(other, '/other/')).toEqual(otherNames);
  expect(await other.evaluate(() => caches.has('unrelated-app-cache'))).toBe(true);
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto(`${site.url}/app/?lang=ko`); await ready(reopened); await saved(reopened);
  await expect(reopened.locator('html')).toHaveAttribute('data-test-release', 'v2');
  expect(parseSave(new Uint8Array(await download(reopened)), 'save.sav').variables[0].values.get('0')).toBe(9223372036854775807n);
});

test('incomplete installation can be retried; a corrupt update preserves the working offline release', async ({ page, context, site }) => {
  site.failAsset = 'icons/app-512.png';
  await page.goto(`${site.url}/app/?lang=ko`);
  await expect(panel(page).locator('summary')).toContainText('오프라인 사용 준비를 다시 시도하세요');
  expect(await cacheNames(page)).toEqual([]);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '1234');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(1234n);
  site.failAsset = undefined;
  await check(page, true); await ready(page);
  const names = await cacheNames(page);
  site.release('v2'); site.corruptAsset = 'icons/app-512.png';
  await check(page);
  await expect(panel(page).locator('.offline-error')).toContainText('업데이트를 준비하지 못했습니다');
  await ready(page);
  expect(await cacheNames(page)).toEqual(names);
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(false);
  await context.setOffline(true);
  page.once('dialog', dialog => dialog.accept());
  await page.reload(); await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-test-release', 'v1');
});

test('missing cached assets are detected and repaired without changing the live save', async ({ page, context, site }) => {
  await page.goto(`${site.url}/app/?lang=ko`); await ready(page);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '-9223372036854775808');
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.includes(':app:'))!;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) if (request.url.endsWith('/icons/app-512.png')) await cache.delete(request);
  });
  await context.setOffline(true);
  await check(page);
  await expect(panel(page).locator('summary')).toContainText('오프라인 사용 준비를 다시 시도하세요');
  await check(page, true);
  await expect(panel(page).locator('summary')).toContainText('오프라인 사용 준비를 다시 시도하세요');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(-9223372036854775808n);
  await context.setOffline(false);
  await expect(panel(page).getByRole('button', { name: '오프라인 준비 다시 시도' })).toBeEnabled();
  await check(page, true); await ready(page);
  await context.setOffline(true);
  page.once('dialog', dialog => dialog.accept());
  await page.reload(); await ready(page);
  await page.getByRole('button', { name: '샘플로 둘러보기', exact: true }).click();
  expect(await download(page)).toEqual(readFileSync('src/assets/demo.sav'));
});

test('a fresh browser process can reopen offline and recover saved work', async ({ site }, testInfo) => {
  const profile = testInfo.outputPath('browser-profile');
  let browser = await chromium.launchPersistentContext(profile, { headless: true, locale: 'ko-KR' });
  try {
    const page = await browser.newPage();
    await page.goto(`${site.url}/app/?lang=ko`); await ready(page);
    const protocol = await browser.newCDPSession(page);
    const manifest = await protocol.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    expect(new URL(JSON.parse(manifest.data!).start_url, manifest.url).href).toBe(`${site.url}/app/`);
    expect((await protocol.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
    await protocol.detach();
    await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
    await page.getByRole('checkbox').check();
    await edit(page, 'GLOBAL:0', '4567'); await saved(page);
    await browser.close();
    browser = await chromium.launchPersistentContext(profile, { headless: true, locale: 'ko-KR', offline: true });
    const reopened = await browser.newPage();
    await reopened.goto(`${site.url}/app/?lang=ko`); await ready(reopened); await saved(reopened);
    expect(parseSave(new Uint8Array(await download(reopened)), 'save.sav').variables[0].values.get('0')).toBe(4567n);
  } finally { await browser.close(); }
});

for (const lang of ['en', 'ko', 'ja']) test(`${lang}: mobile installation is optional, keyboard accessible and preserves open work`, async ({ page, site }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${site.url}/app/?lang=ko`); await ready(page);
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '123');
  await page.getByRole('combobox', { name: '언어', exact: true }).selectOption(lang);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => { document.documentElement.dataset.installPrompt = 'opened'; },
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  const names = { en: 'Install app', ko: '앱 설치', ja: 'アプリをインストール' };
  const button = panel(page).getByRole('button', { name: names[lang as keyof typeof names], exact: true });
  await expect(button).toBeVisible();
  await panel(page).locator('summary').click();
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-install-prompt', 'opened');
  await expect(button).toHaveCount(0);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  expect(await page.locator('.value-text').allTextContents()).toContain('123');
  // An actual browser installation event hides the optional install action.
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(panel(page).locator('.installed-label')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath(`offline-mobile-${lang}.png`), fullPage: true });
});

for (const denial of ['registration', 'property'] as const) test(`${denial} denial keeps ordinary file editing available`, async ({ page, site }) => {
  await page.addInitScript(denial => {
    if (denial === 'property') Object.defineProperty(navigator, 'serviceWorker', { get() { throw new DOMException('Test access denial', 'SecurityError'); } });
    else navigator.serviceWorker.register = () => Promise.reject(new DOMException('Test storage denial', 'SecurityError'));
  }, denial);
  await page.goto(`${site.url}/app/?lang=ko`);
  await expect(panel(page).locator('summary')).toContainText('오프라인 사용 준비를 다시 시도하세요');
  await page.getByLabel('세이브 파일 선택').setInputFiles('tests/fixtures/global-binary.sav');
  await edit(page, 'GLOBAL:0', '111');
  expect(parseSave(new Uint8Array(await download(page)), 'save.sav').variables[0].values.get('0')).toBe(111n);
});
