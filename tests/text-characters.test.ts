import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { Query } from '../src/core/editor';
import { decodeText, encodeText } from '../src/core/encoding';
import { MAX_INT, MAX_TEXT_LINES } from '../src/core/model';
import type { SaveDocument, TextEncoding, Variable } from '../src/core/model';
import { textCharacterFixture as fixture } from './text-character-fixture';
import { isVariableRow } from './rows';

const query: Query = { scope: 'all', search: '', changedOnly: false, page: 0 };
const variable = (e: Editor, scope: number, name: string) => e.summary().variables.find(v => v.scope === scope && v.name === name)!;
const value = (e: Editor, name: string) => e.query({ ...query, scope: -1, search: name + ':0' }).rows.filter(isVariableRow)[0]?.value;
const logical = (v: Variable) => ({ name: v.name, kind: v.kind, dimensions: v.dimensions, values: v.values, section: v.textSection, cells: [...v.textSpans!.keys()] });
const character = (d: SaveDocument, scope: number) => d.variables.filter(v => v.scope === scope).map(logical);

describe('text character structure', () => {
  for (const version of [0, 1700, 1708, 1729, 1803, 1808]) it(`preserves both character sections and all shared values in format ${version}`, () => {
    const bytes = fixture({ version, newline: 'mixed', trailingNewline: false }), e = new Editor(parseSave(bytes, 'text.sav'));
    expect(e.serialize()).toEqual(bytes);
    const copy = e.cloneCharacter(0), empty = e.cloneCharacter(1);
    e.deleteCharacter(1);
    const saved = parseSave(e.serialize(), 'output.sav');
    expect(saved).toMatchObject({ characterCount: 4, formatVersion: version, encoding: 'utf-8' });
    expect(character(saved, 0)).toEqual(character(e.document, 0));
    expect(character(saved, 1)).toEqual(character(e.document, 2));
    expect(character(saved, 2)).toEqual(character(e.document, 0));
    expect(character(saved, 3)).toEqual(character(e.document, 1));
    const a = saved.textLayout!, b = e.document.textLayout!;
    for (const section of ['base', 'extended'] as const) {
      const from = b.characters[0][section], to = a.characters[2][section];
      if (from) expect(saved.original.slice(to!.start, to!.end)).toEqual(bytes.slice(from.start, from.end));
    }
    expect(value(e, 'TARGET')).toBe('1'); expect(value(e, 'ASSI')).toBe('-1');
    expect(saved.variables.find(v => v.name === 'FLAG')?.values.get('0')).toBe(2n);
    if (version) expect(saved.variables.find(v => v.name === 'CUSTOM_REF')?.values.get('')).toBe(2n);
    // Header count formatting also survives a complete individual undo.
    e.deleteCharacter(copy); e.deleteCharacter(empty); e.restoreCharacter(1);
    expect(e.serialize()).toEqual(bytes);
    for (const scope of [2, 0, 1]) e.deleteCharacter(scope);
    const allDeleted = parseSave(e.serialize(), 'empty.sav');
    expect(allDeleted.characterCount).toBe(0); expect(allDeleted.variables.every(v => v.scope === -1)).toBe(true);
    for (const scope of [1, 2, 0]) e.restoreCharacter(scope);
    expect(e.serialize()).toEqual(bytes);
  });

  for (const encoding of ['utf-8', 'shift_jis'] as TextEncoding[]) it(`copies current edits independently and keeps copied cells editable in ${encoding}`, () => {
    const bytes = fixture({ encoding, bom: false }), e = new Editor(parseSave(bytes, 'snapshot.sav', encoding));
    const beforeDocument = structuredClone(e.document);
    e.labels.load([{ name: 'Chara.csv', bytes: encodeText('NO,7\nNAME,参考', encoding) }], encoding);
    e.set(variable(e, 0, 'NAME').id, '', '編集した名前');
    e.set(variable(e, 0, 'NICKNAME').id, '', '長い別名:その一');
    e.set(variable(e, 0, 'ABL').id, '2', String(MAX_INT));
    e.set(variable(e, 0, 'C2D').id, '3,2', '-9223372036854775808');
    const snapshot = parseSave(e.serialize(), 'before.sav', encoding), copy = e.cloneCharacter(0);
    expect(character(parseSave(e.serialize(), 'copy.sav', encoding), 3)).toEqual(character(snapshot, 0));
    expect(e.summary().characters.at(-1)?.csv?.fields.NAME).toBe('参考');
    e.set(variable(e, 0, 'NAME').id, '', '後の変更');
    e.set(variable(e, copy, 'NAME').id, '', '複製');
    e.set(variable(e, copy, 'NICKNAME').id, '', '別の名前');
    e.set(variable(e, copy, 'CSTR').id, '0', '空欄の編集');
    e.set(variable(e, copy, 'C2D').id, '0,1', '99');
    const copyName = variable(e, copy, 'NAME').id, copyOfCopy = e.cloneCharacter(copy);
    e.deleteCharacter(copy); e.deleteCharacter(0);
    expect(e.summary()).toMatchObject({ addedCharacters: 1, deletedCharacters: 1 });
    const saved = parseSave(e.serialize(), 'final.sav', encoding);
    expect(saved.variables.find(v => v.scope === 2 && v.name === 'NAME')?.values.get('')).toBe('複製');
    expect(saved.variables.find(v => v.scope === 2 && v.name === 'NICKNAME')?.values.get('')).toBe('別の名前');
    expect(saved.variables.find(v => v.scope === 2 && v.name === 'CSTR')?.values.get('0')).toBe('空欄の編集');
    expect(saved.variables.find(v => v.scope === 2 && v.name === 'C2D')?.values.get('0,1')).toBe(99n);
    expect(e.summary().characters.at(-1)).toMatchObject({ scope: copyOfCopy, index: 2 });
    expect(e.document).toEqual(beforeDocument);
    expect(() => e.set(copyName, '', 'stale')).toThrow('error.variableMissing');
    e.restoreCharacter(0);
    expect(e.scopeName(0)).toBe('後の変更');
    e.reset(); expect(e.serialize()).toEqual(bytes);
    expect(e.cloneCharacter(0)).toBeGreaterThan(copyOfCopy);
  });

  it('binds manual standard references by identity, preserves literal values and previews automatic changes', () => {
    const e = new Editor(parseSave(fixture(), 'references.sav')), target = variable(e, -1, 'TARGET').id;
    expect(e.previewDeleteCharacter(1)).toEqual([
      { name: 'TARGET:0', before: '2', after: '1' }, { name: 'ASSI:0', before: '1', after: '-1' }, { name: 'PLAYER:0', before: '2', after: '1' },
    ]);
    e.deleteCharacter(1);
    expect(e.query({ ...query, changedOnly: true }).rows.filter(isVariableRow).every(r => r.automatic)).toBe(true);
    e.set(target, '0', '0'); e.deleteCharacter(0); expect(value(e, 'TARGET')).toBe('-1');
    e.restoreCharacter(0); e.restoreCharacter(1); expect(value(e, 'TARGET')).toBe('0');
    e.revert(target, '0'); expect(e.serialize()).toEqual(fixture());
    const copy = e.cloneCharacter(0); e.set(target, '0', '3'); e.deleteCharacter(1);
    expect(value(e, 'TARGET')).toBe('2'); e.deleteCharacter(copy); expect(value(e, 'TARGET')).toBe('-1');
    e.cloneCharacter(2); expect(value(e, 'TARGET')).toBe('-1');
    e.set(target, '0', String(MAX_INT)); e.restoreCharacter(1); expect(value(e, 'TARGET')).toBe(String(MAX_INT));
    const saved = parseSave(e.serialize(), 'refs.sav');
    expect(saved.variables.find(v => v.name === 'TARGET')?.values.get('1')).toBe(MAX_INT);
    expect(saved.variables.filter(v => v.name === 'RELATION').every(v => v.values.get('1') === -9223372036854775808n)).toBe(true);
  });

  it('retains omitted references and rejects new cells, base variable deletion and invalid string edits on copies', () => {
    const e = new Editor(parseSave(fixture({ encoding: 'shift_jis', omitReferences: true }), 'omitted.sav', 'shift_jis'));
    expect(e.previewDeleteCharacter(0)).toEqual([]);
    e.deleteCharacter(0); const copy = e.cloneCharacter(2), name = variable(e, copy, 'NAME').id, ragged = variable(e, copy, 'C2D').id;
    for (const input of ['__FINISHED', '__EMU_SEPARATOR__', '__EMUERA_1808_STRAT__', 'line\nbreak', '\0', '😀']) expect(() => e.set(name, '', input)).toThrow();
    for (const key of ['1,0', '2,1', '4,0']) expect(() => e.set(ragged, key, '1')).toThrow('error.cellBounds');
    expect(() => e.set(variable(e, -1, 'TARGET').id, '0', '1')).toThrow('error.cellBounds');
    expect(() => e.resize(ragged, [4,3])).toThrow('error.resizeBinary');
    expect(() => e.deleteVariable(name)).toThrow('error.textBaseVariable');
    const extra = e.addVariable({ scope: copy, name: 'NEW', kind: 'int', dimensions: [] });
    e.set(extra, '', '9223372036854775807');
    const saved = parseSave(e.serialize(), 'omitted.sav', 'shift_jis');
    for (const ref of ['TARGET', 'ASSI', 'MASTER', 'PLAYER']) expect(saved.variables.find(v => v.name === ref)?.textSpans?.size).toBe(0);
  });

  it('keeps an explicit CP932 override for ambiguous bytes while snapshotting', () => {
    const raw = decodeText(fixture({ bom: false }), 'utf-8').replace(/[^\x00-\x7f]/g, 'a');
    // These two bytes form UTF-8 é, but mean two half-width CP932 characters.
    const ascii = new TextEncoder().encode(raw), nameStart = parseSave(ascii, 'ascii.sav').textLayout!.characters[0].base.start;
    const ambiguous = new Uint8Array([...ascii.slice(0, nameStart), 0xc3, 0xa9, ...ascii.slice(nameStart)]);
    const e = new Editor(parseSave(ambiguous, 'ambiguous.sav', 'shift_jis'));
    expect(parseSave(ambiguous, 'auto.sav').encoding).toBe('utf-8');
    const copy = e.cloneCharacter(0); e.set(variable(e, copy, 'NAME').id, '', e.scopeName(0));
    expect(e.scopeName(copy)).toBe(e.scopeName(0));
    expect(parseSave(e.serialize(), 'out.sav', 'shift_jis').encoding).toBe('shift_jis');
  });

  it('handles count-width changes, insertion beside an edited shared cell, and cancelled operations byte-for-byte', () => {
    const bytes = fixture({ bom: false, newline: '\n' }), e = new Editor(parseSave(bytes, 'boundaries.sav'));
    const ids = Array.from({ length: 7 }, () => e.cloneCharacter(0));
    e.set(variable(e, -1, 'DAY').id, '0', '9223372036854775807');
    e.set(variable(e, -1, 'SHARED_NOTE').id, '', '共通部の長い値');
    const saved = parseSave(e.serialize(), 'ten.sav');
    expect(saved.characterCount).toBe(10);
    expect(saved.variables.find(v => v.name === 'DAY')?.values.get('0')).toBe(MAX_INT);
    expect(saved.variables.find(v => v.name === 'SHARED_NOTE')?.values.get('')).toBe('共通部の長い値');
    for (const id of ids) e.deleteCharacter(id);
    e.revert(variable(e, -1, 'DAY').id, '0'); e.revert(variable(e, -1, 'SHARED_NOTE').id, '');
    expect(e.serialize()).toEqual(bytes);
  });

  it('supports the committed text fixtures and preserves their untouched byte spans', () => {
    for (const filename of ['normal-text.sav', 'normal-sjis.sav']) {
      const bytes = new Uint8Array(readFileSync(`tests/fixtures/${filename}`)), e = new Editor(parseSave(bytes, filename));
      const copy = e.cloneCharacter(0); e.deleteCharacter(0);
      // Replacing the sole character with its identical copy leaves every byte intact, including the count token.
      expect(e.serialize()).toEqual(bytes);
      e.restoreCharacter(0); e.deleteCharacter(copy); expect(e.serialize()).toEqual(bytes);
    }
  });

  it('keeps empty names when mixed CR/LF endings meet at deletion, copy or value-edit boundaries', () => {
    const bytes = fixture({ bom: false, newline: '\n' }), layout = parseSave(bytes, 'joins.sav').textLayout!;
    for (const offset of [layout.characterCount!.end, layout.characters[1].base.end - 1, layout.characters[2].base.end - 1]) bytes[offset] = 13;
    const e = new Editor(parseSave(bytes, 'joins.sav'));
    e.cloneCharacter(1); e.cloneCharacter(1);
    expect(parseSave(e.serialize(), 'clones.sav').variables.filter(v => v.name === 'NAME').map(v => v.values.get(''))).toEqual(['一人目', '', '三人目', '', '']);
    e.deleteCharacter(0);
    expect(parseSave(e.serialize(), 'deleted.sav').variables.filter(v => v.name === 'NAME').map(v => v.values.get(''))).toEqual(['', '三人目', '', '']);
    e.set(variable(e, 2, 'NAME').id, '', '');
    expect(parseSave(e.serialize(), 'edited.sav').variables.filter(v => v.name === 'NAME').map(v => v.values.get(''))).toEqual(['', '', '', '']);
    e.reset(); expect(e.serialize()).toEqual(bytes);
  });

  it('rejects copying beyond the text line limit without adding a partial character', () => {
    const text = decodeText(fixture({ bom: false, newline: '\n' }), 'utf-8');
    const bytes = encodeText(text.replace('C2D\n0,7\n\n3\n0,0,9\n', 'C2D\n' + '\n'.repeat(MAX_TEXT_LINES / 2)), 'utf-8');
    const e = new Editor(parseSave(bytes, 'line-limit.sav'));
    expect(() => e.cloneCharacter(0)).toThrow('error.textLines');
    expect(e.summary()).toMatchObject({ changes: 0, addedCharacters: 0 });
    expect(e.summary().characters).toHaveLength(3);
  }, 20_000);
});
