import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Braces, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, FileCode2, FilePlus2, FileText, FolderOpen, Hash, Layers3, ListFilter, LoaderCircle, LockKeyhole, Pencil, RotateCcw, Search, ShieldCheck, Table2, Upload, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { rpc } from './client';
import type { Page, Row, Summary } from './core/editor';
import type { EncodingOption } from './core/model';
import { MAX_FILE_BYTES, SaveError } from './core/model';
import { messageOf } from './core/diagnostic';
import type { Message, MessageKey } from './core/diagnostic';
import { LanguageSelect, useLocale } from './locale';
import demoUrl from './assets/demo.sav?url';

const emptyPage: Page = { rows: [], page: 0, total: 0, pages: 1 };
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const formatEncoding = (encoding: string) => encoding === 'shift_jis' ? 'Shift-JIS / CP932' : encoding.toUpperCase();

const cellName = (row: Row) => row.name + (row.key === '' ? '' : `:${row.key.replace(/,/g, ':')}`);
const characterFields = [
  ['NAME', 'csvName'], ['CALLNAME', 'csvCallname'], ['NICKNAME', 'csvNickname'], ['MASTERNAME', 'csvMastername'],
] as const;

export function App() {
  const { t, message, number } = useLocale();
  const [summary, setSummary] = useState<Summary>();
  const [scope, setScope] = useState<number | 'all'>(-1);
  const [variableId, setVariableId] = useState<number>();
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Page>(emptyPage);
  const [encoding, setEncoding] = useState<EncodingOption>('auto');
  const [busy, setBusy] = useState<MessageKey>();
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<Message>();
  const [notice, setNotice] = useState<Message>();
  const [warnings, setWarnings] = useState<Message[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<Row>();
  const [resizing, setResizing] = useState<Summary['variables'][number]>();
  const [help, setHelp] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | undefined>(undefined);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!summary) return;
    let active = true;
    const timer = setTimeout(() => {
      setQuerying(true);
      rpc<Page>({ type: 'query', query: { scope, variableId, search, changedOnly, page } })
        .then(result => { if (active) setResults(result); })
        .catch(e => { if (active) { setError(messageOf(e)); setResults(emptyPage); } })
        .finally(() => { if (active) setQuerying(false); });
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [summary, scope, variableId, search, changedOnly, page]);
  useEffect(() => {
    if (!summary?.changes) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [summary?.changes]);

  function chooseScope(next: number | 'all') { setScope(next); setVariableId(undefined); setPage(0); }
  async function openFile(file: File) {
    if (busy) return;
    if (summary?.changes && !window.confirm(t('confirmOpen'))) return;
    setBusy('readingSave'); setError(undefined); setNotice(undefined);
    try {
      if (file.size > MAX_FILE_BYTES) throw new SaveError('error.fileSize');
      const next = await rpc<Summary>({ type: 'open', filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), encoding });
      lastFile.current = file; setSummary(next); setResults(emptyPage); chooseScope(-1); setSearch(''); setChangedOnly(false); setWarnings([]);
    } catch (e) { setError(messageOf(e, 'error.fileRead')); }
    finally { setBusy(undefined); }
  }
  async function demo() {
    try {
      const response = await fetch(demoUrl);
      if (!response.ok) throw new SaveError('error.sample');
      await openFile(new File([await response.arrayBuffer()], 'sample.sav'));
    } catch (e) { setError(messageOf(e, 'error.sample')); }
  }
  async function loadLabels(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy('readingCsv'); setError(undefined);
    try {
      if ([...files].reduce((n, f) => n + f.size, 0) > MAX_FILE_BYTES) throw new SaveError('error.csvSize');
      const data = await Promise.all([...files].map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const result = await rpc<{ summary: Summary; warnings: Message[] }>({ type: 'labels', files: data, encoding });
      setSummary(result.summary); setWarnings(result.warnings); setNotice({ key: 'labelsApplied' });
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(undefined); }
  }
  async function download() {
    setBusy('validating'); setError(undefined);
    try {
      const bytes = await rpc<Uint8Array>({ type: 'export' });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `${summary!.filename.replace(/\.sav$/i, '')}.edited.sav`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice({ key: 'downloaded' });
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(undefined); }
  }
  async function revert(row?: Row) {
    if (!row && !window.confirm(t('confirmRevert'))) return;
    try { setSummary(await rpc<Summary>(row ? row.type === 'resize' ? { type: 'revertResize', id: row.variableId } : { type: 'revert', id: row.variableId, key: row.key } : { type: 'reset' })); }
    catch (e) { setError(messageOf(e)); }
  }
  function scopeName(position: number, name = '') {
    return position === -1 ? t(summary?.fileType === 'global' ? 'globalVariables' : 'sharedVariables') : name || t('character', { index: String(position) });
  }
  const title = scope === 'all' ? t('allVariables') : scopeName(scope, summary?.characters.find(c => c.scope === scope)?.name);
  const selectedVariables = summary?.variables.filter(v => scope === 'all' || v.scope === scope) ?? [];
  const selectedVariable = selectedVariables.find(v => v.id === variableId);
  const characterCsv = summary?.characters.find(c => c.scope === scope)?.csv;
  const hasCsv = !!summary && summary.labels + summary.characterLabels + summary.renames > 0;
  function editRow(row: Row) {
    if (row.type === 'resize') setResizing(summary?.variables.find(v => v.id === row.variableId));
    else setEditing(row);
  }

  return <div className="app" onDragEnter={e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); dragDepth.current++; setDragging(true);
  }} onDragLeave={e => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
    onDragOver={e => e.preventDefault()} onDrop={e => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      if (e.dataTransfer.files.length === 1) void openFile(e.dataTransfer.files[0]);
      else setError({ key: 'error.dropFiles' });
    }}>
    <header className="topbar"><div className="topbar-inner">
      <a href="./" className="brand" onClick={e => { e.preventDefault(); setHelp(true); }} aria-label={t('helpTitle')}><span className="logo"><Braces size={23} strokeWidth={2.5} /></span><span>Emuera <strong>Save Studio</strong></span><span className="version">BETA</span></a>
      <div className="top-right"><LanguageSelect /><span className="local-badge"><span className="status-dot" />{t('localOnly')}</span><button className="icon-button" aria-label={t('help')} onClick={() => setHelp(true)}><CircleHelp size={20} /></button></div>
    </div></header>
    <input ref={fileInput} type="file" accept=".sav" className="visually-hidden" aria-label={t('selectSave')} disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; if (file) void openFile(file); e.target.value = ''; }} />
    <input ref={csvInput} type="file" accept=".csv" multiple className="visually-hidden" aria-label={t('selectCsv')} disabled={!!busy} onChange={e => { void loadLabels(e.target.files); e.target.value = ''; }} />
    <div className="messages" aria-live="polite">
      {error && <div className="message error" role="alert"><span>{message(error)}</span><button aria-label={t('dismissError')} onClick={() => setError(undefined)}><X size={16} /></button></div>}
      {notice && <div className="message success"><Check size={17} /><span>{message(notice)}</span><button aria-label={t('dismissNotice')} onClick={() => setNotice(undefined)}><X size={16} /></button></div>}
      {busy && <div className="message loading"><LoaderCircle size={17} className="spin" />{t(busy)}…</div>}
    </div>
    <main>
      {!summary ? <section className="welcome">
        <div className="welcome-intro"><div className="eyebrow"><span />{t('welcomeEyebrow')}</div>
          <h1>{t('welcomeTitle')}<br /><span>{t('welcomeAccent')}</span></h1>
          <p>{t('welcomeIntro')}<br />{t('welcomeDetail')}</p>
          <div className="hero-chips"><span><FileText size={15} />{t('textSaves')}</span><span><FileCode2 size={15} />{t('binarySaves')}</span><span><Check size={15} />global.sav</span></div>
          <div className="privacy-note"><ShieldCheck size={23} /><div><strong>{t('privacyTitle')}</strong><p>{t('privacyDetail')}</p></div></div>
        </div>
        <div className="open-card">
          <div className="open-card-heading"><span>{t('newSession')}</span><span className="tiny-label">{t('localWorkspace')}</span></div>
          <button className="drop-zone" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <span className="upload-illustration"><FileText size={37} strokeWidth={1.4} /><span><Upload size={15} /></span></span>
            <strong>{t('dropSave')}</strong><span>{t('chooseFile')}</span><small>{t('fileLimit')}</small>
          </button>
          <div className="encoding-row"><label htmlFor="encoding-start">{t('textEncoding')}</label><select id="encoding-start" value={encoding} onChange={e => setEncoding(e.target.value as EncodingOption)}><EncodingOptions /></select></div>
          <button className="button primary full" onClick={() => fileInput.current?.click()} disabled={!!busy}><FolderOpen size={18} />{t('openSave')}<ArrowRight size={17} /></button>
          <div className="demo-link"><span>{t('tryFirst')}</span><button onClick={() => void demo()} disabled={!!busy}>{t('exploreSample')}<ArrowUpRight size={14} /></button></div>
        </div>
        <div className="features"><Feature icon={Layers3} number="01" title={t('formatsTitle')} text={t('formatsDetail')} /><Feature icon={Table2} number="02" title={t('labelsTitle')} text={t('labelsDetail')} /><Feature icon={CheckCheck} number="03" title={t('changesTitle')} text={t('changesDetail')} /></div>
      </section> : <section className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">{t('workspaceEyebrow')}</div><h1>{t('editorTitle')}</h1><p>{t('editorSubtitle')}</p></div><button className="button secondary" onClick={() => fileInput.current?.click()} disabled={!!busy}><FolderOpen size={17} />{t('openAnother')}</button></div>
        <div className="file-bar"><span className="file-icon"><FileCode2 size={23} /></span><div className="file-details"><strong>{summary.filename}</strong><span>{size(summary.bytes)}<i />{summary.format === 'binary' ? t('binary') : t('text')}<i />{formatEncoding(summary.encoding)}</span></div><span className="read-badge"><Check size={14} />{t('loaded')}</span><button className="icon-button" title={t('fileInfo')} aria-label={t('fileInfo')} onClick={() => setHelp(true)}><CircleHelp size={18} /></button></div>
        <div className="editor-layout"><aside className="sidebar">
          <div className="sidebar-label">{t('browse')}</div><button className={`nav-item ${scope === 'all' ? 'selected' : ''}`} onClick={() => chooseScope('all')}><Layers3 size={17} />{t('allVariables')}<span>{number(summary.variables.length)}</span></button>
          <button className={`nav-item ${scope === -1 ? 'selected' : ''}`} onClick={() => chooseScope(-1)}><Braces size={18} />{summary.fileType === 'global' ? t('globalVariables') : t('sharedVariables')}<span>{number(summary.variables.filter(v => v.scope === -1).length)}</span></button>
          {summary.characters.length > 0 && <><div className="sidebar-label character-label">{t('characters')} <span>{number(summary.characters.length)}</span></div><div className="character-list">{summary.characters.map(c => <button key={c.scope} className={`nav-item character ${scope === c.scope ? 'selected' : ''}`} onClick={() => chooseScope(c.scope)}><span className="avatar">{scopeName(c.scope, c.name).slice(0, 1)}</span><span className="character-name">{scopeName(c.scope, c.name)}<small>#{c.scope} · NO {c.no}</small>{c.csv && <small title={c.csv.filename}>CSV · {c.csv.fields.NAME || c.csv.fields.CALLNAME || c.csv.fields.NICKNAME || c.csv.filename}</small>}</span></button>)}</div></>}
          <div className="labels-card"><span className="labels-icon"><Table2 size={19} /></span><strong>{t('gameCsv')}</strong><p className="csv-counts">{hasCsv ? <>{summary.labels > 0 && <span>{t('labelCount', { count: summary.labels })}</span>}{summary.characterLabels > 0 && <span>{t('characterCsvCount', { count: summary.characterLabels })}</span>}{summary.renames > 0 && <span>{t('renameCount', { count: summary.renames })}</span>}</> : t('labelsHint')}</p><button className="button secondary small full" onClick={() => csvInput.current?.click()} disabled={!!busy}><FilePlus2 size={15} />{hasCsv ? t('addLabels') : t('loadCsv')}</button></div>
          <label className="sidebar-encoding">{t('readEncoding')}<select value={encoding} onChange={e => setEncoding(e.target.value as EncodingOption)}><EncodingOptions /></select></label>
          {summary.format === 'text' && <button className="text-button reread" disabled={!!busy} onClick={() => lastFile.current && void openFile(lastFile.current)}>{t('reread')}</button>}
        </aside><div className="editor-main">
          <div className="editor-title"><div><h2>{title}</h2><span>{t('variableCount', { count: selectedVariables.length })}</span></div><div className="segmented"><button className={!changedOnly ? 'active' : ''} onClick={() => { setChangedOnly(false); setPage(0); }}>{t('showAll')}</button><button className={changedOnly ? 'active' : ''} onClick={() => { setChangedOnly(true); chooseScope('all'); }}>{t('changes')} <span>{number(summary.changes)}</span></button></div></div>
          {characterCsv && <details className="character-csv"><summary>{t('characterCsv')} <span>{characterCsv.filename}</span></summary><dl>{characterFields.map(([field, label]) => characterCsv.fields[field] && <div key={field}><dt>{t(label)} <code>{field}</code></dt><dd>{characterCsv.fields[field]}</dd></div>)}</dl><p>{t('characterCsvHint', { no: characterCsv.no })}</p></details>}
          <div className="filters"><div className="search"><Search size={17} /><input aria-label={t('search')} placeholder={t('searchPlaceholder')} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />{search && <button aria-label={t('clearSearch')} onClick={() => { setSearch(''); setPage(0); }}><X size={14} /></button>}</div><div className="variable-filter"><ListFilter size={16} /><select aria-label={t('variableGroup')} value={variableId ?? ''} onChange={e => { setVariableId(e.target.value === '' ? undefined : Number(e.target.value)); setPage(0); }}><option value="">{t('allGroups')}</option>{selectedVariables.map(v => <option value={v.id} key={v.id}>{v.name}{scope === 'all' && v.scope >= 0 ? ` · #${v.scope}` : ''} ({number(v.count)})</option>)}</select></div></div>
          {results.expandedSearch !== undefined && <p className="search-expansion">{t('searchExpanded')} <code>{results.expandedSearch || t('emptyString')}</code></p>}
          {summary.format === 'binary' && !!selectedVariable?.dimensions.length && <div className="array-toolbar"><span>{t('arraySize')} <code>{selectedVariable.dimensions.join(' × ')}</code></span><button className="button secondary small" onClick={() => setResizing(selectedVariable)} disabled={!!busy || querying}>{t('resizeArray')}</button></div>}
          <div className="data-table-wrap" aria-busy={querying}><table className="data-table"><thead><tr><th>{t('variableIndex')}</th><th>{t('label')}</th><th>{changedOnly ? t('beforeAfter') : t('currentValue')}</th><th><span className="visually-hidden">{t('edit')}</span></th></tr></thead><tbody>
            {results.rows.map(row => <tr key={`${row.type}:${row.variableId}:${row.key}`} className={row.changed ? 'modified' : ''}>
              <td><div className="variable-name"><span className={`type-icon ${row.kind}`}>{row.kind === 'int' ? <Hash size={13} /> : <span>Aa</span>}</span><code>{row.name}{row.key !== '' && <span className="index">:{row.key.replace(/,/g, ':')}</span>}</code></div>{scope === 'all' && <small className="row-scope">{scopeName(row.scope, row.scopeName)}</small>}</td>
              <td className="cell-label">{row.type === 'resize' ? t('arraySize') : row.label || <span className="muted">—</span>}</td><td><button className="value-button" aria-label={row.type === 'resize' ? t('resizeVariable', { name: row.name }) : t('editCell', { cell: cellName(row) })} onClick={() => editRow(row)} disabled={!!busy || querying}>{row.changed && <span className="previous-value" title={row.original}>{row.original || t('emptyValue')}<ArrowRight size={12} /></span>}<span className="value-text">{row.value || <span className="empty-string">{t('emptyString')}</span>}</span>{row.changed && <span className="change-dot" />}</button></td>
              <td className="row-actions">{row.changed ? <button className="icon-button" title={t('revertOriginal')} aria-label={row.type === 'resize' ? t('revertArraySize', { name: row.name }) : t('revertCell', { cell: cellName(row) })} onClick={() => void revert(row)} disabled={!!busy}><RotateCcw size={14} /></button> : <button className="icon-button" title={t('editValue')} aria-label={t('editCellAction', { cell: cellName(row) })} onClick={() => editRow(row)} disabled={!!busy || querying}><Pencil size={14} /></button>}</td>
            </tr>)}
          </tbody></table>{!results.rows.length && <div className="empty-results"><Search size={29} /><strong>{changedOnly ? t('noChanges') : t('noResults')}</strong><p>{changedOnly ? t('noChangesHint') : t('noResultsHint')}</p></div>}</div>
          <div className="pagination"><span>{t('itemCount', { count: results.total })}{querying && <LoaderCircle className="spin" size={13} />}</span><div><button className="icon-button" aria-label={t('previousPage')} disabled={results.page === 0 || querying} onClick={() => setPage(results.page - 1)}><ChevronLeft size={17} /></button><label><span className="visually-hidden">{t('page')}</span><input aria-label={t('page')} key={results.page} defaultValue={results.page + 1} inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter') { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) setPage(Math.max(0, Math.min(results.pages - 1, Math.floor(n) - 1))); } }} /></label><span>/ {number(results.pages)}</span><button className="icon-button" aria-label={t('nextPage')} disabled={results.page >= results.pages - 1 || querying} onClick={() => setPage(results.page + 1)}><ChevronRight size={17} /></button></div></div>
        </div></div>
        {warnings.length > 0 && <details className="csv-warnings"><summary>{t('csvWarnings', { count: warnings.length })}</summary><ul>{warnings.slice(0, 100).map((w, i) => <li key={i}>{message(w)}</li>)}</ul>{warnings.length > 100 && <p>{t('firstWarnings')}</p>}</details>}
        <div className="save-bar"><div className="save-status"><span className={`status-dot ${summary.changes ? 'changed' : ''}`} /><strong>{summary.resizedArrays ? t('changesWithResizes', { values: summary.changes - summary.resizedArrays, arrays: summary.resizedArrays }) : summary.changes ? t('changedCount', { count: summary.changes }) : t('originalState')}</strong><span>{t('originalKept')}</span></div><div className="save-actions"><button className="text-button" disabled={!summary.changes || !!busy} onClick={() => void revert()}><RotateCcw size={15} />{t('revertAll')}</button><button className="button primary" onClick={() => void download()} disabled={!!busy}><ArrowDownToLine size={17} />{t('download')}</button></div></div>
      </section>}
    </main>
    <footer><span><LockKeyhole size={13} />{t('footerPrivacy')}</span><div>{t('baseline')}<span className="footer-dot">·</span><a href="https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b" target="_blank" rel="noreferrer">{t('formatReference')}<ArrowUpRight size={12} /></a></div></footer>
    {dragging && <div className="drag-overlay"><Upload size={48} /><h2>{t('dropTitle')}</h2><p>{t('dropHint')}</p></div>}
    {editing && <EditDialog row={editing} displayScope={scopeName(editing.scope, editing.scopeName)} onClose={() => setEditing(undefined)} onSave={async value => { const next = await rpc<Summary>({ type: 'set', id: editing.variableId, key: editing.key, value }); setSummary(next); setEditing(undefined); }} />}
    {resizing && <ResizeDialog variable={resizing} displayScope={scopeName(resizing.scope, summary?.characters.find(c => c.scope === resizing.scope)?.name)} onClose={() => setResizing(undefined)} onSave={async dimensions => { const next = await rpc<Summary>({ type: 'resize', id: resizing.id, dimensions }); setSummary(next); setPage(0); setResizing(undefined); }} />}
    {help && <Modal onClose={() => setHelp(false)} title={summary ? t('fileHelpTitle') : t('helpTitle')}><div className="help-content">
      {summary && <dl><dt>{t('fileFormat')}</dt><dd>{summary.format === 'binary' ? t('binary') : t('text')} · {summary.formatVersion || t('legacyFormat')}</dd><dt>{t('gameVersion')}</dt><dd>{summary.gameCode} / {summary.gameVersion}</dd><dt>{t('saveDescription')}</dt><dd>{summary.description || t('none')}</dd><dt>{t('encoding')}</dt><dd>{formatEncoding(summary.encoding)}</dd></dl>}
      <ol><li>{t('helpOpen')}</li><li>{t('helpEdit')}</li><li>{t('helpDownload')}</li></ol>
      <p>{t('helpLabels')}</p>
      <p>{t('helpCsvMetadata')}</p>
      <p>{t('helpEncoding')}</p>
      <p>{t('helpResize')}</p>
      <p className="help-note">{t('helpLimits')}</p>
    </div></Modal>}
  </div>;
}

function EncodingOptions() { const { t } = useLocale(); return <><option value="auto">{t('autoEncoding')}</option><option value="utf-8">UTF-8</option><option value="shift_jis">Shift-JIS / CP932</option></>; }
function Feature({ icon: Icon, number, title, text }: { icon: LucideIcon; number: string; title: string; text: string }) {
  return <article className="feature"><div><span className="feature-icon"><Icon size={21} /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} aria-labelledby="dialog-title"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label={t('close')} onClick={onClose}><X size={19} /></button></div>{children}</dialog>;
}
function EditDialog({ row, displayScope, onClose, onSave }: { row: Row; displayScope: string; onClose: () => void; onSave: (value: string) => Promise<void> }) {
  const { t, message } = useLocale();
  const [value, setValue] = useState(row.value);
  const [error, setError] = useState<Message>();
  const [pending, setPending] = useState(false);
  return <Modal title={t('editValue')} onClose={() => { if (!pending) onClose(); }}><form onSubmit={async e => { e.preventDefault(); setPending(true); setError(undefined); try { await onSave(value); } catch (e) { setError(messageOf(e)); setPending(false); } }}>
    <div className="edit-meta"><span>{displayScope}</span><code>{row.name}{row.key !== '' && `:${row.key.replace(/,/g, ':')}`}</code>{row.label && <strong>{row.label}</strong>}</div>
    <label className="edit-label" htmlFor="edit-value">{t('newValue')}</label>{row.kind === 'int' ? <input id="edit-value" className="edit-input mono" value={value} onChange={e => setValue(e.target.value)} data-initial-focus autoComplete="off" disabled={pending} /> : <textarea id="edit-value" className="edit-input" rows={4} value={value} onChange={e => setValue(e.target.value)} data-initial-focus disabled={pending} />}
    <p className="input-hint">{row.kind === 'int' ? t('integerHint') : t('stringHint')}</p>
    <div className="original-box"><span>{t('originalValue')}</span><code>{row.original || t('emptyString')}</code></div>
    {error && <p className="field-error" role="alert">{message(error)}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={pending}>{t('cancel')}</button><button type="submit" className="button primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{t('apply')}</button></div>
  </form></Modal>;
}

function ResizeDialog({ variable, displayScope, onClose, onSave }: { variable: Summary['variables'][number]; displayScope: string; onClose: () => void; onSave: (dimensions: number[]) => Promise<void> }) {
  const { t, message } = useLocale();
  const [lengths, setLengths] = useState(variable.dimensions.map(String));
  const [error, setError] = useState<Message>();
  const [pending, setPending] = useState(false);
  return <Modal title={t('resizeArray')} onClose={() => { if (!pending) onClose(); }}><form onSubmit={async e => {
    e.preventDefault(); setPending(true); setError(undefined);
    try {
      if (lengths.some(n => !/^\d+$/.test(n.trim()))) throw new SaveError('error.resizeSize');
      await onSave(lengths.map(n => Number(n.trim())));
    } catch (e) { setError(messageOf(e)); setPending(false); }
  }}>
    <div className="edit-meta"><span>{displayScope}</span><code>{variable.name}</code><strong>{variable.dimensions.join(' × ')}</strong></div>
    <div className="resize-dimensions">{lengths.map((length, axis) => <div key={axis}><label className="edit-label" htmlFor={`dimension-${axis}`}>{t('dimensionSize', { axis: axis + 1 })}</label><input id={`dimension-${axis}`} className="edit-input mono" inputMode="numeric" value={length} onChange={e => setLengths(current => current.map((n, i) => i === axis ? e.target.value : n))} data-initial-focus={axis === 0 || undefined} aria-describedby="resize-hint" autoComplete="off" disabled={pending} /></div>)}</div>
    <p id="resize-hint" className="input-hint">{t('resizeHint')}</p>
    <div className="original-box"><span>{t('originalSize')}</span><code>{variable.originalDimensions.join(' × ')}</code></div>
    <p className="resize-note">{t('resizeRetention')}</p><p className="resize-note">{t('resizeCompatibility')}</p>
    {error && <p className="field-error" role="alert">{message(error)}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={pending}>{t('cancel')}</button><button type="submit" className="button primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{t('apply')}</button></div>
  </form></Modal>;
}
