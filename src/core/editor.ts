import { MAGIC, parseBinary, writeVariable } from './binary';
import { parseText, FINISH, SEPARATOR } from './text';
import { encodeText } from './encoding';
import { Labels, characterLabel } from './labels';
import type { CharacterField, CharacterLabels } from './labels';
import { MAX_ARRAY_CELLS, MAX_FILE_BYTES, MAX_STORED_CELLS, SaveError, cellCount, coordinates, integer, ordinal, originalValue, patchBytes } from './model';
import type { BinarySection, EncodingOption, SaveDocument, Scalar, Variable } from './model';

export function parseSave(bytes: Uint8Array, filename: string, encoding: EncodingOption = 'auto'): SaveDocument {
  if (!bytes.length) throw new SaveError('error.emptyFile');
  if (bytes.length > MAX_FILE_BYTES) throw new SaveError('error.fileSize');
  return MAGIC.every((b, i) => bytes[i] === b) ? parseBinary(bytes, filename) : parseText(bytes, filename, encoding);
}
export interface VariableRow {
  type: 'value' | 'resize' | 'add' | 'delete';
  variableId: number; key: string; name: string; scope: number; scopeName: string; kind: 'int' | 'string';
  dimensions: number[]; label: string; value: string; original: string; changed: boolean; automatic?: boolean; section?: BinarySection;
}
export interface CharacterSummary {
  scope: number; index: number | null; originalIndex?: number; name: string; no: string; csv?: CharacterLabels;
  added: boolean; deleted: boolean; variables: number;
}
export interface CharacterRow { type: 'cloneCharacter' | 'deleteCharacter'; character: CharacterSummary }
export type Row = VariableRow | CharacterRow;
export interface ReferenceChange { name: string; before: string; after: string }
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
  characters: CharacterSummary[];
  variables: VariableSummary[];
  changes: number; valueChanges: number; resizedArrays: number; addedVariables: number; deletedVariables: number;
  addedCharacters: number; deletedCharacters: number;
  labels: number; characterLabels: number; renames: number;
}
const PAGE_SIZE = 50;
const CHARACTER_REFERENCES = new Set(['TARGET', 'ASSI', 'MASTER', 'PLAYER']);
interface CharacterCopy { bytes: Uint8Array; separator?: number; variables: Variable[] }
export class Editor {
  readonly edits = new Map<number, Map<string, Scalar>>();
  private readonly resizes = new Map<number, number[]>();
  private readonly added = new Map<number, Variable>();
  private readonly deleted = new Set<number>();
  private nextId: number;
  private readonly copies = new Map<number, CharacterCopy>();
  private readonly copiedVariables = new Map<number, Variable>();
  private readonly deletedCharacters = new Set<number>();
  private nextScope: number;
  private readonly characterIndices = new Map<number, number>();
  private readonly characterAtIndex = new Map<string, number>();
  // A number is a stable character identity; a bigint is an unbound literal (e.g. -1).
  private readonly referenceTargets = new Map<number, number | bigint>();
  private readonly referenceEdits = new Map<number, number | bigint>();
  readonly labels = new Labels();
  private readonly characterNames = new Map<number, Variable>();
  private readonly characterNumbers = new Map<number, Variable>();
  constructor(readonly document: SaveDocument) {
    this.nextId = document.variables.length;
    this.nextScope = document.characterCount;
    this.reindexCharacters();
    for (const v of document.variables) if (this.isReference(v, '0')) this.referenceTargets.set(v.id, this.bindReference(originalValue(v, '0') as bigint));
    this.refreshCharacters();
  }
  private refreshCharacters() {
    this.characterNames.clear(); this.characterNumbers.clear();
    for (const v of this.variables(false, true)) {
      if (v.scope < 0) continue;
      if (v.name === 'NAME') this.characterNames.set(v.scope, v);
      if (v.name === 'NO') this.characterNumbers.set(v.scope, v);
    }
  }
  private variables(includeDeleted = false, includeDeletedCharacters = false): Variable[] {
    return [...this.document.variables, ...this.copiedVariables.values(), ...this.added.values()]
      .filter(v => (includeDeleted || !this.deleted.has(v.id)) && (includeDeletedCharacters || !this.deletedCharacters.has(v.scope)))
      .sort((a, b) => (this.document.format === 'binary' && a.scope !== b.scope ? a.scope === -1 ? 1 : b.scope === -1 ? -1 : a.scope - b.scope : 0)
        || a.start - b.start || Number(a.section === 'user') - Number(b.section === 'user') || a.id - b.id);
  }
  private variable(id: number, includeDeleted = false): Variable {
    const v = this.document.variables[id] ?? this.copiedVariables.get(id) ?? this.added.get(id);
    if (!v || this.deletedCharacters.has(v.scope) || (!includeDeleted && this.deleted.has(id))) throw new SaveError('error.variableMissing');
    return v;
  }
  private requireBinary() {
    if (this.document.format !== 'binary' || !this.document.binaryLayout) throw new SaveError('error.structureBinary');
    return this.document.binaryLayout;
  }
  private characterScopes(): number[] { return [...Array.from({ length: this.document.characterCount }, (_, i) => i), ...this.copies.keys()]; }
  private reindexCharacters() {
    this.characterIndices.clear(); this.characterAtIndex.clear();
    for (const scope of this.characterScopes()) if (!this.deletedCharacters.has(scope)) {
      const index = this.characterIndices.size;
      this.characterIndices.set(scope, index); this.characterAtIndex.set(String(index), scope);
    }
  }
  private requireCharacter(scope: number, includeDeleted = false) {
    const layout = this.requireBinary();
    if (this.document.fileType !== 'normal') throw new SaveError('error.characterBinary');
    if (!Number.isInteger(scope) || scope < 0 || (scope >= this.document.characterCount && !this.copies.has(scope))
      || (!includeDeleted && this.deletedCharacters.has(scope))) throw new SaveError('error.characterMissing');
    return layout;
  }
  private isReference(v: Variable, key: string): boolean {
    return this.document.format === 'binary' && this.document.fileType === 'normal' && v.scope === -1 && v.kind === 'int'
      && v.dimensions.length === 1 && key === '0' && CHARACTER_REFERENCES.has(v.name.toUpperCase());
  }
  private bindReference(value: bigint): number | bigint { return this.characterAtIndex.get(String(value)) ?? value; }
  private referenceValue(v: Variable, indices = this.characterIndices): bigint {
    const target = this.referenceEdits.get(v.id) ?? this.referenceTargets.get(v.id) ?? originalValue(v, '0') as bigint;
    return typeof target === 'bigint' ? target : BigInt(indices.get(target) ?? -1);
  }
  cloneCharacter(scope: number): number {
    this.requireCharacter(scope);
    if (this.characterIndices.size >= 100_000) throw new SaveError('error.characterCount');
    const variables = this.variables();
    if (variables.length + variables.filter(v => v.scope === scope).length > 200_000) throw new SaveError('error.variableCount');
    // Snapshot the current export, including edits, bounds and variable membership, independently of later source edits.
    const bytes = this.serialize(), snapshot = parseSave(bytes, this.document.filename), layout = snapshot.binaryLayout!;
    const index = this.characterIndices.get(scope)!, start = layout.characterStarts[index], end = layout.characterEnds[index] + 1;
    const source = snapshot.variables.filter(v => v.scope === index);
    if (bytes.length + end - start > MAX_FILE_BYTES) throw new SaveError('error.exportSize');
    if ([...snapshot.variables, ...source].reduce((n, v) => n + v.values.size, 0) > MAX_STORED_CELLS) throw new SaveError('error.storedCells');
    const nextScope = this.nextScope++;
    const copies = source.map(v => ({ ...v, id: this.nextId++, scope: nextScope, start: v.start - start, end: v.end - start }));
    for (const v of copies) this.copiedVariables.set(v.id, v);
    const separator = layout.characterSeparators[index];
    this.copies.set(nextScope, { bytes: bytes.slice(start, end), separator: separator === undefined ? undefined : separator - start, variables: copies });
    this.reindexCharacters(); this.refreshCharacters();
    return nextScope;
  }
  previewDeleteCharacter(scope: number): ReferenceChange[] {
    this.requireCharacter(scope);
    const next = new Map<number, number>();
    for (const id of this.characterIndices.keys()) if (id !== scope) next.set(id, next.size);
    return this.variables().filter(v => this.isReference(v, '0') && ordinal('0', this.dimensions(v)) >= 0)
      .map(v => ({ name: v.name + ':0', before: String(this.referenceValue(v)), after: String(this.referenceValue(v, next)) })).filter(v => v.before !== v.after);
  }
  deleteCharacter(scope: number) {
    this.requireCharacter(scope);
    if (this.copies.has(scope)) {
      for (const v of this.variables(true).filter(v => v.scope === scope)) {
        this.copiedVariables.delete(v.id); this.added.delete(v.id); this.deleted.delete(v.id); this.edits.delete(v.id); this.resizes.delete(v.id);
      }
      this.copies.delete(scope);
    } else this.deletedCharacters.add(scope);
    this.reindexCharacters(); this.refreshCharacters();
  }
  restoreCharacter(scope: number) {
    this.requireCharacter(scope, true);
    if (!this.deletedCharacters.has(scope)) return;
    if (this.characterIndices.size >= 100_000) throw new SaveError('error.characterCount');
    if (this.variables().length + this.variables(false, true).filter(v => v.scope === scope).length > 200_000) throw new SaveError('error.variableCount');
    this.deletedCharacters.delete(scope); this.reindexCharacters(); this.refreshCharacters();
  }
  private validateDimensions(dimensions: number[]) {
    if (dimensions.some(n => !Number.isInteger(n) || n < 0 || n > 2147483647)
      || !Number.isSafeInteger(cellCount(dimensions)) || cellCount(dimensions) > MAX_ARRAY_CELLS) throw new SaveError('error.resizeSize');
  }
  addVariable(spec: NewVariable): number {
    const layout = this.requireBinary();
    if (!Number.isInteger(spec.scope) || spec.scope < -1 || (spec.scope >= 0 && !this.characterIndices.has(spec.scope))) throw new SaveError('error.variableScope');
    if (!/^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u.test(spec.name) || spec.name.length > 128) throw new SaveError('error.newVariableName');
    if (spec.kind !== 'int' && spec.kind !== 'string') throw new SaveError('error.variableKind');
    const section = spec.scope >= 0 ? spec.section ?? 'user' : undefined;
    if ((spec.scope === -1 && spec.section !== undefined) || (section !== undefined && section !== 'builtin' && section !== 'user')) throw new SaveError('error.variableSection');
    if (spec.dimensions.length > (spec.scope >= 0 ? 2 : 3) || (section === 'user' && !spec.dimensions.length)) throw new SaveError('error.newVariableRank');
    this.validateDimensions(spec.dimensions);
    const variables = this.variables();
    if (variables.some(v => v.scope === spec.scope && v.name.toUpperCase() === spec.name.toUpperCase())) throw new SaveError('error.variableNameUsed', undefined, 'byte', { name: spec.name });
    if (variables.length >= 200_000) throw new SaveError('error.variableCount');
    const copy = this.copies.get(spec.scope), end = copy ? copy.bytes.length - 1 : layout.characterEnds[spec.scope];
    const separator = copy ? copy.separator : layout.characterSeparators[spec.scope];
    const start = spec.scope === -1 ? layout.eof : section === 'builtin' ? separator ?? end : end;
    const id = this.nextId++;
    this.added.set(id, { id, scope: spec.scope, name: spec.name, kind: spec.kind, section, dimensions: [...spec.dimensions],
      values: new Map(spec.dimensions.length ? [] : [['', spec.kind === 'int' ? 0n : '']]), start, end: start });
    if (this.isReference(this.added.get(id)!, '0')) this.referenceTargets.set(id, this.bindReference(0n));
    this.refreshCharacters();
    return id;
  }
  deleteVariable(id: number) {
    this.requireBinary(); this.variable(id);
    if (this.added.delete(id)) { this.edits.delete(id); this.resizes.delete(id); this.referenceTargets.delete(id); this.referenceEdits.delete(id); }
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
    const changes = new Map([...(this.edits.get(v.id) ?? [])].filter(([key]) => ordinal(key, dimensions) >= 0));
    if (this.isReference(v, '0') && ordinal('0', dimensions) >= 0) {
      const value = this.referenceValue(v);
      if (value === originalValue(v, '0')) changes.delete('0'); else changes.set('0', value);
    }
    return changes;
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
  reset() {
    this.edits.clear(); this.resizes.clear(); this.added.clear(); this.deleted.clear(); this.copies.clear(); this.copiedVariables.clear(); this.deletedCharacters.clear();
    this.referenceEdits.clear();
    for (const id of this.referenceTargets.keys()) if (id >= this.document.variables.length) this.referenceTargets.delete(id);
    this.reindexCharacters(); this.refreshCharacters();
  }
  value(v: Variable, key: string): Scalar { return this.isReference(v, key) ? this.referenceValue(v) : this.edits.get(v.id)?.get(key) ?? originalValue(v, key); }
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
    if (this.isReference(v, key)) {
      const target = this.bindReference(value as bigint);
      if (target === this.referenceTargets.get(id)) { this.revert(id, key); return; }
      this.referenceEdits.set(id, target);
    } else if (value === originalValue(v, key)) { this.revert(id, key); return; }
    const changes = this.edits.get(id) ?? new Map<string, Scalar>();
    changes.set(key, value); this.edits.set(id, changes);
  }
  revert(id: number, key: string) {
    this.variable(id);
    if (key === '0') this.referenceEdits.delete(id);
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
  private characterSummaries(): CharacterSummary[] {
    const counts = new Map<number, number>();
    for (const v of this.variables(false, true)) if (v.scope >= 0) counts.set(v.scope, (counts.get(v.scope) ?? 0) + 1);
    return this.characterScopes().map(scope => {
      const v = this.characterNumbers.get(scope);
      return { scope, index: this.characterIndices.get(scope) ?? null, originalIndex: scope < this.document.characterCount ? scope : undefined,
        name: this.scopeName(scope), no: v ? String(this.value(v, '')) : '—', csv: this.characterCsv(scope),
        added: this.copies.has(scope), deleted: this.deletedCharacters.has(scope), variables: counts.get(scope) ?? 0 };
    });
  }
  summary(): Summary {
    const d = this.document;
    const variables = this.variables(), active = new Set(variables.map(v => v.id));
    const valueChanges = variables.reduce((n, v) => n + this.activeEdits(v).size, 0);
    const resizedArrays = [...this.resizes.keys()].filter(id => active.has(id)).length;
    const addedVariables = [...this.added.keys()].filter(id => active.has(id)).length;
    const deletedVariables = this.variables(true).filter(v => this.deleted.has(v.id)).length;
    return { filename: d.filename, bytes: d.original.length, format: d.format, encoding: d.encoding, formatVersion: d.formatVersion,
      fileType: d.fileType, gameCode: String(d.gameCode), gameVersion: String(d.gameVersion), description: d.description,
      characters: this.characterSummaries(),
      variables: this.variables(true).map(v => ({ id: v.id, scope: v.scope, name: v.name, kind: v.kind, section: v.section,
        added: this.added.has(v.id), deleted: this.deleted.has(v.id), dimensions: this.dimensions(v), originalDimensions: v.dimensions,
        count: v.textSpans ? v.textSpans.size : cellCount(this.dimensions(v)) })),
      changes: valueChanges + resizedArrays + addedVariables + deletedVariables + this.copies.size + this.deletedCharacters.size, valueChanges, resizedArrays,
      addedVariables, deletedVariables, addedCharacters: this.copies.size, deletedCharacters: this.deletedCharacters.size,
      labels: this.labels.count, characterLabels: this.labels.characters.size, renames: this.labels.renames.size };
  }
  query(query: Query): Page {
    const expanded = this.labels.expand(query.search.trim());
    const search = expanded.trim().toLowerCase();
    const reference = /^([^\d:,\s][^:,\s]*):(\d+(?::\d+){0,2})$/.exec(search);
    const groups: { variable: Variable; dimensions: number[]; keys?: string[]; headers: VariableRow['type'][]; count: number }[] = [];
    const characterRows: CharacterRow[] = query.changedOnly && query.variableId === undefined ? this.characterSummaries()
      .filter(c => (c.added || c.deleted) && (query.scope === 'all' || query.scope === c.scope)
        && (!search || c.name.toLowerCase().includes(search) || c.no === search || String(c.index ?? c.originalIndex) === search))
      .map(character => ({ type: character.deleted ? 'deleteCharacter' : 'cloneCharacter', character })) : [];
    let total = characterRows.length;
    for (const v of this.variables(query.changedOnly)) {
      if (query.scope !== 'all' && v.scope !== query.scope) continue;
      if (query.variableId !== undefined && v.id !== query.variableId) continue;
      if (reference && v.name.toLowerCase() !== reference[1]) continue;
      const dimensions = this.dimensions(v);
      const deleted = this.deleted.has(v.id);
      const headers: VariableRow['type'][] = [];
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
    const rows: Row[] = characterRows.slice(skip, skip + PAGE_SIZE);
    skip = Math.max(0, skip - characterRows.length);
    for (const group of groups) {
      if (skip >= group.count) { skip -= group.count; continue; }
      const v = group.variable;
      for (let i = skip; i < group.headers.length && rows.length < PAGE_SIZE; i++) rows.push({ type: group.headers[i], variableId: v.id, key: '', name: v.name, scope: v.scope, scopeName: this.scopeName(v.scope),
        kind: v.kind, section: v.section, dimensions: group.dimensions, label: '', value: group.dimensions.join(' × '), original: v.dimensions.join(' × '), changed: true });
      for (let i = Math.max(0, skip - group.headers.length); i < group.count - group.headers.length && rows.length < PAGE_SIZE; i++) {
        const key = group.keys?.[i] ?? coordinates(i, group.dimensions);
        const changed = this.isReference(v, key) ? this.value(v, key) !== originalValue(v, key) : this.edits.get(v.id)?.has(key) ?? false;
        rows.push({ type: 'value', variableId: v.id, key, name: v.name, scope: v.scope, scopeName: this.scopeName(v.scope),
          kind: v.kind, section: v.section, dimensions: group.dimensions, label: this.label(v, key),
          value: String(this.value(v, key)), original: String(originalValue(v, key)), changed,
          automatic: changed && this.isReference(v, key) && !this.referenceEdits.has(v.id) });
      }
      skip = 0;
      if (rows.length >= PAGE_SIZE) break;
    }
    return { rows, total, page, pages, expandedSearch: expanded !== query.search.trim() ? expanded : undefined };
  }
  serialize(): Uint8Array {
    const patches: { start: number; end: number; bytes: Uint8Array }[] = [];
    const expected = this.variables(), layout = this.document.binaryLayout;
    const copyAdditions = new Map<number, Variable[]>();
    for (const v of expected) if (this.added.has(v.id) && this.copies.has(v.scope)) {
      const group = copyAdditions.get(v.scope) ?? []; group.push(v); copyAdditions.set(v.scope, group);
    }
    const recordPatches = (originals: Variable[], additions: Variable[], separators: (scope: number) => number | undefined) => {
      const changesToBytes: typeof patches = [];
      for (const v of originals) {
        const id = v.id;
        if (this.deleted.has(id)) { changesToBytes.push({ start: v.start, end: v.end, bytes: new Uint8Array() }); continue; }
        const changes = this.activeEdits(v);
        if (!changes.size && !this.resizes.has(id)) continue;
        if (this.document.format === 'binary') changesToBytes.push({ start: v.start, end: v.end, bytes: writeVariable({ ...v, dimensions: this.dimensions(v) }, changes) });
        else for (const [key, value] of changes) {
          const span = v.textSpans!.get(key)!;
          changesToBytes.push({ ...span, bytes: encodeText(String(value), this.document.encoding as 'utf-8' | 'shift_jis') });
        }
      }
      const insertions = new Map<number, Uint8Array[]>(), separated = new Set<number>();
      for (const v of additions) {
        const chunks = insertions.get(v.start) ?? [];
        if (v.section === 'user' && separators(v.scope) === undefined && !separated.has(v.scope)) {
          chunks.push(new Uint8Array([0xfd])); separated.add(v.scope);
        }
        chunks.push(writeVariable({ ...v, dimensions: this.dimensions(v) }, this.activeEdits(v)));
        insertions.set(v.start, chunks);
      }
      for (const [start, chunks] of insertions) changesToBytes.push({ start, end: start, bytes: concat(chunks) });
      return changesToBytes;
    };
    const originalPatches = recordPatches(this.document.variables.filter(v => !this.deletedCharacters.has(v.scope)),
      expected.filter(v => this.added.has(v.id) && !this.copies.has(v.scope)), scope => layout?.characterSeparators[scope]);
    // Clones must precede shared/global insertions even when the shared section was empty.
    if (layout && (this.copies.size || this.deletedCharacters.size)) {
      const count = new Uint8Array(8); new DataView(count.buffer).setBigInt64(0, BigInt(this.characterIndices.size), true);
      patches.push({ start: layout.characterCountOffset!, end: layout.characterCountOffset! + 8, bytes: count });
      for (const scope of this.deletedCharacters) patches.push({ start: layout.characterStarts[scope], end: layout.characterEnds[scope] + 1, bytes: new Uint8Array() });
      const chunks: Uint8Array[] = [];
      for (const [scope, copy] of this.copies) chunks.push(patchBytes(copy.bytes,
        recordPatches(copy.variables, copyAdditions.get(scope) ?? [], () => copy.separator)));
      if (chunks.length) patches.push({ start: layout.sharedStart, end: layout.sharedStart, bytes: concat(chunks) });
    }
    patches.push(...originalPatches);
    const result = patchBytes(this.document.original, patches);
    // Validate the exact download, including shape and all logical values. No dense expansion.
    const check = parseSave(result, this.document.filename, this.document.format === 'text' ? this.document.encoding as 'utf-8' | 'shift_jis' : 'auto');
    if (check.variables.length !== expected.length || check.characterCount !== this.characterIndices.size || check.fileType !== this.document.fileType
      || check.gameCode !== this.document.gameCode || check.gameVersion !== this.document.gameVersion || check.description !== this.document.description) throw new SaveError('error.exportValidation');
    for (const [i, before] of expected.entries()) {
      const after = check.variables[i];
      const dimensions = this.dimensions(before);
      const scope = before.scope < 0 ? -1 : this.characterIndices.get(before.scope);
      if (before.name !== after.name || scope !== after.scope || before.kind !== after.kind || before.section !== after.section || dimensions.join() !== after.dimensions.join()) throw new SaveError('error.exportStructure');
      const keys = new Set([...before.values.keys(), ...after.values.keys(), ...this.activeEdits(before).keys()]);
      for (const key of keys) if (ordinal(key, dimensions) >= 0 && this.value(before, key) !== originalValue(after, key)) throw new SaveError('error.exportValues');
    }
    return result;
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
  if (length > MAX_FILE_BYTES) throw new SaveError('error.exportSize');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
