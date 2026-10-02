import type { ErrorKey, MessageParams } from './diagnostic';
import { decodeText, detectEncoding, encodeText } from './encoding';
import { MAX_FILE_BYTES, MAX_STORED_CELLS, MAX_TEXT_LINES, SaveError, cellCount, integer, originalValue } from './model';
import type { BinarySection, EncodingOption, SaveDocument, Scalar, Span, TextEncoding, Variable } from './model';

export const FINISH = '__FINISHED';
export const SEPARATOR = '__EMU_SEPARATOR__';
export const COMMON_ARRAYS = [
  'DAY', 'MONEY', 'ITEM', 'FLAG', 'TFLAG', 'UP', 'PALAMLV', 'EXPLV', 'EJAC', 'DOWN', 'RESULT', 'COUNT',
  'TARGET', 'ASSI', 'MASTER', 'NOITEM', 'LOSEBASE', 'SELECTCOM', 'ASSIPLAY', 'PREVCOM', 'NOTUSE_14', 'NOTUSE_15',
  'TIME', 'ITEMSALES', 'PLAYER', 'NEXTCOM', 'PBAND', 'BOUGHT', 'NOTUSE_1C', 'NOTUSE_1D',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'NOTUSE_38', 'NOTUSE_39', 'NOTUSE_3A', 'NOTUSE_3B',
];
export const CHARACTER_ARRAYS = ['BASE', 'MAXBASE', 'ABL', 'TALENT', 'EXP', 'MARK', 'PALAM', 'SOURCE', 'EX', 'CFLAG', 'JUEL', 'RELATION', 'EQUIP', 'TEQUIP', 'STAIN', 'GOTJUEL', 'NOWEX'];
const VERSIONS: Record<string, number> = { __EMUERA_STRAT__: 1700, __EMUERA_1708_STRAT__: 1708,
  __EMUERA_1729_STRAT__: 1729, __EMUERA_1803_STRAT__: 1803, __EMUERA_1808_STRAT__: 1808 };
interface Line extends Span { text: string; bytes: Uint8Array }
function lines(bytes: Uint8Array, encoding: TextEncoding): Line[] {
  const result: Line[] = [];
  let start = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 3 : 0;
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] !== 10 && bytes[i] !== 13) continue;
    if (result.length >= MAX_TEXT_LINES) throw new SaveError('error.textLines', i);
    const line = bytes.subarray(start, i);
    result.push({ start, end: i, text: decodeText(line, encoding), bytes: line });
    if (bytes[i] === 13 && bytes[i + 1] === 10) i++;
    start = i + 1;
  }
  if (start < bytes.length) {
    if (result.length >= MAX_TEXT_LINES) throw new SaveError('error.textLines', start);
    const line = bytes.subarray(start);
    result.push({ start, end: bytes.length, text: decodeText(line, encoding), bytes: line });
  }
  return result;
}

export function parseText(bytes: Uint8Array, filename: string, option: EncodingOption): SaveDocument {
  const encoding = detectEncoding(bytes, option);
  const source = lines(bytes, encoding);
  function parse(fileType: 'normal' | 'global'): SaveDocument {
    let cursor = 0, storedCells = 0;
    let textSection: 'base' | 'extended' = 'base';
    const layout: NonNullable<SaveDocument['textLayout']> = { characters: [], sharedStart: 0, lines: source.length, groups: [] };
    const variables: Variable[] = [];
    const names = new Set<string>();
    const fail = (key: ErrorKey, params: MessageParams = {}): never => { throw new SaveError(key, cursor + 1, 'line', params); };
    const take = (): Line => source[cursor++] ?? fail('error.unexpectedEnd');
    const peek = () => source[cursor]?.text;
    const boundary = () => source[cursor]?.start ?? bytes.length;
    function number(line: Line): bigint {
      try { return integer(line.text); } catch { throw new SaveError('error.invalidInteger', line.start); }
    }
    function variable(name: string, scope: number, kind: 'int' | 'string', rank: number): Variable {
      if (!name || [FINISH, SEPARATOR].includes(name) || name.startsWith('__EMUERA_')) fail('error.variableName');
      if (names.has(`${scope}:${name}`)) fail('error.duplicateVariable', { name });
      names.add(`${scope}:${name}`);
      if (variables.length >= 200_000) fail('error.variableCount');
      const v: Variable = { id: variables.length, name, scope, kind, dimensions: Array(rank).fill(0),
        values: new Map(), textSpans: new Map(), textSection, start: boundary(), end: 0 };
      variables.push(v);
      return v;
    }
    function cell(v: Variable, coords: number[], line: Line) {
      if (++storedCells > MAX_STORED_CELLS) fail('error.storedCells');
      const key = coords.join(',');
      v.values.set(key, v.kind === 'int' ? number(line) : line.text);
      v.textSpans!.set(key, { start: line.start, end: line.end });
      coords.forEach((n, i) => v.dimensions[i] = Math.max(v.dimensions[i], n + 1));
      v.end = line.end;
    }
    function row(v: Variable, prefix: number[], line: Line) {
      if (!line.text.length) return;
      let start = line.start;
      line.text.split(',').forEach((token, i) => {
        cell(v, [...prefix, i], { start, end: start + token.length, text: token, bytes: new Uint8Array() });
        start += token.length + 1;
      });
    }
    function array(v: Variable) {
      let x = 0;
      while (peek() !== FINISH) {
        const line = take();
        if (line.text === SEPARATOR || line.text.startsWith('__EMUERA_')) fail('error.arrayEnd');
        if (v.dimensions.length === 1) cell(v, [x++], line);
        else if (v.dimensions.length === 2) row(v, [x++], line);
        else {
          if (line.text !== `${x}{`) fail('error.planeStart');
          let y = 0;
          while (peek() !== '}') row(v, [x, y++], take());
          take(); x++;
        }
      }
      v.end = take().end;
    }
    function sections(scope: number, maxRank: number, scalar: boolean, section: BinarySection = 'builtin') {
      const finishGroup = (kind: 'int' | 'string', rank: number) => {
        const separator = take();
        let newline = '';
        for (let i = cursor - 1; i >= 0 && !newline; i--) {
          const end = source[i].end, after = source[i + 1]?.start ?? bytes.length;
          if (after > end) newline = decodeText(bytes.subarray(end, after), encoding);
        }
        layout.groups.push({ scope, section, kind, rank, end: separator.start, newline: newline || '\n' });
      };
      if (scalar) for (const kind of ['string', 'int'] as const) {
        while (peek() !== SEPARATOR) {
          const line = take();
          const colon = line.bytes.indexOf(58);
          if (colon < 1) fail('error.scalarSeparator');
          const name = decodeText(line.bytes.subarray(0, colon), encoding);
          const valueBytes = line.bytes.subarray(colon + 1);
          const v = variable(name, scope, kind, 0);
          v.start = line.start;
          cell(v, [], { start: line.start + colon + 1, end: line.end, bytes: valueBytes, text: decodeText(valueBytes, encoding) });
          v.section = section; v.end = boundary();
        }
        finishGroup(kind, 0);
      }
      for (let rank = 1; rank <= maxRank; rank++) for (const kind of ['string', 'int'] as const) {
        while (peek() !== SEPARATOR) {
          if (kind === 'string' && rank > 1) fail('error.textStringRank');
          const line = take(), v = variable(line.text, scope, kind, rank);
          array(v); v.start = line.start; v.end = boundary(); v.section = section;
        }
        finishGroup(kind, rank);
      }
    }
    const gameCode = number(take()), gameVersion = number(take());
    let description = '', characterCount = 0;
    if (fileType === 'normal') {
      description = take().text;
      const countLine = take(), count = number(countLine);
      layout.characterCount = { start: countLine.start, end: countLine.end };
      if (count < 0 || count > 100_000n) fail('error.characterCount');
      characterCount = Number(count);
      for (let scope = 0; scope < characterCount; scope++) {
        const start = boundary(), firstLine = cursor;
        for (const name of ['NAME', 'CALLNAME']) cell(variable(name, scope, 'string', 0), [], take());
        for (const name of ['ISASSI', 'NO']) cell(variable(name, scope, 'int', 0), [], take());
        for (const name of CHARACTER_ARRAYS) array(variable(name, scope, 'int', 1));
        layout.characters.push({ base: { start, end: boundary() }, lines: cursor - firstLine });
      }
      layout.sharedStart = boundary();
      for (const name of COMMON_ARRAYS) array(variable(name, -1, 'int', 1));
      array(variable('SAVESTR', -1, 'string', 1));
    } else {
      layout.sharedStart = boundary();
      array(variable('GLOBAL', -1, 'int', 1));
      array(variable('GLOBALS', -1, 'string', 1));
    }
    let formatVersion = 0;
    if (cursor < source.length) {
      const marker = take().text;
      formatVersion = Object.hasOwn(VERSIONS, marker) ? VERSIONS[marker] : 0;
      if (!formatVersion) fail('error.textExtension');
      textSection = 'extended';
      const maxRank = formatVersion < 1708 ? 1 : formatVersion < 1729 ? 2 : 3;
      if (fileType === 'normal') {
        for (let scope = 0; scope < characterCount; scope++) {
          const start = boundary(), firstLine = cursor;
          sections(scope, formatVersion < 1803 ? 1 : 2, true);
          layout.characters[scope].extended = { start, end: boundary() };
          layout.characters[scope].lines += cursor - firstLine;
        }
        layout.extendedSharedStart = boundary();
        sections(-1, maxRank, true);
        if (formatVersion >= 1808) sections(-1, 3, false, 'user');
      } else {
        layout.extendedSharedStart = boundary();
        if (formatVersion !== 1808) fail('error.globalExtension');
        sections(-1, 3, false, 'user');
      }
    }
    if (cursor !== source.length) fail('error.trailingText');
    return { original: bytes, filename, format: 'text', encoding, formatVersion, fileType,
      gameCode, gameVersion, description, characterCount, variables, textLayout: layout };
  }
  const hint = /(^|[/\\])global(?:\.edited)?\.sav$/i.test(filename) ? 'global' : 'normal';
  try { return parse(hint); }
  catch (firstError) {
    try { return parse(hint === 'normal' ? 'global' : 'normal'); }
    catch { throw firstError; }
  }
}

// New text records contain explicit cells at the requested size. Existing ragged
// records still use their original spans; this writer never fills their gaps.
export function writeTextVariable(v: Variable, changes: Map<string, Scalar>, encoding: TextEncoding, captureSpans = false) {
  const count = cellCount(v.dimensions), rank = v.dimensions.length, newline = v.textNewline!;
  if (count > MAX_STORED_CELLS) throw new SaveError('error.storedCells');
  const lines = !rank ? 1 : 2 + (!count ? 0 : rank === 1 ? count : rank === 2 ? v.dimensions[0] : v.dimensions[0] * (v.dimensions[1] + 2));
  if (lines > MAX_TEXT_LINES) throw new SaveError('error.textLines');
  const text: string[] = [], spans = new Map<string, Span>();
  let bytes = 0, lineCount = 0;
  const append = (value: string, key?: string) => {
    const length = /^[\x00-\x7f]*$/.test(value) ? value.length : encodeText(value, encoding).length;
    if (bytes + length > MAX_FILE_BYTES) throw new SaveError('error.exportSize');
    if (captureSpans && key !== undefined) spans.set(key, { start: bytes, end: bytes + length });
    text.push(value); bytes += length;
  };
  const endLine = () => {
    if (++lineCount > MAX_TEXT_LINES) throw new SaveError('error.textLines');
    append(newline);
  };
  const cell = (key: string) => append(String(changes.get(key) ?? originalValue(v, key)), key);
  if (!rank) { append(v.name + ':'); cell(''); endLine(); }
  else {
    append(v.name); endLine();
    if (count) {
      if (rank === 1) for (let x = 0; x < v.dimensions[0]; x++) { cell(String(x)); endLine(); }
      else if (rank === 2) for (let x = 0; x < v.dimensions[0]; x++) {
        for (let y = 0; y < v.dimensions[1]; y++) { if (y) append(','); cell(`${x},${y}`); }
        endLine();
      } else for (let x = 0; x < v.dimensions[0]; x++) {
        append(`${x}{`); endLine();
        for (let y = 0; y < v.dimensions[1]; y++) {
          for (let z = 0; z < v.dimensions[2]; z++) { if (z) append(','); cell(`${x},${y},${z}`); }
          endLine();
        }
        append('}'); endLine();
      }
    }
    append(FINISH); endLine();
  }
  return { bytes: encodeText(text.join(''), encoding), spans };
}
