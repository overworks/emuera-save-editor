import { MessageError } from './core/diagnostic';
import type { Request } from './worker';
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let sequence = 0;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
worker.onmessage = ({ data }) => {
  const handler = pending.get(data.requestId);
  pending.delete(data.requestId);
  if (data.error) handler?.reject(new MessageError(data.error));
  else handler?.resolve(data.result);
};
worker.onerror = () => {
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
