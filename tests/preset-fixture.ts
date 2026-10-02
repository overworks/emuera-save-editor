import { BinaryWriter, MAGIC, writeVariable } from '../src/core/binary';

// Synthetic values only. No real game save or assets are bundled.
export function presetFixture(gameCode = '666', gameVersion = '309143', characters = 2): Uint8Array {
  const writer = new BinaryWriter();
  MAGIC.forEach(byte => writer.u8(byte)); writer.i32(1808); writer.i32(0);
  writer.u8(0); writer.i64(BigInt(gameCode)); writer.i64(BigInt(gameVersion));
  writer.string('Synthetic preset test'); writer.i64(BigInt(characters));
  const write = (name: string, kind: 'int' | 'string', dimensions: number[], values: [string, bigint | string][]) =>
    writeVariable({ id: 0, scope: 0, name, kind, dimensions, values: new Map(values), start: 0, end: 0 }, new Map()).forEach(byte => writer.u8(byte));
  for (let i = 0; i < characters; i++) {
    write('NAME', 'string', [], [['', `Preset character ${i}`]]);
    write('NO', 'int', [], [['', BigInt(i + 7)]]);
    write('BASE', 'int', [20], [['0', 100n], ['1', 80n], ['5', 123n], ['6', 45n]]);
    write('MAXBASE', 'int', [20], [['0', 200n], ['1', 160n], ['5', 250n], ['6', 90n]]);
    write('ABL', 'int', [64], [['12', 3n], ['44', 4n], ['61', 5n]]);
    writer.u8(0xfe);
  }
  write('MONEY', 'int', [3], [['0', 2500n]]);
  writer.u8(0xff); return writer.finish();
}
