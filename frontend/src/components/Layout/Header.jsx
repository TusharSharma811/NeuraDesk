import { useState } from 'react';
import { Settings, RefreshCw, Activity } from 'lucide-react';

export default function Header({ healthStatus, apiBase, onApiBaseChange, onRefreshHealth }) {
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState(apiBase);

  const handleSave = () => { onApiBaseChange(urlInput); setShowSettings(false); };

  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '18px', height: '18px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={11} strokeWidth={2.5} style={{ color: 'var(--accent-fg)' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.8125rem', letterSpacing: 'var(--tracking-tight)' }}>
              <span style={{ color: 'var(--accent)' }}>NEURA</span>DESK
            </span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <span className={`status-dot status-dot-${healthStatus}`} />
            <span className="label" style={{ fontSize: '0.5625rem' }}>
              {healthStatus === 'ok' ? 'OPERATIONAL' : healthStatus === 'loading' ? 'CONNECTING' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button className="btn-ghost btn-sm" onClick={onRefreshHealth} title="Refresh health" style={{ padding: '0.375rem' }}>
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
          <button className="btn-ghost btn-sm" onClick={() => { setShowSettings(!showSettings); setUrlInput(apiBase); }} title="Settings" style={{ padding: '0.375rem' }}>
            <Settings size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {showSettings && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0', animation: 'fadeIn 150ms var(--ease-out)' }}>
          <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="input-label" style={{ flexShrink: 0 }}>Endpoint</span>
            <input className="input" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="http://localhost:8000"
              style={{ height: '32px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', maxWidth: '360px' }} />
            <button className="btn-outline btn-sm" onClick={handleSave} style={{ height: '32px', padding: '0 1rem' }}>Save</button>
          </div>
        </div>
      )}
    </header>
  );
}
