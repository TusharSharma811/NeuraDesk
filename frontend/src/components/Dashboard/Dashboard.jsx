import { useState, useEffect, useRef } from 'react';
import { Database, Cpu, Building2, ArrowRight, RefreshCw, AlertTriangle, Clock, Zap, BarChart3, Shield, Globe, TrendingUp, TrendingDown, Activity } from 'lucide-react';

const MOCK_ACTIVITY = [
  { level: 'info', msg: 'System initialized — corpus loaded', time: -240 },
  { level: 'success', msg: 'FAISS index ready — 768 vectors indexed', time: -180 },
  { level: 'info', msg: 'BM25 keyword index built', time: -178 },
  { level: 'success', msg: 'Cross-encoder reranker loaded (ms-marco-MiniLM-L-6-v2)', time: -175 },
  { level: 'info', msg: 'Ticket #84219 routed → HackerRank/screen', time: -120 },
  { level: 'info', msg: 'Retrieval completed in 108ms — 5 chunks returned', time: -118 },
  { level: 'success', msg: 'Ticket #84219 resolved — status: replied', time: -112 },
  { level: 'warn', msg: 'Low-confidence retrieval detected (score: 0.23)', time: -90 },
  { level: 'info', msg: 'Ticket #84220 escalated — billing pattern matched', time: -88 },
  { level: 'info', msg: 'Batch job started — 12 tickets queued', time: -60 },
  { level: 'success', msg: 'Batch complete — 11 replied, 1 escalated', time: -45 },
  { level: 'success', msg: 'Corpus reindexed — 769 documents', time: -20 },
  { level: 'info', msg: 'Health check passed — all systems nominal', time: -5 },
];

function timeAgo(seconds) {
  const d = new Date(Date.now() + seconds * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function Sparkline({ data = [], color = 'var(--accent)', height = 24 }) {
  const max = Math.max(...data, 1);
  return (
    <div className="sparkline" style={{ height: `${height}px` }}>
      {data.map((v, i) => (
        <div key={i} className="sparkline-bar" style={{
          height: `${Math.max((v / max) * 100, 4)}%`,
          background: i === data.length - 1 ? color : undefined,
        }} />
      ))}
    </div>
  );
}

function MetricCard({ label, value, delta, deltaDir, sparkData, color, unit = '' }) {
  return (
    <div className="metric-card animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="label">{label}</span>
        {delta && (
          <span className={`metric-delta ${deltaDir}`}>
            {deltaDir === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {delta}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span className="metric-value" style={{ color: color || 'var(--fg)' }}>{value}</span>
        {unit && <span className="label" style={{ fontSize: '0.5625rem' }}>{unit}</span>}
      </div>
      {sparkData && <Sparkline data={sparkData} color={color} />}
    </div>
  );
}

export default function Dashboard({ health, healthStatus, onRefresh, onNavigate }) {
  const feedRef = useRef(null);
  const [activities] = useState(() => MOCK_ACTIVITY.map(a => ({ ...a, time: timeAgo(a.time) })));

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [activities]);

  const docCount = health?.documents || '—';
  const companies = health?.companies || [];
  const reranker = health?.reranker || 'off';

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
          {/* System status */}
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <StatusPill label="API" status={healthStatus === 'ok' ? 'ok' : 'error'} text={healthStatus === 'ok' ? 'Operational' : 'Offline'} />
            <StatusPill label="Model" status="ok" text="Gemini 2.0 Flash" />
            <StatusPill label="Reranker" status={reranker === 'on' ? 'ok' : 'warn'} text={reranker === 'on' ? 'Active' : 'Disabled'} />
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
              <code className="mono" style={{ color: 'var(--accent)', fontSize: '0.6875rem' }}>uvicorn api:app --app-dir code --reload --port 8000</code>
            </p>
          </div>
          <button className="btn-outline btn-sm" onClick={onRefresh}><RefreshCw size={11} /> Retry</button>
        </div>
      )}

      {/* Metrics Grid */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <div className="section-title">
            <div className="section-bar" />
            <span className="label">SYSTEM METRICS</span>
          </div>
          <button className="btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={11} /> Refresh</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)' }}>
          <MetricCard label="CORPUS DOCUMENTS" value={docCount} delta="+12" deltaDir="up" sparkData={[4,6,5,8,7,9,8,10,11,12]} />
          <MetricCard label="INDEXED CHUNKS" value={health ? Math.round(docCount * 2.4) : '—'} delta="+28" deltaDir="up" sparkData={[10,14,12,18,16,20,19,22,24,28]} />
          <MetricCard label="ACTIVE DOMAINS" value={companies.length || '—'} sparkData={[3,3,3,3,3,3,3,3,3,3]} color="var(--cyan)" />
          <MetricCard label="RERANKER" value={reranker === 'on' ? 'ACTIVE' : 'OFF'} color={reranker === 'on' ? 'var(--success)' : 'var(--muted-fg)'} />
          <MetricCard label="AVG RETRIEVAL" value="108" unit="ms" delta="-12ms" deltaDir="up" sparkData={[140,135,128,120,118,112,115,110,108,108]} color="var(--success)" />
          <MetricCard label="AVG RESPONSE" value="2.4" unit="s" sparkData={[3.2,3.0,2.8,2.6,2.5,2.5,2.4,2.4,2.4,2.4]} />
          <MetricCard label="CACHE HIT RATE" value="94.2" unit="%" delta="+2.1%" deltaDir="up" sparkData={[88,89,90,91,91,92,93,93,94,94]} color="var(--success)" />
          <MetricCard label="DAILY REQUESTS" value="847" delta="+63" deltaDir="up" sparkData={[620,680,710,720,750,780,790,810,830,847]} color="var(--accent)" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Activity Feed */}
        <div>
          <div className="section-header">
            <div className="section-title">
              <div className="section-bar" />
              <span className="label">ACTIVITY STREAM</span>
            </div>
            <span className="label" style={{ fontSize: '0.5625rem' }}>{activities.length} events</span>
          </div>
          <div className="activity-feed" ref={feedRef}>
            {activities.map((a, i) => (
              <div key={i} className="activity-item">
                <span className="activity-time">{a.time}</span>
                <span className={`activity-level ${a.level}`}>
                  {a.level === 'info' ? 'INFO' : a.level === 'success' ? 'OK' : a.level === 'warn' ? 'WARN' : 'ERR'}
                </span>
                <span style={{ color: a.level === 'warn' ? 'var(--warning)' : 'var(--fg)', fontSize: '0.6875rem' }}>{a.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
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

          {/* Domain breakdown */}
          {companies.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <span className="label" style={{ display: 'block', marginBottom: '0.5rem' }}>DOMAIN BREAKDOWN</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {companies.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span className="mono" style={{ fontSize: '0.6875rem', fontWeight: 600, width: '80px', textTransform: 'capitalize' }}>{c}</span>
                    <div style={{ flex: 1, height: '4px', background: 'var(--border)' }}>
                      <div style={{ height: '100%', background: 'var(--accent)', width: c === 'hackerrank' ? '78%' : c === 'claude' ? '18%' : '4%', transition: 'width 500ms var(--ease-out)' }} />
                    </div>
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

function StatusPill({ label, status, text }) {
  const colors = { ok: 'var(--success)', error: 'var(--error)', warn: 'var(--warning)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span className="label" style={{ fontSize: '0.5625rem' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span className="status-dot" style={{ background: colors[status], boxShadow: `0 0 6px ${colors[status]}`, width: '5px', height: '5px' }} />
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
