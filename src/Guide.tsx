import { useEffect } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useLocale } from './locale';
import type { MessageKey } from './core/diagnostic';

export const guideSections = ['start', 'labels', 'presets', 'structure', 'characters', 'encoding', 'recovery', 'offline', 'privacy'] as const;
export type GuideSection = typeof guideSections[number];

const titles: Record<GuideSection, MessageKey> = {
  start: 'guideStart', labels: 'guideLabels', presets: 'gamePreset', structure: 'guideStructure', characters: 'guideCharacters',
  encoding: 'guideEncoding', recovery: 'localRecovery', offline: 'offlineApp', privacy: 'guidePrivacy',
};
const paragraphs: Partial<Record<GuideSection, MessageKey[]>> = {
  labels: ['helpLabels', 'helpCsvMetadata'],
  presets: ['guidePresetsText'],
  structure: ['helpVariables', 'helpResize'],
  characters: ['helpCharacters', 'characterReferenceHint'],
  encoding: ['helpEncoding'],
  recovery: ['recoveryHint', 'offlineRecoveryHint'],
  offline: ['offlineHint', 'installHint', 'offlineRequirements', 'updateHint'],
  privacy: ['privacyDetail', 'helpLimits'],
};

export function Guide({ section, hasSave, onBack }: { section?: GuideSection; hasSave: boolean; onBack: () => void }) {
  const { t } = useLocale();
  useEffect(() => {
    if (section) document.getElementById(`guide-${section}`)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [section]);
  return <section className="guide">
    <header className="guide-heading">
      <div className="eyebrow"><span />{t('guideEyebrow')}</div>
      <h1>{t('helpTitle')}</h1>
      <p>{t('guideIntro')}</p>
      <button className="button primary" onClick={onBack}>{t(hasSave ? 'guideBackWorkspace' : 'guideBackStart')}<ArrowRight size={16} /></button>
    </header>
    <div className="guide-layout">
      <nav className="guide-toc" aria-label={t('guideContents')}>
        <div className="sidebar-label">{t('guideContents')}</div>
        {guideSections.map(id => <a key={id} href={`#guide/${id}`} aria-current={section === id ? 'location' : undefined} onClick={() => document.getElementById(`guide-${id}`)?.scrollIntoView()}>{t(titles[id])}</a>)}
      </nav>
      <div className="guide-body">
        {guideSections.map(id => <article key={id} id={`guide-${id}`} className="guide-section">
          <h2>{t(titles[id])}</h2>
          {id === 'start' && <ol><li>{t('helpOpen')}</li><li>{t('helpEdit')}</li><li>{t('helpDownload')}</li></ol>}
          {paragraphs[id]?.map(key => <p key={key}>{t(key)}</p>)}
          {id === 'privacy' && <p className="guide-reference">{t('baseline')} · <a href="https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b" target="_blank" rel="noreferrer">{t('formatReference')}<ArrowUpRight size={12} /></a></p>}
        </article>)}
      </div>
    </div>
  </section>;
}
