import { MAX_ARRAY_CELLS, MAX_STORED_CELLS, SaveError, cellCount, ordinal } from './model';
import type { SaveDocument, Scalar, Variable } from './model';

export const MAGIC = new Uint8Array([0x89, 0x45, 0x52, 0x41, 0x0d, 0x0a, 0x1a, 0x0a]);
export class BinaryReader {
  offset = 0;
  storedCells = 0;
  private view: DataView;
  constructor(readonly bytes: Uint8Array) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  fail(message: string): never { throw new SaveError(message, this.offset); }
  need(n: number) { if (n < 0 || this.offset + n > this.bytes.length) this.fail('파일이 잘렸거나 길이가 잘못되었습니다.'); }
  u8() { this.need(1); return this.bytes[this.offset++]; }
  i32() { this.need(4); const n = this.view.getInt32(this.offset, true); this.offset += 4; return n; }
  i64() { this.need(8); const n = this.view.getBigInt64(this.offset, true); this.offset += 8; return n; }
  int(tag = this.u8()): bigint {
    if (tag <= 0xcf) return BigInt(tag);
    if (tag === 0xd0) { this.need(2); const n = this.view.getInt16(this.offset, true); this.offset += 2; return BigInt(n); }
    if (tag === 0xd1) return BigInt(this.i32());
    if (tag === 0xd2) return this.i64();
    return this.fail('알 수 없는 정수 태그입니다.');
  }
  string(): string {
    let size = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 4 && b > 7) this.fail('문자열 길이가 잘못되었습니다.');
      size += (b & 0x7f) * 2 ** (7 * i);
      if (!(b & 0x80)) {
        if (size % 2) this.fail('UTF-16 문자열 길이가 홀수입니다.');
        this.need(size);
        let result: string;
        try { result = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(this.bytes.subarray(this.offset, this.offset + size)); }
        catch { return this.fail('올바르지 않은 UTF-16 문자열입니다.'); }
        this.offset += size;
        return result;
      }
    }
    return this.fail('문자열 길이 접두사가 잘못되었습니다.');
  }
}

export class BinaryWriter {
  private bytes: number[] = [];
  u8(n: number) { this.bytes.push(n); }
  i32(n: number) { for (let i = 0; i < 4; i++) this.u8((n >>> (i * 8)) & 255); }
  i64(n: bigint) { for (let i = 0n; i < 8n; i++) this.u8(Number((n >> (i * 8n)) & 255n)); }
  int(n: bigint) {
    if (n >= 0n && n <= 0xcfn) this.u8(Number(n));
    else if (n >= -32768n && n <= 32767n) { this.u8(0xd0); this.u8(Number(n & 255n)); this.u8(Number((n >> 8n) & 255n)); }
    else if (n >= -2147483648n && n <= 2147483647n) { this.u8(0xd1); this.i32(Number(n)); }
    else { this.u8(0xd2); this.i64(n); }
  }
  string(s: string) {
    let length = s.length * 2;
    while (length >= 128) { this.u8((length & 127) | 128); length = Math.floor(length / 128); }
    this.u8(length);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.u8(c & 255); this.u8(c >> 8); }
  }
  finish() { return new Uint8Array(this.bytes); }
}

function readVariable(r: BinaryReader, tag: number, start: number, scope: number, id: number): Variable {
  if (![0, 1, 2, 3, 16, 17, 18, 19].includes(tag)) r.fail(`지원하지 않는 변수 태그 0x${tag.toString(16)}입니다.`);
  const name = r.string();
  if (!name || name.includes('\0')) r.fail('변수 이름이 잘못되었습니다.');
  const kind = tag & 16 ? 'string' : 'int';
  const dimensions = Array.from({ length: tag & 3 }, () => r.i32());
  if (dimensions.some(n => n < 0) || !Number.isSafeInteger(cellCount(dimensions)) || cellCount(dimensions) > MAX_ARRAY_CELLS) r.fail('배열 크기가 지원 범위(1억 요소)를 벗어났습니다.');
  const values = new Map<string, Scalar>();
  if (!dimensions.length) {
    if (++r.storedCells > MAX_STORED_CELLS) r.fail('저장된 값이 100만 개 제한을 초과합니다.');
    values.set('', kind === 'int' ? r.int() : r.string());
  }
  else {
    const pos = dimensions.map(() => 0);
    for (;;) {
      const b = r.u8();
      if (b === 255) break;
      if ([0xe0, 0xe1, 0xf0, 0xf1, 0xf2].includes(b)) {
        const level = b === 0xf0 ? 0 : b === 0xe0 || b === 0xf1 ? 1 : 2;
        const axis = dimensions.length - 1 - level;
        if (axis < 0) r.fail('배열 구분자의 차원이 잘못되었습니다.');
        const run = b >= 0xf0 ? r.int() : 1n;
        if (run <= 0 || run > BigInt(dimensions[axis])) r.fail('배열 생략 길이가 잘못되었습니다.');
        if (pos.slice(0, axis).some((n, i) => n >= dimensions[i])) r.fail('배열의 범위를 벗어났습니다.');
        // A skipped row/plane must start at its first cell.
        if (b >= 0xf1 && pos.slice(axis + 1).some(n => n !== 0)) r.fail('빈 배열 시작 위치가 잘못되었습니다.');
        pos[axis] += Number(run);
        if (pos[axis] > dimensions[axis]) r.fail('배열 생략 길이가 범위를 벗어났습니다.');
        pos.fill(0, axis + 1);
        continue;
      }
      if (pos.some((n, i) => n >= dimensions[i])) r.fail('배열 값이 선언된 크기를 초과합니다.');
      const value = kind === 'int' ? r.int(b) : b === 0xd8 ? r.string() : r.fail('문자열 배열 태그가 잘못되었습니다.');
      if (++r.storedCells > MAX_STORED_CELLS) r.fail('저장된 값이 100만 개 제한을 초과합니다.');
      values.set(pos.join(','), value);
      pos[pos.length - 1]++;
    }
  }
  return { id, name, kind, dimensions, values, scope, start, end: r.offset };
}

export function parseBinary(bytes: Uint8Array, filename: string): SaveDocument {
  const r = new BinaryReader(bytes);
  for (const b of MAGIC) if (r.u8() !== b) r.fail('바이너리 헤더가 잘못되었습니다.');
  const version = r.i32();
  if (version !== 1808) r.fail(`지원하지 않는 바이너리 버전 ${version}입니다.`);
  const count = r.i32();
  if (count < 0) r.fail('확장 헤더 크기가 잘못되었습니다.');
  r.need(count * 4); r.offset += count * 4;
  const fileType = r.u8();
  if (fileType > 1) r.fail('일반 세이브와 global.sav만 지원합니다.');
  const gameCode = r.i64(), gameVersion = r.i64(), description = r.string();
  const chars = fileType === 0 ? r.i64() : 0n;
  if (chars < 0 || chars > 100_000n) r.fail('캐릭터 수가 잘못되었습니다.');
  const variables: Variable[] = [];
  let scope = chars > 0 ? 0 : -1;
  let separatorSeen = false;
  for (;;) {
    const start = r.offset, tag = r.u8();
    if (tag === 0xff) {
      if (scope !== -1) r.fail('캐릭터 데이터가 끝나기 전에 파일이 종료되었습니다.');
      break;
    }
    if (tag === 0xfe) {
      if (scope === -1) r.fail('캐릭터 종료 구분자의 위치가 잘못되었습니다.');
      scope++; separatorSeen = false;
      if (scope === Number(chars)) scope = -1;
    } else if (tag === 0xfd) {
      if (scope === -1 || separatorSeen) r.fail('변수 구분자의 위치가 잘못되었습니다.');
      separatorSeen = true;
    } else {
      if (variables.length >= 200_000) r.fail('변수가 너무 많습니다.');
      variables.push(readVariable(r, tag, start, scope, variables.length));
    }
  }
  if (r.offset !== bytes.length) r.fail('파일 종료 뒤에 지원하지 않는 데이터가 있습니다.');
  return { original: bytes, filename, format: 'binary', encoding: 'utf-16le', formatVersion: version,
    fileType: fileType ? 'global' : 'normal', gameCode, gameVersion, description, characterCount: Number(chars), variables };
}

// Only the changed variable is re-encoded. Sparse coordinates avoid expanding zero-filled arrays.
export function writeVariable(v: Variable, edits: Map<string, Scalar>): Uint8Array {
  const w = new BinaryWriter();
  w.u8((v.kind === 'string' ? 16 : 0) + v.dimensions.length);
  w.string(v.name);
  const value = (s: Scalar, array: boolean) => {
    if (typeof s === 'bigint') w.int(s);
    else { if (array) w.u8(0xd8); w.string(s); }
  };
  if (!v.dimensions.length) { value(edits.get('') ?? v.values.get('')!, false); return w.finish(); }
  v.dimensions.forEach(n => w.i32(n));
  const merged = new Map(v.values);
  edits.forEach((s, key) => merged.set(key, s));
  const entries = [...merged].filter(([, s]) => s !== 0n && s !== '').sort((a, b) => ordinal(a[0], v.dimensions) - ordinal(b[0], v.dimensions));
  const pos = v.dimensions.map(() => 0), rank = pos.length;
  const skip = (tag: number, n: number) => { if (n) { w.u8(tag); w.int(BigInt(n)); } };
  for (const [key, s] of entries) {
    const next = key.split(',').map(Number);
    if (rank === 3 && next[0] !== pos[0]) {
      if (pos[1] || pos[2]) { w.u8(0xe1); pos[0]++; pos[1] = pos[2] = 0; }
      skip(0xf2, next[0] - pos[0]); pos[0] = next[0];
    }
    const row = rank - 2, col = rank - 1;
    if (rank >= 2 && next[row] !== pos[row]) {
      if (pos[col]) { w.u8(0xe0); pos[row]++; pos[col] = 0; }
      skip(0xf1, next[row] - pos[row]); pos[row] = next[row];
    }
    skip(0xf0, next[col] - pos[col]);
    value(s, true); pos[col] = next[col] + 1;
  }
  w.u8(0xff);
  return w.finish();
}
