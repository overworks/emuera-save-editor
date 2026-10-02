import { MessageError } from './core/diagnostic';
import type { Request } from './worker';
import type { RecoveryStatus } from './recovery';
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let sequence = 0;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
let recovery: RecoveryStatus = { enabled: false, state: 'loading' };
const recoveryListeners = new Set<() => void>();
export const getRecoveryStatus = () => recovery;
export function subscribeRecovery(listener: () => void) { recoveryListeners.add(listener); return () => { recoveryListeners.delete(listener); }; }
worker.onmessage = ({ data }) => {
  if (data.recovery) {
    recovery = data.recovery;
    recoveryListeners.forEach(listener => listener());
    return;
  }
  const handler = pending.get(data.requestId);
  pending.delete(data.requestId);
  if (data.error) handler?.reject(new MessageError(data.error));
  else handler?.resolve(data.result);
};
worker.onerror = () => {
  recovery = { ...recovery, state: 'error', error: { key: 'error.worker' } };
  recoveryListeners.forEach(listener => listener());
  pending.forEach(p => p.reject(new MessageError({ key: 'error.worker' })));
  pending.clear();
};
export function rpc<T>(request: Request): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;
    pending.set(requestId, { resolve: result => resolve(result as T), reject });
    worker.postMessage({ requestId, request });
  });
}
