import { useState } from 'react';
import { Copy, ArrowRight, ChevronDown, ChevronRight, Terminal, Code2, Globe } from 'lucide-react';
import { getApiBase, buildCurl } from '../../api';
import { useToast } from '../../App';

const ENDPOINTS = [
  {
    category: 'System',
    endpoints: [
      {
        method: 'GET', path: '/health',
        desc: 'Check system readiness and service configuration.',
        body: null,
        response: { status: "ok", documents: 768, companies: ["claude", "hackerrank", "visa"], reranker: "on" },
        tab: 'dashboard',
      },
    ],
  },
  {
    category: 'Analysis',
    endpoints: [
      {
        method: 'POST', path: '/rag/analyse',
        desc: 'Full RAG pipeline — retrieval, safety classification, and LLM generation. Supports SSE streaming with stream=true.',
        body: { issue: "How do I add extra time for candidates?", subject: "Time accommodation", company: "HackerRank", provider: "gemini", use_reranker: true, stream: false },
        response: { ticket: { issue: "...", subject: "...", company: "..." }, retrieval: { max_relevance_score: 8.42, documents: ["..."] }, classification_guidance: { should_escalate: false }, result: { status: "replied", product_area: "screen", response: "...", justification: "...", request_type: "product_issue" } },
        tab: 'analyser',
      },
      {
        method: 'POST', path: '/rag/retrieve',
        desc: 'Retrieval only — returns matched corpus chunks with relevance scores. No LLM invocation.',
        body: { issue: "Delete my conversation", subject: "Privacy", company: "Claude" },
        response: { ticket: {}, documents: [{ text: "...", company: "claude", category: "privacy", title: "...", relevance_score: 9.12 }] },
        tab: 'inspector',
      },
      {
        method: 'POST', path: '/rag/batch',
        desc: 'Process multiple tickets in a single request. Returns results for each ticket.',
        body: [{ issue: "How do I extend a test?", subject: "Test timing", company: "HackerRank" }],
        response: { count: 1, results: ["..."] },
        tab: 'batch',
      },
    ],
  },
  {
    category: 'Corpus',
    endpoints: [
      {
        method: 'POST', path: '/corpus/upsert',
        desc: 'Write a markdown document to the corpus and optionally rebuild the vector index.',
        body: { path: "hackerrank/screen/new-article.md", content: "# New Article\n\nContent here...", force_rebuild: true },
        response: { status: "updated", documents: 769, companies: ["..."], path: "...", updated: true },
        tab: 'corpus',
      },
      {
        method: 'POST', path: '/corpus/refresh',
        desc: 'Reload or full-rebuild the vector index after external corpus changes.',
        body: { force_rebuild: false },
        response: { status: "refreshed", documents: 768, companies: ["..."], reranker: "on" },
        tab: 'corpus',
      },
    ],
  },
];

function genPython(method, path, body) {
  const base = 'BASE_URL';
  if (method === 'GET') return `import requests\n\nres = requests.get(f"{${base}}${path}")\nprint(res.json())`;
  return `import requests\n\nres = requests.post(\n    f"{${base}}${path}",\n    json=${JSON.stringify(body, null, 4).replace(/null/g, 'None').replace(/true/g, 'True').replace(/false/g, 'False')}\n)\nprint(res.json())`;
}

function genJs(method, path, body) {
  if (method === 'GET') return `const res = await fetch(\`\${BASE_URL}${path}\`);\nconst data = await res.json();`;
  return `const res = await fetch(\`\${BASE_URL}${path}\`, {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(body, null, 2)})\n});\nconst data = await res.json();`;
}

export default function ApiReference({ onNavigate }) {
  const toast = useToast();
  const base = getApiBase();

  const copyCurl = (ep) => {
    navigator.clipboard.writeText(buildCurl(ep.method, ep.path, ep.body));
    toast('cURL copied', 'success');
  };

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div className="section-bar" />
        <span className="label" style={{ color: 'var(--accent)' }}>API REFERENCE</span>
      </div>
      <p className="muted" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Base URL: <code className="mono accent" style={{ fontSize: '0.75rem' }}>{base}</code>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {ENDPOINTS.map((group) => (
          <div key={group.category}>
            <span className="label" style={{ display: 'block', marginBottom: '0.625rem', fontSize: '0.5625rem' }}>{group.category}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {group.endpoints.map((ep, i) => (
                <EndpointCard key={i} ep={ep} onCopy={() => copyCurl(ep)} onTry={() => onNavigate(ep.tab)} base={base} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ ep, onCopy, onTry, base }) {
  const [expanded, setExpanded] = useState(false);
  const [lang, setLang] = useState('curl');

  const codeSnippet = lang === 'curl'
    ? buildCurl(ep.method, ep.path, ep.body).replace(/BASE_URL/g, base)
    : lang === 'python'
    ? genPython(ep.method, ep.path, ep.body)
    : genJs(ep.method, ep.path, ep.body);

  const copySnippet = () => {
    navigator.clipboard.writeText(codeSnippet);
  };

  return (
    <div className="card" style={{ padding: '0.875rem 1rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span className={`badge ${ep.method === 'GET' ? 'badge-success' : 'badge-accent'}`} style={{ minWidth: '42px', justifyContent: 'center' }}>{ep.method}</span>
        <code className="mono" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{ep.path}</code>
        <span className="muted" style={{ fontSize: '0.6875rem', flex: 1 }}>{ep.desc}</span>
        {expanded ? <ChevronDown size={13} style={{ color: 'var(--muted-fg)' }} /> : <ChevronRight size={13} style={{ color: 'var(--muted-fg)' }} />}
      </div>

      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', animation: 'fadeIn 150ms', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Language tabs */}
          <div>
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
              {[{ id: 'curl', label: 'cURL', icon: <Terminal size={10} /> }, { id: 'javascript', label: 'JavaScript', icon: <Code2 size={10} /> }, { id: 'python', label: 'Python', icon: <Globe size={10} /> }].map(l => (
                <button key={l.id} className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setLang(l.id); }}
                  style={{ color: lang === l.id ? 'var(--accent)' : undefined, fontWeight: lang === l.id ? 600 : undefined, borderBottom: lang === l.id ? '1px solid var(--accent)' : '1px solid transparent', borderRadius: 0, padding: '0.25rem 0.5rem' }}>
                  {l.icon} {l.label}
                </button>
              ))}
              <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); copySnippet(); }} style={{ marginLeft: 'auto' }}>
                <Copy size={10} /> Copy
              </button>
            </div>
            <div className="code-block" style={{ fontSize: '0.6875rem' }}>{codeSnippet}</div>
          </div>

          {/* Request / Response side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: ep.body ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
            {ep.body && (
              <div>
                <div className="code-block-header"><span>Request Body</span></div>
                <div className="code-block" style={{ fontSize: '0.625rem' }}>{JSON.stringify(ep.body, null, 2)}</div>
              </div>
            )}
            <div>
              <div className="code-block-header"><span>Response</span></div>
              <div className="code-block" style={{ fontSize: '0.625rem' }}>{JSON.stringify(ep.response, null, 2)}</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onTry(); }}>
              Try it <ArrowRight size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
