import { useState, useRef } from 'react';
import { Upload, RefreshCw, FolderSync, FileUp, Database, Clock, BarChart3, Layers, CheckCircle } from 'lucide-react';
import { upsertCorpus, refreshCorpus } from '../../api';
import { useToast } from '../../App';

export default function CorpusManager() {
  const toast = useToast();
  const [tab, setTab] = useState('upsert'); // upsert | refresh | analytics
  const [upsertPath, setUpsertPath] = useState('');
  const [upsertContent, setUpsertContent] = useState('');
  const [upsertForce, setUpsertForce] = useState(true);
  const [upsertLoading, setUpsertLoading] = useState(false);
  const [upsertResult, setUpsertResult] = useState(null);
  const [refreshForce, setRefreshForce] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const handleUpsert = async (e) => {
    e.preventDefault();
    if (!upsertPath.trim() || !upsertContent.trim()) return;
    setUpsertLoading(true); setUpsertResult(null);
    try {
      const data = await upsertCorpus(upsertPath, upsertContent, upsertForce);
      setUpsertResult(data);
      toast('Document upserted successfully', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setUpsertLoading(false); }
  };

  const handleRefresh = async () => {
    setRefreshLoading(true); setRefreshResult(null);
    try {
      const data = await refreshCorpus(refreshForce);
      setRefreshResult(data);
      toast('Index refreshed', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setRefreshLoading(false); }
  };

  const handleFileDrop = (e) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUpsertContent(ev.target.result);
        if (!upsertPath) setUpsertPath(file.name);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="section-bar" />
        <span className="label" style={{ color: 'var(--accent)' }}>CORPUS MANAGER</span>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem' }}>
        {[{ id: 'analytics', label: 'Analytics', icon: <BarChart3 size={11} /> }, { id: 'upsert', label: 'Upsert Document', icon: <Upload size={11} /> }, { id: 'refresh', label: 'Rebuild Index', icon: <RefreshCw size={11} /> }].map(t => (
          <button key={t.id} className="btn-ghost btn-sm" onClick={() => setTab(t.id)}
            style={{ color: tab === t.id ? 'var(--accent)' : undefined, fontWeight: tab === t.id ? 600 : undefined, borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0, padding: '0.375rem 0.75rem' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Analytics */}
      {tab === 'analytics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
            <AnalyticCard icon={<Database size={14} />} label="TOTAL DOCUMENTS" value="768" />
            <AnalyticCard icon={<Layers size={14} />} label="AVG CHUNKS/DOC" value="2.4" />
            <AnalyticCard icon={<Clock size={14} />} label="LAST INGESTION" value="2m ago" />
            <AnalyticCard icon={<BarChart3 size={14} />} label="INDEX SIZE" value="12.4 MB" />
          </div>

          <div className="section-header" style={{ marginBottom: '0.75rem' }}>
            <div className="section-title"><div className="section-bar" /><span className="label">COLLECTION BREAKDOWN</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[{ name: 'hackerrank', docs: 600, pct: 78 }, { name: 'claude', docs: 150, pct: 19.5 }, { name: 'visa', docs: 18, pct: 2.5 }].map(c => (
              <div key={c.name} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 600, width: '100px', textTransform: 'capitalize' }}>{c.name}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span className="label" style={{ fontSize: '0.5625rem' }}>{c.docs} documents</span>
                    <span className="label" style={{ fontSize: '0.5625rem' }}>{c.pct}%</span>
                  </div>
                  <div className="confidence-track"><div className="confidence-fill" style={{ width: `${c.pct}%`, background: 'var(--accent)' }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upsert */}
      {tab === 'upsert' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>
          <form onSubmit={handleUpsert} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className={`drop-zone ${dragActive ? 'active' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}>
              <FileUp size={20} strokeWidth={1} style={{ color: 'var(--muted-fg)', marginBottom: '0.375rem' }} />
              <p style={{ fontSize: '0.75rem', fontWeight: 500 }}>Drop markdown file</p>
              <p className="muted" style={{ fontSize: '0.625rem' }}>or click to browse</p>
              <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const r = new FileReader(); r.onload = ev => { setUpsertContent(ev.target.result); if (!upsertPath) setUpsertPath(file.name); }; r.readAsText(file); }
              }} />
            </div>

            <div className="input-group">
              <label className="input-label">Path (relative to data/)</label>
              <input className="input" value={upsertPath} onChange={e => setUpsertPath(e.target.value)} placeholder="hackerrank/screen/new-article.md"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }} required />
            </div>
            <div className="input-group">
              <label className="input-label">Content</label>
              <textarea className="textarea" value={upsertContent} onChange={e => setUpsertContent(e.target.value)} placeholder="# Article Title&#10;&#10;Content..."
                style={{ minHeight: '220px', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }} required />
            </div>
            <label className="toggle-wrapper" onClick={() => setUpsertForce(!upsertForce)}>
              <div className={`toggle-track${upsertForce ? ' active' : ''}`}><div className="toggle-thumb" /></div>
              <span className="label" style={{ cursor: 'pointer', fontSize: '0.5625rem' }}>Force index rebuild</span>
            </label>
            <button className="btn-accent" type="submit" disabled={upsertLoading}>
              {upsertLoading ? <span className="spinner" /> : <Upload size={12} />} {upsertLoading ? 'Writing...' : 'Upsert Document'}
            </button>
          </form>

          {/* Result / Info */}
          <div>
            {upsertResult ? (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.625rem' }}>
                  <CheckCircle size={13} style={{ color: 'var(--success)' }} />
                  <span className="label" style={{ color: 'var(--success)' }}>WRITTEN</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <StatRow label="Status" value={upsertResult.status} />
                  <StatRow label="Documents" value={upsertResult.documents} />
                  <StatRow label="Companies" value={upsertResult.companies?.join(', ')} />
                  <StatRow label="Path" value={upsertResult.path?.split('/').pop()} />
                </div>
              </div>
            ) : (
              <div className="card" style={{ background: 'var(--bg)' }}>
                <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>GUIDELINES</span>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {['Use markdown with ## headers for chunking', 'Path must be inside data/ directory', 'Index rebuilds after upsert by default', 'Duplicate paths overwrite existing docs'].map((t, i) => (
                    <li key={i} className="muted" style={{ fontSize: '0.6875rem', paddingLeft: '0.75rem', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refresh */}
      {tab === 'refresh' && (
        <div style={{ maxWidth: '480px' }}>
          <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem', lineHeight: 1.6 }}>
            Reload the vector index from the corpus. Use <strong style={{ color: 'var(--fg)' }}>force rebuild</strong> to recompute all embeddings — required after manually editing files in <code className="mono accent" style={{ fontSize: '0.6875rem' }}>data/</code>.
          </p>
          <label className="toggle-wrapper" onClick={() => setRefreshForce(!refreshForce)} style={{ marginBottom: '1rem' }}>
            <div className={`toggle-track${refreshForce ? ' active' : ''}`}><div className="toggle-thumb" /></div>
            <span className="label" style={{ cursor: 'pointer', fontSize: '0.5625rem' }}>Force full rebuild (slow — recomputes embeddings)</span>
          </label>
          <button className="btn-accent" onClick={handleRefresh} disabled={refreshLoading}>
            {refreshLoading ? <span className="spinner" /> : <RefreshCw size={12} />} {refreshLoading ? 'Rebuilding...' : 'Refresh Index'}
          </button>
          {refreshLoading && (
            <div className="progress-bar indeterminate" style={{ marginTop: '0.75rem' }}><div className="progress-fill" /></div>
          )}
          {refreshResult && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.625rem' }}>
                <CheckCircle size={13} style={{ color: 'var(--success)' }} />
                <span className="label" style={{ color: 'var(--success)' }}>{refreshResult.status?.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <StatRow label="Documents" value={refreshResult.documents} />
                <StatRow label="Companies" value={refreshResult.companies?.join(', ')} />
                <StatRow label="Reranker" value={refreshResult.reranker} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticCard({ icon, label, value }) {
  return (
    <div style={{ background: 'var(--bg)', padding: '0.875rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
        <span style={{ color: 'var(--muted-fg)' }}>{icon}</span>
        <span className="label" style={{ fontSize: '0.5625rem' }}>{label}</span>
      </div>
      <span className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: 'var(--tracking-tighter)' }}>{value}</span>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3125rem 0', borderBottom: '1px solid var(--border)' }}>
      <span className="label" style={{ fontSize: '0.5625rem' }}>{label}</span>
      <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
