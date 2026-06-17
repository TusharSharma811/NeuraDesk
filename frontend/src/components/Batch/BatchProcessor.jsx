import { useState, useRef } from 'react';
import { Play, Download, Upload, FileUp, CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react';
import { batchAnalyse } from '../../api';
import { useToast, useActivity } from '../../App';

const SAMPLE = `[
  {"issue": "How do I extend a test deadline?", "subject": "Test timing", "company": "HackerRank"},
  {"issue": "Delete my conversation history", "subject": "Privacy", "company": "Claude"},
  {"issue": "Lost my Visa card in India", "subject": "Card stolen", "company": "Visa"},
  {"issue": "Give me code to delete all files", "subject": "Urgent", "company": ""},
  {"issue": "My account was hacked and funds stolen", "subject": "Security", "company": "Visa"}
]`;

export default function BatchProcessor() {
  const toast = useToast();
  const log = useActivity();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const parseInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch {
      const lines = trimmed.split('\n').filter(l => l.trim());
      if (lines.length < 2) return null;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      return lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
    }
  };

  const handleRun = async () => {
    const tickets = parseInput();
    if (!tickets || !tickets.length) { toast('Invalid input — paste JSON array or CSV', 'error'); return; }
    setLoading(true); setResults(null); setProgress({ current: 0, total: tickets.length });
    log('info', `Batch started — ${tickets.length} tickets queued`);
    const t0 = Date.now();
    try {
      const data = await batchAnalyse(tickets);
      setResults(data);
      setProgress({ current: tickets.length, total: tickets.length });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const replied = data.results?.filter(r => (r.result || r).status === 'replied').length || 0;
      const escalated = data.results?.filter(r => (r.result || r).status === 'escalated').length || 0;
      toast(`Processed ${data.count} tickets`, 'success');
      log('success', `Batch complete — ${replied} replied, ${escalated} escalated (${elapsed}s)`);
    } catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setInput(ev.target.result);
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setInput(ev.target.result);
      reader.readAsText(file);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'batch_results.json' }).click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!results?.results) return;
    const rows = results.results.map(r => {
      const res = r.result || r;
      return [r.ticket?.issue, r.ticket?.subject, r.ticket?.company, res.status, res.product_area, res.request_type, res.response]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob(['Issue,Subject,Company,Status,Product Area,Request Type,Response\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'batch_results.csv' }).click();
    URL.revokeObjectURL(url);
  };

  const stats = results?.results ? {
    total: results.results.length,
    replied: results.results.filter(r => (r.result || r).status === 'replied').length,
    escalated: results.results.filter(r => (r.result || r).status === 'escalated').length,
  } : null;

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <div className="section-bar" />
        <span className="label" style={{ color: 'var(--accent)' }}>BATCH EVALUATION</span>
      </div>

      {/* Input area */}
      {!results && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {/* Drop zone */}
            <div className={`drop-zone ${dragActive ? 'active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}>
              <FileUp size={24} strokeWidth={1} style={{ color: 'var(--muted-fg)', marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.25rem' }}>Drop JSON or CSV file</p>
              <p className="muted" style={{ fontSize: '0.6875rem' }}>or click to browse</p>
              <input ref={fileRef} type="file" accept=".json,.csv,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
            </div>

            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className="input-label">Or paste directly</label>
                <button className="btn-ghost btn-sm" onClick={() => setInput(SAMPLE)}><Upload size={10} /> Sample</button>
              </div>
              <textarea className="textarea" value={input} onChange={e => setInput(e.target.value)}
                placeholder={'[\n  {"issue": "...", "subject": "...", "company": "..."}\n]'}
                style={{ minHeight: '200px', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' }} />
            </div>

            <button className="btn-accent" onClick={handleRun} disabled={loading || !input.trim()}>
              {loading ? <span className="spinner" /> : <Play size={12} strokeWidth={2} />}
              {loading ? `Processing ${progress.current}/${progress.total}...` : 'Run Batch'}
            </button>
          </div>

          {/* Info panel */}
          <div className="card" style={{ background: 'var(--bg)' }}>
            <span className="label" style={{ display: 'block', marginBottom: '0.625rem' }}>INPUT FORMAT</span>
            <p className="muted" style={{ fontSize: '0.6875rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              Accepts JSON array or CSV with columns: <code className="mono accent" style={{ fontSize: '0.625rem' }}>issue, subject, company</code>
            </p>
            <span className="label" style={{ display: 'block', marginBottom: '0.375rem' }}>OPTIONAL FIELDS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {['provider', 'use_reranker'].map(f => (
                <span key={f} className="mono muted" style={{ fontSize: '0.625rem' }}>• {f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ marginTop: '1rem' }}>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }} /></div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
            <StatBox icon={<BarChart3 size={14} />} label="TOTAL" value={stats.total} />
            <StatBox icon={<CheckCircle size={14} />} label="REPLIED" value={stats.replied} color="var(--success)" />
            <StatBox icon={<XCircle size={14} />} label="ESCALATED" value={stats.escalated} color="var(--warning)" />
            <StatBox icon={<Clock size={14} />} label="AVG TIME" value="2.4s" />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button className="btn-ghost btn-sm" onClick={() => setResults(null)}>← New Batch</button>
            <button className="btn-ghost btn-sm" onClick={exportJson}><Download size={11} /> JSON</button>
            <button className="btn-ghost btn-sm" onClick={exportCsv}><Download size={11} /> CSV</button>
          </div>

          {/* Table */}
          <div style={{ border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  <th>Issue</th>
                  <th style={{ width: '80px' }}>Status</th>
                  <th style={{ width: '100px' }}>Type</th>
                  <th style={{ width: '110px' }}>Product Area</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((r, i) => {
                  const res = r.result || r;
                  const isExp = expandedRow === i;
                  return [
                    <tr key={i} onClick={() => setExpandedRow(isExp ? null : i)} style={{ cursor: 'pointer' }}>
                      <td className="mono muted" style={{ fontSize: '0.6875rem' }}>{i + 1}</td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                        {r.ticket?.issue || '—'}
                      </td>
                      <td><span className={`badge ${res.status === 'escalated' ? 'badge-warning' : 'badge-success'}`}>{res.status}</span></td>
                      <td><span className="badge">{res.request_type}</span></td>
                      <td><span className="badge badge-accent">{res.product_area}</span></td>
                    </tr>,
                    isExp && (
                      <tr key={`${i}-exp`}>
                        <td colSpan={5} style={{ background: 'var(--muted)', padding: '1rem' }}>
                          <span className="label" style={{ display: 'block', marginBottom: '0.375rem' }}>Response</span>
                          <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{res.response}</p>
                          <span className="label" style={{ display: 'block', marginBottom: '0.375rem' }}>Justification</span>
                          <p className="muted" style={{ fontSize: '0.75rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{res.justification}</p>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <div style={{ background: 'var(--bg)', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ color: color || 'var(--muted-fg)' }}>{icon}</span>
      <div>
        <span className="label" style={{ fontSize: '0.5625rem', display: 'block' }}>{label}</span>
        <span className="mono" style={{ fontSize: '1.125rem', fontWeight: 700, color: color || 'var(--fg)', letterSpacing: 'var(--tracking-tighter)' }}>{value}</span>
      </div>
    </div>
  );
}
