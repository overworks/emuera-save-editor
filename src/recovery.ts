import type { Message } from './core/diagnostic';
import { SaveError } from './core/model';
import { MAX_SESSION_OPERATIONS } from './core/session';
import type { SessionOperation, SessionSource, SessionView } from './core/session';

export interface RecoveryStatus {
  enabled: boolean; state: 'loading' | 'off' | 'empty' | 'saving' | 'saved' | 'error';
  savedAt?: number; error?: Message;
}
interface Head { version: 1; token: string; count: number; savedAt: number; view: SessionView }
export interface RecoveryData { head?: Head; source?: SessionSource; operations: SessionOperation[] }
export interface RecoveryWrite {
  view: SessionView;
  replace?: { source?: SessionSource; operations: SessionOperation[] };
  operation?: SessionOperation;
}

// One workspace per hosted app path. Files never leave the browser.
export class RecoveryStore {
  constructor(private readonly name: string) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('workspace');
        request.result.createObjectStore('operations');
      };
      request.onblocked = () => { blocked = true; reject(new SaveError('error.sessionStorage')); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (blocked) db.close(); else resolve(db);
      };
    });
  }
  async read(): Promise<RecoveryData> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['workspace', 'operations'], 'readonly');
      const head = tx.objectStore('workspace').get('head');
      const source = tx.objectStore('workspace').get('source');
      const operations = tx.objectStore('operations').getAll(undefined, MAX_SESSION_OPERATIONS + 1);
      tx.oncomplete = () => { db.close(); resolve({ head: head.result, source: source.result, operations: operations.result }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  async write(expectedToken: string | undefined, data: RecoveryWrite): Promise<Head> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['workspace', 'operations'], 'readwrite');
      const workspace = tx.objectStore('workspace'), operations = tx.objectStore('operations');
      let head: Head, failure: unknown;
      const current = workspace.get('head');
      current.onsuccess = () => {
        try {
          if (current.result?.token !== expectedToken) throw new SaveError('error.sessionConflict');
          let count = current.result?.count ?? 0;
          if (data.replace) {
            operations.clear();
            workspace.delete('source');
            if (data.replace.source) workspace.put(data.replace.source, 'source');
            data.replace.operations.forEach((op, i) => operations.add(op, i));
            count = data.replace.operations.length;
          } else if (data.operation) operations.add(data.operation, count++);
          // getRandomValues also works on plain HTTP static hosts.
          const token = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
          head = { version: 1, token, count, savedAt: Date.now(), view: data.view };
          workspace.put(head, 'head');
        } catch (e) { failure = e; tx.abort(); }
      };
      // Request success is not a committed transaction (quota errors can arrive later).
      tx.oncomplete = () => { db.close(); resolve(head); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
    });
  }
  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['workspace', 'operations'], 'readwrite');
      tx.objectStore('workspace').clear(); tx.objectStore('operations').clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
}

export function validateRecovery(data: RecoveryData): void {
  const h = data.head;
  if (!h || h.version !== 1 || typeof h.token !== 'string' || !h.token || !Number.isSafeInteger(h.count)
    || h.count < 0 || h.count > MAX_SESSION_OPERATIONS || h.count !== data.operations.length
    || typeof h.savedAt !== 'number' || !Number.isFinite(h.savedAt) || (!data.source && h.count)) throw new SaveError('error.sessionInvalid');
}
