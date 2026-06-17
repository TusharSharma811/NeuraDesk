import { useEffect, useRef } from 'react';
import { Database, RefreshCw, AlertTriangle, Zap, BarChart3, Shield, CheckCircle } from 'lucide-react';

export default function Dashboard({ health, healthStatus, onRefresh, onNavigate, activities = [], sessionStart }) {
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [activities]);

  const docCount = health?.documents;
  const companies = health?.companies || [];
  const reranker = health?.reranker || 'off';
  const uptime = sessionStart ? formatUptime(Date.now() - sessionStart) : '—';

  return (
    <div className="animate-in">
      {/* Hero */}
      <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
              <div style={{ width: '2px', height: '14px', background: 'var(--accent)' }} />
              <span className="label" style={{ color: 'var(--accent)' }}>SUPPORT INTELLIGENCE</span>
            </div>
            <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem', lineHeight: 1.15 }}>
              NeuraDesk Console
            </h1>
            <p className="muted" style={{ fontSize: '0.875rem', lineHeight: 1.6, maxWidth: '520px' }}>
              Monitor, analyze, and optimize AI-powered customer support workflows through retrieval inspection, ticket analysis, corpus management, and batch evaluation.
            </p>
          </div>
          {/* Live system status — all from real API data */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <StatusPill
              label="API"
              status={healthStatus === 'ok' ? 'ok' : healthStatus === 'loading' ? 'loading' : 'error'}
              text={healthStatus === 'ok' ? 'Operational' : healthStatus === 'loading' ? 'Connecting...' : 'Offline'}
            />
            <StatusPill label="Session" status="ok" text={uptime} />
            <StatusPill
              label="Reranker"
              status={healthStatus !== 'ok' ? 'error' : reranker === 'on' ? 'ok' : 'warn'}
              text={healthStatus !== 'ok' ? 'Unknown' : reranker === 'on' ? 'Active' : 'Disabled'}
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {healthStatus === 'error' && (
        <div className="card animate-in" style={{ borderColor: 'var(--error)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem' }}>
          <AlertTriangle size={15} strokeWidth={1.5} style={{ color: 'var(--error)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Backend Unreachable</p>
            <p className="muted" style={{ fontSize: '0.75rem' }}>
              Start the server from <code className="mono accent" style={{ fontSize: '0.6875rem' }}>backend/</code> directory:
              <code className="mono" style={{ color: 'var(--accent)', fontSize: '0.6875rem', marginLeft: '0.25rem' }}>uvicorn api:app --app-dir code --reload --port 8000</code>
            </p>
          </div>
          <button className="btn-outline btn-sm" onClick={onRefresh}><RefreshCw size={11} /> Retry</button>
        </div>
      )}

      {/* Metrics Grid — all derived from real /health response */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <div className="section-title">
            <div className="section-bar" />
            <span className="label">SYSTEM METRICS</span>
            {healthStatus === 'ok' && <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>LIVE</span>}
          </div>
          <button className="btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={11} /> Refresh</button>
        </div>

        {healthStatus === 'ok' && health ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
            <MetricCard label="CORPUS DOCUMENTS" value={docCount.toLocaleString()} color="var(--fg)" />
            <MetricCard label="ACTIVE DOMAINS" value={companies.length} color="var(--cyan)" />
            <MetricCard label="RERANKER STATUS" value={reranker === 'on' ? 'ACTIVE' : 'OFF'} color={reranker === 'on' ? 'var(--success)' : 'var(--muted-fg)'} />
            <MetricCard label="API STATUS" value={health.status?.toUpperCase()} color="var(--success)" />
          </div>
        ) : healthStatus === 'loading' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ background: 'var(--bg-elevated)', padding: '1rem 1.125rem' }}>
                <div className="skeleton" style={{ width: '60%', marginBottom: '0.5rem', height: '0.625rem' }} />
                <div className="skeleton" style={{ width: '40%', height: '1.5rem' }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', padding: '1.5rem', textAlign: 'center' }}>
            <p className="muted" style={{ fontSize: '0.75rem' }}>Connect to the backend to see live metrics</p>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Activity Feed — real session events */}
        <div>
          <div className="section-header">
            <div className="section-title">
              <div className="section-bar" />
              <span className="label">SESSION ACTIVITY</span>
            </div>
            <span className="label" style={{ fontSize: '0.5625rem' }}>{activities.length} events</span>
          </div>
          {activities.length > 0 ? (
            <div className="activity-feed" ref={feedRef}>
              {activities.map((a, i) => (
                <div key={i} className="activity-item">
                  <span className="activity-time">{a.time}</span>
                  <span className={`activity-level ${a.level}`}>
                    {a.level === 'info' ? 'INFO' : a.level === 'success' ? 'OK' : a.level === 'warn' ? 'WARN' : 'ERR'}
                  </span>
                  <span style={{ color: a.level === 'error' ? 'var(--error)' : a.level === 'warn' ? 'var(--warning)' : 'var(--fg)', fontSize: '0.6875rem' }}>{a.msg}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: '1px dashed var(--border)', padding: '2rem', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '0.6875rem' }}>No activity yet this session</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Quick Actions */}
          <div className="section-header">
            <div className="section-title">
              <div className="section-bar" />
              <span className="label">QUICK ACTIONS</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
            <ActionCard icon={<Zap size={15} strokeWidth={1.5} />} title="Analyse Ticket" desc="Full RAG pipeline" onClick={() => onNavigate('analyser')} />
            <ActionCard icon={<BarChart3 size={15} strokeWidth={1.5} />} title="Batch Evaluate" desc="Bulk processing" onClick={() => onNavigate('batch')} />
            <ActionCard icon={<Shield size={15} strokeWidth={1.5} />} title="Inspect Context" desc="Retrieval debug" onClick={() => onNavigate('inspector')} />
            <ActionCard icon={<Database size={15} strokeWidth={1.5} />} title="Manage Corpus" desc="Knowledge base" onClick={() => onNavigate('corpus')} />
          </div>

          {/* Domain breakdown — real company data from /health */}
          {companies.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>INDEXED DOMAINS</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {companies.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.375rem 0.625rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                    <CheckCircle size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    <span className="mono" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'capitalize' }}>{c}</span>
                    <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: '0.5rem' }}>INDEXED</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function MetricCard({ label, value, color }) {
  return (
    <div className="metric-card animate-in">
      <span className="label">{label}</span>
      <span className="metric-value" style={{ color: color || 'var(--fg)' }}>{value}</span>
    </div>
  );
}

function StatusPill({ label, status, text }) {
  const colors = { ok: 'var(--success)', error: 'var(--error)', warn: 'var(--warning)', loading: 'var(--warning)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span className="label" style={{ fontSize: '0.5625rem' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span className={`status-dot ${status === 'loading' ? 'status-dot-loading' : ''}`} style={{ background: colors[status], boxShadow: `0 0 6px ${colors[status]}`, width: '5px', height: '5px' }} />
        <span className="mono" style={{ fontSize: '0.6875rem', fontWeight: 500 }}>{text}</span>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, desc, onClick }) {
  return (
    <button className="card" onClick={onClick} style={{ cursor: 'pointer', textAlign: 'left', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div style={{ color: 'var(--accent)', marginBottom: '0.125rem' }}>{icon}</div>
      <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{title}</span>
      <span className="muted" style={{ fontSize: '0.6875rem' }}>{desc}</span>
    </button>
  );
}
