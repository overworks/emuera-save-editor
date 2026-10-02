import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { NewVariable } from '../src/core/editor';
import { cellCount, coordinates } from '../src/core/model';
import type { TextEncoding } from '../src/core/model';
import { runOracle } from './oracle';

export function checkTextVariables() {
  const cases: { path: string; global: boolean; encoding: TextEncoding; version: number }[] = [];
  for (const global of [false, true]) for (const encoding of ['utf-8', 'shift_jis'] as const) cases.push({
    path: `tests/fixtures/${global ? 'global' : 'normal'}-${encoding === 'utf-8' ? 'text' : 'sjis'}.sav`, global, encoding, version: 1808,
  });
  for (const version of [1700, 1708, 1729, 1803, 1808]) {
    const path = `.reference/edited/text-variables-${version}.sav`, encoding = version === 1729 ? 'shift_jis' : 'utf-8';
    runOracle('generate-text-characters', path, encoding, String(version), 'lf', 'nobom');
    const raw = readFileSync(path).toString(encoding === 'utf-8' ? 'utf8' : 'latin1');
    // ASCII line endings only: retain encoded content and vary the boundaries independently.
    const lines = raw.trimEnd().split('\n');
    writeFileSync(path, Buffer.from(lines.map((line, i) => line + (i === lines.length - 1 ? '' : ['\r\n', '\r', '\n'][i % 3])).join(''), encoding === 'utf-8' ? 'utf8' : 'latin1'));
    cases.push({ path, global: false, encoding, version });
  }
  for (const { path, global, encoding, version } of cases) {
    const bytes = new Uint8Array(readFileSync(path)), e = new Editor(parseSave(bytes, path, encoding));
    const before: Record<string, string> = JSON.parse(runOracle('read', path, global ? 'global' : 'normal', encoding));
    let expected = { ...before }, layout: string[] = JSON.parse(before.layout);
    const key = (record: string) => {
      const [part, scope, , kind, rank, section] = record.split(':');
      return [part === 'base' ? 0 : 1, scope === '-1' ? 100_000 : Number(scope), section === 'user' ? 1 : 0, Number(rank), kind === 'int' ? 1 : 0];
    };
    const compare = (a: string, b: string) => {
      const left = key(a), right = key(b);
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
      return 0;
    };
    const insert = (record: string) => {
      const at = layout.findIndex(other => compare(other, record) > 0);
      layout.splice(at < 0 ? layout.length : at, 0, record);
    };
    const remove = (scope: number, name: string) => {
      e.deleteVariable(e.summary().variables.find(v => v.scope === scope && v.name === name)!.id);
      for (const k of Object.keys(expected)) if (k.startsWith(`${scope}:${name}:`)) delete expected[k];
      layout = layout.filter(record => !record.startsWith(`extended:${scope}:${name}:`));
    };
    const add = (variable: NewVariable) => {
      const id = e.addVariable(variable), rank = variable.dimensions.length;
      insert(`extended:${variable.scope}:${variable.name}:${variable.kind}:${rank}:${variable.section}`);
      const prefix = `${variable.scope}:${variable.name}:`;
      for (let i = 0; i < cellCount(variable.dimensions); i++) expected[prefix + coordinates(i, variable.dimensions)] = variable.kind === 'int' ? '0' : '';
      if (cellCount(variable.dimensions)) {
        const last = coordinates(cellCount(variable.dimensions) - 1, variable.dimensions);
        const value = variable.kind === 'int' ? '-9223372036854775808' : '新規:文字';
        e.set(id, last, value); expected[prefix + last] = value;
      }
      return id;
    };
    const check = (scenario: string) => {
      const output = `.reference/edited/text-variables-${path.split('/').at(-1)}-${scenario}.sav`;
      writeFileSync(output, e.serialize()); expected.layout = JSON.stringify(layout);
      const actual: Record<string, string> = JSON.parse(runOracle('read', output, global ? 'global' : 'normal', encoding));
      assert.deepEqual(JSON.parse(actual.layout), layout, `${path} ${scenario}: groups and record order`);
      assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${path} ${scenario}: full value membership`);
      for (const [key, value] of Object.entries(expected)) if (key !== 'layout') assert.equal(actual[key], value, `${path} ${scenario}: ${key}`);
    };
    assert.deepEqual(e.serialize(), bytes);
    remove(global ? -1 : 0, global ? 'NOTES' : 'NICKNAME');
    // Deliberately add user records and higher ranks first; disk order follows groups.
    for (const scope of global ? [-1] : [0, -1]) for (const section of ['user', 'builtin'] as const) {
      if (section === 'user' ? scope >= 0 || version < 1808 : global) continue;
      for (const kind of ['int', 'string'] as const) {
        const max = kind === 'string' ? 1 : scope >= 0 ? version < 1803 ? 1 : 2 : version < 1708 ? 1 : version < 1729 ? 2 : 3;
        for (let rank = max; rank >= (section === 'user' ? 1 : 0); rank--) add({ scope, section, kind, name: `追加_${section}_${kind}_${rank}`, dimensions: Array(rank).fill(2) });
      }
    }
    add({ scope: -1, section: version >= 1808 ? 'user' : 'builtin', kind: 'string', name: 'EMPTY', dimensions: [0] });
    check('add-delete');
    if (!global) {
      const copy = e.cloneCharacter(0), position = Number(before.chars);
      for (const [k, value] of Object.entries(expected)) if (k.startsWith('0:')) expected[`${position}:${k.slice(2)}`] = value;
      for (const record of [...layout]) if (/^(base|extended):0:/.test(record)) insert(record.replace(':0:', `:${position}:`));
      expected.chars = String(position + 1);
      assert.equal(copy, position);
      remove(0, '追加_builtin_int_0');
      add({ scope: copy, section: 'builtin', kind: 'string', name: 'COPY_ONLY', dimensions: [2] });
      check('independent-copy');
    }
    e.reset(); assert.deepEqual(e.serialize(), bytes);
    expected = { ...before }; layout = JSON.parse(before.layout);
    for (const record of [...layout]) if (record.startsWith('extended:')) {
      const [, scope, name] = record.split(':'); remove(Number(scope), name);
    }
    check('delete-all-extensions');
    for (const v of e.document.variables.filter(v => v.textSection === 'extended')) e.restoreVariable(v.id);
    assert.deepEqual(e.serialize(), bytes);
    console.log(`✓ ${path}: text additions/deletions, group placement, ${global ? 'global arrays' : 'independent copies'}, complete values and exact undo accepted by the original reader`);
  }
}
