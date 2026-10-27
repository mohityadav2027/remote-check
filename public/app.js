// Parakh front end: hash routes -> page functions. No framework needed.
const $ = s => document.querySelector(s);
const $app = $('#app');
const state = { user: null, plans: [] };

const SEG = { basic: 'Entry', pro: 'Professional', premium: 'Senior & Specialist' };
const LEVEL = { verified: 'Verified', caution: 'Check carefully', risky: 'Risky' };
const TONE = { verified: 'ok', caution: 'warn', risky: 'bad' };
const ATS = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const parseDate = d => new Date(String(d).includes('T') ? d : String(d).replace(' ', 'T') + 'Z');
const fmtDate = d => (d ? parseDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ago = d => { const days = Math.floor((Date.now() - parseDate(d)) / 864e5); return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`; };
const salary = j => (j.salary_min ? `$${Math.round(j.salary_min / 1000)}k–$${Math.round(j.salary_max / 1000)}k / yr` : 'Pay not listed');
// Every job on Parakh is remote; show who can apply, e.g. "Remote · India"
const remoteWhere = loc => { const l = String(loc || '').replace(/^remote\s*[,·–-]?\s*/i, '').trim(); return `Remote · ${esc(l || 'Worldwide')}`; };
const freeN = () => state.trial?.limit ?? 2;   // free applications every new user gets
const domainOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const params = () => new URLSearchParams(location.hash.split('?')[1] || '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('on'), 3200);
}

// Trust score dial. level: verified | caution | risky (or null while unknown)
function seal(score, level, size = 52) {
  const tone = level ? TONE[level] : 'none', C = 2 * Math.PI * 21, off = score == null ? C : C * (1 - score / 100);
  return `<div class="seal ${tone === 'ok' ? '' : tone}" style="width:${size}px;height:${size}px" role="img"
    aria-label="${score == null ? 'Score pending' : `Trust score ${score} out of 100, ${LEVEL[level]}`}">
    <svg viewBox="0 0 50 50"><circle class="trk" cx="25" cy="25" r="21"/><circle class="arc" cx="25" cy="25" r="21" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>
    <span class="n" aria-hidden="true">${score ?? '…'}</span></div>`;
}
const pill = level => `<span class="pill ${TONE[level]}">${LEVEL[level]}</span>`;
const stIcon = s => `<span class="st ${s}" aria-hidden="true">${s === 'ok' ? '✓' : s === 'warn' ? '!' : s === 'bad' ? '✕' : '–'}</span>`;

async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, { ...opts, headers: isForm ? {} : { 'Content-Type': 'application/json' },
    body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status, data });
  return data;
}

async function loadMe() { Object.assign(state, await api('/api/me')); }

function renderNav(page) {
  const u = state.user;
  const link = (href, label, key) => `<a href="${href}"${page === key ? ' aria-current="page"' : ''}>${label}</a>`;
  $('#nav').innerHTML = link('#/', 'Jobs', 'jobs') + link('#/scan', 'Scan a job', 'scan') + link('#/pricing', 'Pricing', 'pricing') +
    (u ? (u.is_admin ? link('#/admin', 'Admin', 'admin') : '') + link('#/profile', 'My profile', 'profile') + '<button type="button" id="logout">Log out</button>'
       : link('#/login', 'Log in', 'login') + '<a href="#/signup" class="btn primary sm">Sign up</a>');
  $('#logout')?.addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); await loadMe(); location.hash = '#/'; toast('Logged out.'); });
}

// ---------- jobs ----------
async function jobsPage() {
  const p = params();
  $app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">For Indian professionals · International companies · Remote</p>
        <h1>Every remote job, <em>background-checked</em> before you apply.</h1>
        <p class="lede">We check each company's founding year, website age, how many jobs it posts, how many it fills, and whether the apply link is on the company's own hiring system. You apply on the employer's page.</p>
        <p class="lede"><b>Your first ${freeN()} applications are free</b>, with the full background check. ${state.user ? '' : '<a href="#/signup">Create a free account</a>'}</p>
      </div>
      <div class="status" id="status" aria-live="polite"><span>Loading verified jobs…</span></div>
    </section>
    <form class="toolbar" id="filters" role="search">
      <label for="q" class="sr-only">Search jobs</label>
      <input id="q" name="q" type="search" placeholder="Search role, skill or company" value="${esc(p.get('q'))}">
      <div class="chips" role="group" aria-label="Filter by plan">${[['', 'All'], ...Object.entries(SEG)].map(([k, l]) =>
        `<button type="button" class="chip" data-seg="${k}" aria-pressed="${(p.get('segment') || '') === k}">${l}</button>`).join('')}</div>
      <label for="category" class="sr-only">Category</label>
      <select id="category" name="category"><option value="">All categories</option></select>
      <span class="count" id="count" role="status"></span>
    </form>
    <div class="jobs" id="jobList"></div>
    <details class="blocked" id="blocked" hidden><summary>${stIcon('bad')}<span id="blockedTitle"></span></summary><ul id="blockedList"></ul></details>
    <p class="sources" id="sources"></p>`;

  const f = $('#filters');
  const filters = { q: p.get('q') || '', segment: p.get('segment') || '', category: p.get('category') || '' };
  const update = () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    history.replaceState(null, '', '#/' + (qs ? '?' + qs : ''));
    loadJobs(filters);
  };
  f.addEventListener('submit', e => { e.preventDefault(); filters.q = f.q.value.trim(); update(); });
  let t; f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { filters.q = f.q.value.trim(); update(); }, 300); });
  f.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
    filters.segment = b.dataset.seg;
    f.querySelectorAll('[data-seg]').forEach(x => x.setAttribute('aria-pressed', x === b));
    update();
  }));
  f.category.addEventListener('change', () => { filters.category = f.category.value; update(); });

  await loadJobs(filters, true);
  api('/api/sources').then(({ sources }) => {
    $('#sources').innerHTML = `Jobs collected from ${sources.map(s => s.site ? `<a href="${esc(s.site)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)).join(', ')}. You always apply on the original listing.`;
  }).catch(() => {});
}

async function loadJobs(filters, first = false) {
  const data = await api('/api/jobs?' + new URLSearchParams(filters));
  const sel = $('#category');
  if (!sel) return;   // user navigated away
  if (first) { sel.innerHTML += data.categories.map(c => `<option>${esc(c)}</option>`).join(''); sel.value = filters.category; }
  $('#status').innerHTML = `<span><i class="dot" aria-hidden="true"></i><b>${data.jobs.length} verified job${data.jobs.length === 1 ? '' : 's'}</b> from <b>${data.companies} compan${data.companies === 1 ? 'y' : 'ies'}</b></span>
    <span>${data.last_refresh ? `Last refreshed ${esc(ago(data.last_refresh))}` : 'Refreshed every 6 hours'} · risky jobs are hidden</span>`;
  $('#count').textContent = `${data.jobs.length} shown`;
  $('#jobList').innerHTML = data.jobs.length ? data.jobs.map(j => `
    <article class="job">
      ${seal(j.trust_score, j.trust_level)}
      <div style="min-width:0">
        <h2><a href="#/job/${j.id}">${esc(j.title)}</a></h2>
        <div class="co"><button type="button" class="linkbtn" data-company="${j.company_id}">${esc(j.company_name)}</button>
          <span>${remoteWhere(j.location)}</span>${j.hq_country ? `<span>HQ ${esc(j.hq_country)}</span>` : ''}${j.founded_year ? `<span>Founded ${j.founded_year}</span>` : ''}</div>
        <div class="tags"><span class="tag seg">${SEG[j.segment]}</span>${j.category ? `<span class="tag">${esc(j.category)}</span>` : ''}
          ${j.match != null ? `<span class="tag ${j.match >= 50 ? 'ok' : ''}">Skill match ${j.match}%</span>` : ''}<span class="tag">via ${esc(j.source)}</span><span class="tag">${esc(ago(j.posted_at))}</span></div>
      </div>
      <div class="side"><div class="pay">${salary(j)}</div>
        <div class="acts"><button type="button" class="btn sm" data-company="${j.company_id}">Report</button><a class="btn primary sm" href="#/job/${j.id}">View &amp; apply</a></div></div>
    </article>`).join('')
    : `<div class="empty"><b>No verified jobs match that search</b>Try another skill, company or plan.</div>`;
  const b = $('#blocked');
  b.hidden = !data.blocked.length;
  $('#blockedTitle').textContent = `${data.hidden_risky} job${data.hidden_risky === 1 ? '' : 's'} hidden because they failed our checks`;
  $('#blockedList').innerHTML = data.blocked.map(x => `<li><b>${esc(x.title)}</b> at ${esc(x.company)} · ${esc(x.why)}</li>`).join('');
}

// ---------- company report (used in the drawer, the company page and the job page) ----------
function reportHtml(c, r, unlocked) {
  const year = new Date().getFullYear(), s = r.stats || {};
  const facts = `<dl class="facts">
    <div><dt>Founded</dt><dd>${c.founded_year ? `${c.founded_year} (${year - c.founded_year} yrs)` : 'Not public'}</dd></div>
    <div><dt>Team size</dt><dd>${c.employee_count ? `${c.employee_count} people` : 'Not public'}</dd></div>
    <div><dt>Website since</dt><dd>${c.domain_created ? fmtDate(c.domain_created) : c.website ? 'Not checked yet' : 'No website'}</dd></div>
    <div><dt>Hiring system</dt><dd>${c.ats_type ? `${ATS[c.ats_type]} careers page` : 'Job boards'}</dd></div></dl>`;
  const checks = `<ul class="checks">${r.signals.map(x => `<li>${stIcon(x.impact > 0 ? 'ok' : x.impact <= -8 ? 'bad' : x.impact < 0 ? 'warn' : 'n')}
    <span>${esc(x.label)}</span><span class="val">${x.impact > 0 ? '+' : ''}${x.impact}</span>${x.detail ? `<span class="det">${esc(x.detail)}</span>` : ''}</li>`).join('')}</ul>`;
  if (!unlocked) return `<div class="report-grid">${facts}<div><p class="sub">Checks</p>${checks}</div>
    <div class="lock">${r.hidden_signals ? `${r.hidden_signals} more checks, ` : 'More checks, '}the hiring history and the apply link are locked.
      ${state.user ? `You've used your ${freeN()} free applications. A pass costs from ${inr(2 * (state.fx || 84))} a month.`
        : `<b>Sign up free:</b> your first ${freeN()} applications include the full background check.`}
      <div class="acts" style="margin-top:10px;justify-content:center">${state.user ? '' : '<a class="btn primary sm" href="#/signup">Sign up free</a>'}<a class="btn sm" href="#/pricing">See plans</a></div></div></div>`;
  const max = Math.max(1, ...(s.monthly || []).map(m => m.n));
  return `<div class="report-grid">${facts}
    <div><p class="sub">Hiring activity</p>
      <dl class="facts">
        <div><dt>Jobs posted, last 30 days</dt><dd>${s.posted30}</dd></div><div><dt>Jobs posted, last 90 days</dt><dd>${s.posted90}</dd></div>
        <div><dt>Open now</dt><dd>${s.open}</dd></div><div><dt>Closed or filled</dt><dd>${s.closed}</dd></div>
        <div><dt>Days a job stays open</dt><dd>${s.avgDaysOpen ?? '–'}</dd></div><div><dt>Members hired here</dt><dd>${s.reports?.hired || 0}</dd></div></dl>
      ${s.monthly?.length ? `<div class="bars" role="img" aria-label="Jobs posted per month: ${s.monthly.map(m => `${m.month} ${m.n}`).join(', ')}">${s.monthly.map(m =>
        `<div style="height:${(m.n / max) * 100}%"><span>${m.month.slice(5)}</span></div>`).join('')}</div>` : ''}
      <p class="hint">Companies don't publish how many people they hire, so we count jobs that close, plus what our members report.</p></div>
    <div><p class="sub">Checks</p>${checks}</div></div>`;
}

let drawerOpener = null;
async function openCompany(id) {
  drawerOpener = document.activeElement;
  const d = await api('/api/companies/' + id).catch(e => { toast(e.message); return null; });
  if (!d) return;
  const c = d.company;
  $('#drHead').innerHTML = `${seal(d.report.score, d.report.level, 56)}<div style="min-width:0"><h2 id="drTitle">${esc(c.name)}</h2>
    <p class="mono">${esc(domainOf(c.website) || 'no website')}${c.hq_country ? ' · ' + esc(c.hq_country) : ''}</p></div>
    <button type="button" class="btn ghost sm x" id="drClose" aria-label="Close report">✕</button>`;
  const open = d.jobs.filter(j => j.status === 'open');
  $('#drBody').innerHTML = `${c.description ? `<p>${esc(c.description)}</p>` : ''}${reportHtml(c, d.report, d.unlocked)}
    <div><p class="sub">Open jobs here (${open.length})</p>${open.map(j => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:14px">
      <a href="#/job/${j.id}">${esc(j.title)}</a><span class="hint">${esc(SEG[j.segment])}</span></div>`).join('') || '<p class="hint">None open right now.</p>'}</div>
    <p class="hint"><a href="#/company/${c.id}">Open as a full page</a>${c.website ? ` · <a href="${esc(c.website)}" target="_blank" rel="noopener">Company website</a>` : ''}${c.linkedin_url ? ` · <a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}</p>`;
  $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drClose').addEventListener('click', closeCompany);
  setTimeout(() => $('#drClose').focus(), 60);
}
function closeCompany() {
  if (!$('#drawer').classList.contains('on')) return;
  $('#drawer').classList.remove('on'); $('#scrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true');
  drawerOpener?.focus?.();
}
$('#scrim').addEventListener('click', closeCompany);
addEventListener('keydown', e => { if (e.key === 'Escape') closeCompany(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-company]');
  if (b) { e.preventDefault(); openCompany(b.dataset.company); return; }
  if (e.target.closest('#drawer a[href^="#/"]')) closeCompany();
});

async function companyPage(id) {
  const d = await api('/api/companies/' + id), c = d.company;
  $app.innerHTML = `<div class="sec-head"><div style="display:flex;gap:16px;align-items:center">${seal(d.report.score, d.report.level, 64)}
      <div><h1>${esc(c.name)}</h1><p>${esc(c.description || domainOf(c.website) || '')}</p></div></div>${pill(d.report.level)}</div>
    <div class="grid2"><div class="card"><h2>Background check</h2>${reportHtml(c, d.report, d.unlocked)}</div>
      <div class="card"><h2>Job history</h2><div class="scroll"><table class="admin"><thead><tr><th scope="col">Role</th><th scope="col">Posted</th><th scope="col">Status</th></tr></thead><tbody>
        ${d.jobs.map(j => `<tr><td>${j.status === 'open' ? `<a href="#/job/${j.id}">${esc(j.title)}</a>` : esc(j.title)}</td><td class="mono">${fmtDate(j.posted_at)}</td>
          <td><span class="pill ${j.status === 'open' ? 'ok' : 'n'}">${j.status}</span></td></tr>`).join('')}</tbody></table></div></div></div>`;
}

// ---------- job page ----------
// Link that records the application on our server and then sends you to the employer's job page
const goHref = (id, confirmRisky) => `/go/${id}${confirmRisky ? '?confirm=1' : ''}`;

function applyControl(d) {
  const j = d.job, here = `#/job/${j.id}`;
  const link = (href, label) => `<a class="btn primary" id="apply" href="${href}">${label}</a>`;
  if (!state.user) return link(`#/signup?next=${encodeURIComponent(here)}`, `Sign up to apply · first ${d.trial.limit} free`);
  if (!state.user.resume_name && !state.user.is_admin) return link('#/profile', 'Add your resume to apply');
  if (!(d.applied || d.paid || d.free)) return link(`#/pricing?need=${j.segment}`, 'Get a pass to apply');
  const label = d.applied ? `Applied ✓ · open ${esc(j.apply_host)} again` : d.paid ? `Apply on ${esc(j.apply_host)} ↗` : `Apply free on ${esc(j.apply_host)} ↗`;
  return `<a class="btn primary" id="apply" data-go href="${goHref(j.id, d.report.level === 'risky')}" target="_blank" rel="noopener">${label}</a>`;
}

async function jobPage(id) {
  const d = await api('/api/jobs/' + id), j = d.job;
  $app.innerHTML = `
    <div class="card" style="margin-bottom:24px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${seal(d.report.score, d.report.level, 64)}
        <div style="min-width:0;flex:1"><h1 style="font-size:clamp(24px,3vw,32px)">${esc(j.title)}</h1>
          <div class="co"><button type="button" class="linkbtn" data-company="${d.company.id}">${esc(d.company.name)}</button><span>${remoteWhere(j.location)}</span><span>Posted ${esc(ago(j.posted_at))} via ${esc(j.source)}</span></div></div>
        ${pill(d.report.level)}</div>
      <div class="tags"><span class="tag seg">${esc(d.segment.name)} pass</span>${j.category ? `<span class="tag">${esc(j.category)}</span>` : ''}<span class="tag">${salary(j)}</span>
        ${j.match != null ? `<span class="tag ${j.match >= 50 ? 'ok' : ''}">Skill match ${j.match}%</span>` : ''}</div>
      <div class="acts" style="margin-top:16px;align-items:center">
        ${applyControl(d)}
        <span class="hint">${!d.applied && state.user && d.free
          ? `This uses free application ${d.trial.used + 1} of ${d.trial.limit}. You apply on the employer's own page (${esc(j.apply_host)}).`
          : `You apply on the employer's original page (${esc(j.apply_host)}). We never ask you for money.`}</span></div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="card"><h2>About the job</h2><div class="desc">${esc(j.description || 'See the original posting for details.')}</div></div>
        ${state.user ? `<div class="card"><h2>Applied here before? Tell others</h2><p class="hint" style="margin-bottom:12px">Your answer changes this company's score.</p>
          <div class="acts">${[['hired', 'I got hired'], ['interview', 'Got an interview'], ['no_response', 'No response'], ['scam', 'Report a scam']]
            .map(([k, t]) => `<button type="button" class="btn sm" data-report="${k}">${t}</button>`).join('')}</div>
          <div id="scamNote" hidden style="margin-top:12px" class="field"><label for="scamText">What happened? For example, they asked for a fee.</label>
            <textarea id="scamText" style="min-height:80px"></textarea><div><button type="button" class="btn primary sm" id="scamSend">Send report</button></div></div></div>` : ''}
      </div>
      <div class="card"><h2>Company background check</h2>${reportHtml(d.company, d.report, d.unlocked)}</div>
    </div>`;

  // The link itself opens the employer's page in a new tab; here we only confirm risky jobs and refresh the counts.
  $('#apply[data-go]')?.addEventListener('click', async e => {
    if (d.report.level === 'risky' && !confirm('This job failed our background check. Open it anyway?')) { e.preventDefault(); return; }
    const usedFree = !d.applied && !d.paid && d.free;
    setTimeout(async () => {
      await loadMe();
      if (location.hash.startsWith(`#/job/${id}`)) await jobPage(id);
      toast(usedFree ? `Free application ${state.trial.used} of ${state.trial.limit} used. The employer's page opened in a new tab.${state.trial.left ? '' : ' Your next application needs a pass.'}`
        : 'The employer\'s page opened in a new tab. It\'s saved in your applications.');
    }, 800);
  });
  const report = async (kind, note = '') => {
    try { await api(`/api/companies/${d.company.id}/report`, { method: 'POST', body: { kind, note, job_id: j.id } }); toast('Thanks. Your report updates this company\'s score.'); }
    catch (e) { toast(e.message); }
  };
  document.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.report !== 'scam') return report(b.dataset.report);
    $('#scamNote').hidden = false; $('#scamText').focus();
  }));
  $('#scamSend')?.addEventListener('click', () => { report('scam', $('#scamText').value); $('#scamNote').hidden = true; });
}

// ---------- scan a job ----------
const SAMPLE_SCAM = 'Hiring for Amazon work-from-home data entry. Earn ₹4,000 per day, no experience needed. Limited seats! Pay ₹1,499 one-time registration fee for your training kit. Contact HR Priya on Telegram @amazon_jobs_hr or email amazonhiring.india@gmail.com';
function scanPage() {
  $app.innerHTML = `
    <div class="sec-head"><div><h1>Scan a job post or recruiter message</h1>
      <p>Got a job on WhatsApp, Telegram, Naukri or LinkedIn and not sure it's real? Paste it here. We check it for the signs that most job scams in India share.</p></div></div>
    <div class="grid2">
      <form class="card" id="scanForm">
        <div class="fields">
          <div class="field"><label for="scCompany">Company name</label><input id="scCompany" name="company" placeholder="e.g. GlobalEarn Partners" autocomplete="off"></div>
          <div class="field"><label for="scSite">Company website (if given)</label><input id="scSite" name="website" placeholder="e.g. globalearn-partners.online" autocomplete="off"></div>
          <div class="field full"><label for="scText">Job post or message</label>
            <textarea id="scText" name="text" aria-describedby="scHint">${esc(SAMPLE_SCAM)}</textarea>
            <span class="hint" id="scHint">The example above is a typical scam message. Replace it with yours.</span></div>
          <div class="field full acts"><button class="btn primary" type="submit" id="scanBtn">Check this job</button>
            <button class="btn" type="button" id="reqBtn">Ask us to check this company</button></div>
        </div>
      </form>
      <div class="card" aria-live="polite">
        <h2>Result</h2>
        <ul class="checks" id="scanChecks"><li>${stIcon('n')}<span class="muted">Paste a job and press Check this job.</span><span></span></li></ul>
        <div id="scanVerdict"></div><div id="scanKnown"></div>
      </div>
    </div>`;
  const f = $('#scanForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    $('#scanBtn').disabled = true;
    $('#scanChecks').innerHTML = `<li><span class="st run" aria-hidden="true"></span><span>Checking…</span><span></span></li>`;
    try {
      const r = await api('/api/scan', { method: 'POST', body: { company: f.company.value, website: f.website.value, text: f.text.value } });
      $('#scanChecks').innerHTML = r.checks.map(k => `<li>${stIcon(k.status)}<span>${esc(k.label)}</span>
        <span class="val">${k.label === 'Website age' ? '' : k.status === 'ok' ? 'not found' : 'found'}</span>${k.detail ? `<span class="det">${esc(k.detail)}</span>` : ''}</li>`).join('');
      const level = r.verdict === 'clear' ? 'verified' : r.verdict === 'suspicious' ? 'caution' : 'risky';
      $('#scanVerdict').innerHTML = `<div class="verdict">${seal(r.score, level, 48)}<p style="flex:1"><strong>${
        r.verdict === 'scam' ? 'Likely a scam' : r.verdict === 'suspicious' ? 'Be careful' : 'No common scam signs'}</strong>${
        r.verdict === 'clear' ? 'That alone doesn\'t prove it\'s real. Find the same job on the company\'s own careers page before you apply.'
        : 'Do not pay anything or share your Aadhaar, PAN, bank details or OTPs.'}</p></div>`;
      $('#scanKnown').innerHTML = r.known ? `<div class="verdict">${seal(r.known.score, r.known.level, 44)}<p style="flex:1"><strong>${esc(r.known.name)} is in our records</strong>
        Make sure the job is also on ${esc(domainOf(r.known.website) || 'its own careers page')}.</p><button type="button" class="btn sm" data-company="${r.known.id}">Open report</button></div>` : '';
    } catch (err) { $('#scanChecks').innerHTML = ''; toast(err.message); }
    finally { $('#scanBtn').disabled = false; }
  });
  $('#reqBtn').addEventListener('click', async () => {
    if (!f.company.value.trim()) { toast('Enter the company name first.'); f.company.focus(); return; }
    if (!state.user) { toast('Log in to ask for a company check.'); location.hash = '#/login?next=' + encodeURIComponent('#/scan'); return; }
    try { await api('/api/check-requests', { method: 'POST', body: { company: f.company.value, website: f.website.value } }); toast(`Thanks. We'll research ${f.company.value.trim()} and add its report.`); }
    catch (err) { toast(err.message); }
  });
}

// ---------- pricing ----------
async function pricingPage() {
  const need = params().get('need');
  const p = await api('/api/pricing');
  state.fx = p.fx_rate;
  let picked = need || state.plans[0]?.segment || 'basic';
  const active = state.plans[0];
  $app.innerHTML = `
    <div class="sec-head"><div><h1>One small monthly pass, priced by your segment</h1>
      <p>The pass unlocks full company reports and the apply links for ${p.days} days. Prices are set in US dollars and charged in rupees. Pay by UPI, card or netbanking.</p></div>
      <span class="hint mono">1 USD = ₹${p.fx_rate.toFixed(2)}</span></div>
    ${need ? `<div class="notice">You've used your ${freeN()} free applications. This job needs the <b>${esc(SEG[need])}</b> pass or higher.</div>` : ''}
    ${active ? `<div class="notice ok">Your ${esc(SEG[active.segment])} pass is active until <b>${esc(fmtDate(active.expires_at))}</b>.</div>`
      : !state.user ? `<div class="notice ok"><b>Try it free first.</b> Your first ${freeN()} applications are free, with the full background check. <a href="#/signup">Create a free account</a></div>`
      : state.trial?.left && !need ? `<div class="notice ok">You still have <b>${state.trial.left} free application${state.trial.left === 1 ? '' : 's'}</b>. Use ${state.trial.left === 1 ? 'it' : 'them'} first; you can buy a pass later.</div>` : ''}
    ${p.payments === 'demo' ? '<div class="notice bad">Demo mode: no real payment is taken. Add Razorpay keys to go live.</div>' : ''}
    <div class="plans" id="plans" role="radiogroup" aria-label="Choose a pass">${p.segments.map(s => `
      <div class="plan" role="radio" tabindex="${s.key === picked ? 0 : -1}" aria-checked="${s.key === picked}" aria-labelledby="pl-${s.key}" data-plan="${s.key}">
        <div class="top"><h2 id="pl-${s.key}">${esc(s.name)}</h2><span class="radio" aria-hidden="true"></span></div>
        <div><div class="price"><b>${inr(s.inr)}</b><span>/ ${p.days} days</span></div><div class="hint mono">$${s.usd.toFixed(2)} USD</div></div>
        <ul><li>Full company background reports</li><li>Hiring history and scam checks</li><li>Apply links to the original job pages</li><li>Application tracking</li></ul>
        <div class="roles">${esc(s.covers)}</div></div>`).join('')}</div>
    <div class="card" style="margin-top:16px" id="payCard"></div>`;

  const renderPay = () => {
    const s = p.segments.find(x => x.key === picked);
    $('#payCard').innerHTML = `<h2>Get the ${esc(s.name)} pass for ${inr(s.inr)}</h2>
      <div class="acts" style="align-items:center"><button type="button" class="btn primary" id="buy">Pay ${inr(s.inr)}</button>
      <span class="hint">${state.user ? `Secure checkout by ${p.payments === 'demo' ? 'demo payment' : 'Razorpay'}. Starts today, lasts ${p.days} days.` : 'You\'ll log in first.'}</span></div>`;
    $('#buy').addEventListener('click', () => buy(picked));
  };
  const select = key => {
    picked = key;
    document.querySelectorAll('[data-plan]').forEach(el => { const on = el.dataset.plan === key; el.setAttribute('aria-checked', on); el.tabIndex = on ? 0 : -1; });
    renderPay();
  };
  $('#plans').addEventListener('click', e => { const el = e.target.closest('[data-plan]'); if (el) select(el.dataset.plan); });
  $('#plans').addEventListener('keydown', e => {
    const keys = Object.keys(SEG), i = keys.indexOf(picked);
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (next) { e.preventDefault(); select(keys[(i + next + keys.length) % keys.length]); $(`[data-plan="${picked}"]`).focus(); }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(e.target.closest('[data-plan]')?.dataset.plan || picked); }
  });
  renderPay();
}

async function buy(segment) {
  if (!state.user) { location.hash = '#/login?next=' + encodeURIComponent('#/pricing'); return; }
  try {
    const o = await api('/api/checkout', { method: 'POST', body: { segment } });
    const done = async payload => {
      await api('/api/checkout/verify', { method: 'POST', body: { subscription_id: o.subscription_id, ...payload } });
      await loadMe(); toast('Payment received. Your pass is active.'); route();
    };
    if (o.mode === 'demo') { if (confirm(`Demo payment of ${inr(o.amount_inr)}. Activate the pass?`)) await done({}); return; }
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    new Razorpay({ key: o.key_id, order_id: o.order_id, amount: o.amount, currency: 'INR', name: 'Parakh', description: o.description,
      prefill: { name: o.name, email: o.email }, theme: { color: '#B05000' }, handler: r => done(r).catch(e => toast(e.message)) }).open();
  } catch (e) { toast(e.message); }
}
const loadScript = src => new Promise((ok, fail) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  document.head.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail }));
});

// ---------- log in / sign up ----------
function authPage(mode) {
  const next = params().get('next') || '#/profile';
  $app.innerHTML = `
    <form class="card" id="authForm" style="max-width:440px;margin:24px auto">
      <h1 style="font-size:26px;margin-bottom:6px">${mode === 'login' ? 'Log in' : 'Create your free profile'}</h1>
      <p class="hint" style="margin-bottom:16px">${mode === 'login' ? 'Welcome back.' : `Your first ${freeN()} applications are free, with the full background check. Pay only after that.`}</p>
      <div class="fields">
        ${mode === 'signup' ? '<div class="field full"><label for="aName">Full name</label><input id="aName" name="name" autocomplete="name" required></div>' : ''}
        <div class="field full"><label for="aEmail">Email</label><input id="aEmail" name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="aPass">Password</label><input id="aPass" name="password" type="password" minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required aria-describedby="aPassHint">
          <span class="hint" id="aPassHint">At least 8 characters.</span></div>
        ${mode === 'signup' ? `<div class="field full"><span class="sub" style="font-size:13px;margin:0">Resume</span>
          <label class="drop" id="aDrop" for="aResume"><b id="aResumeName">Upload your resume</b><span>PDF or Word, up to 5 MB. Drag it here or click. Employers see it when you apply.</span></label>
          <input id="aResume" name="resume" type="file" accept=".pdf,.doc,.docx" class="sr-only" aria-label="Resume file, PDF or Word, up to 5 MB"></div>` : ''}
        <div class="field full"><button class="btn primary">${mode === 'login' ? 'Log in' : 'Create account'}</button></div>
      </div>
      <p class="hint" style="margin-top:14px">${mode === 'login' ? 'New here? <a href="#/signup">Create an account</a>' : 'Already have an account? <a href="#/login">Log in</a>'}</p>
    </form>`;
  const f = $('#authForm');
  const resume = $('#aResume');
  if (resume) {
    const show = () => { $('#aResumeName').textContent = resume.files[0] ? `✓ ${resume.files[0].name}` : 'Upload your resume'; };
    resume.addEventListener('change', show);
    const drop = $('#aDrop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) { resume.files = e.dataTransfer.files; show(); } });
  }
  f.addEventListener('submit', async e => {
    e.preventDefault();
    // Sign-up sends the form with the resume file (the server asks for it); log-in sends just email and password
    const body = mode === 'signup' ? new FormData(f) : Object.fromEntries(new FormData(f));
    try { await api('/api/' + mode, { method: 'POST', body }); await loadMe(); location.hash = next; }
    catch (err) { toast(err.message); }
  });
}

// ---------- profile ----------
async function profilePage() {
  if (!state.user) {
    $app.innerHTML = `<div class="card" style="max-width:520px;margin:24px auto;text-align:center"><h1 style="font-size:26px">Your profile</h1>
      <p class="hint" style="margin:8px 0 16px">Log in to save your resume, track applications and see your best matches.</p>
      <div class="acts" style="justify-content:center"><a class="btn primary" href="#/signup">Create an account</a><a class="btn" href="#/login?next=%23%2Fprofile">Log in</a></div></div>`;
    return;
  }
  const u = state.user;
  const [apps, jobs] = await Promise.all([api('/api/profile/applications'), api('/api/jobs')]);
  const matches = jobs.jobs.filter(j => j.match >= 40).sort((a, b) => b.match - a.match).slice(0, 5);
  const hoursOpts = ['Part-time (up to 20 h/week)', 'Full-time (40 h/week)', 'Night shift IST (US hours)'];
  $app.innerHTML = `
    <div class="sec-head"><div><h1>Your profile</h1><p>Only you can see this. Your resume is stored privately and used for applications and matching.</p></div></div>
    <div class="grid2">
      <form class="card" id="profileForm">
        <h2>About you</h2>
        <div class="fields">
          <div class="field"><label for="pName">Full name</label><input id="pName" name="name" autocomplete="name" value="${esc(u.name)}"></div>
          <div class="field"><label for="pPhone">Phone</label><input id="pPhone" name="phone" type="tel" autocomplete="tel" value="${esc(u.phone)}"></div>
          <div class="field"><label for="pRole">Target role</label><input id="pRole" name="target_role" placeholder="e.g. Content marketer" value="${esc(u.target_role)}"></div>
          <div class="field"><label for="pHours">Hours available</label><select id="pHours" name="hours">${hoursOpts.map(h => `<option${u.hours === h ? ' selected' : ''}>${h}</option>`).join('')}</select></div>
          <div class="field"><label for="pLinked">LinkedIn URL</label><input id="pLinked" name="linkedin_url" placeholder="linkedin.com/in/your-name" value="${esc(u.linkedin_url)}"></div>
          <div class="field"><label for="pExp">Years of experience</label><input id="pExp" name="experience_years" type="number" min="0" max="50" value="${u.experience_years || 0}"></div>
          <div class="field full"><label for="pSkills">Skills, separated by commas</label><input id="pSkills" name="skills" placeholder="english, customer support, zendesk" value="${esc(u.skills)}" aria-describedby="pSkillsHint">
            <span class="hint" id="pSkillsHint">We use these to match you with jobs.</span></div>
          ${u.resume_name
            ? `<div class="file">${stIcon('ok')}<a class="name" href="/api/profile/resume">${esc(u.resume_name)}</a><label class="btn ghost sm" for="pResume">Replace</label></div>`
            : `<label class="drop" id="drop" for="pResume"><b>Upload your resume</b><span>PDF or Word, up to 5 MB. Drag it here or click. You need one before applying.</span></label>`}
          <input id="pResume" type="file" accept=".pdf,.doc,.docx" class="sr-only" aria-label="Resume file, PDF or Word, up to 5 MB">
          <div class="field full"><button class="btn primary" type="submit">Save profile</button></div>
        </div>
      </form>
      <div class="stack">
        <div class="card"><h2>Your pass</h2>${state.plans.length
          ? state.plans.map(p => `<p><b>${esc(SEG[p.segment])}</b> · active until ${esc(fmtDate(p.expires_at))}</p>`).join('')
          : `<p style="margin-bottom:6px"><b>Free trial:</b> ${state.trial.used} of ${state.trial.limit} free applications used.</p>
            <p class="hint" style="margin-bottom:12px">${state.trial.left ? `You can apply to ${state.trial.left} more job${state.trial.left === 1 ? '' : 's'} for free.` : 'Your free applications are used up. Get a pass to keep applying.'}</p>
            <a class="btn sm" href="#/pricing">See plans</a>`}</div>
        <div class="card"><h2>Applications you started</h2><div class="track">${apps.length ? apps.map(a => `<div>
            <span><a href="#/job/${a.job_id}">${esc(a.title)}</a><small>${esc(a.company)} · ${esc(fmtDate(a.applied_at))}${a.job_status === 'closed' ? ' · job closed' : ''}</small></span>
            <select data-app="${a.job_id}" aria-label="Status for ${esc(a.title)}">${['applied', 'interview', 'offer', 'rejected'].map(s =>
              `<option value="${s}"${a.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>`).join('')
          : '<p class="hint">Nothing yet. Click Apply on a job and it shows up here.</p>'}</div>
          <p class="note">Change the status when you hear back.</p></div>
        <div class="card"><h2>Your best matches</h2>${u.skills ? (matches.length ? `<div class="matches">${matches.map(j => `<div class="match"><span class="fit">${j.match}%</span>
            <div style="min-width:0"><a href="#/job/${j.id}"><b>${esc(j.title)}</b></a> · ${esc(j.company_name)}<p>${esc(SEG[j.segment])} · ${salary(j)}</p></div></div>`).join('')}</div>`
            : '<p class="hint">No strong matches right now. New jobs arrive every few hours.</p>')
          : '<p class="hint">Add your skills to see the jobs that fit you best.</p>'}</div>
      </div>
    </div>`;

  const f = $('#profileForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    try { state.user = (await api('/api/profile', { method: 'PUT', body: Object.fromEntries(new FormData(f)) })).user; toast('Profile saved.'); profilePage(); }
    catch (err) { toast(err.message); }
  });
  const upload = async file => {
    if (!file) return;
    const fd = new FormData(); fd.append('resume', file);
    try { await api('/api/profile/resume', { method: 'POST', body: fd }); await loadMe(); toast('Resume uploaded.'); profilePage(); }
    catch (err) { toast(err.message); }
  };
  $('#pResume').addEventListener('change', e => upload(e.target.files[0]));
  const drop = $('#drop');
  if (drop) {
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => upload(e.dataTransfer.files[0]));
  }
  document.querySelectorAll('[data-app]').forEach(s => s.addEventListener('change', async () => {
    try { await api(`/api/profile/applications/${s.dataset.app}`, { method: 'PUT', body: { status: s.value } }); toast('Status updated.'); }
    catch (err) { toast(err.message); }
  }));
}

// ---------- admin ----------
async function adminPage() {
  if (!state.user?.is_admin) { $app.innerHTML = '<div class="card"><h1 style="font-size:24px">Admins only</h1><p class="hint">Set ADMIN_EMAIL on the server and sign up with that email.</p></div>'; return; }
  const [stats, companies, src, reqs] = await Promise.all([api('/api/admin/stats'), api('/api/admin/companies'), api('/api/admin/sources'), api('/api/admin/check-requests')]);
  $app.innerHTML = `
    <div class="sec-head"><div><h1>Admin</h1><p>Job sources, company check requests, and adding companies and jobs by hand.</p></div></div>
    <div class="card" style="margin-bottom:24px"><div class="stats">${Object.entries(stats).map(([k, v]) =>
      `<div class="stat"><b>${k === 'revenue_inr' ? inr(v) : v}</b><span class="hint">${k.replace(/_/g, ' ').replace(' inr', '')}</span></div>`).join('')}</div></div>
    <div class="card" style="margin-bottom:24px">
      <div class="sec-head" style="margin-bottom:8px"><div><h2>Job sources</h2><p class="hint">Only roles open to India, Asia or worldwide are imported. Runs every 6 hours when AUTO_IMPORT=true.</p></div>
        <button type="button" class="btn primary" id="imp">Run import now</button></div>
      <div class="scroll"><table class="admin"><thead><tr><th scope="col">Source</th><th scope="col">Last run</th><th scope="col">Jobs seen</th><th scope="col">New</th><th scope="col">Status</th></tr></thead><tbody>
        ${[...src.careers, ...src.boards].map(x => `<tr><td>${x.site ? `<a href="${esc(x.site)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : esc(x.label)}</td>
          <td class="mono">${x.last_run ? esc(x.last_run.slice(0, 16)) : 'Never'}</td><td class="mono">${x.fetched ?? '–'}</td><td class="mono">${x.added ?? '–'}</td>
          <td>${x.error ? `<span class="pill bad">Failed: ${esc(x.error)}</span>` : x.last_run ? '<span class="pill ok">OK</span>' : '<span class="pill n">Not run yet</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">LinkedIn, Indeed, Naukri and Glassdoor don't offer a public jobs feed and don't allow copying their listings. Add their jobs below, using the original link as the apply URL.</p>
    </div>
    <div class="card" style="margin-bottom:24px"><h2>Companies people asked us to check</h2>${reqs.length ? `<div class="scroll"><table class="admin"><thead><tr>
        <th scope="col">Company</th><th scope="col">Website</th><th scope="col">Asked by</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>
      ${reqs.map(r => `<tr><td>${esc(r.company)}${r.asks > 1 ? ` <span class="pill warn">${r.asks} asks</span>` : ''}</td><td>${esc(r.website || '–')}</td>
        <td>${esc(r.requested_by)}<br><span class="hint">${esc(fmtDate(r.created_at))}</span></td><td><span class="pill ${r.status === 'done' ? 'ok' : 'warn'}">${r.status}</span></td>
        <td>${r.status === 'pending' ? `<button type="button" class="btn sm" data-done="${r.id}">Mark done</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="hint">No requests yet. They come from the "Scan a job" page.</p>'}
      <p class="note">To add a report: research the company, then add it below with its founding year, size, website and careers page.</p></div>
    <div class="grid2">
      <form class="card" id="cf"><h2>Add or update a company</h2><div class="fields">
        <div class="field full"><label for="cName">Name</label><input id="cName" name="name" required></div>
        <div class="field"><label for="cWeb">Website</label><input id="cWeb" name="website" type="url" placeholder="https://…"></div>
        <div class="field"><label for="cLi">LinkedIn page</label><input id="cLi" name="linkedin_url" type="url"></div>
        <div class="field"><label for="cYear">Founded year</label><input id="cYear" name="founded_year" type="number" min="1800" max="2100"></div>
        <div class="field"><label for="cSize">Employees</label><input id="cSize" name="employee_count" type="number" min="1"></div>
        <div class="field"><label for="cHq">HQ country</label><input id="cHq" name="hq_country"></div>
        <div class="field full"><label for="cCareers">Careers page (Greenhouse, Lever or Ashby)</label><input id="cCareers" name="careers_url" type="url" placeholder="https://jobs.lever.co/company" aria-describedby="cCareersHint">
          <span class="hint" id="cCareersHint">Jobs here are imported straight from the employer, and marked closed when they come down.</span></div>
        <div class="field full"><label for="cAbout">About</label><textarea id="cAbout" name="description" style="min-height:80px"></textarea></div>
        <label class="check field full"><input type="checkbox" name="verified_by_admin"> I checked this company myself</label>
        <div class="field full"><button class="btn primary">Save company</button></div></div></form>
      <form class="card" id="jf"><h2>Add a job</h2><div class="fields">
        <div class="field full"><label for="jCo">Company</label><select id="jCo" name="company_id">${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field full"><label for="jTitle">Title</label><input id="jTitle" name="title" required></div>
        <div class="field"><label for="jCat">Category</label><input id="jCat" name="category"></div>
        <div class="field"><label for="jSeg">Pass needed</label><select id="jSeg" name="segment"><option value="">Decide from the title</option>${Object.entries(SEG).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field full"><label for="jUrl">Apply link (LinkedIn or careers page)</label><input id="jUrl" name="apply_url" type="url" required placeholder="https://www.linkedin.com/jobs/view/…"></div>
        <div class="field"><label for="jLoc">Who can apply</label><input id="jLoc" name="location" value="Worldwide"></div>
        <div class="field"><label for="jTags">Tags</label><input id="jTags" name="tags" placeholder="react, node"></div>
        <div class="field"><label for="jMin">Salary from (USD a year)</label><input id="jMin" name="salary_min" type="number" min="0"></div>
        <div class="field"><label for="jMax">Salary to (USD a year)</label><input id="jMax" name="salary_max" type="number" min="0"></div>
        <div class="field full"><label for="jDesc">Description</label><textarea id="jDesc" name="description"></textarea></div>
        <div class="field full"><button class="btn primary">Add job</button></div></div></form>
    </div>`;

  $('#imp').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Importing…';
    try {
      const r = await api('/api/admin/import', { method: 'POST' });
      const added = Object.values(r).reduce((n, x) => n + (x.added || 0), 0), failed = Object.entries(r).filter(([, x]) => x.error).map(([k]) => k);
      await adminPage();
      toast(`Import finished: ${added} new job${added === 1 ? '' : 's'}.${failed.length ? ` ${failed.length} source${failed.length === 1 ? '' : 's'} failed.` : ''}`);
    } catch (err) { toast(err.message); b.disabled = false; b.textContent = 'Run import now'; }
  });
  document.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/api/admin/check-requests/${b.dataset.done}/done`, { method: 'POST' }); await adminPage(); toast('Marked done.'); } catch (err) { toast(err.message); }
  }));
  for (const [id, url] of [['cf', '/api/admin/companies'], ['jf', '/api/admin/jobs']]) {
    const f = $('#' + id);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      if (id === 'cf') body.verified_by_admin = f.verified_by_admin.checked;
      try { await api(url, { method: 'POST', body }); toast(id === 'cf' ? 'Company saved.' : 'Job added.'); f.reset(); if (id === 'cf') adminPage(); }
      catch (err) { toast(err.message); }
    });
  }
}

// ---------- router ----------
async function route() {
  closeCompany();
  const [path] = location.hash.slice(1).split('?');
  const [page = '', id] = (path || '/').split('/').filter(Boolean);
  const key = { '': 'jobs', job: 'jobs', company: 'jobs' }[page] ?? page;
  renderNav(key);
  try {
    if (!page) await jobsPage();
    else if (page === 'job') await jobPage(id);
    else if (page === 'company') await companyPage(id);
    else if (page === 'scan') scanPage();
    else if (page === 'pricing') await pricingPage();
    else if (page === 'login' || page === 'signup') authPage(page);
    else if (page === 'profile') await profilePage();
    else if (page === 'admin') await adminPage();
    else $app.innerHTML = '<div class="empty"><b>Page not found</b><a href="#/">Go to jobs</a></div>';
  } catch (e) { $app.innerHTML = `<div class="notice bad" role="alert">${esc(e.message)}</div>`; }
  const h = $app.querySelector('h1');
  document.title = (h && page ? h.textContent.trim() + ' · ' : '') + 'Parakh – Verified remote jobs for India';
  if (route.ran) { $app.focus({ preventScroll: true }); scrollTo(0, 0); }
  route.ran = true;
}

// "Skip to content" moves focus without changing the page address (the address holds the current page).
document.querySelector('.skip-link').addEventListener('click', e => { e.preventDefault(); $app.focus(); });

window.addEventListener('hashchange', route);
loadMe().then(route);
