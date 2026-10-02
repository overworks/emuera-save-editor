import type { Query, Summary, VariableRow, VariableSummary } from './core/editor';
import type { MessageKey } from './messages';
import type { Translator } from './i18n';

export interface PresetField {
  variable: string;
  index: number;
  scope: 'shared' | 'character';
  name: MessageKey;
  description: MessageKey;
  maximum?: boolean;
}
export interface GamePreset {
  id: string;
  name: string;
  edition: string;
  gameCode: string;
  gameVersion?: string;
  source: string;
  fields: readonly PresetField[];
}

const base = (index: number, name: MessageKey): PresetField => ({ variable: 'BASE', index, scope: 'character', name, description: 'presetCurrentHint' });
const maximum = (index: number, name: MessageKey): PresetField => ({ ...base(index, name), variable: 'MAXBASE', maximum: true, description: 'presetMaximumHint' });
const ability = (index: number, name: MessageKey): PresetField => ({ variable: 'ABL', index, scope: 'character', name, description: 'presetAbilityHint' });
const money: PresetField = { variable: 'MONEY', index: 0, scope: 'shared', name: 'presetMoney', description: 'presetMoneyHint' };

// These are curated coordinates, not imported game assets or executable scripts.
// See docs/game-presets.md for the pinned sources and edition limits.
export const gamePresets: readonly GamePreset[] = [
  {
    id: 'twkr-textbung', name: 'eraTWKR', edition: 'Textbung · TWKR 1.20', gameCode: '7153',
    source: 'https://github.com/keisiki/TWKR-Textbung/tree/567ecd2778fe36cb30c552fd5a57e988520cedfc/CSV',
    fields: [money, base(0, 'presetStamina'), base(1, 'presetEnergy'), maximum(0, 'presetStamina'), maximum(1, 'presetEnergy'), ability(42, 'presetCombat'), ability(44, 'presetCooking'), ability(45, 'presetMusic')],
  },
  {
    id: 'tohok', name: 'eratohoK', edition: '1.29.3', gameCode: '9224517', gameVersion: '12903',
    source: 'https://github.com/wamekukyouzin/eratohoK/tree/36997067a3ac537cff3178b27da8ea8244dd9a9e/CSV',
    fields: [base(0, 'presetStamina'), base(1, 'presetEnergy'), base(2, 'presetMental'), maximum(0, 'presetStamina'), maximum(1, 'presetEnergy'), ability(53, 'presetPolitics'), ability(60, 'presetSinging'), ability(61, 'presetCooking')],
  },
  {
    id: 'megaten-kr', name: 'eraMegaten KR', edition: 'Rev.143', gameCode: '666', gameVersion: '309143',
    source: 'https://github.com/cobaltmist/eraMegaten_KR/tree/da99244642e27095fcce2c5676099cec5e88d2cf/CSV',
    fields: [money, base(5, 'presetHp'), base(6, 'presetMp'), maximum(5, 'presetHp'), maximum(6, 'presetMp'), base(7, 'presetExperience'), base(8, 'presetMagnetite'), ability(12, 'presetCooking')],
  },
  {
    id: 'shin-era-tensei-p', name: 'ShinEraTenseiP', edition: '0.5.9', gameCode: '666', gameVersion: '509309154',
    source: 'https://gitgud.io/bazzile/eramegaten_p/-/tree/6e9479a97e5a42f3e726c203652bd2f169e38c30/Data/CSV',
    fields: [money, base(5, 'presetHp'), base(6, 'presetMp'), maximum(5, 'presetHp'), maximum(6, 'presetMp'), base(7, 'presetExperience'), base(8, 'presetMagnetite'), ability(12, 'presetCooking')],
  },
];

export function suggestedPreset({ gameCode, gameVersion }: Pick<Summary, 'gameCode' | 'gameVersion'>): GamePreset | undefined {
  const candidates = gamePresets.filter(preset => preset.gameCode === gameCode);
  const matchingVersion = candidates.filter(preset => preset.gameVersion === gameVersion);
  // Related games may share a code. Do not pick one by catalog order.
  return matchingVersion.length === 1 ? matchingVersion[0] : candidates.length === 1 ? candidates[0] : undefined;
}

export function presetFieldName(field: PresetField, t: Translator): string {
  return field.maximum ? t('presetMaximum', { name: t(field.name) }) : t(field.name);
}
export function presetFieldDescription(field: PresetField, t: Translator): string {
  return t(field.description, { name: t(field.name) });
}
export function presetReference(field: PresetField): string { return `${field.variable}:${field.index}`; }

function matchesVariable(field: PresetField, variable: Pick<VariableSummary, 'name' | 'kind' | 'dimensions' | 'scope' | 'section'>): boolean {
  return variable.name === field.variable && variable.kind === 'int' && variable.dimensions.length === 1
    && field.index < variable.dimensions[0] && variable.section !== 'user'
    && (field.scope === 'shared' ? variable.scope === -1 : variable.scope >= 0);
}

export function presetFieldForRow(preset: GamePreset | undefined, row: VariableRow): PresetField | undefined {
  return row.type === 'value' ? preset?.fields.find(field => matchesVariable(field, row) && row.key === String(field.index)) : undefined;
}

export function presetTargets(preset: GamePreset, variables: Summary['variables'], scope: Query['scope']): Map<PresetField, VariableSummary> {
  // One pass through summaries; do not enumerate array cells or character scopes.
  const candidates = new Map<string, VariableSummary[]>();
  const names = new Set(preset.fields.map(field => field.variable));
  for (const variable of variables) {
    if (!names.has(variable.name) || variable.deleted || (variable.scope !== -1 && (scope === 'all' || variable.scope !== scope))) continue;
    const key = `${variable.scope === -1 ? 'shared' : 'character'}:${variable.name}`;
    const group = candidates.get(key) ?? [];
    group.push(variable); candidates.set(key, group);
  }
  const targets = new Map<PresetField, VariableSummary>();
  for (const field of preset.fields) {
    const group = candidates.get(`${field.scope}:${field.variable}`);
    if (group?.length === 1 && matchesVariable(field, group[0])) targets.set(field, group[0]);
  }
  return targets;
}

export function presetSearchMatches(preset: GamePreset | undefined, search: string, t: Translator): NonNullable<Query['labelMatches']> {
  const text = search.trim().toLowerCase();
  if (!text || !preset) return [];
  return preset.fields.filter(field => `${presetFieldName(field, t)} ${presetFieldDescription(field, t)}`.toLowerCase().includes(text))
    .map(field => ({ name: field.variable, key: String(field.index), scope: field.scope }));
}
