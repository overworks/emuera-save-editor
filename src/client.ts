import type { Request } from './worker';
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let sequence = 0;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
worker.onmessage = ({ data }) => {
  const handler = pending.get(data.requestId);
  pending.delete(data.requestId);
  if (data.error) handler?.reject(new Error(data.error));
  else handler?.resolve(data.result);
};
worker.onerror = () => {
  pending.forEach(p => p.reject(new Error('파일 처리 중 오류가 발생했습니다. 페이지를 새로 열어 주세요.')));
  pending.clear();
};
export function rpc<T>(request: Request): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;
    pending.set(requestId, { resolve: result => resolve(result as T), reject });
    worker.postMessage({ requestId, request });
  });
}
