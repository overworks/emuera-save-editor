import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { NewVariable } from '../src/core/editor';
import { BinaryWriter, MAGIC } from '../src/core/binary';
import { MAX_INT, MIN_INT, originalValue } from '../src/core/model';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.sav`));
const open = (name = 'normal-binary') => new Editor(parseSave(fixture(name), name + '.sav'));
const query = { scope: 'all' as const, search: '', changedOnly: false, page: 0 };
const spec: NewVariable = { scope: -1, name: 'NEW_VALUE', kind: 'int', dimensions: [] };

describe('binary variable structure', () => {
  for (const file of ['normal-binary', 'global-binary']) {
    it(`${file}: adds both value types at every supported rank without rewriting original variables`, () => {
      const e = open(file), original = e.document.variables.map(v => ({ ...v, values: new Map(v.values) }));
      for (const kind of ['int', 'string'] as const) for (const rank of [0, 1, 2, 3]) {
        const dimensions = Array(rank).fill(2), name = `追加_${kind}_${rank}`;
        const id = e.addVariable({ ...spec, kind, name, dimensions });
        dimensions.fill(99);
        const key = Array(rank).fill(1).join(',');
        e.set(id, key, kind === 'int' ? String(MAX_INT) : '새 값😀\n文字');
        expect(e.query({ ...query, variableId: id }).rows.find(row => row.key === key)?.value).toBe(kind === 'int' ? String(MAX_INT) : '새 값😀\n文字');
      }
      const saved = parseSave(e.serialize(), file);
      expect(e.summary()).toMatchObject({ addedVariables: 8, valueChanges: 8, changes: 16 });
      expect(saved.variables).toHaveLength(original.length + 8);
      for (const v of original) {
        const after = saved.variables.find(a => a.name === v.name && a.scope === v.scope)!;
        expect(saved.original.slice(after.start, after.end)).toEqual(e.document.original.slice(v.start, v.end));
      }
      expect(e.document.variables).toEqual(original);
      e.reset(); expect(e.serialize()).toEqual(fixture(file));
    });
    it(`${file}: keeps edits and resizes hidden while deleted and restores them with stable IDs`, () => {
      const e = open(file), v = e.document.variables.find(v => v.scope === -1 && v.kind === 'int' && v.dimensions.length === 1)!;
      e.set(v.id, '0', String(MIN_INT)); e.resize(v.id, [20]); e.deleteVariable(v.id);
      expect(e.summary()).toMatchObject({ changes: 1, valueChanges: 0, resizedArrays: 0, deletedVariables: 1 });
      expect(e.query({ ...query, variableId: v.id }).total).toBe(0);
      expect(e.query({ ...query, changedOnly: true }).rows).toMatchObject([{ type: 'delete', variableId: v.id }]);
      for (const mutate of [() => e.set(v.id, '0', '9'), () => e.resize(v.id, [2]), () => e.revert(v.id, '0')]) expect(mutate).toThrow('error.variableMissing');
      expect(parseSave(e.serialize(), 'deleted.sav').variables.some(a => a.scope === v.scope && a.name === v.name)).toBe(false);
      e.restoreVariable(v.id);
      expect(e.summary()).toMatchObject({ changes: 2, valueChanges: 1, resizedArrays: 1, deletedVariables: 0 });
      expect(e.query({ ...query, variableId: v.id }).rows[0].value).toBe(String(MIN_INT));
      e.reset(); expect(e.serialize()).toEqual(fixture(file));
      for (const original of e.document.variables) e.deleteVariable(original.id);
      const empty = parseSave(e.serialize(), 'empty.sav');
      expect(empty.variables).toHaveLength(0); expect(empty.characterCount).toBe(e.document.characterCount);
      e.reset(); expect(e.serialize()).toEqual(fixture(file));
    });
  }
  it('inserts character built-ins before the separator and custom arrays after it', () => {
    const e = open();
    const user = e.addVariable({ ...spec, scope: 0, name: 'NEW_CUSTOM', kind: 'string', dimensions: [2, 3] });
    const builtin = e.addVariable({ ...spec, scope: 0, name: 'NICKNAME', kind: 'string', section: 'builtin' });
    e.set(user, '1,2', '新規'); e.set(builtin, '', '旅人');
    const saved = parseSave(e.serialize(), 'added.sav');
    const variables = saved.variables.filter(v => v.scope === 0);
    expect(variables.map(v => v.name)).toEqual(['NAME', 'CALLNAME', 'NO', 'ABL', 'BASE', 'NICKNAME', 'CUSTOM', 'NEW_CUSTOM']);
    expect(variables.find(v => v.name === 'NICKNAME')?.section).toBe('builtin');
    expect(variables.find(v => v.name === 'NEW_CUSTOM')?.section).toBe('user');
    expect(e.query({ ...query, changedOnly: true }).rows.filter(row => row.type === 'add').map(row => row.variableId)).toEqual([builtin, user]);
    e.deleteVariable(user); e.deleteVariable(builtin); expect(e.serialize()).toEqual(fixture('normal-binary'));
  });
  it('adds to empty character scopes and creates only the required separators', () => {
    const w = new BinaryWriter(); MAGIC.forEach(b => w.u8(b)); w.i32(1808); w.i32(0);
    w.u8(0); w.i64(42n); w.i64(1n); w.string('empty characters'); w.i64(2n); w.u8(254); w.u8(254); w.u8(255);
    const bytes = w.finish(), e = new Editor(parseSave(bytes, 'empty.sav'));
    const user = e.addVariable({ ...spec, scope: 0, dimensions: [1] });
    const builtin = e.addVariable({ ...spec, scope: 0, name: 'NO', section: 'builtin' }); e.set(builtin, '', '7');
    e.addVariable({ ...spec, scope: 0, name: 'SECOND_CUSTOM', dimensions: [0] });
    e.addVariable({ ...spec, scope: 1, name: 'NAME', kind: 'string', section: 'builtin' });
    const saved = parseSave(e.serialize(), 'new.sav');
    expect(saved.variables.map(v => [v.scope, v.name, v.section])).toEqual([[0, 'NO', 'builtin'], [0, 'NEW_VALUE', 'user'], [0, 'SECOND_CUSTOM', 'user'], [1, 'NAME', 'builtin']]);
    expect(saved.binaryLayout?.characterSeparators.filter(n => n !== undefined)).toHaveLength(1);
    e.deleteVariable(user); e.reset(); expect(e.serialize()).toEqual(bytes);
  });
  it('updates character identity and CSV association after additions, deletions and restoration conflicts', () => {
    const e = open(), name = e.document.variables.find(v => v.name === 'NAME')!, no = e.document.variables.find(v => v.name === 'NO')!;
    e.labels.load([{ name: 'Chara7.csv', bytes: new TextEncoder().encode('NO,7\nNAME,参照') }], 'auto');
    e.deleteVariable(name.id); e.deleteVariable(no.id);
    expect(e.summary().characters[0]).toMatchObject({ name: '', no: '—', csv: undefined });
    const id = e.addVariable({ ...spec, scope: 0, name: 'NAME', kind: 'string', section: 'builtin' }); e.set(id, '', '新しい名前');
    expect(e.summary().characters[0].name).toBe('新しい名前');
    expect(() => e.restoreVariable(name.id)).toThrow('error.variableNameUsed');
    e.deleteVariable(id); e.restoreVariable(name.id); e.restoreVariable(no.id);
    expect(e.summary().characters[0]).toMatchObject({ name: 'アオイ', no: '7', csv: { fields: { NAME: '参照' } } });
    expect(e.serialize()).toEqual(fixture('normal-binary'));
  });
  it('paginates structural and value changes, including zero-cell arrays, and cancels additions completely', () => {
    const e = open('global-binary');
    const id = e.addVariable({ ...spec, dimensions: [1] }); e.resize(id, [60]);
    for (let i = 0; i < 51; i++) e.set(id, String(i), '42');
    for (let i = 0; i < 5; i++) e.addVariable({ ...spec, name: `EMPTY_${i}`, dimensions: [0] });
    expect(e.query({ ...query, changedOnly: true })).toMatchObject({ total: 58, pages: 2 });
    expect(e.query({ ...query, changedOnly: true }).rows).toHaveLength(50);
    expect(e.query({ ...query, changedOnly: true, page: 1 }).rows).toHaveLength(8);
    expect(e.query({ ...query, search: 'EMPTY', changedOnly: true }).rows.every(row => row.type === 'add')).toBe(true);
    e.deleteVariable(id); expect(e.summary()).toMatchObject({ changes: 5, valueChanges: 0, resizedArrays: 0 });
    expect(() => e.set(id, '0', '9')).toThrow('error.variableMissing');
    e.reset(); const fresh = e.addVariable(spec); expect(fresh).toBeGreaterThan(id);
    e.deleteVariable(fresh); expect(e.serialize()).toEqual(fixture('global-binary'));
  });
  it('keeps very large additions sparse and verifies edits after original IDs shift in the export', () => {
    const e = open(), last = e.document.variables.at(-1)!;
    const id = e.addVariable({ ...spec, dimensions: [10000, 10000] }); e.set(id, '9999,9999', String(MAX_INT));
    const removed = e.document.variables[0]; e.deleteVariable(removed.id);
    const key = [...last.values.keys()][0]; e.set(last.id, key, last.kind === 'string' ? '変化😀' : '999');
    const output = e.serialize(); expect(output.length).toBeLessThan(fixture('normal-binary').length + 100);
    const check = parseSave(output, 'new.sav');
    expect(check.variables.find(v => v.name === spec.name)?.values.get('9999,9999')).toBe(MAX_INT);
    expect(originalValue(check.variables.find(v => v.name === last.name && v.scope === last.scope)!, key)).toBe(last.kind === 'string' ? '変化😀' : 999n);
    e.reset(); expect(e.serialize()).toEqual(fixture('normal-binary'));
  });
  it('rejects invalid structure atomically and keeps text structure read-only', () => {
    const e = open();
    const bad: NewVariable[] = [
      { ...spec, name: '' }, { ...spec, name: '1ABC' }, { ...spec, name: 'A:B' }, { ...spec, name: 'A'.repeat(129) },
      { ...spec, scope: 1 }, { ...spec, scope: -2 }, { ...spec, scope: NaN }, { ...spec, kind: 'bad' as 'int' },
      { ...spec, dimensions: [1, 1, 1, 1] }, { ...spec, dimensions: [-1] }, { ...spec, dimensions: [1.1] },
      { ...spec, dimensions: [0, 2147483648] }, { ...spec, dimensions: [10001, 10000] },
      { ...spec, section: 'builtin' }, { ...spec, scope: 0, section: 'wrong' as 'user', dimensions: [1] },
      { ...spec, scope: 0 }, { ...spec, scope: 0, dimensions: [1, 1, 1] }, { ...spec, name: 'money' },
    ];
    for (const value of bad) expect(() => e.addVariable(value)).toThrow();
    expect(e.summary().changes).toBe(0); expect(e.serialize()).toEqual(fixture('normal-binary'));
    const text = open('normal-text');
    for (const mutate of [() => text.addVariable(spec), () => text.deleteVariable(0), () => text.restoreVariable(0)]) expect(mutate).toThrow('error.structureBinary');
    expect(text.serialize()).toEqual(fixture('normal-text'));
  });
});
