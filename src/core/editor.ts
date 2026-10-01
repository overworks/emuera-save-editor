import { MAGIC, parseBinary, writeVariable } from './binary';
import { parseText, FINISH, SEPARATOR } from './text';
import { encodeText } from './encoding';
import { Labels } from './labels';
import { MAX_FILE_BYTES, SaveError, cellCount, coordinates, integer, ordinal, originalValue, patchBytes } from './model';
import type { EncodingOption, SaveDocument, Scalar, Variable } from './model';

export function parseSave(bytes: Uint8Array, filename: string, encoding: EncodingOption = 'auto'): SaveDocument {
  if (!bytes.length) throw new SaveError('error.emptyFile');
  if (bytes.length > MAX_FILE_BYTES) throw new SaveError('error.fileSize');
  return MAGIC.every((b, i) => bytes[i] === b) ? parseBinary(bytes, filename) : parseText(bytes, filename, encoding);
}
export interface Row {
  variableId: number; key: string; name: string; scope: number; scopeName: string; kind: 'int' | 'string';
  dimensions: number[]; label: string; value: string; original: string; changed: boolean;
}
export interface Query {
  scope: number | 'all'; variableId?: number; search: string; changedOnly: boolean; page: number;
}
export interface Page { rows: Row[]; total: number; page: number; pages: number }
export interface Summary {
  filename: string; bytes: number; format: 'text' | 'binary'; encoding: string; formatVersion: number;
  fileType: 'normal' | 'global'; gameCode: string; gameVersion: string; description: string;
  characters: { scope: number; name: string; no: string }[];
  variables: { id: number; scope: number; name: string; count: number; dimensions: number[] }[];
  changes: number; labels: number;
}
const PAGE_SIZE = 50;
export class Editor {
  readonly edits = new Map<number, Map<string, Scalar>>();
  readonly labels = new Labels();
  private readonly characterNames = new Map<number, Variable>();
  private readonly characterNumbers = new Map<number, Variable>();
  constructor(readonly document: SaveDocument) {
    for (const v of document.variables) {
      if (v.scope < 0) continue;
      if (v.name === 'NAME') this.characterNames.set(v.scope, v);
      if (v.name === 'NO') this.characterNumbers.set(v.scope, v);
    }
  }
  private variable(id: number): Variable {
    const v = this.document.variables[id];
    if (!v) throw new SaveError('error.variableMissing');
    return v;
  }
  value(v: Variable, key: string): Scalar { return this.edits.get(v.id)?.get(key) ?? originalValue(v, key); }
  set(id: number, key: string, input: string) {
    const v = this.variable(id);
    if (ordinal(key, v.dimensions) < 0 || (v.textSpans && !v.textSpans.has(key))) throw new SaveError('error.cellBounds');
    if (input.length > 1_000_000) throw new SaveError('error.inputLength');
    const value = v.kind === 'int' ? integer(input) : input;
    if (typeof value === 'string' && this.document.format === 'text') {
      if (/[\r\n\0]/.test(value) || value === FINISH || value === SEPARATOR || value.startsWith('__EMUERA_')) {
        throw new SaveError('error.textReserved');
      }
      encodeText(value, this.document.encoding as 'utf-8' | 'shift_jis');
    } else if (typeof value === 'string') {
      // Reject isolated UTF-16 surrogates instead of silently replacing them.
      if (new TextDecoder().decode(new TextEncoder().encode(value)) !== value) throw new SaveError('error.unicode');
    }
    if (value === originalValue(v, key)) { this.revert(id, key); return; }
    const changes = this.edits.get(id) ?? new Map<string, Scalar>();
    changes.set(key, value); this.edits.set(id, changes);
  }
  revert(id: number, key: string) {
    const changes = this.edits.get(id);
    changes?.delete(key);
    if (!changes?.size) this.edits.delete(id);
  }
  scopeName(scope: number) {
    if (scope === -1) return '';
    const v = this.characterNames.get(scope);
    return v ? String(this.value(v, '')) : '';
  }
  summary(): Summary {
    const d = this.document;
    return { filename: d.filename, bytes: d.original.length, format: d.format, encoding: d.encoding, formatVersion: d.formatVersion,
      fileType: d.fileType, gameCode: String(d.gameCode), gameVersion: String(d.gameVersion), description: d.description,
      characters: Array.from({ length: d.characterCount }, (_, scope) => {
        const v = this.characterNumbers.get(scope);
        return { scope, name: this.scopeName(scope), no: v ? String(this.value(v, '')) : '—' };
      }),
      variables: d.variables.map(v => ({ id: v.id, scope: v.scope, name: v.name, dimensions: v.dimensions,
        count: v.textSpans ? v.textSpans.size : cellCount(v.dimensions) })),
      changes: [...this.edits.values()].reduce((n, v) => n + v.size, 0), labels: this.labels.count };
  }
  query(query: Query): Page {
    const search = query.search.trim().toLowerCase();
    const groups: { variable: Variable; keys?: string[]; count: number }[] = [];
    let total = 0;
    for (const v of this.document.variables) {
      if (query.scope !== 'all' && v.scope !== query.scope) continue;
      if (query.variableId !== undefined && v.id !== query.variableId) continue;
      let keys: string[] | undefined;
      if (query.changedOnly) keys = [...(this.edits.get(v.id)?.keys() ?? [])];
      else if (v.textSpans) keys = [...v.textSpans.keys()];
      if (search && !v.name.toLowerCase().includes(search)) {
        const matches = (key: string) => key === search.replace(/:/g, ',') || this.labels.get(v.name, key).toLowerCase().includes(search);
        if (keys) keys = keys.filter(matches);
        else {
          const candidates = new Set<string>();
          const index = search.replace(/:/g, ',');
          if (ordinal(index, v.dimensions) >= 0) candidates.add(index);
          this.labels.entries.get(v.name.toUpperCase())?.forEach((label, key) => {
            if (label.toLowerCase().includes(search) && ordinal(key, v.dimensions) >= 0) candidates.add(key);
          });
          keys = [...candidates];
        }
      }
      keys?.sort((a, b) => ordinal(a, v.dimensions) - ordinal(b, v.dimensions));
      const count = keys ? keys.length : cellCount(v.dimensions);
      if (count) { groups.push({ variable: v, keys, count }); total += count; }
    }
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.max(0, Math.min(pages - 1, Math.floor(query.page) || 0));
    let skip = page * PAGE_SIZE;
    const rows: Row[] = [];
    for (const group of groups) {
      if (skip >= group.count) { skip -= group.count; continue; }
      const v = group.variable;
      for (let i = skip; i < group.count && rows.length < PAGE_SIZE; i++) {
        const key = group.keys?.[i] ?? coordinates(i, v.dimensions);
        rows.push({ variableId: v.id, key, name: v.name, scope: v.scope, scopeName: this.scopeName(v.scope),
          kind: v.kind, dimensions: v.dimensions, label: this.labels.get(v.name, key),
          value: String(this.value(v, key)), original: String(originalValue(v, key)), changed: this.edits.get(v.id)?.has(key) ?? false });
      }
      skip = 0;
      if (rows.length >= PAGE_SIZE) break;
    }
    return { rows, total, page, pages };
  }
  serialize(): Uint8Array {
    const patches = [];
    for (const [id, changes] of this.edits) {
      const v = this.variable(id);
      if (this.document.format === 'binary') patches.push({ start: v.start, end: v.end, bytes: writeVariable(v, changes) });
      else for (const [key, value] of changes) {
        const span = v.textSpans!.get(key)!;
        patches.push({ ...span, bytes: encodeText(String(value), this.document.encoding as 'utf-8' | 'shift_jis') });
      }
    }
    const result = patchBytes(this.document.original, patches);
    // Validate the exact download, including shape and all logical values. No dense expansion.
    const check = parseSave(result, this.document.filename, this.document.format === 'text' ? this.document.encoding as 'utf-8' | 'shift_jis' : 'auto');
    if (check.variables.length !== this.document.variables.length) throw new SaveError('error.exportValidation');
    for (const [i, before] of this.document.variables.entries()) {
      const after = check.variables[i];
      if (before.name !== after.name || before.scope !== after.scope || before.kind !== after.kind || before.dimensions.join() !== after.dimensions.join()) throw new SaveError('error.exportStructure');
      const keys = new Set([...before.values.keys(), ...after.values.keys(), ...(this.edits.get(i)?.keys() ?? [])]);
      for (const key of keys) if (this.value(before, key) !== originalValue(after, key)) throw new SaveError('error.exportValues');
    }
    return result;
  }
}
