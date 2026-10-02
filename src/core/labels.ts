import { messageOf } from './diagnostic';
import type { Message } from './diagnostic';
import { decodeText, detectEncoding } from './encoding';
import { MAX_FILE_BYTES, MAX_STORED_CELLS, SaveError, integer } from './model';
import type { EncodingOption } from './model';

const FAMILIES: Record<string, string[]> = {
  abl: ['ABL'], talent: ['TALENT'], exp: ['EXP'], mark: ['MARK'], palam: ['PALAM', 'JUEL', 'GOTJUEL', 'UP', 'DOWN', 'CUP', 'CDOWN'],
  base: ['BASE', 'MAXBASE', 'LOSEBASE', 'DOWNBASE'], item: ['ITEM', 'ITEMSALES'], flag: ['FLAG'], cflag: ['CFLAG'], tflag: ['TFLAG'],
  source: ['SOURCE'], ex: ['EX', 'NOWEX'], equip: ['EQUIP'], tequip: ['TEQUIP'], cstr: ['CSTR'], str: ['STR'],
  stain: ['STAIN'], tcvar: ['TCVAR'], global: ['GLOBAL'], globals: ['GLOBALS'], savestr: ['SAVESTR'],
};
export type CharacterField = 'NAME' | 'CALLNAME' | 'NICKNAME' | 'MASTERNAME';
export interface CharacterLabels {
  no: string; filename: string; fields: Partial<Record<CharacterField, string>>;
}
const CHARACTER_FIELDS: Record<string, CharacterField> = {
  NAME: 'NAME', 名前: 'NAME', CALLNAME: 'CALLNAME', 呼び名: 'CALLNAME',
  NICKNAME: 'NICKNAME', あだ名: 'NICKNAME', MASTERNAME: 'MASTERNAME', 主人の呼び方: 'MASTERNAME',
};
export function characterLabel(character?: CharacterLabels): string {
  return character?.fields.NAME || character?.fields.CALLNAME || character?.fields.NICKNAME || '';
}
function enabledLine(line: string): string {
  let content = line.trimStart();
  if (content.startsWith(';!;')) content = content.slice(3).trimStart();
  return content.startsWith(';') ? '' : content;
}
export class Labels {
  entries = new Map<string, Map<string, string>>();
  readonly characters = new Map<string, CharacterLabels>();
  readonly renames = new Map<string, string>();
  count = 0;
  private loadedBytes = 0;
  load(files: { name: string; bytes: Uint8Array }[], encoding: EncodingOption): Message[] {
    const bytes = files.reduce((n, file) => n + file.bytes.length, 0);
    if (this.loadedBytes + bytes > MAX_FILE_BYTES) throw new SaveError('error.csvSize');
    this.loadedBytes += bytes;
    const warnings: Message[] = [];
    for (const file of files) {
      const stem = file.name.replace(/^.*[/\\]/, '').replace(/\.csv$/i, '').toLowerCase();
      const targets = Object.hasOwn(FAMILIES, stem) ? FAMILIES[stem] : undefined;
      if (!targets && stem !== '_rename' && !stem.startsWith('chara')) { warnings.push({ key: 'csv.unsupported', source: { filename: file.name } }); continue; }
      let lineNumber: number | undefined;
      try {
        const lines = decodeText(file.bytes, detectEncoding(file.bytes, encoding)).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
        if (lines.length > MAX_STORED_CELLS) throw new SaveError('error.textLines');
        if (stem.startsWith('chara')) { this.loadCharacter(file.name, lines, warnings); continue; }
        for (const [index, line] of lines.entries()) {
          lineNumber = index + 1;
          const source = { filename: file.name, line: lineNumber };
          if (stem === '_rename') {
            // ParserMediator.LoadEraExRenameFile: replacement,token; \, escapes commas.
            // Unlike standard CSV, only a semicolon at column zero is a comment.
            if (!line || line.startsWith(';')) continue;
            const chunks = line.split('\\,');
            const last = chunks.pop()!.split(',');
            if (last.length < 2) { warnings.push({ key: 'csv.renameRow', source }); continue; }
            const key = `[[${last[1].trim()}]]`, value = [...chunks, last[0]].join(',').trim();
            if (this.renames.has(key)) {
              if (this.renames.get(key) !== value) warnings.push({ key: 'csv.renameConflict', params: { token: key }, source });
            } else { this.checkCount(); this.renames.set(key, value); }
            continue;
          }
          // Standard CSV uses whole-line comments. Semicolons inside names are literal.
          const content = enabledLine(line);
          if (!content) continue;
          const parts = content.split(',');
          const n = Number(parts[0].trim());
          if (parts.length < 2 || !/^\s*\+?\d+\s*$/.test(parts[0]) || !Number.isInteger(n) || n > 2147483647) { warnings.push({ key: 'csv.index', source }); continue; }
          const key = String(n), label = parts[1];
          if (!label) continue;
          let conflict = false;
          for (const name of targets!) {
            const group = this.entries.get(name) ?? new Map<string, string>();
            if (group.has(key)) { if (group.get(key) !== label) conflict = true; }
            else { this.checkCount(); group.set(key, label); this.count++; }
            this.entries.set(name, group);
          }
          if (conflict) warnings.push({ key: 'csv.conflict', params: { index: key }, source });
        }
      } catch (e) { warnings.push({ ...messageOf(e), source: { filename: file.name, line: lineNumber } }); }
    }
    return warnings;
  }
  private checkCount(additional = 1) {
    if (this.count + this.renames.size + this.characters.size * 5 + additional > MAX_STORED_CELLS) throw new SaveError('error.csvEntries');
  }
  private loadCharacter(filename: string, lines: string[], warnings: Message[]) {
    let character: CharacterLabels | undefined;
    for (const [index, line] of lines.entries()) {
      const content = enabledLine(line);
      if (!content) continue;
      const parts = content.split(','), field = parts[0].toUpperCase();
      const source = { filename, line: index + 1 };
      if (field === 'NO' || field === '番号') {
        if (character) { warnings.push({ key: 'csv.characterNumberDuplicate', source }); continue; }
        try { character = { no: String(integer(parts[1] ?? '')), filename, fields: {} }; }
        catch { warnings.push({ key: 'csv.characterNumber', source }); }
      } else if (Object.hasOwn(CHARACTER_FIELDS, field)) {
        if (!character) { warnings.push({ key: 'csv.characterNumberFirst', source }); continue; }
        if (parts.length < 2) { warnings.push({ key: 'csv.characterRow', source }); continue; }
        const name = CHARACTER_FIELDS[field], value = parts[1];
        if (!value) continue;
        if (character.fields[name] !== undefined && character.fields[name] !== value) warnings.push({ key: 'csv.characterFieldConflict', params: { field: name }, source });
        else character.fields[name] = value;
      }
      // Initial stats and script-dependent fields are not display metadata.
    }
    if (!character) { warnings.push({ key: 'csv.characterNumber', source: { filename } }); return; }
    const existing = this.characters.get(character.no);
    if (existing) {
      if (Object.values(CHARACTER_FIELDS).some(field => existing.fields[field] !== character.fields[field])) warnings.push({ key: 'csv.characterConflict', params: { no: character.no }, source: { filename } });
    } else {
      if (this.characters.size >= 100_000) throw new SaveError('error.csvEntries');
      this.checkCount(5);
      this.characters.set(character.no, character);
    }
  }
  expand(search: string): string {
    let work = 0;
    if (search.length > 1_000_000) throw new SaveError('error.renameExpansion');
    // Ordered, case-sensitive literal replacement, once per rule; never evaluate ERB.
    for (const [key, value] of this.renames) {
      if (!search.includes('[[') || !search.includes(']]')) break;
      work += search.length;
      if (work > MAX_FILE_BYTES) throw new SaveError('error.renameExpansion');
      const parts = search.split(key);
      if (search.length + (parts.length - 1) * (value.length - key.length) > 1_000_000) throw new SaveError('error.renameExpansion');
      search = parts.join(value);
    }
    return search;
  }
  get(name: string, key: string): string {
    return this.entries.get(name.toUpperCase())?.get(key) ?? (name.toUpperCase() === 'RELATION' ? characterLabel(this.characters.get(key)) : '');
  }
  matches(name: string, key: string, search: string): boolean {
    if (this.get(name, key).toLowerCase().includes(search)) return true;
    const fields = name.toUpperCase() === 'RELATION' ? this.characters.get(key)?.fields : undefined;
    return !!fields && [fields.NAME, fields.CALLNAME, fields.NICKNAME].some(value => value?.toLowerCase().includes(search));
  }
  *matchingKeys(name: string, search: string): Iterable<string> {
    for (const [key, label] of this.entries.get(name.toUpperCase()) ?? []) if (label.toLowerCase().includes(search)) yield key;
    if (name.toUpperCase() === 'RELATION') for (const key of this.characters.keys()) if (this.matches(name, key, search)) yield key;
  }
}
