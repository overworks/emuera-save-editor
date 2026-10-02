import { useMemo, useState } from 'react';
import type { Query, Summary, VariableRow, VariableSummary } from './core/editor';
import { useLocale } from './locale';
import { gamePresets, presetFieldDescription, presetFieldForRow, presetFieldName, presetReference, presetTargets, suggestedPreset } from './presets';
import type { GamePreset, PresetField } from './presets';

export function GamePresets({ summary, preset, scope, disabled, onSelect, onNavigate }: {
  summary: Summary; preset?: GamePreset; scope: Query['scope']; disabled: boolean;
  onSelect: (id: string) => void; onNavigate: (field: PresetField, variable: VariableSummary) => void;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const suggestion = suggestedPreset(summary);
  const targets = useMemo(() => preset ? presetTargets(preset, summary.variables, scope) : new Map<PresetField, VariableSummary>(), [preset, summary.variables, scope]);
  const differentGame = preset && preset.gameCode !== summary.gameCode;
  const differentVersion = preset && (!preset.gameVersion || preset.gameVersion !== summary.gameVersion);
  return <section className="game-presets" aria-label={t('gamePreset')}>
    <div className="preset-heading"><label htmlFor="game-preset">{t('gamePreset')}</label><select id="game-preset" value={preset?.id ?? ''} onChange={e => { onSelect(e.target.value); setExpanded(false); }} disabled={disabled}>
      <option value="">{t('presetNone')}</option>
      {gamePresets.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.edition}</option>)}
    </select></div>
    {!preset && <p>{suggestion ? t('presetSuggestion', { name: suggestion.name }) : t('presetChooseHint')}</p>}
    {preset && <>
      <p className="preset-edition">{t('presetEdition', { edition: `${preset.name} · ${preset.edition}` })} <a href={preset.source} target="_blank" rel="noreferrer">{t('presetSource')}</a></p>
      <p className={differentGame || differentVersion ? 'preset-caution' : ''}>{t(differentGame ? 'presetDifferentGame' : differentVersion ? 'presetDifferentVersion' : 'presetEditionHint')}</p>
      <details className="preset-fields" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} key={preset.id}><summary>{t('presetShortcuts')}</summary>
        <p>{t(scope === 'all' || scope === -1 ? 'presetChooseCharacter' : 'presetNavigationHint')}</p>
        <div className="preset-grid">{preset.fields.map(field => {
          const target = targets.get(field);
          const name = presetFieldName(field, t);
          return <div className="preset-field" key={presetReference(field)}>
            <button disabled={disabled || !target} onClick={() => { if (target) { onNavigate(field, target); setExpanded(false); } }} aria-label={t('presetOpen', { name })}>
              <strong>{name}</strong><code>{presetReference(field)}</code>
            </button>
            <p>{presetFieldDescription(field, t)}</p>
            {!target && <small>{t(field.scope === 'character' && (scope === -1 || scope === 'all') ? 'presetNeedsCharacter' : 'presetUnavailable')}</small>}
          </div>;
        })}</div>
      </details>
    </>}
  </section>;
}

export function PresetLabel({ preset, row }: { preset?: GamePreset; row: VariableRow }) {
  const { t } = useLocale();
  const field = presetFieldForRow(preset, row);
  if (!field) return <>{row.label || <span className="muted">—</span>}</>;
  const name = presetFieldName(field, t);
  return <span className="preset-value-label" title={presetFieldDescription(field, t)}>{row.label || name}
    <small>{row.label ? t('presetLabel', { name }) : t('presetBadge')}</small>
  </span>;
}
