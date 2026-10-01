import { messageOf } from './diagnostic';
import type { Message } from './diagnostic';
import { decodeText, detectEncoding } from './encoding';
import type { EncodingOption } from './model';

const FAMILIES: Record<string, string[]> = {
  abl: ['ABL'], talent: ['TALENT'], exp: ['EXP'], mark: ['MARK'], palam: ['PALAM', 'JUEL', 'GOTJUEL', 'UP', 'DOWN', 'CUP', 'CDOWN'],
  base: ['BASE', 'MAXBASE', 'LOSEBASE', 'DOWNBASE'], item: ['ITEM', 'ITEMSALES'], flag: ['FLAG'], cflag: ['CFLAG'], tflag: ['TFLAG'],
  source: ['SOURCE'], ex: ['EX', 'NOWEX'], equip: ['EQUIP'], tequip: ['TEQUIP'], cstr: ['CSTR'], str: ['STR'],
  stain: ['STAIN'], tcvar: ['TCVAR'], global: ['GLOBAL'], globals: ['GLOBALS'], savestr: ['SAVESTR'],
};
export class Labels {
  entries = new Map<string, Map<string, string>>();
  count = 0;
  load(files: { name: string; bytes: Uint8Array }[], encoding: EncodingOption): Message[] {
    const warnings: Message[] = [];
    for (const file of files) {
      const stem = file.name.replace(/^.*[/\\]/, '').replace(/\.csv$/i, '').toLowerCase();
      const targets = Object.hasOwn(FAMILIES, stem) ? FAMILIES[stem] : undefined;
      if (!targets) { warnings.push({ key: 'csv.unsupported', source: { filename: file.name } }); continue; }
      let text: string;
      try { text = decodeText(file.bytes, detectEncoding(file.bytes, encoding)).replace(/^\uFEFF/, ''); }
      catch (e) { warnings.push({ ...messageOf(e), source: { filename: file.name } }); continue; }
      text.split(/\r\n|\n|\r/).forEach((line, index) => {
        // Emuera CSV uses whole-line comments. Semicolons inside names are literal.
        let content = line.trimStart();
        if (content.startsWith(';!;')) content = content.slice(3).trimStart();
        if (!content || content.startsWith(';')) return;
        const parts = content.split(',');
        const n = Number(parts[0].trim());
        if (parts.length < 2 || !/^\s*\+?\d+\s*$/.test(parts[0]) || !Number.isInteger(n) || n > 2147483647) { warnings.push({ key: 'csv.index', source: { filename: file.name, line: index + 1 } }); return; }
        const key = String(n), label = parts[1];
        if (!label) return;
        let conflict = false;
        for (const name of targets) {
          const group = this.entries.get(name) ?? new Map<string, string>();
          if (group.has(key)) { if (group.get(key) !== label) conflict = true; }
          else { group.set(key, label); this.count++; }
          this.entries.set(name, group);
        }
        if (conflict) warnings.push({ key: 'csv.conflict', params: { index: key }, source: { filename: file.name, line: index + 1 } });
      });
    }
    return warnings;
  }
  get(name: string, key: string): string { return this.entries.get(name.toUpperCase())?.get(key) ?? ''; }
}
