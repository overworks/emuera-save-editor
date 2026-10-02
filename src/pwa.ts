interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export interface OfflineStatus {
  phase: 'preparing' | 'ready' | 'unavailable' | 'error';
  updateReady: boolean;
  updateFailed: boolean;
  checking: boolean;
  installable: boolean;
  installed: boolean;
  installFailed: boolean;
}
let status: OfflineStatus = { phase: 'preparing', updateReady: false, updateFailed: false, checking: false, installable: false, installed: false, installFailed: false };
const listeners = new Set<() => void>();
export const getOfflineStatus = () => status;
export function subscribeOffline(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(change: Partial<OfflineStatus>) { status = { ...status, ...change }; listeners.forEach(listener => listener()); }
let started = false;
let registration: ServiceWorkerRegistration | undefined;
let installPrompt: InstallPrompt | undefined;
let inspection = 0;
const watched = new WeakSet<ServiceWorker>();

function ask(worker: ServiceWorker, type: 'OFFLINE_STATUS' | 'PREPARE_OFFLINE'): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => { clearTimeout(timer); channel.port1.close(); resolve(ready); };
    const timer = window.setTimeout(() => finish(false), 15_000);
    channel.port1.onmessage = event => finish(event.data?.ready === true);
    try { worker.postMessage({ type }, [channel.port2]); }
    catch { finish(false); }
  });
}

async function inspect() {
  const current = ++inspection;
  const active = registration?.active;
  publish({ updateReady: registration?.waiting?.state === 'installed' });
  if (active?.state === 'activated') {
    const ready = await ask(active, 'OFFLINE_STATUS');
    if (current === inspection) publish({ phase: ready ? 'ready' : 'error' });
  } else if (registration?.installing || active?.state === 'activating') publish({ phase: 'preparing' });
  else publish({ phase: 'error' });
}

function watch(worker: ServiceWorker | null) {
  if (!worker || watched.has(worker)) return;
  watched.add(worker);
  worker.addEventListener('statechange', () => {
    if (worker.state === 'redundant') publish({ updateFailed: !!registration?.active });
    if (worker.state === 'installed') publish({ updateFailed: false });
    void inspect();
  });
}

async function register() {
  publish({ phase: 'preparing', updateFailed: false });
  const base = new URL('.', window.location.href);
  registration = await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.href, updateViaCache: 'none' });
  registration.addEventListener('updatefound', () => { watch(registration!.installing); void inspect(); });
  watch(registration.installing); watch(registration.active);
  await inspect();
}

export function startOffline() {
  if (started) return;
  started = true;
  const display = window.matchMedia('(display-mode: standalone)');
  publish({ installed: display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true });
  display.addEventListener('change', event => { if (event.matches) publish({ installed: true, installable: false }); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event as InstallPrompt;
    publish({ installable: !status.installed, installFailed: false });
  });
  window.addEventListener('appinstalled', () => { installPrompt = undefined; publish({ installed: true, installable: false }); });
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) {
    publish({ phase: 'unavailable' }); return;
  }
  try {
    // Some privacy/sandbox policies deny the property itself, not just register().
    navigator.serviceWorker.addEventListener('controllerchange', () => { void inspect(); });
    void register().catch(() => publish({ phase: 'error' }));
  } catch { publish({ phase: 'error' }); }
  window.addEventListener('online', () => { void checkOffline(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkOffline(); });
}

export async function checkOffline(repair = false) {
  if (status.checking || status.phase === 'unavailable') return;
  publish({ checking: true });
  try {
    // A failed first installation can discard its registration entirely.
    if (!registration || (!registration.active && !registration.installing && !registration.waiting)) await register();
    else {
      if (navigator.onLine) {
        try { await registration.update(); publish({ updateFailed: false }); }
        catch { publish({ updateFailed: true }); }
      }
      if (repair && registration.active?.state === 'activated') await ask(registration.active, 'PREPARE_OFFLINE');
      await inspect();
    }
  } catch { publish({ phase: 'error' }); }
  finally { publish({ checking: false }); }
}

export async function installApp() {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = undefined;
  publish({ installable: false, installFailed: false });
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { publish({ installFailed: true }); }
}
