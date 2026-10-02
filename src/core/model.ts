import { MessageError } from './diagnostic';
import type { ErrorKey, MessageParams } from './diagnostic';

export type Scalar = bigint | string;
export type TextEncoding = 'utf-8' | 'shift_jis';
export type EncodingOption = TextEncoding | 'auto';
export type BinarySection = 'builtin' | 'user';
export type TextSection = 'base' | 'extended';
export interface Span { start: number; end: number }
export interface TextCharacterLayout { base: Span; extended?: Span; lines: number }
export interface Variable extends Span {
  id: number;
  scope: number; // -1: shared/global; otherwise stable character ID (original position), never NO.
  name: string;
  kind: 'int' | 'string';
  dimensions: number[];
  values: Map<string, Scalar>;
  textSpans?: Map<string, Span>;
  textSection?: TextSection;
  section?: BinarySection; // Character binary records before/after the 0xfd separator.
}
export interface SaveDocument {
  original: Uint8Array;
  filename: string;
  format: 'text' | 'binary';
  encoding: TextEncoding | 'utf-16le';
  fileType: 'normal' | 'global';
  formatVersion: number;
  gameCode: bigint;
  gameVersion: bigint;
  description: string;
  characterCount: number;
  variables: Variable[];
  binaryLayout?: { characterCountOffset?: number; characterStarts: number[]; characterEnds: number[]; characterSeparators: (number | undefined)[]; sharedStart: number; eof: number };
  textLayout?: { characterCount?: Span; characters: TextCharacterLayout[]; sharedStart: number; extendedSharedStart?: number; lines: number };
}
export class SaveError extends MessageError {
  constructor(key: ErrorKey, position?: number, unit: 'byte' | 'line' = 'byte', params: MessageParams = {}) {
    super({ key, params, location: position === undefined ? undefined : { unit, position } });
    this.name = 'SaveError';
  }
}
export const MIN_INT = -(1n << 63n);
export const MAX_INT = (1n << 63n) - 1n;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_ARRAY_CELLS = 100_000_000;
export const MAX_STORED_CELLS = 1_000_000;
export const MAX_TEXT_LINES = 1_000_000;
export function integer(input: string): bigint {
  if (!/^[+-]?\d+$/.test(input.trim())) throw new SaveError('error.integer');
  if (input.trim().replace(/^[+-]?0*/, '').length > 19) throw new SaveError('error.integerRange');
  const value = BigInt(input.trim());
  if (value < MIN_INT || value > MAX_INT) throw new SaveError('error.integerRange');
  return value;
}
export function cellCount(dimensions: number[]): number {
  return dimensions.reduce((a, b) => a * b, 1);
}
export function coordinates(index: number, dimensions: number[]): string {
  const result = Array(dimensions.length).fill(0);
  for (let i = dimensions.length - 1; i >= 0; i--) {
    result[i] = index % dimensions[i];
    index = Math.floor(index / dimensions[i]);
  }
  return result.join(',');
}
export function ordinal(key: string, dimensions: number[]): number {
  if (!dimensions.length) return key === '' ? 0 : -1;
  const parts = key.split(',');
  if (parts.length !== dimensions.length) return -1;
  let index = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!/^(0|[1-9]\d*)$/.test(parts[i])) return -1;
    const n = Number(parts[i]);
    if (!Number.isSafeInteger(n) || n >= dimensions[i]) return -1;
    index = index * dimensions[i] + n;
  }
  return index;
}
export function originalValue(v: Variable, key: string): Scalar {
  return v.values.get(key) ?? (v.kind === 'int' ? 0n : '');
}
export function patchBytes(original: Uint8Array, patches: (Span & { bytes: Uint8Array })[], preserveTextLines = false): Uint8Array {
  patches.sort((a, b) => a.start - b.start || a.end - b.end); // Insertions precede replacements at the same boundary.
  let size = original.length + patches.reduce((n, p) => n + p.bytes.length - (p.end - p.start), 0);
  let source = 0, last: number | undefined;
  // Text patches never split an existing CRLF. If an edit joins a bare CR to an LF,
  // add an LF so two line endings cannot collapse into one (e.g. an empty NAME).
  const measure = (bytes: Uint8Array) => {
    if (!bytes.length) return;
    if (preserveTextLines && last === 13 && bytes[0] === 10) size++;
    last = bytes[bytes.length - 1];
  };
  for (const p of patches) {
    if (p.start < source || p.end < p.start || p.end > original.length) throw new SaveError('error.patchOverlap');
    measure(original.subarray(source, p.start)); measure(p.bytes); source = p.end;
  }
  measure(original.subarray(source));
  if (size > MAX_FILE_BYTES) throw new SaveError('error.exportSize');
  const result = new Uint8Array(size);
  source = 0;
  let target = 0;
  const append = (bytes: Uint8Array) => {
    if (!bytes.length) return;
    if (preserveTextLines && target && result[target - 1] === 13 && bytes[0] === 10) result[target++] = 10;
    result.set(bytes, target); target += bytes.length;
  };
  for (const p of patches) {
    append(original.subarray(source, p.start)); append(p.bytes);
    source = p.end;
  }
  append(original.subarray(source));
  return result;
}
