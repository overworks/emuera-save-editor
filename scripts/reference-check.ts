import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import type { NewVariable } from '../src/core/editor';
import { coordinates, cellCount } from '../src/core/model';
import { buildOracle, runOracle } from './oracle';

buildOracle();
mkdirSync('.reference/edited', { recursive: true });
for (const filename of readdirSync('tests/fixtures').filter(f => f.endsWith('.sav'))) {
  const editor = new Editor(parseSave(new Uint8Array(readFileSync(`tests/fixtures/${filename}`)), filename));
  const doc = editor.document;
  const dump = (path: string): Record<string, string> => JSON.parse(runOracle('read', path, doc.fileType, doc.encoding));
  const before = dump(`tests/fixtures/${filename}`);
  const metadata = ['ABL.csv', 'Chara999.csv', '_Rename.csv'].map(name => ({ name, bytes: new Uint8Array(readFileSync(`tests/fixtures/${name}`)) }));
  assert.deepEqual(editor.labels.load(metadata, 'auto'), []);
  assert.deepEqual(editor.serialize(), doc.original, `${filename}: CSV metadata must leave the save byte-identical`);
  // Edit every type/rank, including elements that were implicit zeros in binary arrays.
  for (const v of doc.variables) {
    const keys = v.textSpans ? [...v.textSpans.keys()] : Array.from({ length: cellCount(v.dimensions) }, (_, i) => coordinates(i, v.dimensions));
    for (const [i, key] of keys.entries()) {
      if (i % 3 !== 0 && i !== keys.length - 1) continue;
      editor.set(v.id, key, v.kind === 'int' ? (i % 2 ? '-9223372036854775808' : '9223372036854775807') : `編集${i}：日本語`);
    }
  }
  const editedPath = `.reference/edited/${filename}`;
  writeFileSync(editedPath, editor.serialize());
  const after = dump(editedPath);
  const expected = { ...before };
  for (const [id, changes] of editor.edits) {
    const v = doc.variables[id];
    for (const [key, value] of changes) expected[`${v.scope}:${v.name}:${key}`] = String(value);
  }
  assert.deepEqual(after, expected, `${filename}: the original reader must observe exactly the intended edits`);
  console.log(`✓ ${filename}: CSV metadata preserves original bytes; ${editor.summary().changes} edits accepted by the original engine reader`);
  if (doc.format !== 'binary') continue;
  for (const mode of ['grow', 'shrink', 'mixed', 'empty'] as const) {
    const resized = new Editor(parseSave(doc.original, filename));
    const resizedExpected = { ...before };
    for (const v of doc.variables.filter(v => v.dimensions.length)) {
      const dimensions = v.dimensions.map((n, axis) => mode === 'grow' ? n + 2 : mode === 'shrink' ? Math.max(0, n - 1)
        : mode === 'empty' ? axis === 0 ? 0 : n : axis % 2 ? Math.max(0, n - 1) : n + 1);
      resized.resize(v.id, dimensions);
      const prefix = `${v.scope}:${v.name}:`;
      for (const key of Object.keys(resizedExpected)) if (key.startsWith(prefix)) delete resizedExpected[key];
      resizedExpected[prefix + 'dimensions'] = dimensions.join(',');
      // Expected values come from the original C# dump, at unchanged coordinates.
      for (let i = 0; i < cellCount(dimensions); i++) {
        const key = coordinates(i, dimensions);
        resizedExpected[prefix + key] = before[prefix + key] ?? (v.kind === 'int' ? '0' : '');
      }
      if (cellCount(dimensions)) {
        const last = coordinates(cellCount(dimensions) - 1, dimensions);
        const value = v.kind === 'int' ? '-9223372036854775808' : '拡張😀';
        resized.set(v.id, last, value); resizedExpected[prefix + last] = value;
      }
    }
    const path = `.reference/edited/${mode}-${filename}`;
    writeFileSync(path, resized.serialize());
    assert.deepEqual(dump(path), resizedExpected, `${filename} ${mode}: the original reader must observe the planned sizes and full value dictionaries`);
    resized.reset(); assert.deepEqual(resized.serialize(), doc.original);
    console.log(`✓ ${filename}: ${mode} array sizes and values accepted by the original engine reader`);
  }
}

// Exercise record membership/order and character separators with the original reader/writer.
const structureFixture = '.reference/edited/structure-base.sav';
runOracle('generate-structure', structureFixture);
for (const path of ['tests/fixtures/normal-binary.sav', 'tests/fixtures/global-binary.sav', structureFixture]) {
  const raw = new Uint8Array(readFileSync(path)), editor = new Editor(parseSave(raw, 'structure.sav'));
  const before: Record<string, string> = JSON.parse(runOracle('read', path, editor.document.fileType, editor.document.encoding));
  const expected = { ...before }, layout: string[] = JSON.parse(before.layout);
  const add = (variable: NewVariable) => {
    const id = editor.addVariable(variable), rank = variable.dimensions.length;
    const end = variable.scope === -1 ? 'eof' : `${variable.scope}:end`, separator = `${variable.scope}:separator`;
    if (variable.scope >= 0 && variable.section !== 'builtin' && !layout.includes(separator)) layout.splice(layout.indexOf(end), 0, separator);
    const anchor = variable.section === 'builtin' && layout.includes(separator) ? separator : end;
    layout.splice(layout.indexOf(anchor), 0, `${variable.scope}:${variable.name}:${(variable.kind === 'string' ? 16 : 0) + rank}`);
    const prefix = `${variable.scope}:${variable.name}:`;
    if (rank) expected[prefix + 'dimensions'] = variable.dimensions.join(',');
    for (let i = 0; i < cellCount(variable.dimensions); i++) expected[prefix + coordinates(i, variable.dimensions)] = variable.kind === 'int' ? '0' : '';
    if (cellCount(variable.dimensions)) {
      const key = coordinates(cellCount(variable.dimensions) - 1, variable.dimensions), value = variable.kind === 'int' ? '-9223372036854775808' : '追加😀';
      editor.set(id, key, value); expected[prefix + key] = value;
    }
  };
  for (const kind of ['int', 'string'] as const) for (const rank of [0, 1, 2, 3]) add({ scope: -1, name: `NEW_${kind}_${rank}`, kind, dimensions: Array(rank).fill(2) });
  add({ scope: -1, name: 'EMPTY', kind: 'string', dimensions: [0, 3] });
  for (let scope = 0; scope < editor.document.characterCount; scope++) {
    // Add the custom record first to ensure later built-ins still precede its separator.
    add({ scope, name: 'NEW_CUSTOM', kind: 'int', dimensions: [2, 3], section: 'user' });
    add({ scope, name: 'NICKNAME', kind: 'string', dimensions: [], section: 'builtin' });
  }
  const removed = editor.document.variables[0];
  if (removed) {
    editor.deleteVariable(removed.id);
    const prefix = `${removed.scope}:${removed.name}:`;
    for (const key of Object.keys(expected)) if (key.startsWith(prefix)) delete expected[key];
    layout.splice(layout.findIndex(record => record.startsWith(prefix)), 1);
  }
  expected.layout = JSON.stringify(layout);
  const output = `.reference/edited/structure-${path.split('/').at(-1)}`;
  writeFileSync(output, editor.serialize());
  assert.deepEqual(JSON.parse(runOracle('read', output, editor.document.fileType, editor.document.encoding)), expected, `${path}: added/deleted records, exact types, order, separators and all values`);
  editor.reset(); assert.deepEqual(editor.serialize(), raw);
  for (const variable of editor.document.variables) editor.deleteVariable(variable.id);
  const emptyExpected = Object.fromEntries(Object.entries(before).filter(([key]) => !/^-?\d+:/.test(key)));
  emptyExpected.layout = JSON.stringify((JSON.parse(before.layout) as string[]).filter(record => record === 'eof' || /^\d+:(end|separator)$/.test(record)));
  writeFileSync(output, editor.serialize());
  assert.deepEqual(JSON.parse(runOracle('read', output, editor.document.fileType, editor.document.encoding)), emptyExpected, `${path}: deleting all variables preserves headers and character boundaries`);
  editor.reset(); assert.deepEqual(editor.serialize(), raw);
  console.log(`✓ ${path}: variable additions/deletions, empty scopes, and exact reset accepted by the original engine reader`);
}

const characterFixture = '.reference/edited/characters-base.sav';
runOracle('generate-characters', characterFixture);
const characterBytes = new Uint8Array(readFileSync(characterFixture));
const characterBefore: Record<string, string> = JSON.parse(runOracle('read', characterFixture, 'normal', 'utf-16le'));
const characterEditor = new Editor(parseSave(characterBytes, 'characters.sav'));
const characterVariable = (scope: number, name: string) => characterEditor.summary().variables.find(v => v.scope === scope && v.name === name && !v.deleted)!;
const characterExpected = (sources: { scope: number; data: Record<string, string> }[], references: Record<string, string> = {}) => {
  const result = Object.fromEntries(Object.entries(characterBefore).filter(([key]) => !/^\d+:/.test(key)));
  const layout: string[] = [];
  for (const [index, source] of sources.entries()) {
    const prefix = `${source.scope}:`;
    for (const [key, value] of Object.entries(source.data)) if (key.startsWith(prefix)) result[`${index}:${key.slice(prefix.length)}`] = value;
    for (const record of JSON.parse(source.data.layout) as string[]) if (record.startsWith(prefix)) layout.push(`${index}:${record.slice(prefix.length)}`);
  }
  layout.push(...(JSON.parse(characterBefore.layout) as string[]).filter(record => record === 'eof' || record.startsWith('-1:')));
  result.chars = String(sources.length); result.layout = JSON.stringify(layout);
  for (const [name, value] of Object.entries(references)) result[`-1:${name}:0`] = value;
  return result;
};
const checkCharacters = (name: string, expected: Record<string, string>) => {
  const path = `.reference/edited/characters-${name}.sav`; writeFileSync(path, characterEditor.serialize());
  assert.deepEqual(JSON.parse(runOracle('read', path, 'normal', 'utf-16le')), expected, `characters ${name}: count, scope order, records, dimensions and every value`);
  console.log(`✓ characters ${name}: count, complete records/values and references accepted by the original engine reader`);
};
const source = (scope: number, data = characterBefore) => ({ scope, data });

// The expected dictionaries below originate from C#, with explicit edits and scope remapping.
const snapshot = { ...characterBefore }, editedAbl = characterVariable(0, 'ABL');
characterEditor.resize(editedAbl.id, [5]); characterEditor.set(editedAbl.id, '0', '-9223372036854775808'); characterEditor.set(editedAbl.id, '4', '9223372036854775807');
Object.assign(snapshot, { '0:ABL:dimensions': '5', '0:ABL:0': '-9223372036854775808', '0:ABL:3': '0', '0:ABL:4': '9223372036854775807' });
characterEditor.deleteVariable(characterVariable(0, 'CUSTOM').id);
for (const key of Object.keys(snapshot)) if (key.startsWith('0:CUSTOM:')) delete snapshot[key];
const extra = characterEditor.addVariable({ scope: 0, name: 'EXTRA', kind: 'string', dimensions: [1, 2] }); characterEditor.set(extra, '0,1', '複製😀');
Object.assign(snapshot, { '0:EXTRA:dimensions': '1,2', '0:EXTRA:0,0': '', '0:EXTRA:0,1': '複製😀' });
const snapshotLayout = (JSON.parse(snapshot.layout) as string[]).filter(record => !record.startsWith('0:CUSTOM:'));
snapshotLayout.splice(snapshotLayout.indexOf('0:end'), 0, '0:EXTRA:18'); snapshot.layout = JSON.stringify(snapshotLayout);
characterEditor.cloneCharacter(0); characterEditor.deleteCharacter(1);
characterEditor.set(characterVariable(0, 'NAME').id, '', '後で変更');
checkCharacters('edited-copy-and-delete', characterExpected([source(0, { ...snapshot, '0:NAME:': '後で変更' }), source(2), source(0, snapshot)], { TARGET: '1', ASSI: '-1', PLAYER: '1' }));
characterEditor.reset(); assert.deepEqual(characterEditor.serialize(), characterBytes);

for (const scope of [0, 1, 2]) characterEditor.deleteCharacter(scope);
checkCharacters('delete-all', characterExpected([], { TARGET: '-1', ASSI: '-1', MASTER: '-1', PLAYER: '-1' }));
for (const scope of [2, 0, 1]) characterEditor.restoreCharacter(scope);
assert.deepEqual(characterEditor.serialize(), characterBytes);

characterEditor.cloneCharacter(1); const unseparated = characterEditor.cloneCharacter(2);
characterEditor.addVariable({ scope: unseparated, name: 'NEW_CUSTOM', kind: 'string', dimensions: [0] });
const withSeparator: Record<string, string> = { ...characterBefore, '2:NEW_CUSTOM:dimensions': '0' }, separatedLayout: string[] = JSON.parse(characterBefore.layout);
separatedLayout.splice(separatedLayout.indexOf('2:end'), 0, '2:separator', '2:NEW_CUSTOM:17'); withSeparator.layout = JSON.stringify(separatedLayout);
checkCharacters('empty-and-unseparated-copies', characterExpected([source(0), source(1), source(2), source(1), source(2, withSeparator)]));
characterEditor.reset(); assert.deepEqual(characterEditor.serialize(), characterBytes);

characterEditor.deleteCharacter(0); characterEditor.set(characterVariable(-1, 'TARGET').id, '0', '0'); characterEditor.restoreCharacter(0);
checkCharacters('manual-reference-restore', characterExpected([source(0), source(1), source(2)], { TARGET: '1' }));
const referencedCopy = characterEditor.cloneCharacter(0); characterEditor.set(characterVariable(-1, 'TARGET').id, '0', '3'); characterEditor.deleteCharacter(1);
checkCharacters('reference-to-copy', characterExpected([source(0), source(2), source(0)], { TARGET: '2', ASSI: '-1', PLAYER: '1' }));
characterEditor.deleteCharacter(referencedCopy);
checkCharacters('cancel-referenced-copy', characterExpected([source(0), source(2)], { TARGET: '-1', ASSI: '-1', PLAYER: '1' }));
characterEditor.reset(); assert.deepEqual(characterEditor.serialize(), characterBytes);
