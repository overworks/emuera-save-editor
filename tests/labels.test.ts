import { isVariableRow } from './rows';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import { Labels } from '../src/core/labels';
import { encodeText } from '../src/core/encoding';
import { BinaryWriter, MAGIC, writeVariable } from '../src/core/binary';
import { MAX_FILE_BYTES, MAX_INT, MIN_INT } from '../src/core/model';
import type { Variable } from '../src/core/model';

const csv = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });
const fixture = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(`tests/fixtures/${name}`)) });
const open = (name = 'normal-binary.sav') => new Editor(parseSave(fixture(name).bytes, name));
const query = { scope: 'all' as const, search: '', changedOnly: false, page: 0 };

describe('_Rename.csv search substitutions', () => {
  it('reads the engine column direction, whitespace, escaped commas, comments and literal replacement text', () => {
    const labels = new Labels();
    expect(labels.load([csv('CSV\\_ReNaMe.CSV', '\ufeff;ignored,comment\n;!;ignored,alsoComment\n ABL:0 , focus ,ignored\ntext\\,with\\,commas,comma\n$&$`$\',literal\n,empty\nvalue,\n;comment')], 'auto')).toEqual([]);
    expect(labels.expand('[[focus]]')).toBe('ABL:0');
    expect(labels.expand('[[Focus]] [[unknown]]')).toBe('[[Focus]] [[unknown]]');
    expect(labels.expand('[[comma]]')).toBe('text,with,commas');
    expect(labels.expand('[[literal]]')).toBe('$&$`$\'');
    expect(labels.expand('[[empty]]')).toBe('');
    expect(labels.expand('[[]]')).toBe('value');
    expect(labels.renames.has('[[comment]]')).toBe(false);
    expect(labels.renames.has('[[alsoComment]]')).toBe(false);
  });
  it('makes one ordered pass, retains the first duplicate and reports source locations', () => {
    const labels = new Labels();
    const warnings = labels.load([csv('_Rename.csv', '[[second]],first\nABL:0,second\n[[first]],late\n[[cycle]],cycle\nABL:1,second\ninvalid')], 'auto');
    expect(labels.expand('[[first]]')).toBe('ABL:0');
    expect(labels.expand('[[late]]')).toBe('[[first]]');
    expect(labels.expand('[[cycle]]')).toBe('[[cycle]]');
    expect(warnings).toEqual([
      { key: 'csv.renameConflict', params: { token: '[[second]]' }, source: { filename: '_Rename.csv', line: 5 } },
      { key: 'csv.renameRow', source: { filename: '_Rename.csv', line: 6 } },
    ]);
    expect(labels.load([csv('_Rename.csv', 'ABL:2,second')], 'auto')[0].key).toBe('csv.renameConflict');
    expect(labels.expand('[[second]]')).toBe('ABL:0');
  });
  it('searches qualified references, partial tokens, and multidimensional indices within current bounds', () => {
    const e = open();
    e.labels.load([fixture('_Rename.csv')], 'auto');
    expect(e.query({ ...query, search: '[[focus]]' })).toMatchObject({ total: 1, expandedSearch: 'ABL:0', rows: [{ name: 'ABL', key: '0', scope: 0 }] });
    expect(e.query({ ...query, search: 'ABL:[[skill]]' }).rows.filter(isVariableRow)[0].key).toBe('0');
    expect(e.query({ ...query, search: '[[lastCell]]' }).rows.filter(isVariableRow)[0]).toMatchObject({ name: 'TA', key: '3,2,1', value: '42' });
    expect(e.query({ ...query, scope: -1, search: '[[focus]]' }).total).toBe(0);
    expect(e.query({ ...query, search: 'ABL:99' }).total).toBe(0);
    expect(e.query({ ...query, search: 'ABL:TARGET:0' }).total).toBe(0);
    const v = e.document.variables.find(v => v.name === 'ABL')!;
    e.resize(v.id, [0]);
    expect(e.query({ ...query, search: '[[focus]]' }).total).toBe(0);
    e.reset(); e.set(v.id, '0', '9');
    expect(e.query({ ...query, search: '[[focus]]', changedOnly: true }).rows.filter(isVariableRow)[0].value).toBe('9');
    expect(e.query({ ...query, search: 'ABL:1', changedOnly: true }).total).toBe(0);
  });
  it('bounds expansion size and work without modifying saved data or existing CSV metadata', () => {
    const e = open();
    const text = Array.from({ length: 20 }, (_, i) => `[[n${i + 1}]][[n${i + 1}]],n${i}`).join('\n');
    e.labels.load([csv('_Rename.csv', text)], 'auto');
    expect(() => e.query({ ...query, search: '[[n0]]' })).toThrow('error.renameExpansion');
    expect(() => e.labels.expand('x'.repeat(1_000_001))).toThrow('error.renameExpansion');
    expect(() => e.labels.expand('[[unknown]]'.repeat(90_000))).not.toThrow();
    e.labels.load([csv('_Rename.csv', Array.from({ length: 60 }, (_, i) => `0,extra${i}`).join('\n'))], 'auto');
    expect(() => e.labels.expand('[[unknown]]'.repeat(90_000))).toThrow('error.renameExpansion');
    expect(e.query({ ...query, search: 'MONEY:0' }).rows.filter(isVariableRow)[0].value).toBe('2500');
    expect(e.serialize()).toEqual(fixture('normal-binary.sav').bytes);
  });
});

describe('character CSV metadata', () => {
  it('reads Japanese and English names, enabled comments and CP932 without importing initial stats', () => {
    const labels = new Labels();
    const text = ';comment\n;!;NO,+0007\nNAME,青い旅人;注\n呼び名, アオ \nNICKNAME,青空\n主人の呼び方,隊長\nABL,0,999\nconstructor,ignored';
    expect(labels.load([{ name: 'folder/CHARA_other.CSV', bytes: encodeText(text, 'shift_jis') }], 'auto')).toEqual([]);
    expect(labels.characters.get('7')).toEqual({ no: '7', filename: 'folder/CHARA_other.CSV', fields: { NAME: '青い旅人;注', CALLNAME: ' アオ ', NICKNAME: '青空', MASTERNAME: '隊長' } });
    expect(labels.count).toBe(0);
    expect(labels.get('ABL', '0')).toBe('');
    expect(labels.get('RELATION', '7')).toBe('青い旅人;注');
    expect([...labels.matchingKeys('RELATION', '青空')]).toEqual(['7']);
  });
  it('requires explicit exact 64-bit numbers, never infers them from filenames or merges duplicate templates', () => {
    const labels = new Labels();
    const warnings = labels.load([
      csv('Chara1.csv', `NO,${MAX_INT}\nNAME,first\n名前,second\nNO,1`),
      csv('Chara2.csv', `番号,${MIN_INT}\n名前,minimum`),
      csv('Chara3.csv', `NO,${MAX_INT}\nCALLNAME,other`),
      csv('Chara7.csv', 'NAME,before\nNO,9223372036854775808'),
    ], 'auto');
    expect(labels.characters.get(String(MAX_INT))?.fields).toEqual({ NAME: 'first' });
    expect(labels.characters.get(String(MIN_INT))?.fields.NAME).toBe('minimum');
    expect(labels.characters.has('7')).toBe(false);
    expect(warnings.map(w => w.key)).toEqual(['csv.characterFieldConflict', 'csv.characterNumberDuplicate', 'csv.characterConflict', 'csv.characterNumberFirst', 'csv.characterNumber', 'csv.characterNumber']);
    expect(labels.load([csv('CharaBad.csv', 'NO,4\nNAME')], 'auto')[0]).toMatchObject({ key: 'csv.characterRow', source: { line: 2 } });
  });
  for (const save of ['normal-binary.sav', 'normal-text.sav', 'normal-sjis.sav']) {
    it(`${save}: labels saved NO and names, follows NO edits, and preserves saved names and bytes`, () => {
      const e = open(save);
      e.labels.load([fixture('Chara999.csv'), fixture('_Rename.csv'), csv('Chara8.csv', 'NO,8\nNAME,別人')], 'auto');
      expect(e.summary()).toMatchObject({ changes: 0, characterLabels: 2, renames: 3, characters: [{ name: 'アオイ', no: '7', csv: { fields: { NAME: '青い旅人' } } }] });
      expect(e.query({ ...query, search: '青い旅人' }).rows.filter(isVariableRow).map(row => row.name).sort()).toEqual(['NAME', 'NO']);
      const no = e.document.variables.find(v => v.name === 'NO')!;
      e.set(no.id, '', '8');
      expect(e.summary().characters[0]).toMatchObject({ name: 'アオイ', no: '8', csv: { fields: { NAME: '別人' } } });
      e.set(no.id, '', '9'); expect(e.summary().characters[0].csv).toBeUndefined();
      e.reset(); expect(e.serialize()).toEqual(fixture(save).bytes);
      e.labels.load([csv('_Rename.csv', 'NAME,名前参照')], 'auto');
      expect(e.query({ ...query, search: '[[名前参照]]' }).rows.filter(isVariableRow).find(row => row.name === 'NAME')).toMatchObject({ value: 'アオイ', label: '青い旅人', changed: false });
    });
  }
  it('labels and searches sparse RELATION cells by character NO, names, call names and nicknames', () => {
    const head = new BinaryWriter(); MAGIC.forEach(b => head.u8(b)); head.i32(1808); head.i32(0);
    head.u8(0); head.i64(1n); head.i64(1n); head.string(''); head.i64(1n);
    const relation: Variable = { id: 0, scope: 0, name: 'RELATION', kind: 'int', dimensions: [100_000_000], values: new Map(), start: 0, end: 0 };
    const bytes = new Uint8Array([...head.finish(), ...writeVariable(relation, new Map()), 254, 255]);
    const e = new Editor(parseSave(bytes, 'relation.sav'));
    e.labels.load([fixture('Chara999.csv'), csv('CharaFar.csv', 'NO,100000000\nNAME,青い旅人')], 'auto');
    for (const search of ['青い旅人', 'アオ', '青空']) expect(e.query({ ...query, search })).toMatchObject({ total: 1, rows: [{ name: 'RELATION', key: '7', label: '青い旅人', value: '0' }] });
    e.set(0, '7', '99');
    expect(e.query({ ...query, search: '青空', changedOnly: true }).rows.filter(isVariableRow)[0].value).toBe('99');
    e.reset(); expect(e.serialize()).toEqual(bytes);
  });
  it('leaves token-like CSV names literal and supports imports in any file order', () => {
    for (const reversed of [false, true]) {
      const files = [csv('ABL.csv', '0,[[name]]'), csv('Chara1.csv', 'NO,7\nNAME,[[name]]'), csv('_Rename.csv', 'replacement,name')];
      const labels = new Labels(); labels.load(reversed ? files.reverse() : files, 'auto');
      expect(labels.get('ABL', '0')).toBe('[[name]]');
      expect(labels.characters.get('7')?.fields.NAME).toBe('[[name]]');
      expect(labels.expand('[[name]]')).toBe('replacement');
    }
  });
  it('keeps earlier metadata after decode errors and rejects oversized batches before importing anything', () => {
    const labels = new Labels(); labels.load([fixture('Chara999.csv')], 'auto');
    expect(labels.load([{ name: '_Rename.csv', bytes: new Uint8Array([255]) }], 'utf-8')[0]).toMatchObject({ key: 'error.decode', source: { filename: '_Rename.csv' } });
    expect(() => labels.load([csv('_Rename.csv', '0,test'), { name: 'ABL.csv', bytes: new Uint8Array(MAX_FILE_BYTES) }], 'auto')).toThrow('error.csvSize');
    expect(labels.renames.size).toBe(0);
    expect(labels.characters.get('7')?.fields.NAME).toBe('青い旅人');
  });
});
