import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
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

const ActivityContext = createContext();
export const useActivity = () => useContext(ActivityContext);

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
  const [activities, setActivities] = useState([]);
  const sessionStart = useRef(Date.now());

  const logActivity = useCallback((level, msg) => {
    setActivities(prev => [...prev.slice(-99), {
      level,
      msg,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    }]);
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    // also log to activity feed
    logActivity(type === 'error' ? 'error' : 'success', message);
  }, [logActivity]);

  const removeToast = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const checkHealth = useCallback(async () => {
    setHealthStatus('loading');
    logActivity('info', 'Health check initiated...');
    try {
      const data = await healthCheck();
      setHealth(data);
      setHealthStatus('ok');
      logActivity('success', `Connected — ${data.documents} documents, ${data.companies?.length} domains, reranker ${data.reranker}`);
    } catch {
      setHealth(null);
      setHealthStatus('error');
      logActivity('error', 'Backend unreachable — connection refused');
    }
  }, [logActivity]);

  useEffect(() => {
    logActivity('info', 'NeuraDesk Console initialized');
    checkHealth();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleApiBaseChange = (url) => {
    setApiBase(url);
    setApiBaseState(url);
    logActivity('info', `API endpoint changed → ${url}`);
    checkHealth();
  };

  const renderTab = () => {
    switch (tab) {
      case 'dashboard': return <Dashboard health={health} healthStatus={healthStatus} onRefresh={checkHealth} onNavigate={setTab} activities={activities} sessionStart={sessionStart.current} />;
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
      <ActivityContext.Provider value={logActivity}>
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
      </ActivityContext.Provider>
    </ToastContext.Provider>
  );
}
