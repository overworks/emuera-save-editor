import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Braces, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, FileCode2, FilePlus2, FileText, FolderOpen, Hash, Layers3, ListFilter, LoaderCircle, LockKeyhole, Pencil, RotateCcw, Search, ShieldCheck, Table2, Upload, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { rpc } from './client';
import type { Page, Row, Summary } from './core/editor';
import type { EncodingOption } from './core/model';
import { MAX_FILE_BYTES } from './core/model';
import demoUrl from './assets/demo.sav?url';

const emptyPage: Page = { rows: [], page: 0, total: 0, pages: 1 };
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const formatEncoding = (encoding: string) => encoding === 'shift_jis' ? 'Shift-JIS / CP932' : encoding.toUpperCase();

export function App() {
  const [summary, setSummary] = useState<Summary>();
  const [scope, setScope] = useState<number | 'all'>(-1);
  const [variableId, setVariableId] = useState<number>();
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Page>(emptyPage);
  const [encoding, setEncoding] = useState<EncodingOption>('auto');
  const [busy, setBusy] = useState('');
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<Row>();
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
        .catch(e => { if (active) setError(e.message); })
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
    if (summary?.changes && !window.confirm('다운로드하지 않은 변경 내역이 있습니다. 현재 작업을 닫고 파일을 열까요?')) return;
    setBusy('세이브를 읽고 있습니다'); setError(''); setNotice('');
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('64 MiB 이하의 파일을 선택해 주세요.');
      const next = await rpc<Summary>({ type: 'open', filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), encoding });
      lastFile.current = file; setSummary(next); setResults(emptyPage); chooseScope(-1); setSearch(''); setChangedOnly(false); setWarnings([]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function demo() {
    try {
      const response = await fetch(demoUrl);
      if (!response.ok) throw new Error('샘플 파일을 열 수 없습니다.');
      await openFile(new File([await response.arrayBuffer()], 'sample.sav'));
    } catch (e) { setError((e as Error).message); }
  }
  async function loadLabels(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy('CSV 이름표를 읽고 있습니다'); setError('');
    try {
      if ([...files].reduce((n, f) => n + f.size, 0) > MAX_FILE_BYTES) throw new Error('CSV 파일의 합계는 64 MiB 이하여야 합니다.');
      const data = await Promise.all([...files].map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
      const result = await rpc<{ summary: Summary; warnings: string[] }>({ type: 'labels', files: data, encoding });
      setSummary(result.summary); setWarnings(result.warnings); setNotice('CSV 이름표를 적용했습니다.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function download() {
    setBusy('수정본을 검증하고 있습니다'); setError('');
    try {
      const bytes = await rpc<Uint8Array>({ type: 'export' });
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `${summary!.filename.replace(/\.sav$/i, '')}.edited.sav`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice('검증을 마친 세이브를 다운로드했습니다. 변경 내역은 계속 확인할 수 있습니다.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }
  async function revert(row?: Row) {
    if (!row && !window.confirm('모든 변경을 원본 값으로 되돌릴까요?')) return;
    try { setSummary(await rpc<Summary>(row ? { type: 'revert', id: row.variableId, key: row.key } : { type: 'reset' })); }
    catch (e) { setError((e as Error).message); }
  }
  const title = scope === 'all' ? '모든 변수' : scope === -1 ? summary?.fileType === 'global' ? '글로벌 변수' : '공통 변수' : summary?.characters.find(c => c.scope === scope)?.name;
  const selectedVariables = summary?.variables.filter(v => scope === 'all' || v.scope === scope) ?? [];

  return <div className="app" onDragEnter={e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); dragDepth.current++; setDragging(true);
  }} onDragLeave={e => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
    onDragOver={e => e.preventDefault()} onDrop={e => {
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      if (e.dataTransfer.files.length === 1) void openFile(e.dataTransfer.files[0]);
      else setError('세이브는 한 번에 하나씩 열어 주세요. CSV는 이름표 추가 버튼으로 선택할 수 있습니다.');
    }}>
    <header className="topbar"><div className="topbar-inner">
      <a href="./" className="brand" onClick={e => { e.preventDefault(); setHelp(true); }} aria-label="Emuera Save Studio 안내"><span className="logo"><Braces size={23} strokeWidth={2.5} /></span><span>Emuera <strong>Save Studio</strong></span><span className="version">BETA</span></a>
      <div className="top-right"><span className="local-badge"><span className="status-dot" />브라우저에서만 처리</span><button className="icon-button" aria-label="사용 안내" onClick={() => setHelp(true)}><CircleHelp size={20} /></button></div>
    </div></header>
    <input ref={fileInput} type="file" accept=".sav" className="visually-hidden" aria-label="세이브 파일 선택" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; if (file) void openFile(file); e.target.value = ''; }} />
    <input ref={csvInput} type="file" accept=".csv" multiple className="visually-hidden" aria-label="CSV 파일 선택" disabled={!!busy} onChange={e => { void loadLabels(e.target.files); e.target.value = ''; }} />
    <div className="messages" aria-live="polite">
      {error && <div className="message error" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={() => setError('')}><X size={16} /></button></div>}
      {notice && <div className="message success"><Check size={17} /><span>{notice}</span><button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {busy && <div className="message loading"><LoaderCircle size={17} className="spin" />{busy}…</div>}
    </div>
    <main>
      {!summary ? <section className="welcome">
        <div className="welcome-intro"><div className="eyebrow"><span />YOUR SAVE, YOUR STORY</div>
          <h1>세이브를 열고,<br /><span>원하는 대로 바꾸세요.</span></h1>
          <p>Emuera 세이브를 위한 작은 작업실.<br />복잡한 설치 없이, 브라우저에서 바로 읽고 편집하세요.</p>
          <div className="hero-chips"><span><FileText size={15} />텍스트 세이브</span><span><FileCode2 size={15} />바이너리 세이브</span><span><Check size={15} />global.sav</span></div>
          <div className="privacy-note"><ShieldCheck size={23} /><div><strong>내 파일은 내 브라우저에만.</strong><p>세이브와 CSV 파일을 외부로 전송하지 않습니다.</p></div></div>
        </div>
        <div className="open-card">
          <div className="open-card-heading"><span>새로운 작업 시작</span><span className="tiny-label">LOCAL WORKSPACE</span></div>
          <button className="drop-zone" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            <span className="upload-illustration"><FileText size={37} strokeWidth={1.4} /><span><Upload size={15} /></span></span>
            <strong>세이브 파일을 여기에 놓으세요</strong><span>또는 클릭해서 파일 선택</span><small>.sav · 최대 64 MB</small>
          </button>
          <div className="encoding-row"><label htmlFor="encoding-start">텍스트 인코딩</label><select id="encoding-start" value={encoding} onChange={e => setEncoding(e.target.value as EncodingOption)}><EncodingOptions /></select></div>
          <button className="button primary full" onClick={() => fileInput.current?.click()} disabled={!!busy}><FolderOpen size={18} />세이브 파일 열기<ArrowRight size={17} /></button>
          <div className="demo-link"><span>먼저 살펴보고 싶다면</span><button onClick={() => void demo()} disabled={!!busy}>샘플로 둘러보기<ArrowUpRight size={14} /></button></div>
        </div>
        <div className="features"><Feature icon={Layers3} number="01" title="두 가지 형식, 하나의 편집기" text="텍스트와 바이너리를 자동으로 구분하고 원래 형식으로 저장합니다." /><Feature icon={Table2} number="02" title="숫자에 이름을 더하세요" text="게임의 CSV를 불러오면 능력치와 아이템을 이름으로 찾을 수 있습니다." /><Feature icon={CheckCheck} number="03" title="바꾼 부분을 한눈에" text="수정 전후를 비교하고, 언제든 원본 값으로 되돌릴 수 있습니다." /></div>
      </section> : <section className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">SAVE WORKSPACE</div><h1>세이브 편집기</h1><p>작은 변화로, 새로운 이야기를 이어가세요.</p></div><button className="button secondary" onClick={() => fileInput.current?.click()} disabled={!!busy}><FolderOpen size={17} />다른 파일 열기</button></div>
        <div className="file-bar"><span className="file-icon"><FileCode2 size={23} /></span><div className="file-details"><strong>{summary.filename}</strong><span>{size(summary.bytes)}<i />{summary.format === 'binary' ? '바이너리' : '텍스트'}<i />{formatEncoding(summary.encoding)}</span></div><span className="read-badge"><Check size={14} />읽기 완료</span><button className="icon-button" title="파일 정보" aria-label="파일 정보" onClick={() => setHelp(true)}><CircleHelp size={18} /></button></div>
        <div className="editor-layout"><aside className="sidebar">
          <div className="sidebar-label">탐색</div><button className={`nav-item ${scope === 'all' ? 'selected' : ''}`} onClick={() => chooseScope('all')}><Layers3 size={17} />모든 변수<span>{summary.variables.length}</span></button>
          <button className={`nav-item ${scope === -1 ? 'selected' : ''}`} onClick={() => chooseScope(-1)}><Braces size={18} />{summary.fileType === 'global' ? '글로벌 변수' : '공통 변수'}<span>{summary.variables.filter(v => v.scope === -1).length}</span></button>
          {summary.characters.length > 0 && <><div className="sidebar-label character-label">캐릭터 <span>{summary.characters.length}</span></div><div className="character-list">{summary.characters.map(c => <button key={c.scope} className={`nav-item character ${scope === c.scope ? 'selected' : ''}`} onClick={() => chooseScope(c.scope)}><span className="avatar">{c.name.slice(0, 1)}</span><span className="character-name">{c.name}<small>#{c.scope} · NO {c.no}</small></span></button>)}</div></>}
          <div className="labels-card"><span className="labels-icon"><Table2 size={19} /></span><strong>게임 CSV 이름표</strong><p>{summary.labels ? `${summary.labels.toLocaleString()}개 이름표가 연결되었습니다.` : '능력치와 아이템을 이름으로 찾아보세요.'}</p><button className="button secondary small full" onClick={() => csvInput.current?.click()} disabled={!!busy}><FilePlus2 size={15} />{summary.labels ? '이름표 더하기' : 'CSV 불러오기'}</button></div>
          <label className="sidebar-encoding">읽기 인코딩<select value={encoding} onChange={e => setEncoding(e.target.value as EncodingOption)}><EncodingOptions /></select></label>
          {summary.format === 'text' && <button className="text-button reread" disabled={!!busy} onClick={() => lastFile.current && void openFile(lastFile.current)}>선택한 인코딩으로 다시 읽기</button>}
        </aside><div className="editor-main">
          <div className="editor-title"><div><h2>{title}</h2><span>{selectedVariables.length}개 변수 그룹</span></div><div className="segmented"><button className={!changedOnly ? 'active' : ''} onClick={() => { setChangedOnly(false); setPage(0); }}>전체 보기</button><button className={changedOnly ? 'active' : ''} onClick={() => { setChangedOnly(true); chooseScope('all'); }}>변경 내역 <span>{summary.changes}</span></button></div></div>
          <div className="filters"><div className="search"><Search size={17} /><input aria-label="변수 검색" placeholder="변수명, 이름표 또는 인덱스 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />{search && <button aria-label="검색 지우기" onClick={() => { setSearch(''); setPage(0); }}><X size={14} /></button>}</div><div className="variable-filter"><ListFilter size={16} /><select aria-label="변수 그룹" value={variableId ?? ''} onChange={e => { setVariableId(e.target.value === '' ? undefined : Number(e.target.value)); setPage(0); }}><option value="">모든 변수 그룹</option>{selectedVariables.map(v => <option value={v.id} key={v.id}>{v.name}{scope === 'all' && v.scope >= 0 ? ` · #${v.scope}` : ''} ({v.count})</option>)}</select></div></div>
          <div className="data-table-wrap" aria-busy={querying}><table className="data-table"><thead><tr><th>변수 / 인덱스</th><th>이름표</th><th>{changedOnly ? '수정 전 → 현재 값' : '현재 값'}</th><th><span className="visually-hidden">편집</span></th></tr></thead><tbody>
            {results.rows.map(row => <tr key={`${row.variableId}:${row.key}`} className={row.changed ? 'modified' : ''}>
              <td><div className="variable-name"><span className={`type-icon ${row.kind}`}>{row.kind === 'int' ? <Hash size={13} /> : <span>Aa</span>}</span><code>{row.name}{row.key !== '' && <span className="index">:{row.key.replace(/,/g, ':')}</span>}</code></div>{scope === 'all' && <small className="row-scope">{row.scopeName}</small>}</td>
              <td className="cell-label">{row.label || <span className="muted">—</span>}</td><td><button className="value-button" aria-label={`${row.name}${row.key !== '' ? ':' + row.key.replace(/,/g, ':') : ''} 값 수정`} onClick={() => setEditing(row)} disabled={!!busy || querying}>{row.changed && <span className="previous-value" title={row.original}>{row.original || '(빈 값)'}<ArrowRight size={12} /></span>}<span className="value-text">{row.value || <span className="empty-string">빈 문자열</span>}</span>{row.changed && <span className="change-dot" />}</button></td>
              <td className="row-actions">{row.changed ? <button className="icon-button" title="원본으로 되돌리기" aria-label={`${row.name}:${row.key} 되돌리기`} onClick={() => void revert(row)} disabled={!!busy}><RotateCcw size={14} /></button> : <button className="icon-button" title="값 수정" aria-label={`${row.name}:${row.key} 편집`} onClick={() => setEditing(row)} disabled={!!busy || querying}><Pencil size={14} /></button>}</td>
            </tr>)}
          </tbody></table>{!results.rows.length && <div className="empty-results"><Search size={29} /><strong>{changedOnly ? '아직 변경한 값이 없습니다' : '표시할 항목이 없습니다'}</strong><p>{changedOnly ? '변수의 값을 클릭해서 편집을 시작하세요.' : '검색어나 변수 그룹을 바꿔 보세요. 비어 있는 텍스트 배열은 편집할 요소가 없습니다.'}</p></div>}</div>
          <div className="pagination"><span>{results.total.toLocaleString()}개 항목{querying && <LoaderCircle className="spin" size={13} />}</span><div><button className="icon-button" aria-label="이전 페이지" disabled={results.page === 0 || querying} onClick={() => setPage(results.page - 1)}><ChevronLeft size={17} /></button><label><span className="visually-hidden">페이지</span><input aria-label="페이지" key={results.page} defaultValue={results.page + 1} inputMode="numeric" onKeyDown={e => { if (e.key === 'Enter') { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) setPage(Math.max(0, Math.min(results.pages - 1, Math.floor(n) - 1))); } }} /></label><span>/ {results.pages.toLocaleString()}</span><button className="icon-button" aria-label="다음 페이지" disabled={results.page >= results.pages - 1 || querying} onClick={() => setPage(results.page + 1)}><ChevronRight size={17} /></button></div></div>
        </div></div>
        {warnings.length > 0 && <details className="csv-warnings"><summary>CSV 읽기 알림 {warnings.length}개</summary><ul>{warnings.slice(0, 100).map((w, i) => <li key={i}>{w}</li>)}</ul>{warnings.length > 100 && <p>앞의 100개 알림만 표시했습니다.</p>}</details>}
        <div className="save-bar"><div className="save-status"><span className={`status-dot ${summary.changes ? 'changed' : ''}`} /><strong>{summary.changes ? `${summary.changes}개 값 변경됨` : '원본 상태'}</strong><span>원본 파일은 그대로 유지됩니다.</span></div><div className="save-actions"><button className="text-button" disabled={!summary.changes || !!busy} onClick={() => void revert()}><RotateCcw size={15} />전체 되돌리기</button><button className="button primary" onClick={() => void download()} disabled={!!busy}><ArrowDownToLine size={17} />세이브 다운로드</button></div></div>
      </section>}
    </main>
    <footer><span><LockKeyhole size={13} />파일 전송 없음 · 설치 필요 없음</span><div>표준 Emuera 1.824 기준<span className="footer-dot">·</span><a href="https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b" target="_blank" rel="noreferrer">형식 참고<ArrowUpRight size={12} /></a></div></footer>
    {dragging && <div className="drag-overlay"><Upload size={48} /><h2>세이브 파일을 놓아주세요</h2><p>한 번에 하나의 .sav 파일을 열 수 있습니다.</p></div>}
    {editing && <EditDialog row={editing} onClose={() => setEditing(undefined)} onSave={async value => { const next = await rpc<Summary>({ type: 'set', id: editing.variableId, key: editing.key, value }); setSummary(next); setEditing(undefined); }} />}
    {help && <Modal onClose={() => setHelp(false)} title={summary ? '파일 정보와 사용 안내' : 'Save Studio 사용 안내'}><div className="help-content">
      {summary && <dl><dt>파일 형식</dt><dd>{summary.format === 'binary' ? '바이너리' : '텍스트'} · {summary.formatVersion || '기본 형식'}</dd><dt>게임 코드 / 버전</dt><dd>{summary.gameCode} / {summary.gameVersion}</dd><dt>저장 설명</dt><dd>{summary.description || '없음'}</dd><dt>문자 인코딩</dt><dd>{formatEncoding(summary.encoding)}</dd></dl>}
      <ol><li>일반 세이브 또는 global.sav를 엽니다.</li><li>공통 변수나 캐릭터를 선택하고 원하는 값을 클릭합니다.</li><li>변경 내역을 확인한 뒤 수정본을 다운로드합니다.</li></ol>
      <p>게임 CSV를 불러오면 인덱스 옆에 이름표가 표시됩니다. 인덱스 검색은 정확한 번호를 사용하세요. 다차원 배열은 <code>1:2:3</code>으로 찾을 수 있습니다.</p>
      <p>글자가 깨지면 읽기 인코딩을 선택하고 다시 읽으세요. 수정본을 게임에서 사용하려면 백업을 보관한 뒤 원래 세이브 파일명으로 바꿔 넣으세요.</p>
      <p className="help-note">현재는 기존 값만 수정할 수 있습니다. 캐릭터 추가·삭제, 형식 변환, 확장 포크 전용 형식은 지원하지 않습니다. 새로고침하면 작업 내용이 사라집니다.</p>
    </div></Modal>}
  </div>;
}

function EncodingOptions() { return <><option value="auto">자동 감지</option><option value="utf-8">UTF-8</option><option value="shift_jis">Shift-JIS / CP932</option></>; }
function Feature({ icon: Icon, number, title, text }: { icon: LucideIcon; number: string; title: string; text: string }) {
  return <article className="feature"><div><span className="feature-icon"><Icon size={21} /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose} aria-labelledby="dialog-title"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={19} /></button></div>{children}</dialog>;
}
function EditDialog({ row, onClose, onSave }: { row: Row; onClose: () => void; onSave: (value: string) => Promise<void> }) {
  const [value, setValue] = useState(row.value);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return <Modal title="값 수정" onClose={() => { if (!pending) onClose(); }}><form onSubmit={async e => { e.preventDefault(); setPending(true); setError(''); try { await onSave(value); } catch (e) { setError((e as Error).message); setPending(false); } }}>
    <div className="edit-meta"><span>{row.scopeName}</span><code>{row.name}{row.key !== '' && `:${row.key.replace(/,/g, ':')}`}</code>{row.label && <strong>{row.label}</strong>}</div>
    <label className="edit-label" htmlFor="edit-value">새로운 값</label>{row.kind === 'int' ? <input id="edit-value" className="edit-input mono" value={value} onChange={e => setValue(e.target.value)} data-initial-focus autoComplete="off" disabled={pending} /> : <textarea id="edit-value" className="edit-input" rows={4} value={value} onChange={e => setValue(e.target.value)} data-initial-focus disabled={pending} />}
    <p className="input-hint">{row.kind === 'int' ? '64비트 정수를 정확하게 저장합니다. 소수는 입력할 수 없습니다.' : '원본 파일의 문자 인코딩과 저장 형식을 유지합니다.'}</p>
    <div className="original-box"><span>원본 값</span><code>{row.original || '(빈 문자열)'}</code></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={pending}>취소</button><button type="submit" className="button primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}변경 적용</button></div>
  </form></Modal>;
}
