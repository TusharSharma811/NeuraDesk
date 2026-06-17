export default function TabNav({ tabs, active, onChange }) {
  return (
    <nav className="tab-nav" style={{ background: 'var(--bg)', position: 'sticky', top: '64px', zIndex: 99 }}>
      <div className="container" style={{ display: 'flex' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn${active === t.id ? ' active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
