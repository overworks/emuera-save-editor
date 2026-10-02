import { characterFixture as fixture } from './character-fixture';
import { isVariableRow } from './rows';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { Query } from '../src/core/editor';
import { MAX_INT, MIN_INT } from '../src/core/model';

const query: Query = { scope: 'all', search: '', changedOnly: false, page: 0 };
const rows = (e: Editor, q: Query = query) => e.query(q).rows.filter(isVariableRow);
const variable = (e: Editor, scope: number, name: string) => e.summary().variables.find(v => v.scope === scope && v.name === name && !v.deleted)!;
const value = (e: Editor, name: string) => rows(e, { ...query, scope: -1, search: name + ':0' })[0].value;

describe('binary character structure', () => {
  it('appends an exact independent snapshot of the current character with stable IDs', () => {
    const bytes = fixture(), e = new Editor(parseSave(bytes, 'characters.sav'));
    const original = e.document.variables.map(v => ({ ...v, values: new Map(v.values) }));
    const abl = variable(e, 0, 'ABL'); e.resize(abl.id, [8]); e.set(abl.id, '7', String(MAX_INT));
    e.deleteVariable(variable(e, 0, 'CUSTOM').id);
    const user = e.addVariable({ scope: 0, name: 'NEW_CUSTOM', kind: 'string', dimensions: [2, 2] }); e.set(user, '1,1', '複製😀');
    const before = parseSave(e.serialize(), 'before.sav'), copy = e.cloneCharacter(0);
    const after = parseSave(e.serialize(), 'after.sav'), b = before.binaryLayout!, a = after.binaryLayout!;
    expect(after.original.slice(a.characterStarts[3], a.characterEnds[3] + 1)).toEqual(before.original.slice(b.characterStarts[0], b.characterEnds[0] + 1));
    expect(e.summary()).toMatchObject({ addedCharacters: 1, deletedCharacters: 0 });
    expect(e.summary().characters.at(-1)).toMatchObject({ scope: copy, index: 3, no: '7', added: true, variables: 5 });
    expect(e.query({ ...query, scope: copy, changedOnly: true }).rows).toMatchObject([{ type: 'cloneCharacter' }]);
    e.set(abl.id, '7', '10');
    expect(rows(e, { ...query, scope: copy, search: 'ABL:7' })[0].value).toBe(String(MAX_INT));
    const copiedAbl = variable(e, copy, 'ABL'); e.resize(copiedAbl.id, [9]); e.set(copiedAbl.id, '8', String(MIN_INT));
    const nickname = e.addVariable({ scope: copy, name: 'NICKNAME', kind: 'string', dimensions: [], section: 'builtin' }); e.set(nickname, '', 'コピー');
    e.deleteVariable(variable(e, copy, 'RELATION').id);
    const copyOfCopy = e.cloneCharacter(copy);
    e.deleteCharacter(copy);
    expect(e.summary().characters.at(-1)).toMatchObject({ scope: copyOfCopy, index: 3 });
    expect(rows(e, { ...query, scope: copyOfCopy, search: 'ABL:8' })[0].value).toBe(String(MIN_INT));
    expect(parseSave(e.serialize(), 'final.sav').variables.find(v => v.scope === 3 && v.name === 'NICKNAME')?.section).toBe('builtin');
    expect(e.document.variables).toEqual(original);
    e.reset(); expect(e.serialize()).toEqual(bytes);
    expect(() => e.set(copiedAbl.id, '0', '1')).toThrow('error.variableMissing');
  });

  it('previews and remaps standard references by identity across deletion and restoration', () => {
    const bytes = fixture(), e = new Editor(parseSave(bytes, 'references.sav'));
    expect(e.previewDeleteCharacter(1)).toEqual([
      { name: 'TARGET:0', before: '2', after: '1' }, { name: 'ASSI:0', before: '1', after: '-1' }, { name: 'PLAYER:0', before: '2', after: '1' },
    ]);
    e.deleteCharacter(1);
    expect(value(e, 'TARGET')).toBe('1'); expect(value(e, 'ASSI')).toBe('-1'); expect(value(e, 'MASTER')).toBe('0');
    expect(e.summary()).toMatchObject({ deletedCharacters: 1, valueChanges: 3, changes: 4 });
    expect(rows(e, { ...query, changedOnly: true }).every(r => r.automatic)).toBe(true);
    const saved = parseSave(e.serialize(), 'deleted.sav');
    expect(saved.characterCount).toBe(2);
    expect(saved.variables.find(v => v.scope === 1 && v.name === 'NO')?.values.get('')).toBe(MAX_INT);
    expect(saved.variables.find(v => v.name === 'GAME_REF')?.values.get('0')).toBe(2n);
    expect(saved.variables.find(v => v.name === 'TARGET')?.values.get('1')).toBe(MAX_INT);
    expect(saved.variables.filter(v => v.name === 'RELATION').map(v => v.values.get('7'))).toEqual([MIN_INT, MIN_INT]);
    e.deleteCharacter(0); expect(value(e, 'TARGET')).toBe('0'); expect(value(e, 'MASTER')).toBe('-1');
    e.restoreCharacter(1); expect(value(e, 'TARGET')).toBe('1'); expect(value(e, 'ASSI')).toBe('0');
    e.restoreCharacter(0); expect(e.serialize()).toEqual(bytes);
  });

  it('binds manual reference edits to current positions and preserves literal values', () => {
    const e = new Editor(parseSave(fixture(), 'manual.sav')), target = variable(e, -1, 'TARGET'), assi = variable(e, -1, 'ASSI');
    e.deleteCharacter(0); e.set(target.id, '0', '0');
    expect(value(e, 'TARGET')).toBe('0');
    e.restoreCharacter(0); expect(value(e, 'TARGET')).toBe('1');
    e.revert(target.id, '0'); expect(value(e, 'TARGET')).toBe('2');
    e.deleteCharacter(1); e.set(assi.id, '0', '-1'); e.restoreCharacter(1);
    expect(value(e, 'ASSI')).toBe('-1'); e.revert(assi.id, '0'); expect(value(e, 'ASSI')).toBe('1');
    e.set(target.id, '0', String(MAX_INT)); e.deleteCharacter(0); e.restoreCharacter(0);
    expect(value(e, 'TARGET')).toBe(String(MAX_INT));
    e.revert(target.id, '0'); const copy = e.cloneCharacter(2); e.set(target.id, '0', '3');
    e.deleteCharacter(0); expect(value(e, 'TARGET')).toBe('2');
    e.deleteCharacter(copy); expect(value(e, 'TARGET')).toBe('-1');
    const next = e.cloneCharacter(2); expect(next).toBeGreaterThan(copy); expect(value(e, 'TARGET')).toBe('-1');
    e.reset(); expect(e.serialize()).toEqual(fixture());
  });

  it('retains hidden character edits, variable operations, CSV identity and sparse bounds', () => {
    const bytes = fixture(), e = new Editor(parseSave(bytes, 'hidden.sav'));
    e.labels.load([{ name: 'Chara.csv', bytes: new TextEncoder().encode('NO,7\nNAME,参考') }], 'auto');
    const name = variable(e, 0, 'NAME'), abl = variable(e, 0, 'ABL'), custom = variable(e, 0, 'CUSTOM');
    e.set(name.id, '', '編集済み'); e.resize(abl.id, [100_000_000]); e.set(abl.id, '99999999', String(MIN_INT));
    e.deleteVariable(custom.id); e.addVariable({ scope: 0, name: 'EMPTY', kind: 'int', dimensions: [0] });
    e.deleteCharacter(0);
    expect(e.summary()).toMatchObject({ addedVariables: 0, deletedVariables: 0, resizedArrays: 0 });
    expect(e.query({ ...query, scope: 0 }).total).toBe(0);
    expect(e.query({ ...query, scope: 0, changedOnly: true }).rows).toMatchObject([{ type: 'deleteCharacter', character: { name: '編集済み', no: '7', csv: { fields: { NAME: '参考' } } } }]);
    for (const mutate of [() => e.set(name.id, '', 'x'), () => e.restoreVariable(custom.id), () => e.cloneCharacter(0), () => e.addVariable({ scope: 0, name: 'BAD', kind: 'int', dimensions: [1] })]) expect(mutate).toThrow();
    e.restoreCharacter(0);
    expect(e.summary()).toMatchObject({ addedVariables: 1, deletedVariables: 1, resizedArrays: 1 });
    const copy = e.cloneCharacter(0), saved = parseSave(e.serialize(), 'sparse.sav');
    expect(saved.variables.find(v => v.scope === 3 && v.name === 'ABL')?.values.get('99999999')).toBe(MIN_INT);
    expect(e.summary().characters.find(c => c.scope === copy)?.csv?.fields.NAME).toBe('参考');
    expect(saved.original.length).toBeLessThan(2000);
    e.reset(); expect(e.serialize()).toEqual(bytes);
  });

  it('deletes all characters, keeps shared records, and restores exact bytes individually', () => {
    const bytes = fixture(), e = new Editor(parseSave(bytes, 'all.sav'));
    for (let scope = 0; scope < 3; scope++) e.deleteCharacter(scope);
    const saved = parseSave(e.serialize(), 'empty.sav');
    expect(saved.characterCount).toBe(0); expect(saved.variables.every(v => v.scope === -1)).toBe(true);
    for (const name of ['TARGET', 'ASSI', 'MASTER', 'PLAYER']) expect(value(e, name)).toBe('-1');
    for (const scope of [2, 0, 1]) e.restoreCharacter(scope);
    expect(e.serialize()).toEqual(bytes);
  });

  it('preserves empty scopes and unseparated sections at insertion/replacement boundaries', () => {
    const bytes = fixture(2, true, false), e = new Editor(parseSave(bytes, 'empty.sav'));
    const copy = e.cloneCharacter(0);
    e.addVariable({ scope: copy, name: 'CUSTOM', kind: 'string', dimensions: [2] });
    e.addVariable({ scope: copy, name: 'NAME', kind: 'string', dimensions: [], section: 'builtin' });
    e.addVariable({ scope: -1, name: 'SHARED', kind: 'int', dimensions: [] });
    e.deleteCharacter(1);
    const saved = parseSave(e.serialize(), 'copy.sav');
    expect(saved.characterCount).toBe(2);
    expect(saved.variables.map(v => [v.scope, v.name, v.section])).toEqual([[1, 'NAME', 'builtin'], [1, 'CUSTOM', 'user'], [-1, 'SHARED', undefined]]);
    e.reset(); expect(e.serialize()).toEqual(bytes);
    const replacement = new Editor(parseSave(fixture(), 'replace.sav'));
    replacement.cloneCharacter(1); replacement.deleteVariable(variable(replacement, -1, 'TARGET').id);
    expect(parseSave(replacement.serialize(), 'out.sav').characterCount).toBe(4);
  });

  it('paginates character changes with other changes and never reuses character IDs', () => {
    const e = new Editor(parseSave(fixture(2, true, false), 'many.sav'));
    for (let i = 0; i < 51; i++) e.cloneCharacter(0);
    e.deleteCharacter(0);
    expect(e.query({ ...query, changedOnly: true })).toMatchObject({ total: 52, pages: 2 });
    expect(e.query({ ...query, changedOnly: true }).rows).toHaveLength(50);
    expect(e.query({ ...query, changedOnly: true, page: 1 }).rows).toHaveLength(2);
    const last = e.summary().characters.at(-1)!.scope;
    e.reset(); expect(e.cloneCharacter(0)).toBeGreaterThan(last);
    expect(() => e.deleteCharacter(last)).toThrow('error.characterMissing');
  });

  it('rejects unsupported files, absent sources and the character limit without partial changes', () => {
    for (const name of ['global-text', 'global-binary']) {
      const bytes = new Uint8Array(readFileSync(`tests/fixtures/${name}.sav`)), e = new Editor(parseSave(bytes, name));
      for (const mutate of [() => e.cloneCharacter(0), () => e.deleteCharacter(0), () => e.restoreCharacter(0)]) expect(mutate).toThrow();
      expect(e.serialize()).toEqual(bytes);
    }
    const empty = new Editor(parseSave(fixture(0, true, false), 'zero.sav'));
    for (const scope of [-1, 0, 0.5, NaN]) expect(() => empty.cloneCharacter(scope)).toThrow('error.characterMissing');
    const bytes = fixture(100_000, true, false), e = new Editor(parseSave(bytes, 'limit.sav'));
    expect(() => e.cloneCharacter(0)).toThrow('error.characterCount'); expect(e.summary().changes).toBe(0);
    e.deleteCharacter(0); e.cloneCharacter(1);
    expect(() => e.restoreCharacter(0)).toThrow('error.characterCount');
    e.reset(); expect(e.serialize()).toEqual(bytes);
  }, 20_000);
});
