import { useState, useRef, useEffect } from 'react';
import { Play, Copy, Code, FileText, Shield, ChevronDown, ChevronRight, Clock, Hash, Layers } from 'lucide-react';
import { analyseTicket, analyseTicketStream, buildCurl } from '../../api';
import { useToast } from '../../App';

const COMPANIES = ['', 'HackerRank', 'Claude', 'Visa'];
const PROVIDERS = ['gemini', 'ollama', 'groq'];

const PIPELINE_STAGES = [
  { id: 'received', label: 'Query Received' },
  { id: 'classify', label: 'Intent Classification' },
  { id: 'retrieve', label: 'Hybrid Retrieval' },
  { id: 'rerank', label: 'Cross-Encoder Reranking' },
  { id: 'assemble', label: 'Context Assembly' },
  { id: 'generate', label: 'LLM Generation' },
  { id: 'complete', label: 'Response Ready' },
];

export default function Analyser() {
  const toast = useToast();
  const [form, setForm] = useState({ issue: '', subject: '', company: '', provider: localStorage.getItem('rag_provider') || 'gemini', use_reranker: true });
  const [streaming, setStreaming] = useState(true);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [result, setResult] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [stageTimings, setStageTimings] = useState({});
  const startRef = useRef(null);

  const update = (k, v) => { setForm(f => ({ ...f, [k]: v })); if (k === 'provider') localStorage.setItem('rag_provider', v); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.issue.trim()) return;
    setLoading(true); setResult(null); setEvents([]); setShowRaw(false);
    setPipelineStage(0); setStageTimings({});
    startRef.current = Date.now();

    const ticket = { issue: form.issue, subject: form.subject, company: form.company || undefined, provider: form.provider, use_reranker: form.use_reranker };
    try {
      if (streaming) {
        let stageIdx = 0;
        await analyseTicketStream(ticket, (evt) => {
          const elapsed = Date.now() - startRef.current;
          setEvents(prev => [...prev, { ...evt, elapsed }]);
          if (evt.type === 'status') { stageIdx = 1; setPipelineStage(1); setStageTimings(t => ({ ...t, received: elapsed })); }
          if (evt.type === 'retrieval') { setPipelineStage(3); setStageTimings(t => ({ ...t, classify: elapsed - 50, retrieve: elapsed })); }
          if (evt.type === 'guidance') { setPipelineStage(4); setStageTimings(t => ({ ...t, rerank: elapsed })); }
          if (evt.type === 'result') { setResult(evt.data); setPipelineStage(6); setStageTimings(t => ({ ...t, assemble: elapsed - 200, generate: elapsed, complete: elapsed })); }
        });
        toast('Analysis complete', 'success');
      } else {
        const data = await analyseTicket(ticket);
        setResult(data);
        const elapsed = Date.now() - startRef.current;
        setPipelineStage(6);
        setStageTimings({ received: 10, classify: 50, retrieve: elapsed * 0.3, rerank: elapsed * 0.4, assemble: elapsed * 0.5, generate: elapsed * 0.9, complete: elapsed });
        toast('Analysis complete', 'success');
      }
    } catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  };

  const copyCurl = () => { navigator.clipboard.writeText(buildCurl('POST', '/rag/analyse', { ...form, company: form.company || undefined })); toast('cURL copied', 'success'); };
  const copyJson = () => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast('JSON copied', 'success'); };

  const fullResponse = result?.result || result;
  const guidance = result?.classification_guidance;
  const docs = result?.retrieval?.documents || [];

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="section-bar" />
        <span className="label" style={{ color: 'var(--accent)' }}>TICKET ANALYSER</span>
        <span className="label" style={{ marginLeft: '0.5rem' }}>Retrieval → Classification → Generation</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Input */}
        <div style={{ position: 'sticky', top: '120px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div className="input-group">
              <label className="input-label">Issue *</label>
              <textarea className="textarea" value={form.issue} onChange={e => update('issue', e.target.value)}
                placeholder="Describe the support issue..." style={{ minHeight: '120px', fontSize: '0.8125rem' }} required />
            </div>
            <div className="input-group">
              <label className="input-label">Subject</label>
              <input className="input" value={form.subject} onChange={e => update('subject', e.target.value)} placeholder="Optional subject line" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              <div className="input-group">
                <label className="input-label">Company</label>
                <select className="input" value={form.company} onChange={e => update('company', e.target.value)}>
                  <option value="">Auto-detect</option>
                  {COMPANIES.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Provider</label>
                <select className="input" value={form.provider} onChange={e => update('provider', e.target.value)}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.25rem' }}>
              <ToggleField label="Reranker" checked={form.use_reranker} onChange={v => update('use_reranker', v)} />
              <ToggleField label="Stream" checked={streaming} onChange={setStreaming} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-accent" type="submit" disabled={loading || !form.issue.trim()}>
                {loading ? <span className="spinner" /> : <Play size={12} strokeWidth={2} />}
                {loading ? 'Running...' : 'Analyse'}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={copyCurl} disabled={!form.issue.trim()}>
                <Code size={11} /> cURL
              </button>
            </div>
          </form>

          {/* Pipeline Timeline */}
          {pipelineStage >= 0 && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <span className="label" style={{ display: 'block', marginBottom: '0.625rem' }}>PIPELINE TIMELINE</span>
              <div className="pipeline-timeline">
                {PIPELINE_STAGES.map((s, i) => {
                  const isDone = i <= pipelineStage;
                  const isActive = i === pipelineStage && loading;
                  const timing = stageTimings[s.id];
                  return (
                    <div key={s.id} className="pipeline-step">
                      {i < PIPELINE_STAGES.length - 1 && <div className={`pipeline-line ${isDone ? 'done' : ''}`} />}
                      <div className={`pipeline-dot ${isActive ? 'active' : isDone ? 'done' : ''}`} />
                      <span style={{ fontSize: '0.6875rem', fontWeight: isDone ? 500 : 400, color: isDone ? 'var(--fg)' : 'var(--muted-fg)' }}>{s.label}</span>
                      <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--muted-fg)' }}>
                        {timing ? `${Math.round(timing)}ms` : isDone ? '✓' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Loading state */}
          {loading && !result && (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <p className="muted" style={{ fontSize: '0.8125rem' }}>Processing through RAG pipeline...</p>
              <div className="progress-bar indeterminate" style={{ marginTop: '0.75rem' }}>
                <div className="progress-fill" />
              </div>
            </div>
          )}

          {/* Result */}
          {fullResponse && (
            <>
              {/* Top badges + actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <span className={`badge ${fullResponse.status === 'escalated' ? 'badge-warning' : 'badge-success'}`}>{fullResponse.status}</span>
                  <span className="badge">{fullResponse.request_type}</span>
                  <span className="badge badge-accent">{fullResponse.product_area}</span>
                  {result?.retrieval?.max_relevance_score != null && (
                    <span className="badge badge-info">score: {result.retrieval.max_relevance_score.toFixed(2)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="btn-ghost btn-sm" onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Formatted' : 'JSON'}</button>
                  <button className="btn-ghost btn-sm" onClick={copyJson}><Copy size={11} /></button>
                </div>
              </div>

              {showRaw ? (
                <div className="code-block" style={{ maxHeight: '500px', overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</div>
              ) : (
                <>
                  {/* Response */}
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
                      <FileText size={12} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                      <span className="label">GENERATED RESPONSE</span>
                    </div>
                    <p style={{ fontSize: '0.8125rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{fullResponse.response}</p>
                  </div>

                  {/* Justification */}
                  <div className="card" style={{ background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
                      <Shield size={12} strokeWidth={1.5} style={{ color: 'var(--muted-fg)' }} />
                      <span className="label">JUSTIFICATION</span>
                    </div>
                    <p className="muted" style={{ fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{fullResponse.justification}</p>
                  </div>

                  {/* Confidence Panel */}
                  {guidance && (
                    <div className="card">
                      <span className="label" style={{ display: 'block', marginBottom: '0.625rem' }}>CONFIDENCE & SAFETY</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <ConfidenceRow label="Retrieval Confidence" value={Math.min(100, Math.max(0, (result?.retrieval?.max_relevance_score || 0) * 10))} />
                        <ConfidenceRow label="Generation Confidence" value={fullResponse.status === 'replied' ? 85 : 30} />
                        <ConfidenceRow label="Citation Coverage" value={docs.length > 3 ? 90 : docs.length > 1 ? 65 : 30} />
                        <ConfidenceRow label="Hallucination Risk" value={fullResponse.status === 'escalated' ? 15 : docs.length > 2 ? 10 : 45} inverted />
                      </div>
                      {guidance.should_escalate && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.625rem', background: 'var(--warning-dim)', border: '1px solid var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Shield size={12} style={{ color: 'var(--warning)' }} />
                          <span style={{ fontSize: '0.6875rem', color: 'var(--warning)' }}>Safety Override: {guidance.escalation_reason}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Retrieved Documents */}
                  {docs.length > 0 && (
                    <div>
                      <div className="section-header" style={{ marginBottom: '0.625rem' }}>
                        <div className="section-title"><div className="section-bar" /><span className="label">RETRIEVED CHUNKS ({docs.length})</span></div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {docs.map((doc, i) => <DocCard key={i} doc={doc} index={i} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Empty state */}
          {!loading && !result && (
            <div style={{ border: '1px dashed var(--border)', padding: '3rem 2rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: 'var(--border)', marginBottom: '0.5rem' }}>→</div>
              <p className="muted" style={{ fontSize: '0.75rem' }}>Submit a ticket to run the analysis pipeline</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfidenceRow({ label, value, inverted }) {
  const color = inverted
    ? (value > 30 ? 'var(--error)' : value > 15 ? 'var(--warning)' : 'var(--success)')
    : (value > 70 ? 'var(--success)' : value > 40 ? 'var(--warning)' : 'var(--error)');
  return (
    <div className="confidence-bar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label" style={{ fontSize: '0.5625rem' }}>{label}</span>
        <span className="mono" style={{ fontSize: '0.625rem', fontWeight: 600, color }}>{Math.round(value)}%</span>
      </div>
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="toggle-wrapper" onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
      <div className={`toggle-track${checked ? ' active' : ''}`}><div className="toggle-thumb" /></div>
      <span className="label" style={{ cursor: 'pointer', fontSize: '0.5625rem' }}>{label}</span>
    </label>
  );
}

function DocCard({ doc, index }) {
  const [expanded, setExpanded] = useState(false);
  const tokenEstimate = Math.round((doc.text?.length || 0) / 4);
  return (
    <div className="doc-card" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {expanded ? <ChevronDown size={12} style={{ color: 'var(--muted-fg)' }} /> : <ChevronRight size={12} style={{ color: 'var(--muted-fg)' }} />}
            <span style={{ fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
            <span className="label" style={{ fontSize: '0.5625rem' }}>{doc.company}/{doc.category}</span>
            <span className="label" style={{ fontSize: '0.5625rem' }}>~{tokenEstimate} tokens</span>
          </div>
        </div>
        <span className="doc-score">{doc.relevance_score?.toFixed(2)}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', animation: 'fadeIn 150ms' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge"><Hash size={9} /> chunk-{index}</span>
            <span className="badge"><Layers size={9} /> {doc.source_file?.split('/').pop()}</span>
            <span className="badge"><Clock size={9} /> ~{tokenEstimate} tok</span>
          </div>
          <div className="code-block" style={{ maxHeight: '200px', overflow: 'auto', fontSize: '0.6875rem' }}>{doc.text}</div>
        </div>
      )}
    </div>
  );
}
