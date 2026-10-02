import { messageOf } from './core/diagnostic';
import { SaveError } from './core/model';
import { Editor, parseSave } from './core/editor';
import type { NewVariable, Query } from './core/editor';
import type { EncodingOption } from './core/model';

export type Request =
  | { type: 'open'; bytes: Uint8Array; filename: string; encoding: EncodingOption }
  | { type: 'summary' }
  | { type: 'query'; query: Query }
  | { type: 'set'; id: number; key: string; value: string }
  | { type: 'revert'; id: number; key: string }
  | { type: 'resize'; id: number; dimensions: number[] }
  | { type: 'revertResize'; id: number }
  | { type: 'addVariable'; variable: NewVariable }
  | { type: 'deleteVariable'; id: number }
  | { type: 'restoreVariable'; id: number }
  | { type: 'cloneCharacter'; scope: number }
  | { type: 'previewDeleteCharacter'; scope: number }
  | { type: 'deleteCharacter'; scope: number }
  | { type: 'restoreCharacter'; scope: number }
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
      if (!editor) throw new SaveError('error.openFirst');
      switch (request.type) {
        case 'summary': result = editor.summary(); break;
        case 'query': result = editor.query(request.query); break;
        case 'set': editor.set(request.id, request.key, request.value); result = editor.summary(); break;
        case 'revert': editor.revert(request.id, request.key); result = editor.summary(); break;
        case 'resize': editor.resize(request.id, request.dimensions); result = editor.summary(); break;
        case 'revertResize': editor.revertResize(request.id); result = editor.summary(); break;
        case 'addVariable': { const id = editor.addVariable(request.variable); result = { id, summary: editor.summary() }; break; }
        case 'deleteVariable': editor.deleteVariable(request.id); result = editor.summary(); break;
        case 'restoreVariable': editor.restoreVariable(request.id); result = editor.summary(); break;
        case 'cloneCharacter': { const scope = editor.cloneCharacter(request.scope); result = { scope, summary: editor.summary() }; break; }
        case 'previewDeleteCharacter': result = editor.previewDeleteCharacter(request.scope); break;
        case 'deleteCharacter': editor.deleteCharacter(request.scope); result = editor.summary(); break;
        case 'restoreCharacter': editor.restoreCharacter(request.scope); result = editor.summary(); break;
        case 'reset': editor.reset(); result = editor.summary(); break;
        case 'labels': result = { warnings: editor.labels.load(request.files, request.encoding), summary: editor.summary() }; break;
        case 'export': result = editor.serialize(); break;
      }
    }
    if (result instanceof Uint8Array) self.postMessage({ requestId, result }, { transfer: [result.buffer] });
    else self.postMessage({ requestId, result });
  } catch (error) { self.postMessage({ requestId, error: messageOf(error) }); }
};
