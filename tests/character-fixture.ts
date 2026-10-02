import { BinaryWriter, MAGIC, writeVariable } from '../src/core/binary';
import { MAX_INT, MIN_INT } from '../src/core/model';
import type { Scalar } from '../src/core/model';

export function characterFixture(count = 3, empty = false, shared = true) {
  const w = new BinaryWriter(); MAGIC.forEach(b => w.u8(b)); w.i32(1808); w.i32(0);
  w.u8(0); w.i64(4242n); w.i64(100n); w.string('character structure'); w.i64(BigInt(count));
  const write = (name: string, kind: 'int' | 'string', dimensions: number[], values: [string, Scalar][]) =>
    writeVariable({ id: 0, scope: 0, name, kind, dimensions, values: new Map(values), start: 0, end: 0 }, new Map()).forEach(b => w.u8(b));
  for (let i = 0; i < count; i++) {
    if (!empty) {
      write('NAME', 'string', [], [['', `人物${i}😀`]]);
      write('NO', 'int', [], [['', i === 2 ? MAX_INT : BigInt(i + 7)]]);
      write('ABL', 'int', [5], [['0', BigInt(i + 1)]]);
      write('RELATION', 'int', [20], [['7', MIN_INT]]);
      w.u8(0xfd); write('CUSTOM', 'string', [2, 2], [['1,1', '原文']]);
    }
    w.u8(0xfe);
  }
  if (shared) {
    for (const [name, value] of [['TARGET', 2n], ['ASSI', 1n], ['MASTER', 0n], ['PLAYER', 2n], ['GAME_REF', 2n]] as const)
      write(name, 'int', [2], [['0', value], ['1', MAX_INT]]);
    write('TARGET_SCALAR', 'int', [], [['', 2n]]);
  }
  w.u8(0xff); return w.finish();
}
