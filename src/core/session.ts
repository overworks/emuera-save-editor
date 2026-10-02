import { Editor, parseSave } from './editor';
import type { NewVariable } from './editor';
import type { Message } from './diagnostic';
import { MAX_FILE_BYTES, SaveError } from './model';
import type { EncodingOption } from './model';

export type SessionOperation =
  | { type: 'set'; id: number; key: string; value: string }
  | { type: 'revert'; id: number; key: string }
  | { type: 'resize'; id: number; dimensions: number[] }
  | { type: 'revertResize' | 'deleteVariable' | 'restoreVariable'; id: number }
  | { type: 'addVariable'; variable: NewVariable }
  | { type: 'cloneCharacter' | 'deleteCharacter' | 'restoreCharacter'; scope: number }
  | { type: 'reset' }
  | { type: 'labels'; files: { name: string; bytes: Uint8Array }[]; encoding: EncodingOption };

export interface SessionSource { bytes: Uint8Array; filename: string; encoding: EncodingOption }
export interface SessionView {
  scope: number | 'all'; variableId?: number; search: string; changedOnly: boolean; page: number;
  encoding: EncodingOption; presetId: string;
}
export const defaultView: SessionView = { scope: -1, search: '', changedOnly: false, page: 0, encoding: 'auto', presetId: '' };
export const MAX_SESSION_OPERATIONS = 100_000;
// Bound recovery work independently of the save limits; never expand sparse arrays.
export const MAX_SESSION_BYTES = 128 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SaveError('error.sessionInvalid');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 1_000_000): string {
  if (typeof value !== 'string' || value.length > limit) throw new SaveError('error.sessionInvalid');
  return value;
}
function index(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new SaveError('error.sessionInvalid');
  return value;
}
function encoding(value: unknown): EncodingOption {
  if (value !== 'auto' && value !== 'utf-8' && value !== 'shift_jis') throw new SaveError('error.sessionInvalid');
  return value;
}
function dimensions(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 3) throw new SaveError('error.sessionInvalid');
  return value.map(n => index(n));
}
function file(value: unknown): { name: string; bytes: Uint8Array } {
  const f = record(value);
  if (!(f.bytes instanceof Uint8Array) || f.bytes.byteLength > MAX_FILE_BYTES) throw new SaveError('error.sessionInvalid');
  return { name: text(f.name, 4096), bytes: f.bytes };
}
export function readSessionView(value: unknown): SessionView {
  const v = record(value);
  if (typeof v.changedOnly !== 'boolean') throw new SaveError('error.sessionInvalid');
  return { scope: v.scope === 'all' ? 'all' : index(v.scope, -1), variableId: v.variableId === undefined ? undefined : index(v.variableId),
    search: text(v.search), changedOnly: v.changedOnly, page: index(v.page), encoding: encoding(v.encoding), presetId: text(v.presetId, 128) };
}
function readOperation(value: unknown): SessionOperation {
  const op = record(value);
  switch (op.type) {
    case 'set': return { type: op.type, id: index(op.id), key: text(op.key, 128), value: text(op.value) };
    case 'revert': return { type: op.type, id: index(op.id), key: text(op.key, 128) };
    case 'resize': return { type: op.type, id: index(op.id), dimensions: dimensions(op.dimensions) };
    case 'revertResize': case 'deleteVariable': case 'restoreVariable': return { type: op.type, id: index(op.id) };
    case 'cloneCharacter': case 'deleteCharacter': case 'restoreCharacter': return { type: op.type, scope: index(op.scope) };
    case 'reset': return { type: op.type };
    case 'labels': {
      if (!Array.isArray(op.files) || op.files.length > MAX_SESSION_OPERATIONS) throw new SaveError('error.sessionInvalid');
      const files = op.files.map(file);
      if (files.reduce((n, f) => n + f.bytes.length, 0) > MAX_FILE_BYTES) throw new SaveError('error.csvSize');
      return { type: op.type, files, encoding: encoding(op.encoding) };
    }
    case 'addVariable': {
      const v = record(op.variable);
      if ((v.kind !== 'int' && v.kind !== 'string') || (v.section !== undefined && v.section !== 'builtin' && v.section !== 'user')) throw new SaveError('error.sessionInvalid');
      return { type: op.type, variable: { scope: index(v.scope, -1), name: text(v.name, 128), kind: v.kind, dimensions: dimensions(v.dimensions), section: v.section } };
    }
    default: throw new SaveError('error.sessionInvalid');
  }
}
function operationBytes(op: SessionOperation): number {
  if (op.type === 'labels') return 128 + op.files.reduce((n, f) => n + f.bytes.byteLength + f.name.length * 2 + 64, 0);
  return 128 + JSON.stringify(op).length * 2; // Save integers are decimal strings in operations.
}
function apply(editor: Editor, op: SessionOperation): { id?: number; scope?: number; warnings?: Message[] } {
  switch (op.type) {
    case 'set': editor.set(op.id, op.key, op.value); break;
    case 'revert': editor.revert(op.id, op.key); break;
    case 'resize': editor.resize(op.id, op.dimensions); break;
    case 'revertResize': editor.revertResize(op.id); break;
    case 'addVariable': return { id: editor.addVariable(op.variable) };
    case 'deleteVariable': editor.deleteVariable(op.id); break;
    case 'restoreVariable': editor.restoreVariable(op.id); break;
    case 'cloneCharacter': return { scope: editor.cloneCharacter(op.scope) };
    case 'deleteCharacter': editor.deleteCharacter(op.scope); break;
    case 'restoreCharacter': editor.restoreCharacter(op.scope); break;
    case 'reset': editor.reset(); break;
    case 'labels': return { warnings: editor.labels.load(op.files, op.encoding) };
  }
  return {};
}

// A versioned operation journal preserves undo, hidden edits, copy snapshots and
// monotonically allocated identities by replaying the same validated editor API.
export class Session {
  readonly editor: Editor;
  readonly source: SessionSource;
  private journal: SessionOperation[] | undefined = [];
  private bytes: number;
  warnings: Message[] = [];
  constructor(source: SessionSource) {
    const input = file({ name: source.filename, bytes: source.bytes });
    this.editor = new Editor(parseSave(input.bytes, input.name, encoding(source.encoding)));
    this.source = { bytes: input.bytes, filename: input.name,
      encoding: this.editor.document.format === 'text' ? this.editor.document.encoding as EncodingOption : 'auto' };
    this.bytes = input.bytes.byteLength;
  }
  static restore(source: unknown, operations: unknown): Session {
    const s = record(source);
    if (!Array.isArray(operations) || operations.length > MAX_SESSION_OPERATIONS) throw new SaveError('error.sessionInvalid');
    const f = file({ name: s.filename, bytes: s.bytes });
    const session = new Session({ bytes: f.bytes, filename: f.name, encoding: encoding(s.encoding) });
    const validated = operations.map(readOperation);
    if (session.bytes + validated.reduce((n, op) => n + operationBytes(op), 0) > MAX_SESSION_BYTES) throw new SaveError('error.sessionLimit');
    for (const op of validated) session.run(op);
    return session;
  }
  run(operation: SessionOperation) {
    const op = readOperation(operation);
    const result = apply(this.editor, op); // Failed operations never enter the journal.
    if (result.warnings) this.warnings = result.warnings;
    this.bytes += operationBytes(op);
    if (this.bytes > MAX_SESSION_BYTES || (this.journal?.length ?? 0) >= MAX_SESSION_OPERATIONS) this.journal = undefined;
    else this.journal?.push(op);
    return result;
  }
  get operations(): SessionOperation[] {
    if (!this.journal) throw new SaveError('error.sessionLimit');
    return this.journal;
  }
}
