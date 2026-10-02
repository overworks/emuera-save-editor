import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { NewVariable } from '../src/core/editor';
import { MAX_INT, MIN_INT, cellCount } from '../src/core/model';
import { encodeText, decodeText } from '../src/core/encoding';
import { textCharacterFixture } from './text-character-fixture';

const query = { scope: 'all' as const, search: '', changedOnly: false, page: 0 };
const spec: NewVariable = { scope: -1, name: 'NEW_VALUE', kind: 'int', dimensions: [] };
const find = (e: Editor, scope: number, name: string) => e.summary().variables.find(v => v.scope === scope && v.name === name)!;

describe('text extension variable structure', () => {
  for (const version of [1700, 1708, 1729, 1803, 1808]) it(`adds every supported type and rank to the correct groups in ${version}`, () => {
    const bytes = textCharacterFixture({ version, newline: 'mixed', trailingNewline: false });
    const e = new Editor(parseSave(bytes, 'normal.sav'));
    const additions: { id: number; variable: NewVariable; value: string }[] = [];
    for (const scope of [-1, 0, 1]) for (const section of ['builtin', 'user'] as const) {
      if (section === 'user' && (scope >= 0 || version < 1808)) continue;
      for (const kind of ['int', 'string'] as const) {
        const max = kind === 'string' ? 1 : scope >= 0 ? version < 1803 ? 1 : 2 : version < 1708 ? 1 : version < 1729 ? 2 : 3;
        for (let rank = section === 'user' ? 1 : 0; rank <= max; rank++) {
          const variable = { scope, section, kind, name: `追加_${section}_${kind}_${rank}`, dimensions: Array(rank).fill(2) };
          const id = e.addVariable(variable), value = kind === 'int' ? String(MAX_INT) : '新しい値:漢字';
          e.set(id, Array(rank).fill(1).join(','), value); additions.push({ id, variable, value });
        }
      }
    }
    const output = e.serialize(), saved = parseSave(output, 'normal.sav');
    expect(saved.formatVersion).toBe(version); expect(output.at(-1)).toBe(bytes.at(-1));
    for (const { variable: v, value } of additions) {
      const after = saved.variables.find(a => a.scope === v.scope && a.name === v.name)!;
      expect(after).toMatchObject({ ...v, textSection: 'extended' });
      expect(after.textSpans!.size).toBe(cellCount(v.dimensions));
      expect(after.values.get(Array(v.dimensions.length).fill(1).join(','))).toBe(v.kind === 'int' ? MAX_INT : value);
      if (v.dimensions.length) expect(after.values.get(Array(v.dimensions.length).fill(0).join(','))).toBe(v.kind === 'int' ? 0n : '');
    }
    for (const v of e.document.variables) {
      const after = saved.variables.find(a => a.scope === v.scope && a.name === v.name)!;
      expect(output.slice(after.start, after.end)).toEqual(bytes.slice(v.start, v.end));
    }
    e.reset(); expect(e.serialize()).toEqual(bytes);
  });

  for (const encoding of ['utf-8', 'shift_jis'] as const) it(`adds and deletes global arrays with ${encoding} names and exact individual undo`, () => {
    const bytes = new Uint8Array(readFileSync(`tests/fixtures/global-${encoding === 'utf-8' ? 'text' : 'sjis'}.sav`));
    const e = new Editor(parseSave(bytes, 'global.sav', encoding)), notes = find(e, -1, 'NOTES');
    e.set(notes.id, '1', '変更:保存'); e.deleteVariable(notes.id);
    expect(e.summary()).toMatchObject({ valueChanges: 0, deletedVariables: 1, changes: 1 });
    expect(() => e.set(notes.id, '1', '失敗')).toThrow('error.variableMissing');
    expect(e.query({ ...query, variableId: notes.id }).total).toBe(0);
    const added = e.addVariable({ ...spec, name: 'NOTES', kind: 'string', dimensions: [3] });
    e.set(added, '2', '末尾');
    expect(() => e.restoreVariable(notes.id)).toThrow('error.variableNameUsed');
    const empty = e.addVariable({ ...spec, name: '空配列', dimensions: [0, 0, 0] });
    const saved = parseSave(e.serialize(), 'global.sav', encoding);
    expect(saved.variables.find(v => v.name === 'NOTES')!.values).toEqual(new Map([['0', ''], ['1', ''], ['2', '末尾']]));
    expect(saved.variables.find(v => v.name === '空配列')!.dimensions).toEqual([0, 0, 0]);
    e.deleteVariable(added); e.deleteVariable(empty); e.restoreVariable(notes.id);
    expect(e.query({ ...query, variableId: notes.id }).rows[1]).toMatchObject({ value: '変更:保存' });
    e.revert(notes.id, '1'); expect(e.serialize()).toEqual(bytes);
    for (const v of e.document.variables.filter(v => v.textSection === 'extended')) e.deleteVariable(v.id);
    expect(parseSave(e.serialize(), 'global.sav', encoding).variables.map(v => v.name)).toEqual(['GLOBAL', 'GLOBALS']);
    for (const v of e.document.variables.filter(v => v.textSection === 'extended')) e.restoreVariable(v.id);
    expect(e.serialize()).toEqual(bytes);
    expect(e.addVariable({ ...spec, dimensions: [1] })).toBeGreaterThan(empty);
  });

  it('snapshots added/deleted records, edits copies independently and retains hidden source edits', () => {
    const bytes = textCharacterFixture({ newline: 'mixed', trailingNewline: false });
    const e = new Editor(parseSave(bytes, 'copies.sav')), nickname = find(e, 0, 'NICKNAME');
    e.set(nickname.id, '', '保存した別名'); e.deleteVariable(nickname.id);
    const added = e.addVariable({ ...spec, scope: 0, name: '新しい配列', dimensions: [2, 3] });
    e.set(added, '1,2', String(MIN_INT));
    const copy = e.cloneCharacter(0);
    expect(find(e, copy, 'NICKNAME')).toBeUndefined();
    e.restoreVariable(nickname.id); e.set(added, '1,2', '17');
    const copied = find(e, copy, '新しい配列');
    expect(e.query({ ...query, variableId: copied.id, search: '新しい配列:1:2' }).rows[0]).toMatchObject({ value: String(MIN_INT) });
    e.deleteVariable(copied.id); e.restoreVariable(copied.id);
    const extra = e.addVariable({ ...spec, scope: copy, name: 'COPY_NOTE', kind: 'string', dimensions: [] });
    e.set(extra, '', '複製だけ');
    const second = e.cloneCharacter(copy); e.deleteCharacter(copy); e.deleteCharacter(0);
    const saved = parseSave(e.serialize(), 'copies.sav');
    expect(saved.variables.find(v => v.scope === 2 && v.name === 'COPY_NOTE')?.values.get('')).toBe('複製だけ');
    expect(saved.variables.find(v => v.scope === 2 && v.name === '新しい配列')?.values.get('1,2')).toBe(MIN_INT);
    expect(saved.variables.some(v => v.scope === 2 && v.name === 'NICKNAME')).toBe(false);
    e.restoreCharacter(0); e.deleteCharacter(second); e.deleteVariable(added); e.revert(nickname.id, '');
    expect(e.serialize()).toEqual(bytes);
  });

  it('preserves untouched ragged cells, empty names and mixed line endings while removing every extension record', () => {
    const bytes = textCharacterFixture({ newline: 'mixed', trailingNewline: false });
    const e = new Editor(parseSave(bytes, 'mixed.sav'));
    const ragged = find(e, 0, 'C2D'); e.set(ragged.id, '3,2', String(MIN_INT));
    expect(() => e.set(ragged.id, '1,0', '12')).toThrow('error.cellBounds');
    for (const v of e.document.variables.filter(v => v.textSection === 'extended')) e.deleteVariable(v.id);
    const saved = parseSave(e.serialize(), 'mixed.sav');
    expect(saved.variables.every(v => v.textSection === 'base')).toBe(true);
    expect(saved.characterCount).toBe(3); expect(saved.formatVersion).toBe(1808);
    for (const v of e.document.variables.filter(v => v.textSection === 'extended')) e.restoreVariable(v.id);
    e.revert(ragged.id, '3,2'); expect(e.serialize()).toEqual(bytes);
  });

  it('paginates explicit new cells and structural changes and cancels additions with their edits', () => {
    const e = new Editor(parseSave(textCharacterFixture(), 'normal.sav'));
    const id = e.addVariable({ ...spec, dimensions: [51] });
    for (let i = 0; i < 51; i++) e.set(id, String(i), String(MAX_INT));
    expect(e.query({ ...query, variableId: id })).toMatchObject({ total: 51, pages: 2 });
    expect(e.query({ ...query, changedOnly: true })).toMatchObject({ total: 52, pages: 2 });
    expect(e.query({ ...query, changedOnly: true }).rows).toHaveLength(50);
    expect(() => e.resize(id, [52])).toThrow('error.resizeBinary');
    e.deleteVariable(id); expect(e.summary().changes).toBe(0);
    expect(() => e.set(id, '0', '0')).toThrow('error.variableMissing');
    expect(e.serialize()).toEqual(e.document.original);
  });

  it('rejects unavailable groups, base edits, reserved/unencodable names and resource overflows atomically', () => {
    const e = new Editor(parseSave(textCharacterFixture({ encoding: 'shift_jis' }), 'normal.sav', 'shift_jis'));
    const invalid: NewVariable[] = [
      { ...spec, name: '__FINISHED' }, { ...spec, name: '__EMU_SEPARATOR__' }, { ...spec, name: '__EMUERA_TEST' },
      { ...spec, name: '한글' }, { ...spec, name: 'money' }, { ...spec, name: 'A:B' },
      { ...spec, dimensions: [0, 4] }, { ...spec, dimensions: [-1] }, { ...spec, dimensions: [1.5] },
      { ...spec, section: 'user' }, { ...spec, scope: 0, section: 'user', dimensions: [1] },
      { ...spec, scope: 0, dimensions: [1, 1, 1] }, { ...spec, kind: 'string', dimensions: [2, 2] },
      { ...spec, dimensions: [1_000_001] }, { ...spec, dimensions: [333_333, 1, 1] },
    ];
    for (const v of invalid) expect(() => e.addVariable(v)).toThrow();
    for (const v of e.document.variables.filter(v => v.textSection === 'base')) {
      expect(() => e.deleteVariable(v.id)).toThrow('error.textBaseVariable');
      expect(() => e.restoreVariable(v.id)).toThrow('error.textBaseVariable');
    }
    expect(e.summary().changes).toBe(0); expect(e.serialize()).toEqual(e.document.original);
    const legacy = new Editor(parseSave(textCharacterFixture({ version: 0 }), 'old.sav'));
    expect(() => legacy.addVariable(spec)).toThrow('error.textVariableType');
    const old = new Editor(parseSave(textCharacterFixture({ version: 1700 }), 'old.sav'));
    expect(() => old.addVariable({ ...spec, dimensions: [2, 2] })).toThrow('error.textVariableType');
    expect(() => old.addVariable({ ...spec, dimensions: [1], section: 'user' })).toThrow('error.textVariableType');
    const id = e.addVariable({ ...spec, kind: 'string' });
    for (const value of ['\n', '\r', '\0', '__FINISHED', '__EMUERA_1808_STRAT__', '😀']) expect(() => e.set(id, '', value)).toThrow();
    e.deleteVariable(id); expect(e.serialize()).toEqual(e.document.original);
  });

  it('keeps a manual CP932 override through additions and copied group relocation', () => {
    const ambiguous = decodeText(new Uint8Array([0xc3, 0xa9]), 'shift_jis');
    const raw = decodeText(textCharacterFixture({ bom: false }), 'utf-8').replace(/[^\x00-\x7f]/g, 'x').replace(/NICKNAME:[^\r\n]*/, 'NICKNAME:' + ambiguous);
    const bytes = encodeText(raw, 'shift_jis');
    expect(parseSave(bytes, 'ambiguous.sav').encoding).toBe('utf-8');
    const e = new Editor(parseSave(bytes, 'ambiguous.sav', 'shift_jis'));
    const copy = e.cloneCharacter(0), id = e.addVariable({ ...spec, scope: copy, name: 'EXTRA', kind: 'string', dimensions: [2] });
    e.set(id, '1', '漢字');
    const saved = parseSave(e.serialize(), 'ambiguous.sav', 'shift_jis');
    expect(saved.variables.find(v => v.scope === 3 && v.name === 'NICKNAME')?.values.get('')).toBe(ambiguous);
    expect(saved.variables.find(v => v.scope === 3 && v.name === 'EXTRA')?.values.get('1')).toBe('漢字');
    e.reset(); expect(e.serialize()).toEqual(bytes);
  });
});
