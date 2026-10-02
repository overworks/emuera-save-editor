import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Session, defaultView, MAX_SESSION_OPERATIONS, readSessionView } from '../src/core/session';
import { validateRecovery } from '../src/recovery';
import { MAX_INT, MIN_INT } from '../src/core/model';
import { characterFixture } from './character-fixture';
import { textCharacterFixture } from './text-character-fixture';

const open = (bytes: Uint8Array = characterFixture(), encoding: 'auto' | 'shift_jis' = 'auto') => new Session({ bytes, filename: 'original.sav', encoding });
const restore = (session: Session) => Session.restore(structuredClone(session.source), structuredClone(session.operations));
const id = (s: Session, scope: number, name: string) => s.editor.summary().variables.find(v => v.scope === scope && v.name === name)!.id;
const row = (s: Session, scope: number, search: string) => s.editor.query({ scope, search, changedOnly: false, page: 0 }).rows[0];

describe('local recovery journal', () => {
  it('restores hidden sparse edits, deleted records, manual reference bindings and copy independence', () => {
    const s = open(), abl = id(s, 0, 'ABL'), target = id(s, -1, 'TARGET');
    s.run({ type: 'resize', id: abl, dimensions: [100_000_000] });
    s.run({ type: 'set', id: abl, key: '99999999', value: String(MIN_INT) });
    const copy = s.run({ type: 'cloneCharacter', scope: 0 }).scope!;
    s.run({ type: 'set', id: abl, key: '99999999', value: String(MAX_INT) });
    s.run({ type: 'resize', id: abl, dimensions: [2] });
    s.run({ type: 'deleteVariable', id: id(s, 0, 'CUSTOM') });
    const added = s.run({ type: 'addVariable', variable: { scope: copy, name: 'NOTE', kind: 'string', dimensions: [2] } }).id!;
    s.run({ type: 'set', id: added, key: '1', value: '복제😀' });
    s.run({ type: 'deleteCharacter', scope: 1 });
    s.run({ type: 'set', id: target, key: '0', value: '2' });
    s.run({ type: 'deleteCharacter', scope: 0 });
    const r = restore(s);
    expect(r.editor.summary()).toEqual(s.editor.summary());
    expect(r.editor.serialize()).toEqual(s.editor.serialize());
    expect(row(r, -1, 'TARGET:0')).toMatchObject({ value: '1' });
    expect(row(r, copy, 'ABL:99999999')).toMatchObject({ value: String(MIN_INT) });
    r.run({ type: 'restoreCharacter', scope: 0 });
    r.run({ type: 'restoreVariable', id: id(r, 0, 'CUSTOM') });
    r.run({ type: 'resize', id: abl, dimensions: [100_000_000] });
    expect(row(r, 0, 'ABL:99999999')).toMatchObject({ value: String(MAX_INT) });
    expect(row(r, -1, 'TARGET:0')).toMatchObject({ value: '2' });
    r.run({ type: 'restoreCharacter', scope: 1 });
    expect(row(r, -1, 'TARGET:0')).toMatchObject({ value: '3' });
    r.run({ type: 'reset' });
    expect(restore(r).editor.serialize()).toEqual(s.source.bytes);
    expect(r.run({ type: 'cloneCharacter', scope: 0 }).scope).toBeGreaterThan(copy);
    expect(restore(r).editor.summary()).toEqual(r.editor.summary());
  });

  for (const encoding of ['auto', 'shift_jis'] as const) it(`restores ${encoding} text copies, ragged spans and exact undo`, () => {
    const s = open(textCharacterFixture({ encoding: encoding === 'auto' ? 'utf-8' : encoding, newline: 'mixed', trailingNewline: false }), encoding);
    s.run({ type: 'set', id: id(s, 0, 'C2D'), key: '3,2', value: String(MIN_INT) });
    s.run({ type: 'set', id: id(s, 0, 'NICKNAME'), key: '', value: '編集:済み' });
    const copy = s.run({ type: 'cloneCharacter', scope: 0 }).scope!;
    s.run({ type: 'set', id: id(s, copy, 'NAME'), key: '', value: '複製' });
    s.run({ type: 'deleteCharacter', scope: 0 });
    const r = restore(s);
    expect(r.editor.summary()).toEqual(s.editor.summary());
    expect(r.editor.serialize()).toEqual(s.editor.serialize());
    expect(row(r, copy, 'C2D:3:2')).toMatchObject({ value: String(MIN_INT) });
    expect(() => r.run({ type: 'set', id: id(r, copy, 'C2D'), key: '1,0', value: '1' })).toThrow('error.cellBounds');
    r.run({ type: 'reset' });
    expect(r.editor.serialize()).toEqual(s.source.bytes);
    expect(restore(r).editor.serialize()).toEqual(s.source.bytes);
  });

  it('restores CSV order, conflicts, warnings, substitutions and cumulative import limits', () => {
    const s = open();
    s.run({ type: 'labels', encoding: 'auto', files: [
      { name: 'ABL.csv', bytes: new TextEncoder().encode('0,집중력\n0,other') },
      { name: '_Rename.csv', bytes: new TextEncoder().encode('ABL:0,focus') },
      { name: 'Chara.csv', bytes: new TextEncoder().encode('NO,7\nNAME,参考') },
    ] });
    const r = restore(s);
    expect(r.warnings).toEqual(s.warnings);
    expect(r.editor.summary()).toEqual(s.editor.summary());
    expect(row(r, 0, '[[focus]]')).toMatchObject({ label: '집중력' });
    expect(r.editor.serialize()).toEqual(s.source.bytes);
    expect(() => r.run({ type: 'labels', encoding: 'auto', files: [{ name: 'ABL.csv', bytes: new Uint8Array(64 * 1024 * 1024) }] })).toThrow('error.csvSize');
    expect(r.operations).toHaveLength(1);
  });

  it('keeps stable IDs after canceled additions and copies, resets, reverts and repeated recovery', () => {
    const s = open(), variable = { scope: -1, name: 'EXTRA', kind: 'int' as const, dimensions: [1] };
    const first = s.run({ type: 'addVariable', variable }).id!;
    s.run({ type: 'deleteVariable', id: first });
    const copy = s.run({ type: 'cloneCharacter', scope: 0 }).scope!;
    s.run({ type: 'deleteCharacter', scope: copy });
    s.run({ type: 'reset' });
    const next = s.run({ type: 'addVariable', variable }).id!;
    expect(next).toBeGreaterThan(first);
    s.run({ type: 'set', id: next, key: '0', value: '12' });
    s.run({ type: 'revert', id: next, key: '0' });
    s.run({ type: 'resize', id: next, dimensions: [2] });
    s.run({ type: 'revertResize', id: next });
    const r = restore(restore(s));
    expect(r.editor.summary()).toEqual(s.editor.summary());
    expect(r.run({ type: 'cloneCharacter', scope: 0 }).scope).toBeGreaterThan(copy);
    r.run({ type: 'set', id: next, key: '0', value: String(MAX_INT) });
    expect(row(restore(r), -1, 'EXTRA:0')).toMatchObject({ value: String(MAX_INT) });
  });

  it('round-trips all committed formats without changing original bytes', () => {
    for (const name of ['normal-binary', 'global-binary', 'normal-text', 'global-text', 'normal-sjis', 'global-sjis']) {
      const bytes = new Uint8Array(readFileSync(`tests/fixtures/${name}.sav`));
      expect(restore(open(bytes)).editor.serialize()).toEqual(bytes);
    }
  });

  it('rejects malformed, oversized, unsupported and invalid operations through editor validation', () => {
    const source = open().source;
    for (const op of [{ type: 'export' }, { type: '__proto__' }, { type: 'set', id: 0, key: '', value: 5 },
      { type: 'cloneCharacter', scope: -1 }, { type: 'resize', id: 0, dimensions: [Infinity] }]) {
      expect(() => Session.restore(source, [op])).toThrow('error.sessionInvalid');
    }
    expect(() => Session.restore(source, Array(MAX_SESSION_OPERATIONS + 1))).toThrow('error.sessionInvalid');
    expect(() => Session.restore(source, [{ type: 'set', id: 999_999, key: '0', value: '1' }])).toThrow('error.variableMissing');
    expect(() => Session.restore({ ...source, encoding: 'utf-16le' }, [])).toThrow('error.sessionInvalid');
    expect(() => readSessionView({ ...defaultView, scope: NaN })).toThrow('error.sessionInvalid');
    expect(() => readSessionView({ ...defaultView, search: 5 })).toThrow('error.sessionInvalid');
    const data = { head: { version: 1 as const, token: 'token', count: 0, savedAt: 1, view: defaultView }, source, operations: [] };
    expect(() => validateRecovery(data)).not.toThrow();
    expect(() => validateRecovery({ ...data, head: { ...data.head, count: 1 } })).toThrow('error.sessionInvalid');
    expect(() => validateRecovery({ ...data, head: { ...data.head, version: 2 as 1 } })).toThrow('error.sessionInvalid');
  });
});
