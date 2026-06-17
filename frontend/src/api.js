const DEFAULT_BASE = 'http://localhost:8000';

function getBase() {
  return localStorage.getItem('rag_api_base') || DEFAULT_BASE;
}

export function setApiBase(url) {
  localStorage.setItem('rag_api_base', url.replace(/\/+$/, ''));
}

export function getApiBase() {
  return getBase();
}

async function request(path, options = {}) {
  const base = getBase();
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function healthCheck() {
  return request('/health');
}

export async function retrieveContext(ticket) {
  return request('/rag/retrieve', {
    method: 'POST',
    body: JSON.stringify(ticket),
  });
}

export async function analyseTicket(ticket) {
  return request('/rag/analyse', {
    method: 'POST',
    body: JSON.stringify({ ...ticket, stream: false }),
  });
}

export async function analyseTicketStream(ticket, onEvent) {
  const base = getBase();
  const res = await fetch(`${base}/rag/analyse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ticket, stream: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent({ type: eventType, data });
        } catch { /* skip */ }
      }
    }
  }
}

export async function batchAnalyse(tickets) {
  return request('/rag/batch', {
    method: 'POST',
    body: JSON.stringify(tickets),
  });
}

export async function refreshCorpus(forceRebuild = false) {
  return request('/corpus/refresh', {
    method: 'POST',
    body: JSON.stringify({ force_rebuild: forceRebuild }),
  });
}

export async function upsertCorpus(path, content, forceRebuild = true) {
  return request('/corpus/upsert', {
    method: 'POST',
    body: JSON.stringify({ path, content, force_rebuild: forceRebuild }),
  });
}

export function buildCurl(method, path, body) {
  const base = getBase();
  let cmd = `curl -X ${method} ${base}${path}`;
  if (body) {
    cmd += ` \\\n  -H "Content-Type: application/json"`;
    cmd += ` \\\n  -d '${JSON.stringify(body)}'`;
  }
  return cmd;
}
