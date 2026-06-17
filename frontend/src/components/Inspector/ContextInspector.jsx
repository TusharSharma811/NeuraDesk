import { useState } from 'react';
import { Search, Copy, ChevronDown, ChevronRight, Layers, Hash, Clock, FileText, GitCompare } from 'lucide-react';
import { retrieveContext, buildCurl } from '../../api';
import { useToast } from '../../App';

export default function ContextInspector() {
  const toast = useToast();
  const [form, setForm] = useState({ issue: '', subject: '', company: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [viewMode, setViewMode] = useState('ranked'); // ranked | grid | raw

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!form.issue.trim()) return;
    setLoading(true);
    try {
      const data = await retrieveContext({ issue: form.issue, subject: form.subject, company: form.company || undefined });
      setResult(data);
      toast(`Retrieved ${data.documents?.length || 0} chunks`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(buildCurl('POST', '/rag/retrieve', { issue: form.issue, subject: form.subject, company: form.company || undefined }));
    toast('cURL copied', 'success');
  };

  const docs = result?.documents || [];
  const maxScore = docs.length ? Math.max(...docs.map(d => d.relevance_score || 0)) : 0;

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="section-bar" />
        <span className="label" style={{ color: 'var(--accent)' }}>CONTEXT INSPECTOR</span>
        <span className="label" style={{ marginLeft: '0.5rem' }}>Retrieval-only debug — no LLM call</span>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 140px', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <div className="input-group">
            <label className="input-label">Query</label>
            <input className="input" value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} placeholder="Enter a search query..." required />
          </div>
          <div className="input-group">
            <label className="input-label">Subject</label>
            <input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="input-group">
            <label className="input-label">Scope</label>
            <select className="input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}>
              <option value="">All domains</option>
              <option value="HackerRank">HackerRank</option>
              <option value="Claude">Claude</option>
              <option value="Visa">Visa</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-accent" type="submit" disabled={loading || !form.issue.trim()}>
            {loading ? <span className="spinner" /> : <Search size={12} strokeWidth={2} />}
            {loading ? 'Searching...' : 'Retrieve'}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={copyCurl} disabled={!form.issue.trim()}>
            <Copy size={11} /> cURL
          </button>
        </div>
      </form>

      {/* Results */}
      {docs.length > 0 && (
        <div>
          {/* Header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="label">{docs.length} CHUNKS RETRIEVED</span>
              <span className="badge badge-info">max score: {maxScore.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['ranked', 'grid', 'raw'].map(m => (
                <button key={m} className={`btn-ghost btn-sm`} onClick={() => setViewMode(m)}
                  style={{ color: viewMode === m ? 'var(--accent)' : undefined, fontWeight: viewMode === m ? 600 : undefined }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Relevance distribution */}
          <div style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <span className="label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.5625rem' }}>RELEVANCE DISTRIBUTION</span>
            <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '40px' }}>
              {docs.map((doc, i) => {
                const pct = maxScore > 0 ? (doc.relevance_score / maxScore) * 100 : 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '100%', height: `${Math.max(pct, 4)}%`, background: i === 0 ? 'var(--accent)' : 'var(--border-hover)', transition: 'height 300ms var(--ease-out)', minHeight: '2px' }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
              <span className="label" style={{ fontSize: '0.5rem' }}>#1</span>
              <span className="label" style={{ fontSize: '0.5rem' }}>#{docs.length}</span>
            </div>
          </div>

          {/* View modes */}
          {viewMode === 'raw' ? (
            <div className="code-block" style={{ maxHeight: '500px', overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</div>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.625rem' }}>
              {docs.map((doc, i) => <GridCard key={i} doc={doc} index={i} maxScore={maxScore} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {docs.map((doc, i) => <RankedCard key={i} doc={doc} index={i} maxScore={maxScore} />)}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
          <p className="muted" style={{ fontSize: '0.75rem' }}>Searching FAISS + BM25 indices...</p>
        </div>
      )}
    </div>
  );
}

function RankedCard({ doc, index, maxScore }) {
  const [expanded, setExpanded] = useState(index === 0);
  const pct = maxScore > 0 ? (doc.relevance_score / maxScore) * 100 : 0;
  const tokens = Math.round((doc.text?.length || 0) / 4);

  return (
    <div className="doc-card" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        {/* Rank indicator */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', paddingTop: '0.125rem' }}>
          <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--muted-fg)' }}>#{index + 1}</span>
          <div style={{ width: '4px', height: '28px', background: 'var(--border)', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct}%`, background: index === 0 ? 'var(--accent)' : 'var(--border-hover)', transition: 'height 300ms' }} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.125rem' }}>
                {expanded ? <ChevronDown size={11} style={{ color: 'var(--muted-fg)' }} /> : <ChevronRight size={11} style={{ color: 'var(--muted-fg)' }} />}
                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{doc.title}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="label" style={{ fontSize: '0.5625rem' }}>{doc.company}/{doc.category}</span>
                <span className="label" style={{ fontSize: '0.5625rem' }}>~{tokens} tokens</span>
              </div>
            </div>
            <span className="doc-score">{doc.relevance_score?.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginLeft: '2rem', animation: 'fadeIn 150ms' }}>
          {/* Metadata */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.625rem' }}>
            <span className="badge"><Hash size={9} /> chunk-{index}</span>
            <span className="badge"><Layers size={9} /> {doc.source_file?.split('/').pop()}</span>
            <span className="badge"><Clock size={9} /> {tokens} tok</span>
            <span className="badge"><FileText size={9} /> {doc.text?.length || 0} chars</span>
          </div>
          <div className="code-block" style={{ maxHeight: '240px', overflow: 'auto', fontSize: '0.6875rem' }}>{doc.text}</div>
        </div>
      )}
    </div>
  );
}

function GridCard({ doc, index, maxScore }) {
  const pct = maxScore > 0 ? (doc.relevance_score / maxScore) * 100 : 0;
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span className="label">#{index + 1} — {doc.company}</span>
        <span className="doc-score" style={{ fontSize: '1rem' }}>{doc.relevance_score?.toFixed(2)}</span>
      </div>
      <h5 style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</h5>
      <span className="label" style={{ fontSize: '0.5625rem', display: 'block', marginBottom: '0.5rem' }}>{doc.category}</span>
      <div className="confidence-track" style={{ marginBottom: '0.375rem' }}>
        <div className="confidence-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
      <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {doc.text?.slice(0, 200)}
      </p>
    </div>
  );
}
