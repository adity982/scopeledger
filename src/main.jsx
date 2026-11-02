import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUpRight, ArrowsClockwise, Check, CheckCircle, ClipboardText, FileText, GitBranch, Invoice, LinkSimple, Plus, ShieldCheck, Sparkle, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import './style.css';

async function api(path, options = {}, retry = true) {
  const token = sessionStorage.getItem('scopeledger-admin-token');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  if (response.status === 401 && retry) {
    const next = window.prompt('Enter the demo admin token');
    if (next) { sessionStorage.setItem('scopeledger-admin-token', next); return api(path, options, false); }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const json = (body) => JSON.stringify(body);
const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));
const label = (status) => ({ new: 'New request', analyzed: 'Ready to review', proposed: 'Awaiting client', accepted: 'Client accepted', invoiced: 'Invoice sent', paid: 'Paid' }[status] || status);

function Status({ status }) { return <span className={`status status-${status}`}><span className="status-dot" />{label(status)}</span>; }
function Button({ children, icon: Icon, variant = 'primary', busy, ...props }) { return <button className={`button ${variant}`} disabled={busy || props.disabled} {...props}>{busy ? <SpinnerGap className="spin" size={17} /> : Icon && <Icon size={17} weight="bold" />}{children}</button>; }
function Field({ label: title, children, hint }) { return <label className="field"><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>; }

function ClientView() {
  const token = window.location.pathname.split('/').pop();
  const [item, setItem] = useState(null);
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => api(`/client/${token}`).then(setItem).catch(e => setError(e.message));
  useEffect(() => { refresh(); }, []);
  async function accept() {
    setBusy(true); setError('');
    try { await api(`/client/${token}/accept`, { method: 'POST', body: json({ name, accepted: checked }) }); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="client-shell">
    <header className="client-top"><div className="brand-mark">S</div><strong>ScopeLedger</strong><span>Client review</span></header>
    <main className="client-main">
      <p className="eyebrow">CHANGE ORDER</p>
      <h1>A clear next step<br /><em>for extra work.</em></h1>
      {error && <div className="notice error"><WarningCircle size={19} />{error}</div>}
      {!item && !error && <p>Loading your change order…</p>}
      {item && <div className="client-card">
        <div className="client-card-head"><div><span className="muted">Project</span><h2>{item.project_name}</h2></div><Status status={item.status} /></div>
        <div className="review-block"><span className="muted">Requested change</span><h3>{item.title}</h3><p>{item.work_description}</p></div>
        <div className="review-total"><div><span className="muted">Estimated effort</span><strong>{item.hours} hours</strong></div><div><span className="muted">Additional fee</span><strong>{money(item.amount, item.currency)}</strong></div></div>
        {item.status === 'proposed' ? <div className="accept-box"><h3>Accept this change</h3><p>Your approval is recorded with your name and time. The freelancer will then send a separate PayPal invoice.</p><Field label="Your name"><input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></Field><label className="checkline"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> I agree to the added work and fee shown above.</label><Button icon={Check} onClick={accept} busy={busy} disabled={!checked || name.trim().length < 2}>Accept change order</Button></div> : <div className="notice success"><CheckCircle size={20} />Accepted by {item.accepted_name}{item.accepted_at ? ` on ${new Date(item.accepted_at).toLocaleString()}` : ''}.</div>}
        {item.invoice_url && <a className="button primary invoice-link" href={item.invoice_url} target="_blank" rel="noreferrer"><Invoice size={17} />Open PayPal invoice <ArrowUpRight size={16} /></a>}
      </div>}
      <p className="client-foot">This page records approval of the change shown above. Payment takes place on PayPal’s hosted page when an invoice is sent.</p>
    </main>
  </div>;
}

function App() {
  const [config, setConfig] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [request, setRequest] = useState(null);
  const [mode, setMode] = useState('workspace');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [draft, setDraft] = useState({ work_description: '', hours: '' });
  const [newProject, setNewProject] = useState({ name: '', client_name: '', client_email: '', scope: '', rate: 85, currency: 'USD' });
  const [newRequest, setNewRequest] = useState({ title: '', body: '', source_url: '' });

  async function loadProjects(preferred) {
    const rows = await api('/projects'); setProjects(rows);
    const chosen = preferred || project?.id || rows[0]?.id;
    if (chosen) await loadProject(chosen);
    else { setProject(null); setRequest(null); }
  }
  async function loadProject(projectId, requestId) {
    const item = await api(`/projects/${projectId}`); setProject(item);
    const selected = requestId ? item.requests.find(r => r.id === requestId) : item.requests.find(r => r.id === request?.id) || item.requests[0];
    setRequest(selected || null); setDraft({ work_description: selected?.work_description || '', hours: selected?.hours || '' });
    setMode('workspace');
  }
  async function loadRequest(requestId) {
    const item = await api(`/requests/${requestId}`);
    setRequest(item); setDraft({ work_description: item.work_description || '', hours: item.hours || '' });
    if (project) { const p = await api(`/projects/${project.id}`); setProject(p); }
  }
  useEffect(() => { api('/config').then(setConfig); loadProjects().catch(e => setError(e.message)); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);

  async function action(key, fn) { setBusy(key); setError(''); try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); } }
  const createProject = e => { e.preventDefault(); action('project', async () => { const p = await api('/projects', { method: 'POST', body: json(newProject) }); await loadProjects(p.id); setNewProject({ name: '', client_name: '', client_email: '', scope: '', rate: 85, currency: 'USD' }); setToast('Project created'); }); };
  const createRequest = e => { e.preventDefault(); action('request', async () => { const r = await api(`/projects/${project.id}/requests`, { method: 'POST', body: json(newRequest) }); await loadProject(project.id, r.id); setNewRequest({ title: '', body: '', source_url: '' }); setToast('Request added'); }); };
  const sample = () => action('sample', async () => { const p = await api('/sample', { method: 'POST' }); await loadProjects(p.id); setToast('Sample project loaded'); });
  const analyzeRequest = () => action('analyze', async () => { await api(`/requests/${request.id}/analyze`, { method: 'POST' }); await loadRequest(request.id); setToast(config?.aiConfigured ? 'AI comparison complete' : 'Local sample comparison complete'); });
  const saveDraft = () => action('save', async () => { await api(`/requests/${request.id}`, { method: 'PATCH', body: json(draft) }); await loadRequest(request.id); setToast('Change order saved'); });
  const propose = () => action('propose', async () => { await api(`/requests/${request.id}/propose`, { method: 'POST' }); await loadRequest(request.id); setToast('Client review link is ready'); });
  const invoice = () => action('invoice', async () => { await api(`/requests/${request.id}/invoice`, { method: 'POST' }); await loadRequest(request.id); setToast('PayPal invoice sent'); });
  const sync = () => action('sync', async () => { await api(`/requests/${request.id}/sync`, { method: 'POST' }); await loadRequest(request.id); setToast('PayPal status refreshed'); });
  async function copyLink() { const url = `${location.origin}/client/${request.client_token}`; await navigator.clipboard.writeText(url); setToast('Client review link copied'); }
  const editable = request && ['new','analyzed'].includes(request.status);
  const amount = Math.round(Number(draft.hours || 0) * Number(project?.rate || 0) * 100) / 100;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><strong>ScopeLedger</strong><span>Scope to settlement</span></div></div>
      <div className="side-section-label">WORKSPACE</div>
      <button className={`nav-button ${mode === 'workspace' ? 'active' : ''}`} onClick={() => { if (project) setMode('workspace'); }}><ClipboardText size={19} /> Change orders</button>
      <button className={`nav-button ${mode === 'new-project' ? 'active' : ''}`} onClick={() => setMode('new-project')}><Plus size={19} /> New project</button>
      <div className="side-section-label projects-label">PROJECTS</div>
      <div className="project-list">{projects.map(p => <button key={p.id} className={`project-button ${project?.id === p.id && mode === 'workspace' ? 'selected' : ''}`} onClick={() => loadProject(p.id).catch(e => setError(e.message))}><span className="project-initial">{p.name[0]}</span><span className="project-name">{p.name}</span><span className="project-count">{p.request_count}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="sandbox-pill"><ShieldCheck size={16} /> Sandbox workspace</div><p>Built for clear client decisions and traceable payments.</p></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-crumb">WORKSPACE <span>/</span> {mode === 'new-project' ? 'NEW PROJECT' : project?.name?.toUpperCase() || 'OVERVIEW'}</div><div className="topbar-right">{config && <span className={`connection ${config.aiConfigured ? 'on' : ''}`}><span />AI {config.aiConfigured ? 'connected' : 'sample only'}</span>}{config && <span className={`connection ${config.paypalConfigured ? 'on' : ''}`}><span />PayPal {config.paypalConfigured ? 'sandbox ready' : 'setup needed'}</span>}</div></header>
      <div className="content">
        {error && <div className="notice error"><WarningCircle size={19} />{error}<button onClick={() => setError('')}>Dismiss</button></div>}
        {toast && <div className="toast"><CheckCircle size={18} />{toast}</div>}
        {mode === 'new-project' ? <section className="form-page"><p className="eyebrow">NEW ENGAGEMENT</p><h1>Give the project<br /><em>a clear baseline.</em></h1><p className="lead">The signed scope becomes the reference for every future request.</p><form onSubmit={createProject} className="form-panel"><div className="two-col"><Field label="Project name"><input required value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} placeholder="Checkout redesign" /></Field><Field label="Client name"><input required value={newProject.client_name} onChange={e => setNewProject({ ...newProject, client_name: e.target.value })} placeholder="Maya Chen" /></Field></div><div className="two-col"><Field label="Client email"><input type="email" required value={newProject.client_email} onChange={e => setNewProject({ ...newProject, client_email: e.target.value })} placeholder="client@example.com" /></Field><div className="rate-grid"><Field label="Hourly rate"><input type="number" min="1" step="0.01" required value={newProject.rate} onChange={e => setNewProject({ ...newProject, rate: e.target.value })} /></Field><Field label="Currency"><select value={newProject.currency} onChange={e => setNewProject({ ...newProject, currency: e.target.value })}><option>USD</option><option>EUR</option><option>GBP</option><option>INR</option></select></Field></div></div><Field label="Agreed scope" hint="Paste the signed scope or statement of work. Use fictional information in a public demo."><textarea required rows="9" value={newProject.scope} onChange={e => setNewProject({ ...newProject, scope: e.target.value })} placeholder="List the agreed deliverables, exclusions, and change process…" /></Field><Button icon={ArrowRight} busy={busy === 'project'}>Create project</Button></form></section>
        : !project ? <section className="empty-home"><div className="eyebrow">WELCOME TO SCOPELEDGER</div><h1>Make extra work<br /><em>clear before it starts.</em></h1><p className="lead">Compare a new request to the agreed scope, agree the change, and collect payment through PayPal.</p><div className="home-actions"><Button icon={Plus} onClick={() => setMode('new-project')}>Create a project</Button>{config?.demoMode && <Button icon={FileText} variant="secondary" busy={busy === 'sample'} onClick={sample}>Load sample project</Button>}</div><div className="steps"><span>01 · Compare</span><span>02 · Agree</span><span>03 · Invoice</span></div></section>
        : <>
          <section className="page-intro"><div><p className="eyebrow">PROJECT OVERVIEW</p><h1>{project.name}</h1><p className="lead">Track new requests against the work everyone already agreed to.</p></div><div className="form-actions"><Button icon={ArrowsClockwise} variant="secondary" onClick={() => loadProject(project.id).catch(e => setError(e.message))}>Refresh</Button><Button icon={Plus} onClick={() => setMode('new-request')}>Add request</Button></div></section>
          {mode === 'new-request' ? <form className="form-panel request-form" onSubmit={createRequest}><div className="section-title"><GitBranch size={23} /><div><h2>Add a client request</h2><p>Paste the request or import a public GitHub issue.</p></div></div><Field label="GitHub issue URL (optional)"><input value={newRequest.source_url} onChange={e => setNewRequest({ ...newRequest, source_url: e.target.value })} placeholder="https://github.com/owner/repo/issues/12" /></Field><div className="or-divider">OR ENTER THE REQUEST</div><Field label="Title"><input value={newRequest.title} onChange={e => setNewRequest({ ...newRequest, title: e.target.value })} placeholder="Add native mobile checkout" /></Field><Field label="Request details"><textarea rows="5" value={newRequest.body} onChange={e => setNewRequest({ ...newRequest, body: e.target.value })} placeholder="The client's exact request…" /></Field><div className="form-actions"><Button icon={ArrowRight} busy={busy === 'request'}>Add request</Button><Button type="button" variant="text" onClick={() => setMode('workspace')}>Cancel</Button></div></form>
          : <div className="workspace-grid"><section className="request-list-panel"><div className="panel-heading"><div><span className="panel-kicker">INCOMING</span><h2>Requests <span>{project.requests.length}</span></h2></div><button className="icon-button" aria-label="Add request" onClick={() => setMode('new-request')}><Plus size={20} /></button></div>{project.requests.length ? project.requests.map(r => <button key={r.id} className={`request-row ${request?.id === r.id ? 'current' : ''}`} onClick={() => { setRequest(r); setDraft({ work_description: r.work_description || '', hours: r.hours || '' }); }}><span className="request-row-top"><span className="request-title">{r.title}</span><ArrowRight size={16} /></span><span className="request-row-body">{r.body}</span><Status status={r.status} /></button>) : <div className="empty-list"><FileText size={27} /><p>No requests yet.</p><button onClick={() => setMode('new-request')}>Add the first request <ArrowRight size={15} /></button></div>}</section>
          <section className="detail-panel">{request ? <><div className="detail-head"><div><span className="panel-kicker">CHANGE REVIEW</span><h2>{request.title}</h2></div><Status status={request.status} /></div><div className="detail-body"><div className="detail-section"><div className="detail-section-label"><span>01</span> Client request</div><p className="request-copy">{request.body}</p>{request.source_url && <a className="source-link" href={request.source_url} target="_blank" rel="noreferrer"><GitBranch size={15} /> View GitHub issue <ArrowUpRight size={14} /></a>}</div><div className="detail-section"><div className="detail-section-label"><span>02</span> Scope comparison</div>{request.analysis ? <><div className={`verdict verdict-${request.analysis.verdict}`}><Sparkle size={19} /><div><strong>{({ in_scope: 'Likely in scope', extra_work: 'Likely extra work', uncertain: 'Needs your judgment' })[request.analysis.verdict]}</strong><p>{request.analysis.summary}</p></div></div>{request.analysis.mode === 'sample' && <div className="notice sample-note"><WarningCircle size={18} />Local sample only. Set OPENAI_API_KEY to run an AI comparison.</div>}<div className="evidence-grid"><div><span>AGREED SCOPE</span><blockquote>“{request.analysis.scope_quote}”</blockquote></div><div><span>NEW REQUEST</span><blockquote>“{request.analysis.request_quote}”</blockquote></div></div><p className="analysis-reason">{request.analysis.reason}</p></> : <div className="analysis-empty"><p>Compare this request with the agreed scope and see the supporting evidence.</p><Button icon={Sparkle} busy={busy === 'analyze'} onClick={analyzeRequest}>{config?.aiConfigured ? 'Analyze request' : 'Run local sample'}</Button></div>}</div><div className="detail-section"><div className="detail-section-label"><span>03</span> Change order</div><Field label="Additional deliverable"><textarea rows="3" disabled={!editable} value={draft.work_description} onChange={e => setDraft({ ...draft, work_description: e.target.value })} placeholder="Describe the work the client will receive…" /></Field><div className="quote-grid"><Field label="Estimated hours"><input type="number" min="0" step="0.25" disabled={!editable} value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value })} /></Field><div className="quote-price"><span>AT {money(project.rate, project.currency)} / HOUR</span><strong>{money(amount, project.currency)}</strong></div></div>{editable && <div className="form-actions"><Button icon={Check} variant="secondary" onClick={saveDraft} busy={busy === 'save'} disabled={!draft.work_description || Number(draft.hours) <= 0}>Save changes</Button>{request.status === 'analyzed' && <Button icon={ArrowRight} onClick={propose} busy={busy === 'propose'} disabled={!request.amount || !request.work_description}>Create client review link</Button>}</div>}{request.client_token && <div className="client-link-box"><div><LinkSimple size={19} /><div><strong>Client review link</strong><small>{location.origin}/client/{request.client_token}</small></div></div><Button variant="secondary" onClick={copyLink}>Copy</Button></div>}{request.status === 'accepted' && <div className="payment-action"><div><CheckCircle size={21} /><span>Accepted by {request.accepted_name}. Ready for a PayPal sandbox invoice.</span></div><Button icon={Invoice} onClick={invoice} busy={busy === 'invoice'} disabled={!config?.paypalConfigured}>Send PayPal invoice</Button>{!config?.paypalConfigured && <small>Set PayPal sandbox credentials in .env to enable this step.</small>}</div>}{['invoiced','paid'].includes(request.status) && <div className="payment-action"><div><Invoice size={21} /><span>PayPal invoice {request.invoice_id} · {request.invoice_status}</span></div><div className="form-actions">{request.invoice_url && <a className="button secondary" href={request.invoice_url} target="_blank" rel="noreferrer">Open invoice <ArrowUpRight size={16} /></a>}<Button variant="secondary" onClick={sync} busy={busy === 'sync'}>Refresh status</Button></div></div>}</div></div></> : <div className="no-selection"><ClipboardText size={32} /><h3>Select a request</h3><p>Its scope comparison and payment status will appear here.</p></div>}</section></div>}
        </>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(window.location.pathname.startsWith('/client/') ? <ClientView /> : <App />);
