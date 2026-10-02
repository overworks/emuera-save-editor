import { describe, expect, it } from 'vitest';
import { Editor, parseSave } from '../src/core/editor';
import { translator } from '../src/i18n';
import { gamePresets, presetFieldForRow, presetSearchMatches, presetTargets, suggestedPreset } from '../src/presets';
import { presetFixture } from './preset-fixture';
import { textCharacterFixture } from './text-character-fixture';
import { isVariableRow } from './rows';

const preset = gamePresets.find(item => item.id === 'megaten-kr')!;
const query = { scope: 'all', search: 'HP', changedOnly: false, page: 0 } as const;

describe('game preset metadata', () => {
  it('distinguishes related games by version without guessing an ambiguous game code', () => {
    expect(suggestedPreset({ gameCode: '666', gameVersion: '509309154' })?.id).toBe('shin-era-tensei-p');
    expect(suggestedPreset({ gameCode: '666', gameVersion: '309143' })?.id).toBe('megaten-kr');
    expect(suggestedPreset({ gameCode: '666', gameVersion: '999' })).toBeUndefined();
    expect(suggestedPreset({ gameCode: '9224517', gameVersion: '999' })?.id).toBe('tohok');
    expect(suggestedPreset({ gameCode: '999', gameVersion: '509309154' })).toBeUndefined();
  });

  it.each(['en', 'ko', 'ja'] as const)('resolves ShinEraTenseiP fields to the selected character without modifying the save (%s)', locale => {
    const bytes = presetFixture('666', '509309154');
    const editor = new Editor(parseSave(bytes, 'shin.sav'));
    const shin = suggestedPreset(editor.summary())!;
    const targets = presetTargets(shin, editor.summary().variables, 1);
    const t = translator(locale);
    for (const [name, variable, key] of [
      ['presetHp', 'BASE', '5'], ['presetMp', 'BASE', '6'], ['presetExperience', 'BASE', '7'],
      ['presetMagnetite', 'BASE', '8'], ['presetCooking', 'ABL', '12'],
    ] as const) {
      const field = shin.fields.find(field => field.variable === variable && field.index === Number(key))!;
      expect(targets.get(field)?.scope).toBe(1);
      const search = t(name);
      const rows = editor.query({ ...query, scope: 1, search, labelMatches: presetSearchMatches(shin, search, t) }).rows.filter(isVariableRow);
      expect(rows.some(row => row.name === variable && row.key === key && row.scope === 1)).toBe(true);
    }
    expect(editor.summary().changes).toBe(0);
    expect(editor.serialize()).toEqual(bytes);
  });

  it.each(['en', 'ko', 'ja'] as const)('finds localized fields while keeping CSV names and original bytes (%s)', locale => {
    const bytes = presetFixture();
    const editor = new Editor(parseSave(bytes, 'test.sav'));
    editor.labels.load([{ name: 'Base.csv', bytes: new TextEncoder().encode('5,Custom CSV name') }], 'auto');
    const t = translator(locale);
    const search = t('presetHp');
    const result = editor.query({ ...query, search, labelMatches: presetSearchMatches(preset, search, t) });
    expect(result.total).toBe(4);
    for (const row of result.rows.filter(isVariableRow)) {
      expect(row.key).toBe('5');
      expect(row.label).toBe('Custom CSV name');
      expect(presetFieldForRow(preset, row)?.name).toBe('presetHp');
    }
    expect(editor.summary().changes).toBe(0);
    expect(editor.serialize()).toEqual(bytes);
  });

  it('keeps shortcuts bound to the selected stable character and existing array bounds', () => {
    const editor = new Editor(parseSave(presetFixture(), 'test.sav'));
    const hp = preset.fields.find(field => field.variable === 'BASE' && field.index === 5)!;
    const money = preset.fields.find(field => field.variable === 'MONEY')!;
    expect(presetTargets(preset, editor.summary().variables, 'all').has(hp)).toBe(false);
    expect(presetTargets(preset, editor.summary().variables, 1).get(money)?.scope).toBe(-1);
    const copy = editor.cloneCharacter(1);
    editor.deleteCharacter(0);
    const target = presetTargets(preset, editor.summary().variables, copy).get(hp)!;
    expect(target.scope).toBe(copy);
    expect(editor.summary().characters.find(character => character.scope === copy)?.index).toBe(1);
    editor.resize(target.id, [5]);
    expect(presetTargets(preset, editor.summary().variables, copy).has(hp)).toBe(false);
    editor.resize(target.id, [6]);
    expect(presetTargets(preset, editor.summary().variables, copy).has(hp)).toBe(true);
    editor.deleteVariable(target.id);
    expect(presetTargets(preset, editor.summary().variables, copy).has(hp)).toBe(false);
  });

  it('excludes unrelated scope, type, rank and character user variables', () => {
    const editor = new Editor(parseSave(presetFixture(), 'test.sav'));
    const base = editor.summary().variables.find(variable => variable.scope === 0 && variable.name === 'BASE')!;
    editor.deleteVariable(base.id);
    const custom = editor.addVariable({ scope: 0, name: 'BASE', kind: 'int', dimensions: [20], section: 'user' });
    const shared = editor.addVariable({ scope: -1, name: 'BASE', kind: 'int', dimensions: [20] });
    const wrongRank = editor.addVariable({ scope: 1, name: 'HP', kind: 'int', dimensions: [2, 8] });
    const wrongType = editor.addVariable({ scope: 1, name: 'TEXT_HP', kind: 'string', dimensions: [20] });
    const labelMatches = [
      ...presetSearchMatches(preset, 'HP', translator('en')),
      { name: 'HP', key: '1,5', scope: 'character' as const },
      { name: 'TEXT_HP', key: '5', scope: 'character' as const },
    ];
    const rows = editor.query({ ...query, search: 'health', labelMatches }).rows.filter(isVariableRow);
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.variableId)).not.toContain(custom);
    expect(rows.map(row => row.variableId)).not.toContain(shared);
    expect(rows.map(row => row.variableId)).not.toContain(wrongRank);
    expect(rows.map(row => row.variableId)).not.toContain(wrongType);
  });

  it('keeps metadata searches sparse, paginated and limited to active changes', () => {
    const editor = new Editor(parseSave(presetFixture('666', '309143', 30), 'test.sav'));
    const base = editor.summary().variables.find(variable => variable.scope === 0 && variable.name === 'BASE')!;
    editor.resize(base.id, [100_000_000]);
    const labelMatches = [...presetSearchMatches(preset, 'HP', translator('en')), { name: 'BASE', key: '100000000', scope: 'character' as const }];
    expect(editor.query({ ...query, labelMatches }).rows).toHaveLength(50);
    expect(editor.query({ ...query, labelMatches, page: 1 }).rows).toHaveLength(10);
    editor.set(base.id, '5', '9223372036854775807');
    const changed = editor.query({ ...query, labelMatches, changedOnly: true }).rows.filter(isVariableRow);
    expect(changed).toHaveLength(1);
    expect(changed[0].value).toBe('9223372036854775807');
  });

  it('does not invent omitted text cells or interfere with explicit CSV search aliases', () => {
    const bytes = textCharacterFixture();
    const editor = new Editor(parseSave(bytes, 'test.sav'));
    const labelMatches = [0, 1, 2, 3].map(index => ({ name: 'ABL', key: String(index), scope: 'character' as const }));
    const result = editor.query({ ...query, search: 'custom ability', labelMatches });
    expect(result.total).toBe(9);
    expect(result.rows.filter(isVariableRow).some(row => row.key === '3')).toBe(false);
    expect(editor.query({ ...query, labelMatches: presetSearchMatches(preset, 'HP', translator('en')) }).total).toBe(0);
    editor.labels.load([{ name: '_Rename.csv', bytes: new TextEncoder().encode('ABL:1,ability') }], 'auto');
    const alias = editor.query({ ...query, search: '[[ability]]', labelMatches });
    expect(alias.total).toBe(3);
    expect(alias.rows.filter(isVariableRow).every(row => row.key === '1')).toBe(true);
    expect(editor.serialize()).toEqual(bytes);
  });
});
