import Encoding from 'encoding-japanese';
import { SaveError } from './model';
import type { EncodingOption, TextEncoding } from './model';

export function detectEncoding(bytes: Uint8Array, option: EncodingOption): TextEncoding {
  if (option !== 'auto') return option;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return 'utf-8'; }
  catch { return 'shift_jis'; }
}
export function decodeText(bytes: Uint8Array, encoding: TextEncoding): string {
  try { return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new SaveError('문자 인코딩을 읽을 수 없습니다. 인코딩을 직접 선택해 다시 열어 주세요.'); }
}
export function encodeText(text: string, encoding: TextEncoding): Uint8Array {
  const bytes = encoding === 'utf-8' ? new TextEncoder().encode(text)
    : new Uint8Array(Encoding.convert(Encoding.stringToCode(text), { to: 'SJIS', from: 'UNICODE', type: 'array' }));
  if (decodeText(bytes, encoding) !== text) throw new SaveError('원본 인코딩으로 표현할 수 없는 문자가 있습니다.');
  return bytes;
}
