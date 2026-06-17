import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { healthCheck, getApiBase, setApiBase } from './api';
import Header from './components/Layout/Header';
import TabNav from './components/Layout/TabNav';
import Dashboard from './components/Dashboard/Dashboard';
import Analyser from './components/Analyser/Analyser';
import BatchProcessor from './components/Batch/BatchProcessor';
import ContextInspector from './components/Inspector/ContextInspector';
import CorpusManager from './components/Corpus/CorpusManager';
import ApiReference from './components/ApiRef/ApiReference';
import ToastContainer from './components/shared/ToastContainer';

const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analyser', label: 'Analyser' },
  { id: 'batch', label: 'Batch' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'corpus', label: 'Corpus' },
  { id: 'api', label: 'API Ref' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [health, setHealth] = useState(null);
  const [healthStatus, setHealthStatus] = useState('loading');
  const [toasts, setToasts] = useState([]);
  const [apiBase, setApiBaseState] = useState(getApiBase());

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const checkHealth = useCallback(async () => {
    setHealthStatus('loading');
    try {
      const data = await healthCheck();
      setHealth(data);
      setHealthStatus('ok');
    } catch {
      setHealth(null);
      setHealthStatus('error');
    }
  }, []);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  const handleApiBaseChange = (url) => {
    setApiBase(url);
    setApiBaseState(url);
    checkHealth();
  };

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard health={health} healthStatus={healthStatus} onRefresh={checkHealth} onNavigate={setTab} />;
      case 'analyser': return <Analyser />;
      case 'batch': return <BatchProcessor />;
      case 'inspector': return <ContextInspector />;
      case 'corpus': return <CorpusManager />;
      case 'api': return <ApiReference onNavigate={setTab} />;
      default: return null;
    }
  };

  return (
    <ToastContext.Provider value={addToast}>
      <Header
        healthStatus={healthStatus}
        apiBase={apiBase}
        onApiBaseChange={handleApiBaseChange}
        onRefreshHealth={checkHealth}
      />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      <main className="container" style={{ flex: 1, paddingTop: '2rem', paddingBottom: '4rem' }}>
        {renderTab()}
      </main>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
