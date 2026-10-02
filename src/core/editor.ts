import { MAGIC, parseBinary, writeVariable } from './binary';
import { parseText, FINISH, SEPARATOR } from './text';
import { encodeText } from './encoding';
import { Labels, characterLabel } from './labels';
import type { CharacterField, CharacterLabels } from './labels';
import { MAX_ARRAY_CELLS, MAX_FILE_BYTES, SaveError, cellCount, coordinates, integer, ordinal, originalValue, patchBytes } from './model';
import type { BinarySection, EncodingOption, SaveDocument, Scalar, Variable } from './model';

export function parseSave(bytes: Uint8Array, filename: string, encoding: EncodingOption = 'auto'): SaveDocument {
  if (!bytes.length) throw new SaveError('error.emptyFile');
  if (bytes.length > MAX_FILE_BYTES) throw new SaveError('error.fileSize');
  return MAGIC.every((b, i) => bytes[i] === b) ? parseBinary(bytes, filename) : parseText(bytes, filename, encoding);
}
export interface Row {
  type: 'value' | 'resize' | 'add' | 'delete';
  variableId: number; key: string; name: string; scope: number; scopeName: string; kind: 'int' | 'string';
  dimensions: number[]; label: string; value: string; original: string; changed: boolean; section?: BinarySection;
}
export interface NewVariable { scope: number; name: string; kind: 'int' | 'string'; dimensions: number[]; section?: BinarySection }
export interface VariableSummary {
  id: number; scope: number; name: string; kind: 'int' | 'string'; count: number; dimensions: number[]; originalDimensions: number[];
  added: boolean; deleted: boolean; section?: BinarySection;
}
export interface Query {
  scope: number | 'all'; variableId?: number; search: string; changedOnly: boolean; page: number;
}
export interface Page { rows: Row[]; total: number; page: number; pages: number; expandedSearch?: string }
export interface Summary {
  filename: string; bytes: number; format: 'text' | 'binary'; encoding: string; formatVersion: number;
  fileType: 'normal' | 'global'; gameCode: string; gameVersion: string; description: string;
  characters: { scope: number; name: string; no: string; csv?: CharacterLabels }[];
  variables: VariableSummary[];
  changes: number; valueChanges: number; resizedArrays: number; addedVariables: number; deletedVariables: number;
  labels: number; characterLabels: number; renames: number;
}
const PAGE_SIZE = 50;
export class Editor {
  readonly edits = new Map<number, Map<string, Scalar>>();
  private readonly resizes = new Map<number, number[]>();
  private readonly added = new Map<number, Variable>();
  private readonly deleted = new Set<number>();
  private nextId: number;
  readonly labels = new Labels();
  private readonly characterNames = new Map<number, Variable>();
  private readonly characterNumbers = new Map<number, Variable>();
  constructor(readonly document: SaveDocument) {
    this.nextId = document.variables.length;
    this.refreshCharacters();
  }
  private refreshCharacters() {
    this.characterNames.clear(); this.characterNumbers.clear();
    for (const v of this.variables()) {
      if (v.scope < 0) continue;
      if (v.name === 'NAME') this.characterNames.set(v.scope, v);
      if (v.name === 'NO') this.characterNumbers.set(v.scope, v);
    }
  }
  private variables(includeDeleted = false): Variable[] {
    return [...this.document.variables, ...this.added.values()].filter(v => includeDeleted || !this.deleted.has(v.id))
      .sort((a, b) => a.start - b.start || Number(a.section === 'user') - Number(b.section === 'user') || a.id - b.id);
  }
  private variable(id: number, includeDeleted = false): Variable {
    const v = this.document.variables[id] ?? this.added.get(id);
    if (!v || (!includeDeleted && this.deleted.has(id))) throw new SaveError('error.variableMissing');
    return v;
  }
  private requireBinary() {
    if (this.document.format !== 'binary' || !this.document.binaryLayout) throw new SaveError('error.structureBinary');
    return this.document.binaryLayout;
  }
  private validateDimensions(dimensions: number[]) {
    if (dimensions.some(n => !Number.isInteger(n) || n < 0 || n > 2147483647)
      || !Number.isSafeInteger(cellCount(dimensions)) || cellCount(dimensions) > MAX_ARRAY_CELLS) throw new SaveError('error.resizeSize');
  }
  addVariable(spec: NewVariable): number {
    const layout = this.requireBinary();
    if (!Number.isInteger(spec.scope) || spec.scope < -1 || spec.scope >= this.document.characterCount) throw new SaveError('error.variableScope');
    if (!/^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u.test(spec.name) || spec.name.length > 128) throw new SaveError('error.newVariableName');
    if (spec.kind !== 'int' && spec.kind !== 'string') throw new SaveError('error.variableKind');
    const section = spec.scope >= 0 ? spec.section ?? 'user' : undefined;
    if ((spec.scope === -1 && spec.section !== undefined) || (section !== undefined && section !== 'builtin' && section !== 'user')) throw new SaveError('error.variableSection');
    if (spec.dimensions.length > (spec.scope >= 0 ? 2 : 3) || (section === 'user' && !spec.dimensions.length)) throw new SaveError('error.newVariableRank');
    this.validateDimensions(spec.dimensions);
    const variables = this.variables();
    if (variables.some(v => v.scope === spec.scope && v.name.toUpperCase() === spec.name.toUpperCase())) throw new SaveError('error.variableNameUsed', undefined, 'byte', { name: spec.name });
    if (variables.length >= 200_000) throw new SaveError('error.variableCount');
    const start = spec.scope === -1 ? layout.eof : section === 'builtin' ? layout.characterSeparators[spec.scope] ?? layout.characterEnds[spec.scope] : layout.characterEnds[spec.scope];
    const id = this.nextId++;
    this.added.set(id, { id, scope: spec.scope, name: spec.name, kind: spec.kind, section, dimensions: [...spec.dimensions],
      values: new Map(spec.dimensions.length ? [] : [['', spec.kind === 'int' ? 0n : '']]), start, end: start });
    this.refreshCharacters();
    return id;
  }
  deleteVariable(id: number) {
    this.requireBinary(); this.variable(id);
    if (this.added.delete(id)) { this.edits.delete(id); this.resizes.delete(id); }
    else this.deleted.add(id);
    this.refreshCharacters();
  }
  restoreVariable(id: number) {
    this.requireBinary();
    const v = this.variable(id, true);
    if (!this.deleted.has(id)) return;
    if ([...this.added.values()].some(a => a.scope === v.scope && a.name.toUpperCase() === v.name.toUpperCase())) throw new SaveError('error.variableNameUsed', undefined, 'byte', { name: v.name });
    if (this.variables().length >= 200_000) throw new SaveError('error.variableCount');
    this.deleted.delete(id); this.refreshCharacters();
  }
  private dimensions(v: Variable): number[] { return this.resizes.get(v.id) ?? v.dimensions; }
  private activeEdits(v: Variable): Map<string, Scalar> {
    const dimensions = this.dimensions(v);
    return new Map([...(this.edits.get(v.id) ?? [])].filter(([key]) => ordinal(key, dimensions) >= 0));
  }
  resize(id: number, dimensions: number[]) {
    const v = this.variable(id);
    if (this.document.format !== 'binary') throw new SaveError('error.resizeBinary');
    if (!v.dimensions.length || dimensions.length !== v.dimensions.length) throw new SaveError('error.resizeRank');
    this.validateDimensions(dimensions);
    // Keep hidden values at their coordinates for restoration; export omits them.
    if (dimensions.join() === v.dimensions.join()) this.resizes.delete(id);
    else this.resizes.set(id, [...dimensions]);
  }
  revertResize(id: number) { this.variable(id); this.resizes.delete(id); }
  reset() { this.edits.clear(); this.resizes.clear(); this.added.clear(); this.deleted.clear(); this.refreshCharacters(); }
  value(v: Variable, key: string): Scalar { return this.edits.get(v.id)?.get(key) ?? originalValue(v, key); }
  set(id: number, key: string, input: string) {
    const v = this.variable(id);
    if (ordinal(key, this.dimensions(v)) < 0 || (v.textSpans && !v.textSpans.has(key))) throw new SaveError('error.cellBounds');
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
    this.variable(id);
    const changes = this.edits.get(id);
    changes?.delete(key);
    if (!changes?.size) this.edits.delete(id);
  }
  scopeName(scope: number) {
    if (scope === -1) return '';
    const v = this.characterNames.get(scope);
    return v ? String(this.value(v, '')) : '';
  }
  private characterCsv(scope: number): CharacterLabels | undefined {
    const v = this.characterNumbers.get(scope);
    return v ? this.labels.characters.get(String(this.value(v, ''))) : undefined;
  }
  private label(v: Variable, key: string): string {
    if (v.scope >= 0 && key === '') {
      const csv = this.characterCsv(v.scope);
      if (v.name === 'NO') return characterLabel(csv);
      if (csv && Object.hasOwn(csv.fields, v.name)) return csv.fields[v.name as CharacterField] ?? '';
    }
    return this.labels.get(v.name, key);
  }
  summary(): Summary {
    const d = this.document;
    const valueChanges = [...this.edits.keys()].reduce((n, id) => n + (this.deleted.has(id) ? 0 : this.activeEdits(this.variable(id)).size), 0);
    const resizedArrays = [...this.resizes.keys()].filter(id => !this.deleted.has(id)).length;
    return { filename: d.filename, bytes: d.original.length, format: d.format, encoding: d.encoding, formatVersion: d.formatVersion,
      fileType: d.fileType, gameCode: String(d.gameCode), gameVersion: String(d.gameVersion), description: d.description,
      characters: Array.from({ length: d.characterCount }, (_, scope) => {
        const v = this.characterNumbers.get(scope);
        return { scope, name: this.scopeName(scope), no: v ? String(this.value(v, '')) : '—', csv: this.characterCsv(scope) };
      }),
      variables: this.variables(true).map(v => ({ id: v.id, scope: v.scope, name: v.name, kind: v.kind, section: v.section,
        added: this.added.has(v.id), deleted: this.deleted.has(v.id), dimensions: this.dimensions(v), originalDimensions: v.dimensions,
        count: v.textSpans ? v.textSpans.size : cellCount(this.dimensions(v)) })),
      changes: valueChanges + resizedArrays + this.added.size + this.deleted.size, valueChanges, resizedArrays,
      addedVariables: this.added.size, deletedVariables: this.deleted.size,
      labels: this.labels.count, characterLabels: this.labels.characters.size, renames: this.labels.renames.size };
  }
  query(query: Query): Page {
    const expanded = this.labels.expand(query.search.trim());
    const search = expanded.trim().toLowerCase();
    const reference = /^([^\d:,\s][^:,\s]*):(\d+(?::\d+){0,2})$/.exec(search);
    const groups: { variable: Variable; dimensions: number[]; keys?: string[]; headers: Row['type'][]; count: number }[] = [];
    let total = 0;
    for (const v of this.variables(query.changedOnly)) {
      if (query.scope !== 'all' && v.scope !== query.scope) continue;
      if (query.variableId !== undefined && v.id !== query.variableId) continue;
      if (reference && v.name.toLowerCase() !== reference[1]) continue;
      const dimensions = this.dimensions(v);
      const deleted = this.deleted.has(v.id);
      const headers: Row['type'][] = [];
      if (query.changedOnly && !reference && (!search || v.name.toLowerCase().includes(search))) {
        if (deleted) headers.push('delete');
        else {
          if (this.added.has(v.id)) headers.push('add');
          if (this.resizes.has(v.id)) headers.push('resize');
        }
      }
      let keys: string[] | undefined;
      if (query.changedOnly) keys = deleted ? [] : [...this.activeEdits(v).keys()];
      else if (v.textSpans) keys = [...v.textSpans.keys()];
      if (reference) {
        const key = reference[2].replace(/:/g, ',');
        keys = keys ? keys.filter(k => k === key) : ordinal(key, dimensions) >= 0 ? [key] : [];
      } else if (search && !v.name.toLowerCase().includes(search)) {
        const matches = (key: string) => key === search.replace(/:/g, ',') || this.label(v, key).toLowerCase().includes(search) || this.labels.matches(v.name, key, search);
        if (keys) keys = keys.filter(matches);
        else {
          const candidates = new Set<string>();
          const index = search.replace(/:/g, ',');
          if (ordinal(index, dimensions) >= 0) candidates.add(index);
          if (!dimensions.length && matches('')) candidates.add('');
          for (const key of this.labels.matchingKeys(v.name, search)) if (ordinal(key, dimensions) >= 0) candidates.add(key);
          keys = [...candidates];
        }
      }
      keys?.sort((a, b) => ordinal(a, dimensions) - ordinal(b, dimensions));
      const count = (keys ? keys.length : cellCount(dimensions)) + headers.length;
      if (count) { groups.push({ variable: v, dimensions, keys, headers, count }); total += count; }
    }
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.max(0, Math.min(pages - 1, Math.floor(query.page) || 0));
    let skip = page * PAGE_SIZE;
    const rows: Row[] = [];
    for (const group of groups) {
      if (skip >= group.count) { skip -= group.count; continue; }
      const v = group.variable;
      for (let i = skip; i < group.headers.length && rows.length < PAGE_SIZE; i++) rows.push({ type: group.headers[i], variableId: v.id, key: '', name: v.name, scope: v.scope, scopeName: this.scopeName(v.scope),
        kind: v.kind, section: v.section, dimensions: group.dimensions, label: '', value: group.dimensions.join(' × '), original: v.dimensions.join(' × '), changed: true });
      for (let i = Math.max(0, skip - group.headers.length); i < group.count - group.headers.length && rows.length < PAGE_SIZE; i++) {
        const key = group.keys?.[i] ?? coordinates(i, group.dimensions);
        rows.push({ type: 'value', variableId: v.id, key, name: v.name, scope: v.scope, scopeName: this.scopeName(v.scope),
          kind: v.kind, section: v.section, dimensions: group.dimensions, label: this.label(v, key),
          value: String(this.value(v, key)), original: String(originalValue(v, key)), changed: this.edits.get(v.id)?.has(key) ?? false });
      }
      skip = 0;
      if (rows.length >= PAGE_SIZE) break;
    }
    return { rows, total, page, pages, expandedSearch: expanded !== query.search.trim() ? expanded : undefined };
  }
  serialize(): Uint8Array {
    const patches = [];
    for (const v of this.document.variables) {
      const id = v.id;
      if (this.deleted.has(id)) { patches.push({ start: v.start, end: v.end, bytes: new Uint8Array() }); continue; }
      const changes = this.activeEdits(v);
      if (!changes.size && !this.resizes.has(id)) continue;
      if (this.document.format === 'binary') patches.push({ start: v.start, end: v.end, bytes: writeVariable({ ...v, dimensions: this.dimensions(v) }, changes) });
      else for (const [key, value] of changes) {
        const span = v.textSpans!.get(key)!;
        patches.push({ ...span, bytes: encodeText(String(value), this.document.encoding as 'utf-8' | 'shift_jis') });
      }
    }
    const expected = this.variables();
    const insertions = new Map<number, Uint8Array[]>(), separated = new Set<number>();
    for (const v of expected.filter(v => this.added.has(v.id))) {
      const chunks = insertions.get(v.start) ?? [];
      if (v.section === 'user' && this.document.binaryLayout!.characterSeparators[v.scope] === undefined && !separated.has(v.scope)) {
        chunks.push(new Uint8Array([0xfd])); separated.add(v.scope);
      }
      chunks.push(writeVariable({ ...v, dimensions: this.dimensions(v) }, this.activeEdits(v)));
      insertions.set(v.start, chunks);
    }
    for (const [start, chunks] of insertions) {
      const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
      if (length > MAX_FILE_BYTES) throw new SaveError('error.exportSize');
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      patches.push({ start, end: start, bytes });
    }
    const result = patchBytes(this.document.original, patches);
    // Validate the exact download, including shape and all logical values. No dense expansion.
    const check = parseSave(result, this.document.filename, this.document.format === 'text' ? this.document.encoding as 'utf-8' | 'shift_jis' : 'auto');
    if (check.variables.length !== expected.length || check.characterCount !== this.document.characterCount || check.fileType !== this.document.fileType
      || check.gameCode !== this.document.gameCode || check.gameVersion !== this.document.gameVersion || check.description !== this.document.description) throw new SaveError('error.exportValidation');
    for (const [i, before] of expected.entries()) {
      const after = check.variables[i];
      const dimensions = this.dimensions(before);
      if (before.name !== after.name || before.scope !== after.scope || before.kind !== after.kind || before.section !== after.section || dimensions.join() !== after.dimensions.join()) throw new SaveError('error.exportStructure');
      const keys = new Set([...before.values.keys(), ...after.values.keys(), ...(this.edits.get(before.id)?.keys() ?? [])]);
      for (const key of keys) if (ordinal(key, dimensions) >= 0 && this.value(before, key) !== originalValue(after, key)) throw new SaveError('error.exportValues');
    }
    return result;
  }
}
