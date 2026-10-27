// Tiny single-page app: hash routes -> render functions. No framework needed.
const $app = document.getElementById('app');
const state = { user: null, plans: [] };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const ago = d => { const days = Math.floor((Date.now() - Date.parse(d.replace(' ', 'T') + 'Z')) / 864e5); return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`; };
const LEVEL = { verified: '✔ Verified', caution: '⚠ Check carefully', risky: '✖ Risky' };
const LEVEL_TEXT = { verified: 'Verified', caution: 'Check carefully', risky: 'Risky' };
const badge = (level, score) => `<span class="badge ${level}" role="img" aria-label="${LEVEL_TEXT[level]}${score != null ? `, trust score ${score} out of 100` : ''}">${LEVEL[level]}${score != null ? ` · ${score}` : ''}</span>`;
const salary = j => j.salary_min ? `$${(j.salary_min / 1000).toFixed(0)}k–$${(j.salary_max / 1000).toFixed(0)}k / yr` : '';

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, ...opts,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

async function loadMe() { Object.assign(state, await api('/api/me')); renderNav(); }

function renderNav() {
  const u = state.user;
  document.getElementById('nav').innerHTML = `<a href="#/">Jobs</a><a href="#/pricing">Pricing</a>` +
    (u ? `${u.is_admin ? '<a href="#/admin">Admin</a>' : ''}<a href="#/profile">My profile</a><button type="button" class="linklike" id="logout">Logout</button>`
       : `<a href="#/login">Login</a><a href="#/signup" class="btn">Sign up</a>`);
  document.getElementById('logout')?.addEventListener('click', async e => { e.preventDefault(); await api('/api/logout', { method: 'POST' }); await loadMe(); location.hash = '#/'; });
}

// ---------- pages ----------
async function homePage() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  $app.innerHTML = `
    <section class="hero">
      <h1>Genuine international remote jobs, open to India</h1>
      <p class="muted">Every company is background-checked: founding year, website age, hiring history, repost patterns and scam signals.</p>
    </section>
    <form class="card row filters" id="f">
      <input name="q" type="search" aria-label="Search jobs" placeholder="Search title, skill or company" value="${esc(params.get('q'))}">
      <select name="segment" aria-label="Experience level"><option value="">All levels</option><option value="basic">Starter (entry / non-tech)</option><option value="pro">Professional</option><option value="premium">Senior / specialist</option></select>
      <select name="category" aria-label="Category"><option value="">All categories</option></select>
      <button>Search</button>
    </form>
    <div id="list"><p class="muted">Loading jobs…</p></div>`;
  const f = document.getElementById('f');
  f.segment.value = params.get('segment') || '';
  f.onsubmit = e => { e.preventDefault(); location.hash = '#/?' + new URLSearchParams(new FormData(f)).toString(); };

  const data = await api('/api/jobs?' + params.toString());
  f.category.innerHTML += data.categories.map(c => `<option>${esc(c)}</option>`).join('');
  f.category.value = params.get('category') || '';
  document.getElementById('list').innerHTML = `<p class="muted small" role="status">${data.jobs.length} verified job${data.jobs.length === 1 ? '' : 's'}</p>` + (data.jobs.length ? data.jobs.map(j => `
    <article class="card job">
      <div class="row between">
        <div>
          <h2><a href="#/job/${j.id}">${esc(j.title)}</a></h2>
          <a class="muted" href="#/company/${j.company_id}">${esc(j.company_name)}</a>
        </div>
        ${badge(j.trust_level, j.trust_score)}
      </div>
      <p class="muted small">${esc(j.snippet)}…</p>
      <div class="row small">
        <span class="pill">${esc(j.location || 'Remote')}</span>
        ${j.category ? `<span class="pill">${esc(j.category)}</span>` : ''}
        ${salary(j) ? `<span class="pill">${salary(j)}</span>` : ''}
        ${j.match != null ? `<span class="pill">Skill match ${j.match}%</span>` : ''}
        <span class="muted">Posted ${ago(j.posted_at)}</span>
      </div>
    </article>`).join('') : '<div class="card muted">No jobs found.</div>') +
    (data.hidden_risky ? `<p class="muted small">🛡 ${data.hidden_risky} job(s) hidden because they failed our background check.</p>` : '');
  const { sources } = await api('/api/sources');
  document.getElementById('list').insertAdjacentHTML('beforeend', `<p class="muted small">Jobs collected from ${sources.map(x => x.site
    ? `<a href="${esc(x.site)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : esc(x.label)).join(', ')}. You always apply on the original listing.</p>`);
}

function reportCard(report, company) {
  const s = report.stats || {};
  const max = Math.max(1, ...(s.monthly || []).map(m => m.n));
  return `
    <div class="card ${report.locked ? 'locked' : ''}">
      <div class="row between">
        <div><h2 style="margin:0">Company background check</h2><span class="muted small">${esc(company.name)}</span></div>
        <div style="text-align:right"><div class="score">${report.score}<span class="muted small">/100</span></div>${badge(report.level)}</div>
      </div>
      ${report.locked ? '' : `
      <div class="stats">
        <div class="stat"><b>${company.founded_year || '—'}</b><span class="muted small">Founded</span></div>
        <div class="stat"><b>${company.employee_count ?? '—'}</b><span class="muted small">Employees</span></div>
        <div class="stat"><b>${company.domain_created ? company.domain_created.slice(0, 4) : '—'}</b><span class="muted small">Website since</span></div>
        <div class="stat"><b>${s.posted30}</b><span class="muted small">Jobs posted (30 days)</span></div>
        <div class="stat"><b>${s.posted90}</b><span class="muted small">Jobs posted (90 days)</span></div>
        <div class="stat"><b>${s.closed}</b><span class="muted small">Openings filled/closed</span></div>
        <div class="stat"><b>${s.avgDaysOpen ?? '—'}</b><span class="muted small">Avg days a job stays open</span></div>
        <div class="stat"><b>${(s.reports?.hired || 0)}</b><span class="muted small">Members hired</span></div>
      </div>
      ${s.monthly?.length ? `<p class="small muted" style="margin:16px 0 0">Jobs posted per month (last 12 months)</p>
        <div class="bars" role="img" aria-label="Jobs posted per month: ${s.monthly.map(m => `${m.month} ${m.n}`).join(', ')}">${s.monthly.map(m => `<div style="height:${(m.n / max) * 100}%" title="${m.month}: ${m.n}"><span>${m.month.slice(5)}</span></div>`).join('')}</div><br>` : ''}`}
      <ul class="signals">${report.signals.map(x => `
        <li><span class="imp ${x.impact > 0 ? 'plus' : x.impact < 0 ? 'minus' : 'zero'}">${x.impact > 0 ? '+' : ''}${x.impact}</span>
        <div>${esc(x.label)}${x.detail ? `<div class="muted small">${esc(x.detail)}</div>` : ''}</div></li>`).join('')}</ul>
      ${report.locked ? `<p><b>🔒 ${report.hidden_signals ?? 'More'} more checks, hiring history and the apply link are locked.</b><br>
        <a class="btn" href="#/pricing">Unlock from ${'$'}2/month</a></p>` : ''}
    </div>`;
}

async function jobPage(id) {
  const d = await api('/api/jobs/' + id);
  const j = d.job;
  $app.innerHTML = `
    <div id="msg"></div>
    <div class="card">
      <div class="row between">
        <div><h1 style="margin:0">${esc(j.title)}</h1><a href="#/company/${d.company.id}">${esc(d.company.name)}</a></div>
        ${badge(d.report.level, d.report.score)}
      </div>
      <div class="row small" style="margin:10px 0">
        <span class="pill">${esc(j.location)}</span>${j.category ? `<span class="pill">${esc(j.category)}</span>` : ''}
        ${salary(j) ? `<span class="pill">${salary(j)}</span>` : ''}<span class="pill">Plan: ${esc(d.segment.name)}</span>
        ${j.match != null ? `<span class="pill">Skill match ${j.match}%</span>` : ''}<span class="muted">Posted ${ago(j.posted_at)} · via ${esc(j.source)}</span>
      </div>
      <div class="row">
        <button id="apply" ${d.applied ? 'class="ghost"' : ''}>${d.applied ? 'Applied ✓ – open again' : d.unlocked ? `Apply on ${esc(j.apply_host)}` : '🔒 Apply'}</button>
        <span class="muted small">You'll apply on the employer's original page (${esc(j.apply_host)}).</span>
      </div>
    </div>
    ${reportCard(d.report, d.company)}
    <div class="card"><h3>Job description</h3><div class="desc">${esc(j.description || 'See original posting.')}</div></div>
    ${state.user ? `<div class="card"><h3>Applied here before? Help others</h3><div class="row">
      ${[['hired', '🎉 I got hired'], ['interview', '💬 Got an interview'], ['no_response', '🕳 No response'], ['scam', '🚩 Report scam']]
        .map(([k, t]) => `<button class="ghost" data-report="${k}">${t}</button>`).join('')}</div></div>` : ''}`;

  const msg = (t, ok) => { document.getElementById('msg').innerHTML = `<div class="alert ${ok ? 'ok' : 'err'}" role="${ok ? 'status' : 'alert'}">${t}</div>`; scrollTo(0, 0); };
  document.getElementById('apply').onclick = async () => {
    if (!state.user) return (location.hash = '#/login?next=' + encodeURIComponent(location.hash));
    try {
      let r;
      try { r = await api(`/api/jobs/${id}/apply`, { method: 'POST', body: {} }); }
      catch (e) {
        if (e.data?.code !== 'RISKY' || !confirm(e.message)) throw e;
        r = await api(`/api/jobs/${id}/apply`, { method: 'POST', body: { confirmRisky: true } });
      }
      window.open(r.apply_url, '_blank', 'noopener');
      msg('Opened the original job page in a new tab. We saved this in "My applications".', true);
    } catch (e) {
      if (e.data?.code === 'NEED_PLAN') return (location.hash = '#/pricing?need=' + e.data.segment);
      if (e.data?.code === 'NO_RESUME') { msg(esc(e.message) + ' → <a href="#/profile">Go to profile</a>'); return; }
      msg(esc(e.message));
    }
  };
  document.querySelectorAll('[data-report]').forEach(b => b.onclick = async () => {
    const note = b.dataset.report === 'scam' ? prompt('What happened? (e.g. asked for a fee)') : '';
    if (note === null) return;
    try { await api(`/api/companies/${d.company.id}/report`, { method: 'POST', body: { kind: b.dataset.report, note, job_id: j.id } }); msg('Thanks! Your report updates this company\'s score.', true); }
    catch (e) { msg(esc(e.message)); }
  });
}

async function companyPage(id) {
  const d = await api('/api/companies/' + id);
  const c = d.company;
  $app.innerHTML = `
    <div class="card">
      <h1 style="margin:0">${esc(c.name)}</h1>
      <p class="muted">${esc(c.description || '')}</p>
      <div class="row small">
        ${c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
        ${c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ↗</a>` : ''}
        ${c.hq_country ? `<span class="pill">HQ: ${esc(c.hq_country)}</span>` : ''}
      </div>
    </div>
    ${reportCard(d.report, c)}
    <div class="card"><h3>Job history</h3><table><tr><th>Role</th><th>Posted</th><th>Status</th></tr>
      ${d.jobs.map(j => `<tr><td>${j.status === 'open' ? `<a href="#/job/${j.id}">${esc(j.title)}</a>` : esc(j.title)}</td><td>${j.posted_at.slice(0, 10)}</td><td>${j.status}</td></tr>`).join('')}
    </table></div>`;
}

function authPage(mode) {
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next') || '#/profile';
  $app.innerHTML = `
    <form class="card" id="f" style="max-width:420px;margin:30px auto">
      <h1 style="font-size:24px;margin-top:0">${mode === 'login' ? 'Log in' : 'Create your free profile'}</h1>
      <div id="msg"></div>
      ${mode === 'signup' ? '<label>Full name</label><input name="name" required>' : ''}
      <label>Email</label><input name="email" type="email" required>
      <label>Password</label><input name="password" type="password" minlength="8" required>
      <br><br><button style="width:100%">${mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <p class="small muted">${mode === 'login' ? 'New here? <a href="#/signup">Create an account</a>' : 'Already registered? <a href="#/login">Log in</a>'}</p>
    </form>`;
  const f = document.getElementById('f');
  f.onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/' + mode, { method: 'POST', body: Object.fromEntries(new FormData(f)) }); await loadMe(); location.hash = next; }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="alert err" role="alert">${esc(err.message)}</div>`; }
  };
}

async function profilePage() {
  if (!state.user) return (location.hash = '#/login');
  const u = state.user;
  const apps = await api('/api/profile/applications');
  $app.innerHTML = `
    <div id="msg"></div>
    <div class="grid">
      <form class="card" id="pf">
        <h1 style="margin-top:0;font-size:24px">My profile</h1>
        <label>Name</label><input name="name" value="${esc(u.name)}">
        <label>Phone</label><input name="phone" value="${esc(u.phone)}">
        <label>Headline</label><input name="headline" placeholder="e.g. React developer, 3 yrs" value="${esc(u.headline)}">
        <label>Skills (comma separated – used to match jobs)</label><input name="skills" placeholder="react, node, english, customer support" value="${esc(u.skills)}">
        <label>Years of experience</label><input name="experience_years" type="number" min="0" value="${u.experience_years || 0}">
        <br><br><button>Save profile</button>
      </form>
      <div>
        <form class="card" id="rf">
          <h2 style="margin-top:0;font-size:18px">Resume</h2>
          ${u.resume_name ? `<p>Current: <a href="/api/profile/resume">${esc(u.resume_name)}</a></p>` : '<p class="muted">No resume yet. You need one before applying.</p>'}
          <input type="file" name="resume" aria-label="Resume file, PDF or Word, up to 5 MB" accept=".pdf,.doc,.docx" required>
          <br><br><button>Upload resume</button>
        </form>
        <div class="card">
          <h2 style="margin-top:0;font-size:18px">My plans</h2>
          ${state.plans.length ? state.plans.map(p => `<p><b>${p.segment.toUpperCase()}</b> – active until ${p.expires_at.slice(0, 10)}</p>`).join('') : '<p class="muted">No active plan.</p>'}
          <a class="btn ghost" href="#/pricing">See plans</a>
        </div>
      </div>
    </div>
    <div class="card"><h2 style="margin-top:0;font-size:18px">My applications</h2>
      ${apps.length ? `<table><tr><th>Job</th><th>Company</th><th>Date</th></tr>${apps.map(a => `<tr><td><a href="#/job/${a.job_id}">${esc(a.title)}</a></td><td>${esc(a.company)}</td><td>${a.applied_at.slice(0, 10)}</td></tr>`).join('')}</table>` : '<p class="muted">You haven\'t applied anywhere yet.</p>'}
    </div>`;
  const msg = (t, ok) => document.getElementById('msg').innerHTML = `<div class="alert ${ok ? 'ok' : 'err'}" role="${ok ? 'status' : 'alert'}">${esc(t)}</div>`;
  const pf = document.getElementById('pf');
  pf.onsubmit = async e => { e.preventDefault(); try { state.user = (await api('/api/profile', { method: 'PUT', body: Object.fromEntries(new FormData(pf)) })).user; msg('Profile saved', true); } catch (err) { msg(err.message); } };
  const rf = document.getElementById('rf');
  rf.onsubmit = async e => { e.preventDefault(); try { await api('/api/profile/resume', { method: 'POST', body: new FormData(rf) }); await loadMe(); profilePage(); } catch (err) { msg(err.message); } };
}

async function pricingPage() {
  const need = new URLSearchParams(location.hash.split('?')[1] || '').get('need');
  const p = await api('/api/pricing');
  $app.innerHTML = `
    <section class="hero"><h1>Simple monthly plans</h1>
      <p class="muted">Pay once for ${p.days} days. Prices in USD converted to INR at today's rate (1 USD = ₹${p.fx_rate.toFixed(2)}).</p>
      ${need ? `<div class="alert err" role="alert">This job needs the <b>${esc(p.segments.find(s => s.key === need)?.name)}</b> plan or higher.</div>` : ''}
      ${p.payments === 'demo' ? '<div class="alert err small">DEMO MODE: no real payment is taken. Add Razorpay keys in .env to go live.</div>' : ''}
    </section>
    <div id="msg"></div>
    <div class="grid">${p.segments.map(s => `
      <div class="card plan ${s.key === (need || 'pro') ? 'best' : ''}">
        <h2 style="margin:0;font-size:18px">${esc(s.name)}</h2>
        <div class="price">${inr(s.inr)}</div><div class="muted small">≈ $${s.usd} · ${p.days} days</div>
        <p>${esc(s.covers)}</p>
        <ul class="small"><li>Full company background reports</li><li>Hiring history & scam signals</li><li>Apply links to original job pages</li><li>Application tracking</li></ul>
        <button data-buy="${s.key}" style="width:100%">Get ${esc(s.name)}</button>
      </div>`).join('')}</div>`;
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
}

async function buy(segment) {
  if (!state.user) return (location.hash = '#/login?next=' + encodeURIComponent('#/pricing'));
  const msg = (t, ok) => document.getElementById('msg').innerHTML = `<div class="alert ${ok ? 'ok' : 'err'}" role="${ok ? 'status' : 'alert'}">${esc(t)}</div>`;
  try {
    const o = await api('/api/checkout', { method: 'POST', body: { segment } });
    const done = async payload => { await api('/api/checkout/verify', { method: 'POST', body: { subscription_id: o.subscription_id, ...payload } }); await loadMe(); msg('Payment successful! Your plan is active.', true); };
    if (o.mode === 'demo') {
      if (confirm(`DEMO payment of ${inr(o.amount_inr)}. Activate plan?`)) await done({});
      return;
    }
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    new Razorpay({
      key: o.key_id, order_id: o.order_id, amount: o.amount, currency: 'INR', name: 'RemoteCheck', description: o.description,
      prefill: { name: o.name, email: o.email }, theme: { color: '#4f46e5' },
      handler: r => done(r).catch(e => msg(e.message)),
    }).open();
  } catch (e) { msg(e.message); }
}
const loadScript = src => new Promise((ok, fail) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail }); document.head.append(s); });

async function adminPage() {
  if (!state.user?.is_admin) return ($app.innerHTML = '<div class="card">Admins only. Set ADMIN_EMAIL in .env and sign up with that email.</div>');
  const [stats, companies, src] = await Promise.all([api('/api/admin/stats'), api('/api/admin/companies'), api('/api/admin/sources')]);
  $app.innerHTML = `
    <h1>Admin</h1><div id="msg"></div>
    <div class="stats card">${Object.entries(stats).map(([k, v]) => `<div class="stat"><b>${v}</b><span class="muted small">${k.replace(/_/g, ' ')}</span></div>`).join('')}</div>
    <div class="card">
      <div class="row between"><div><h2 style="margin:0;font-size:18px">Job sources</h2><div class="muted small">Only roles open to India, Asia or worldwide are imported. Runs every 6 hours when AUTO_IMPORT=true.</div></div><button id="imp">Run import now</button></div>
      <div style="overflow-x:auto"><table><thead><tr><th scope="col">Source</th><th scope="col">Last run</th><th scope="col">Jobs seen</th><th scope="col">New</th><th scope="col">Status</th></tr></thead><tbody>
      ${[...src.careers, ...src.boards].map(x => `<tr><td>${x.site ? `<a href="${esc(x.site)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : esc(x.label)}</td>
        <td>${x.last_run ? esc(x.last_run.slice(0, 16)) : 'Never'}</td><td>${x.fetched ?? '–'}</td><td>${x.added ?? '–'}</td>
        <td>${x.error ? `<span class="badge risky">Failed: ${esc(x.error)}</span>` : x.last_run ? '<span class="badge verified">OK</span>' : '<span class="muted">Not run yet</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted small">LinkedIn, Indeed, Naukri and Glassdoor don't offer a public jobs feed and don't allow copying their listings. Add their jobs with "Add job" below, using the original link as the apply URL.</p>
    </div>
    <div class="grid">
      <form class="card" id="cf"><h3 style="margin-top:0">Add / update company</h3>
        <label>Name</label><input name="name" required><label>Website</label><input name="website" placeholder="https://…">
        <label>LinkedIn page</label><input name="linkedin_url"><label>Founded year</label><input name="founded_year" type="number">
        <label>Employees</label><input name="employee_count" type="number"><label>HQ country</label><input name="hq_country">
        <label>Careers page (Greenhouse, Lever or Ashby)</label><input name="careers_url" type="url" placeholder="https://jobs.lever.co/company">
        <div class="muted small">Jobs on this page are imported directly from the employer, and marked closed when they come down.</div>
        <label>About</label><textarea name="description" rows="3"></textarea>
        <label><input type="checkbox" name="verified_by_admin" style="width:auto"> I verified this company manually</label>
        <br><button>Save company</button></form>
      <form class="card" id="jf"><h3 style="margin-top:0">Add job</h3>
        <label>Company</label><select name="company_id">${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <label>Title</label><input name="title" required><label>Category</label><input name="category">
        <label>Plan segment</label><select name="segment"><option value="">Auto-detect</option><option value="basic">Starter $2</option><option value="pro">Professional $3</option><option value="premium">Senior $4</option></select>
        <label>Apply URL (LinkedIn / careers page)</label><input name="apply_url" required placeholder="https://www.linkedin.com/jobs/view/…">
        <label>Location eligibility</label><input name="location" value="Worldwide">
        <label>Salary min / max (USD/yr)</label><div class="row"><input name="salary_min" type="number" aria-label="Minimum salary, USD per year" style="flex:1"><input name="salary_max" type="number" aria-label="Maximum salary, USD per year" style="flex:1"></div>
        <label>Tags</label><input name="tags" placeholder="react, node"><label>Description</label><textarea name="description" rows="4"></textarea>
        <br><button>Add job</button></form>
    </div>`;
  const msg = (t, ok) => { document.getElementById('msg').innerHTML = `<div class="alert ${ok ? 'ok' : 'err'}" role="${ok ? 'status' : 'alert'}">${esc(t)}</div>`; scrollTo(0, 0); };
  document.getElementById('imp').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Importing…'; try { const r = await api('/api/admin/import', { method: 'POST' }); const added = Object.values(r).reduce((n, x) => n + (x.added || 0), 0);
    const failed = Object.entries(r).filter(([, x]) => x.error).map(([k]) => k); await adminPage();
    msg(`Import finished: ${added} new job${added === 1 ? '' : 's'}.${failed.length ? ` Failed: ${failed.join(', ')}.` : ''}`, !failed.length); }
    catch (err) { msg(err.message); e.target.disabled = false; e.target.textContent = 'Run import now'; } };
  for (const [id, url] of [['cf', '/api/admin/companies'], ['jf', '/api/admin/jobs']]) {
    const f = document.getElementById(id);
    f.onsubmit = async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f)); if (id === 'cf') body.verified_by_admin = f.verified_by_admin.checked;
      try { await api(url, { method: 'POST', body }); msg('Saved', true); f.reset(); if (id === 'cf') adminPage(); } catch (err) { msg(err.message); }
    };
  }
}

// ---------- router ----------
async function route() {
  const [path] = location.hash.slice(1).split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  try {
    if (!parts.length) await homePage();
    else if (parts[0] === 'job') await jobPage(parts[1]);
    else if (parts[0] === 'company') await companyPage(parts[1]);
    else if (parts[0] === 'login' || parts[0] === 'signup') authPage(parts[0]);
    else if (parts[0] === 'profile') await profilePage();
    else if (parts[0] === 'pricing') await pricingPage();
    else if (parts[0] === 'admin') await adminPage();
    else $app.innerHTML = '<div class="card">Page not found</div>';
  } catch (e) { $app.innerHTML = `<div class="alert err" role="alert">${esc(e.message)}</div>`; }
  const h = $app.querySelector('h1, h2');
  document.title = (h ? h.textContent.trim() + ' · ' : '') + 'RemoteCheck';
  if (route.ran) $app.focus({ preventScroll: true });
  route.ran = true;
}

// Give each <label> a "for" pointing at the field right after it, so clicking the label and screen readers work.
let labelSeq = 0;
function linkLabels(root) {
  for (const label of root.querySelectorAll('label:not([for])')) {
    if (label.querySelector('input, select, textarea')) continue;
    const field = label.nextElementSibling;
    if (!field || !field.matches('input, select, textarea')) continue;
    field.id ||= `f${++labelSeq}`;
    label.htmlFor = field.id;
  }
}
new MutationObserver(() => linkLabels($app)).observe($app, { childList: true, subtree: true });

// "Skip to content" moves focus without changing the page address (the address holds the current page).
document.querySelector('.skip-link')?.addEventListener('click', e => { e.preventDefault(); $app.focus(); });

window.addEventListener('hashchange', route);
loadMe().then(route);
