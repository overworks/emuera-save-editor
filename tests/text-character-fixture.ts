import { encodeText } from '../src/core/encoding';
import type { TextEncoding } from '../src/core/model';
import { CHARACTER_ARRAYS, COMMON_ARRAYS } from '../src/core/text';

export function textCharacterFixture({ version = 1808, encoding = 'utf-8', bom = true, newline = '\r\n', trailingNewline = true, omitReferences = false }: {
  version?: number; encoding?: TextEncoding; bom?: boolean; newline?: string; trailingNewline?: boolean; omitReferences?: boolean;
} = {}): Uint8Array {
  const lines = ['4242', '100', '文字の冒険', ' +0003 '];
  const array = (values: (string | number)[]) => lines.push(...values.map(String), '__FINISHED');
  const separator = () => lines.push('__EMU_SEPARATOR__');
  for (let c = 0; c < 3; c++) {
    lines.push(['一人目', '', '三人目'][c], c === 1 ? '' : '呼び名', '+000', ['7', '8', '9223372036854775807'][c]);
    for (const name of CHARACTER_ARRAYS) array(name === 'ABL' ? [c + 1, 0, 3] : name === 'RELATION' ? [0, '-9223372036854775808'] : []);
  }
  const references: Record<string, (string | number)[]> = { TARGET: [2, '9223372036854775807'], ASSI: [1], MASTER: [0], PLAYER: [2] };
  for (const name of COMMON_ARRAYS) array(Object.hasOwn(references, name) ? omitReferences ? [] : references[name] : name === 'DAY' ? [12] : name === 'FLAG' ? [2] : []);
  array(['', '保存']);
  if (version) {
    lines.push(version === 1700 ? '__EMUERA_STRAT__' : `__EMUERA_${version}_STRAT__`);
    for (let c = 0; c < 3; c++) {
      if (c !== 1) lines.push(`NICKNAME:旅人${c}:別名`);
      separator();
      if (c !== 1) lines.push('EXTRA_NUMBER:-9223372036854775808');
      separator();
      if (c !== 1) { lines.push('CSTR'); array(['', '漢字', '']); }
      separator();
      if (c !== 1) { lines.push('CEXT'); array([0, 5]); }
      separator();
      if (version >= 1803) {
        separator();
        if (c !== 1) { lines.push('C2D'); array(['0,7', '', '3', '0,0,9']); }
        separator();
      }
    }
    lines.push('SHARED_NOTE:そのまま'); separator(); lines.push('CUSTOM_REF:2'); separator();
    const maxRank = version < 1708 ? 1 : version < 1729 ? 2 : 3;
    for (let i = 0; i < maxRank * 2; i++) separator();
    if (version >= 1808) {
      lines.push('NOTES'); array(['', '記録']); separator();
      lines.push('CUSTOM_NUMBER'); array([5, 0, -1]); separator();
      for (let i = 2; i < 6; i++) separator();
    }
  }
  const text = lines.map((line, i) => line + (i === lines.length - 1 && !trailingNewline ? '' : newline === 'mixed' ? ['\n', '\r', '\r\n'][i % 3] : newline)).join('');
  return encodeText((bom && encoding === 'utf-8' ? '\uFEFF' : '') + text, encoding);
}
