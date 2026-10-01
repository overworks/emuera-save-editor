import { Editor, parseSave } from './core/editor';
import type { Query } from './core/editor';
import type { EncodingOption } from './core/model';

export type Request =
  | { type: 'open'; bytes: Uint8Array; filename: string; encoding: EncodingOption }
  | { type: 'summary' }
  | { type: 'query'; query: Query }
  | { type: 'set'; id: number; key: string; value: string }
  | { type: 'revert'; id: number; key: string }
  | { type: 'reset' }
  | { type: 'labels'; files: { name: string; bytes: Uint8Array }[]; encoding: EncodingOption }
  | { type: 'export' };
let editor: Editor | undefined;
self.onmessage = ({ data }: MessageEvent<{ requestId: number; request: Request }>) => {
  const { requestId, request } = data;
  try {
    let result: unknown;
    if (request.type === 'open') {
      const next = new Editor(parseSave(request.bytes, request.filename, request.encoding));
      editor = next;
      result = editor.summary();
    } else {
      if (!editor) throw new Error('세이브 파일을 먼저 열어 주세요.');
      switch (request.type) {
        case 'summary': result = editor.summary(); break;
        case 'query': result = editor.query(request.query); break;
        case 'set': editor.set(request.id, request.key, request.value); result = editor.summary(); break;
        case 'revert': editor.revert(request.id, request.key); result = editor.summary(); break;
        case 'reset': editor.edits.clear(); result = editor.summary(); break;
        case 'labels': result = { warnings: editor.labels.load(request.files, request.encoding), summary: editor.summary() }; break;
        case 'export': result = editor.serialize(); break;
      }
    }
    if (result instanceof Uint8Array) self.postMessage({ requestId, result }, { transfer: [result.buffer] });
    else self.postMessage({ requestId, result });
  } catch (error) { self.postMessage({ requestId, error: error instanceof Error ? error.message : String(error) }); }
};
