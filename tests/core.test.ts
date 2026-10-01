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
    expect(e.query(q).rows[0].name).toBe('ABL');
    expect(e.query({ ...q, search: '3:2:1' }).rows[0].value).toBe('42');
    const m = variable(e, 'MONEY'); e.set(m.id, '0', '3456');
    expect(e.query({ ...q, search: '', changedOnly: true }).rows).toHaveLength(1);
    e.set(m.id, '0', '2500'); expect(e.summary().changes).toBe(0);
    expect(e.query({ ...q, search: 'money' }).rows[0].value).toBe('2500');
  });
  it('applies aliases, comments and first-wins CSV conflicts', () => {
    const labels = new Labels();
    const warnings = labels.load([{ name: 'PALAM.CSV', bytes: encodeText(';comment\n0,体力; note\n0,違う\n1,気力\ninvalid', 'shift_jis') }], 'auto');
    expect(labels.get('JUEL', '0')).toBe('体力; note'); expect(labels.get('PALAM', '1')).toBe('気力');
    expect(warnings).toHaveLength(2);
    expect(labels.load([{ name: 'chara1.csv', bytes: new Uint8Array() }], 'auto')[0]).toMatchObject({ key: 'csv.unsupported' });
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
    expect(e.query({ scope: -1, search: '', changedOnly: false, page: 1_999_999 }).rows.at(-1)?.value).toBe('8');
    e.set(0, '0,0', '12'); expect(e.serialize().length).toBeLessThan(120);
  });
});
