import { messageOf, MessageError } from './core/diagnostic';
import { SaveError } from './core/model';
import type { Query, Summary } from './core/editor';
import type { Message } from './core/diagnostic';
import type { EncodingOption } from './core/model';
import { Session, defaultView, readSessionView } from './core/session';
import type { SessionOperation, SessionSource, SessionView } from './core/session';
import { RecoveryStore, validateRecovery } from './recovery';
import type { RecoveryStatus } from './recovery';

export type Request = SessionOperation
  | ({ type: 'open' } & SessionSource)
  | { type: 'reopen'; encoding: EncodingOption }
  | { type: 'initialize'; path: string }
  | { type: 'recovery'; enabled: boolean }
  | { type: 'retryRecovery' }
  | { type: 'view'; view: SessionView }
  | { type: 'summary' }
  | { type: 'query'; query: Query }
  | { type: 'previewDeleteCharacter'; scope: number }
  | { type: 'export' };
export interface RestoredSession { summary?: Summary; view: SessionView; warnings: Message[] }
let session: Session | undefined;
let view = { ...defaultView };
let store: RecoveryStore;
let token: string | undefined;
let recovery: RecoveryStatus = { enabled: false, state: 'loading' };
let initialized = false;
let restoreFailed = false;

function status(next: RecoveryStatus) { recovery = next; self.postMessage({ recovery }); }
function storageError(error: unknown): Message {
  if (error instanceof MessageError) return error.diagnostic;
  return { key: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'error.sessionQuota' : 'error.sessionStorage' };
}
async function persist(replace: boolean, operation?: SessionOperation) {
  if (!recovery.enabled || restoreFailed || (recovery.state === 'error' && !replace)) return;
  status({ ...recovery, state: 'saving', error: undefined });
  try {
    const operations = session?.operations ?? [];
    const head = await store.write(token, { view, ...(replace ? { replace: { source: session?.source, operations } } : { operation }) });
    token = head.token;
    status({ enabled: true, state: session ? 'saved' : 'empty', savedAt: session ? head.savedAt : undefined });
  } catch (e) { status({ ...recovery, state: 'error', error: storageError(e) }); }
}
async function initialize(path: string): Promise<RestoredSession> {
  if (!initialized) {
    initialized = true;
    store = new RecoveryStore(`emuera-save-studio:${path}`);
    try {
      const data = await store.read();
      if (data.head) {
        token = data.head.token;
        recovery = { enabled: true, state: 'loading' };
        validateRecovery(data);
        const nextView = readSessionView(data.head.view);
        const next = data.source ? Session.restore(data.source, data.operations) : undefined;
        session = next; view = nextView;
        status({ enabled: true, state: next ? 'saved' : 'empty', savedAt: next ? data.head.savedAt : undefined });
      } else status({ enabled: false, state: 'off' });
    } catch (e) {
      restoreFailed = recovery.enabled;
      status({ ...recovery, state: 'error', error: recovery.enabled ? { key: 'error.sessionRestore' } : storageError(e) });
    }
  }
  return { summary: session?.editor.summary(), view, warnings: session?.warnings ?? [] };
}
async function handle(request: Request): Promise<unknown> {
  if (request.type === 'initialize') return initialize(request.path);
  if (request.type === 'recovery') {
    if (request.enabled) {
      recovery = { ...recovery, enabled: true };
      await persist(true);
    } else {
      status({ ...recovery, state: 'saving', error: undefined });
      try {
        await store.clear(); token = undefined; restoreFailed = false;
        status({ enabled: false, state: 'off' });
      } catch { status({ ...recovery, state: 'error', error: { key: 'error.sessionDelete' } }); }
    }
    return;
  }
  if (request.type === 'retryRecovery') { await persist(true); return; }
  if (request.type === 'view') {
    const next = readSessionView(request.view);
    if (JSON.stringify(next) === JSON.stringify(view)) return;
    view = next;
    if (session) await persist(false);
    return;
  }
  if (request.type === 'open' || request.type === 'reopen') {
    if (request.type === 'reopen' && !session) throw new SaveError('error.openFirst');
    const source = request.type === 'open' ? request : { ...session!.source, encoding: request.encoding };
    const next = new Session(source); // Keep both the live and saved sessions on failed opens.
    session = next; restoreFailed = false;
    view = { ...defaultView, encoding: request.encoding };
    await persist(true);
    return next.editor.summary();
  }
  if (!session) throw new SaveError('error.openFirst');
  const editor = session.editor;
  switch (request.type) {
    case 'summary': return editor.summary();
    case 'query': return editor.query(request.query);
    case 'previewDeleteCharacter': return editor.previewDeleteCharacter(request.scope);
    case 'export': return editor.serialize();
    default: {
      const result = session.run(request);
      await persist(false, request);
      const summary = editor.summary();
      return request.type === 'addVariable' || request.type === 'cloneCharacter' || request.type === 'labels' ? { ...result, summary } : summary;
    }
  }
}
// IndexedDB is asynchronous: serialize requests so opens, edits, view updates and
// disabling recovery cannot race or resurrect a deleted workspace.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ requestId: number; request: Request }>) => {
  const { requestId, request } = data;
  queue = queue.then(async () => {
    try {
      const result = await handle(request);
      if (result instanceof Uint8Array) self.postMessage({ requestId, result }, { transfer: [result.buffer] });
      else self.postMessage({ requestId, result });
    } catch (error) { self.postMessage({ requestId, error: messageOf(error) }); }
  });
};
