import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Editor, parseSave } from '../src/core/editor';
import { coordinates, cellCount } from '../src/core/model';
import { buildOracle, runOracle } from './oracle';

buildOracle();
mkdirSync('.reference/edited', { recursive: true });
for (const filename of readdirSync('tests/fixtures').filter(f => f.endsWith('.sav'))) {
  const editor = new Editor(parseSave(new Uint8Array(readFileSync(`tests/fixtures/${filename}`)), filename));
  const doc = editor.document;
  const dump = (path: string): Record<string, string> => JSON.parse(runOracle('read', path, doc.fileType, doc.encoding));
  const before = dump(`tests/fixtures/${filename}`);
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
  console.log(`✓ ${filename}: ${editor.summary().changes} edits accepted by the original engine reader`);
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
