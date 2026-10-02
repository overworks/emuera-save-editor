import { isVariableRow } from './rows';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import { BinaryWriter, MAGIC, parseBinary, writeVariable } from '../src/core/binary';
import { encodeText } from '../src/core/encoding';
import { Labels } from '../src/core/labels';
import { MAX_INT, MIN_INT, cellCount, coordinates, originalValue } from '../src/core/model';
import type { Scalar, Variable } from '../src/core/model';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.sav`));
const open = (name: string) => new Editor(parseSave(fixture(name), name + '.sav'));
const variable = (editor: Editor, name: string) => editor.document.variables.find(v => v.name === name)!;

describe('real engine fixtures', () => {
  for (const name of readdirSync('tests/fixtures').filter(n => n.endsWith('.sav'))) {
    it(`${name}: byte-identical no-op, editable and reversible`, () => {
      const bytes = new Uint8Array(readFileSync(`tests/fixtures/${name}`));
      const e = new Editor(parseSave(bytes, name));
      expect(e.serialize()).toEqual(bytes);
      expect(e.document.gameCode).toBe(4242n);
      const v = variable(e, e.document.fileType === 'global' ? 'GLOBAL' : 'MONEY');
      e.set(v.id, '0', MAX_INT.toString());
      const edited = e.serialize();
      const read = new Editor(parseSave(edited, 'renamed.sav'));
      expect(variable(read, v.name).values.get('0')).toBe(MAX_INT);
      e.revert(v.id, '0'); expect(e.serialize()).toEqual(bytes);
    });
  }
  it('reads all integer widths, extrema, Unicode and compressed matrices', () => {
    const e = open('normal-binary');
    const flag = variable(e, 'FLAG');
    expect([...flag.values.values()]).toContain(MIN_INT);
    expect([...flag.values.values()]).toContain(MAX_INT);
    expect(variable(e, 'CUSTOM').values.get('1,1')).toBe('😀');
    expect(variable(e, 'TA').values.get('3,2,1')).toBe(42n);
    expect(variable(e, 'TEXT3').values.get('1,1,1')).toBe('c');
  });
  it('changes compressed zero elements and string lengths without disturbing other variables', () => {
    const e = open('normal-binary');
    e.set(variable(e, 'TA').id, '0,2,3', MIN_INT.toString());
    e.set(variable(e, 'TA').id, '3,2,1', '0');
    e.set(variable(e, 'CUSTOM').id, '0,0', '가나다\n日本語😀'.repeat(100));
    const next = new Editor(parseSave(e.serialize(), 'save.sav'));
    expect(variable(next, 'TA').values.get('0,2,3')).toBe(MIN_INT);
    expect(originalValue(variable(next, 'TA'), '3,2,1')).toBe(0n);
    expect(variable(next, 'CUSTOM').values.get('0,0')).toBe('가나다\n日本語😀'.repeat(100));
    for (const v of e.document.variables.filter(v => !e.edits.has(v.id))) {
      const after = next.document.variables[v.id];
      expect(next.document.original.slice(after.start, after.end)).toEqual(e.document.original.slice(v.start, v.end));
    }
  });
  it('preserves BOM, mixed line endings, numeric whitespace, and untouched CP932 bytes', () => {
    const initial = new TextDecoder().decode(fixture('normal-text'));
    const raw = new TextEncoder().encode('\ufeff' + initial.replace('2500\r\n', '  +02500 \n'));
    const e = new Editor(parseSave(raw, 'save.sav'));
    const v = variable(e, 'MONEY');
    e.set(v.id, '0', '-5');
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(e.serialize())).toBe('\ufeff' + initial.replace('2500\r\n', '-5\n'));
    const sjis = open('normal-sjis');
    expect(sjis.document.encoding).toBe('shift_jis');
    sjis.set(variable(sjis, 'NAME').id, '', '日本語');
    expect(new Editor(parseSave(sjis.serialize(), 'a.sav')).summary().characters[0].name).toBe('日本語');
    expect(() => sjis.set(variable(sjis, 'NAME').id, '', '한글')).toThrow('error.encode');
  });
  it('keeps ragged text matrices and edits only represented cells', () => {
    const e = open('normal-text');
    const da = variable(e, 'DA');
    expect(da.values.has('1,0')).toBe(false);
    expect(() => e.set(da.id, '1,0', '10')).toThrow('error.cellBounds');
    e.set(da.id, '2,0', '20');
    e.set(variable(e, 'TA').id, '2,2,1', '7');
    expect(variable(new Editor(parseSave(e.serialize(), 'save.sav')), 'DA').values.get('2,0')).toBe(20n);
  });
});

describe('validation and browsing', () => {
  it('rejects unsafe input and accepts exact 64-bit values', () => {
    const e = open('normal-text'), money = variable(e, 'MONEY');
    for (const s of ['1.2', '1e5', '', '9223372036854775808', '-9223372036854775809']) expect(() => e.set(money.id, '0', s)).toThrow();
    for (const s of [String(MIN_INT), String(MAX_INT), '-5', '0']) e.set(money.id, '0', s);
    const name = variable(e, 'NAME');
    for (const s of ['a\nb', '__FINISHED', '__EMU_SEPARATOR__', 'a\0b']) expect(() => e.set(name.id, '', s)).toThrow();
    e.set(name.id, '', '한글 😀'); expect(e.serialize().length).toBeGreaterThan(0);
  });
  it('rejects unknown versions, truncated bodies and unsupported file types', () => {
    const raw = fixture('normal-binary');
    for (const cut of [0, 7, 19, 43, raw.length - 1]) expect(() => parseSave(raw.slice(0, cut), 'save.sav')).toThrow();
    const version = raw.slice(); version[8] = 0; expect(() => parseSave(version, 's')).toThrow('error.binaryVersion');
    const type = raw.slice(); type[16] = 2; expect(() => parseSave(type, 's')).toThrow('error.fileType');
    const extra = new Uint8Array([...raw, 5]); expect(() => parseSave(extra, 's')).toThrow('error.trailingBinary');
    const text = new TextDecoder().decode(fixture('normal-text')).replace('__EMUERA_1808_STRAT__', '__EMUERA_9999_STRAT__');
    expect(() => parseSave(new TextEncoder().encode(text), 's')).toThrow('error.textExtension');
  });
  it('does not treat inherited property names as format markers or CSV families', () => {
    const base = new TextDecoder().decode(fixture('normal-text')).split('__EMUERA_1808_STRAT__')[0];
    for (const marker of ['constructor', '__proto__', 'toString']) {
      const text = base + marker + '\r\n' + '__EMU_SEPARATOR__\r\n'.repeat(14);
      expect(() => parseSave(new TextEncoder().encode(text), 'save.sav')).toThrow('error.textExtension');
      expect(new Labels().load([{ name: marker + '.csv', bytes: new TextEncoder().encode('0,name') }], 'auto')[0]).toMatchObject({ key: 'csv.unsupported' });
    }
  });
  it('searches variables, exact indices and CSV names, and filters changes', () => {
    const e = open('normal-binary');
    e.labels.load([{ name: 'ABL.csv', bytes: new TextEncoder().encode('0,집중력\n2,기술') }], 'auto');
    const q = { scope: 'all' as const, search: '집중력', changedOnly: false, page: 0 };
    expect(e.query(q).rows.filter(isVariableRow)[0].name).toBe('ABL');
    expect(e.query({ ...q, search: '3:2:1' }).rows.filter(isVariableRow)[0].value).toBe('42');
    const m = variable(e, 'MONEY'); e.set(m.id, '0', '3456');
    expect(e.query({ ...q, search: '', changedOnly: true }).rows.filter(isVariableRow)).toHaveLength(1);
    e.set(m.id, '0', '2500'); expect(e.summary().changes).toBe(0);
    expect(e.query({ ...q, search: 'money' }).rows.filter(isVariableRow)[0].value).toBe('2500');
  });
  it('applies aliases, comments and first-wins CSV conflicts', () => {
    const labels = new Labels();
    const warnings = labels.load([{ name: 'PALAM.CSV', bytes: encodeText(';comment\n0,体力; note\n0,違う\n1,気力\ninvalid', 'shift_jis') }], 'auto');
    expect(labels.get('JUEL', '0')).toBe('体力; note'); expect(labels.get('PALAM', '1')).toBe('気力');
    expect(warnings).toHaveLength(2);
    expect(labels.load([{ name: 'chara1.csv', bytes: new Uint8Array() }], 'auto')[0]).toMatchObject({ key: 'csv.characterNumber' });
  });
});

describe('binary array resizing', () => {
  for (const file of ['normal-binary', 'global-binary']) {
    it(`${file}: grows every array type and preserves coordinates, original data, and untouched bytes`, () => {
      const e = open(file);
      for (const v of e.document.variables.filter(v => v.dimensions.length)) {
        const originalDimensions = [...v.dimensions];
        const dimensions = v.dimensions.map(n => n + 1);
        e.resize(v.id, dimensions);
        const key = dimensions.map(n => n - 1).join(',');
        e.set(v.id, key, v.kind === 'int' ? String(MIN_INT) : '追加😀');
        expect(v.dimensions).toEqual(originalDimensions);
        const read = new Editor(parseSave(e.serialize(), 'resized.sav'));
        const after = read.document.variables[v.id];
        expect(after.dimensions).toEqual(dimensions);
        expect(originalValue(after, key)).toBe(v.kind === 'int' ? MIN_INT : '追加😀');
        for (const [key, value] of v.values) expect(originalValue(after, key)).toBe(value);
      }
      const next = parseSave(e.serialize(), 'resized.sav');
      expect(next.original.slice(0, next.variables[0].start)).toEqual(e.document.original.slice(0, e.document.variables[0].start));
      for (const v of e.document.variables.filter(v => !v.dimensions.length)) {
        const after = next.variables[v.id];
        expect(next.original.slice(after.start, after.end)).toEqual(e.document.original.slice(v.start, v.end));
      }
      e.reset();
      expect(e.summary().changes).toBe(0);
      expect(e.serialize()).toEqual(fixture(file));
    });
  }
  it('shrinks by coordinate and restores hidden original values and edits when expanded again', () => {
    const e = open('normal-binary'), v = variable(e, 'DA');
    e.set(v.id, '3,4', '123');
    e.set(v.id, '1,2', '456');
    e.resize(v.id, [2, 3]);
    expect(e.summary()).toMatchObject({ changes: 2, resizedArrays: 1 });
    const query = { scope: 'all' as const, variableId: v.id, search: '', changedOnly: true, page: 0 };
    expect(e.query(query).rows.filter(isVariableRow).map(row => [row.type, row.key])).toEqual([['resize', ''], ['value', '1,2']]);
    const after = variable(new Editor(parseSave(e.serialize(), 'resized.sav')), 'DA');
    expect(after.dimensions).toEqual([2, 3]);
    expect(after.values.get('1,2')).toBe(456n);
    expect(after.values.has('3,4')).toBe(false);
    expect(() => e.set(v.id, '3,4', '789')).toThrow('error.cellBounds');
    expect(e.query({ ...query, changedOnly: false, search: '3:4' }).total).toBe(0);
    e.revertResize(v.id);
    expect(e.summary()).toMatchObject({ changes: 2, resizedArrays: 0 });
    expect(e.query({ ...query, search: '3:4' }).rows.filter(isVariableRow)[0].value).toBe('123');
    e.revert(v.id, '3,4'); e.revert(v.id, '1,2');
    expect(e.serialize()).toEqual(fixture('normal-binary'));
  });
  it('supports empty arrays and ignores hidden edits in no-op exports and CSV searches', () => {
    const e = open('normal-binary'), v = variable(e, 'ABL');
    const q = { scope: 0, variableId: v.id, search: '', changedOnly: false, page: 0 };
    e.labels.load([{ name: 'ABL.csv', bytes: new TextEncoder().encode('8,追加') }], 'auto');
    e.resize(v.id, [10]); e.set(v.id, '8', '55');
    expect(e.query({ ...q, search: '追加' }).rows.filter(isVariableRow)[0].value).toBe('55');
    e.resize(v.id, [0]);
    expect(e.query(q).rows.filter(isVariableRow)).toEqual([]);
    expect(e.query({ ...q, changedOnly: true }).rows.filter(isVariableRow)[0].type).toBe('resize');
    expect(variable(new Editor(parseSave(e.serialize(), 'empty.sav')), 'ABL').dimensions).toEqual([0]);
    e.revertResize(v.id);
    expect(e.query({ ...q, search: '追加' }).rows.filter(isVariableRow)).toEqual([]);
    expect(e.summary().changes).toBe(0);
    expect(e.serialize()).toEqual(fixture('normal-binary'));
    e.resize(v.id, [10]);
    expect(e.query({ ...q, search: '8' }).rows.filter(isVariableRow)[0].value).toBe('55');
    e.reset(); e.resize(v.id, [10]);
    expect(e.query({ ...q, search: '8' }).rows.filter(isVariableRow)[0].value).toBe('0');
  });
  it('validates sizes atomically and rejects text arrays, scalars, and rank changes', () => {
    const e = open('normal-binary'), v = variable(e, 'DA');
    for (const dimensions of [[-1, 5], [1.5, 5], [NaN, 5], [Infinity, 5], [10001, 10000], [0, 2147483648]]) {
      expect(() => e.resize(v.id, dimensions)).toThrow('error.resizeSize');
    }
    for (const dimensions of [[], [2], [2, 2, 2]]) expect(() => e.resize(v.id, dimensions)).toThrow('error.resizeRank');
    expect(() => e.resize(variable(e, 'NAME').id, [2])).toThrow('error.resizeRank');
    const text = open('normal-text');
    expect(() => text.resize(variable(text, 'DA').id, [3, 3])).toThrow('error.resizeBinary');
    expect(e.summary().changes).toBe(0);
    expect(e.serialize()).toEqual(fixture('normal-binary'));
    const dimensions = [3, 3]; e.resize(v.id, dimensions); dimensions[0] = -1;
    expect(e.summary().variables[v.id].dimensions).toEqual([3, 3]);
  });
  it('paginates size changes together with value changes in at most 50 rows', () => {
    const e = open('global-binary'), v = variable(e, 'GLOBAL');
    e.resize(v.id, [60]);
    for (let i = 0; i < 51; i++) e.set(v.id, String(i), '1234567');
    const q = { scope: -1, variableId: v.id, search: '', changedOnly: true, page: 0 };
    expect(e.query(q)).toMatchObject({ total: 52, pages: 2 });
    expect(e.query(q).rows.filter(isVariableRow)).toHaveLength(50);
    expect(e.query(q).rows.filter(isVariableRow)[0].type).toBe('resize');
    expect(e.query({ ...q, page: 1 }).rows.filter(isVariableRow).map(row => row.key)).toEqual(['49', '50']);
    expect(e.query({ ...q, search: '50' }).rows.filter(isVariableRow).map(row => row.key)).toEqual(['50']);
  });
});

describe('binary sparse codec', () => {
  function document(v: Variable): Uint8Array {
    const head = new BinaryWriter(); MAGIC.forEach(b => head.u8(b)); head.i32(1808); head.i32(0);
    head.u8(1); head.i64(1n); head.i64(1n); head.string('');
    return new Uint8Array([...head.finish(), ...writeVariable(v, new Map()), 255]);
  }
  it('round trips many sparse patterns across all ranks and scalar types', () => {
    let seed = 9231;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (const rank of [1, 2, 3]) for (const kind of ['int', 'string'] as const) for (let sample = 0; sample < 30; sample++) {
      const dimensions = Array.from({ length: rank }, () => Math.floor(random() * 5) + 1);
      const values = new Map<string, Scalar>();
      for (let i = 0; i < cellCount(dimensions); i++) if (random() < .3) values.set(coordinates(i, dimensions), kind === 'int' ? BigInt(Math.floor(random() * 9999) - 5000) : `한글😀${i}`);
      const v: Variable = { id: 0, scope: -1, name: 'TEST', dimensions, values, kind, start: 0, end: 0 };
      const parsed = parseBinary(document(v), 'global.sav').variables[0];
      for (let i = 0; i < cellCount(dimensions); i++) {
        const key = coordinates(i, dimensions); expect(originalValue(parsed, key)).toEqual(originalValue(v, key));
      }
    }
  });
  it('pages a 100-million-cell sparse array without expanding it', () => {
    const v: Variable = { id: 0, scope: -1, name: 'BIG', dimensions: [10000, 10000], values: new Map([['9999,9999', 8n]]), kind: 'int', start: 0, end: 0 };
    const raw = document(v); expect(raw.length).toBeLessThan(100);
    const e = new Editor(parseSave(raw, 'global.sav'));
    expect(e.document.variables[0].values.size).toBe(1);
    expect(e.query({ scope: -1, search: '', changedOnly: false, page: 1_999_999 }).rows.filter(isVariableRow).at(-1)?.value).toBe('8');
    e.set(0, '0,0', '12'); expect(e.serialize().length).toBeLessThan(120);
    e.resize(0, [20000, 5000]);
    e.set(0, '19999,4999', String(MAX_INT));
    expect(e.query({ scope: -1, search: '', changedOnly: false, page: 1_999_999 }).rows.filter(isVariableRow).at(-1)?.value).toBe(String(MAX_INT));
    const resized = parseSave(e.serialize(), 'global.sav');
    expect(resized.variables[0].values.size).toBe(2);
    expect(resized.original.length).toBeLessThan(150);
    e.resize(0, [0, 5000]);
    expect(parseSave(e.serialize(), 'global.sav').variables[0].values.size).toBe(0);
    e.reset(); expect(e.serialize()).toEqual(raw);
  });
});
