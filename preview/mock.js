// Preview-only: answers the site's API calls in the browser. Jobs and companies come from live job boards (live.js);
// accounts, the free trial and payments are simulated here.
const LIVE_ERROR = /github\.io$/.test(window.location.hostname)
  ? 'The job websites didn\'t respond just now, so no jobs are shown. Refresh the page in a minute.'
  : 'Live jobs couldn\'t load in this window. Open https://mohityadav2027.github.io/remote-check/ to see real remote jobs from the job websites.';
const RANK = { basic: 1, pro: 2, premium: 3 };
const mock = { user: null, plans: [], apps: [], requests: [] };
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const err = (status, error, extra = {}) => reply(status, { error, ...extra });
const today = (d = 0) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 19).replace('T', ' ');
const covers = seg => mock.plans.some(p => RANK[p.segment] >= RANK[seg]);
const FREE = 2;
const trial = () => ({ limit: FREE, used: Math.min(mock.apps.length, FREE), left: Math.max(0, FREE - mock.apps.length) });
function matchOf(job) {
  const skills = (mock.user?.skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!skills.length) return null;
  const text = `${job.title} ${job.tags || ''} ${job.snippet || job.description || ''}`.toLowerCase();
  return Math.round(100 * skills.filter(s => text.includes(s)).length / skills.length);
}

// Same CIN / LLPIN reading as lib/verify.js
const CIN_STATES = { AN: 'Andaman and Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CT: 'Chhattisgarh', DL: 'Delhi',
  DN: 'Dadra and Nagar Haveli', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana', JH: 'Jharkhand', JK: 'Jammu and Kashmir', KA: 'Karnataka', KL: 'Kerala',
  LD: 'Lakshadweep', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', PB: 'Punjab', PY: 'Puducherry',
  RJ: 'Rajasthan', SK: 'Sikkim', TG: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UP: 'Uttar Pradesh', UR: 'Uttarakhand', WB: 'West Bengal' };
const CIN_TYPES = { PTC: 'Private limited company', PLC: 'Public limited company', OPC: 'One person company', NPL: 'Not-for-profit (Section 8) company',
  FTC: 'Indian subsidiary of a foreign company', FLC: 'Indian public subsidiary of a foreign company', GOI: 'Central government company', SGC: 'State government company',
  GAP: 'Public company limited by guarantee', GAT: 'Private company limited by guarantee', ULL: 'Public unlimited company', ULT: 'Private unlimited company' };
function regCheck(raw, text) {
  const id = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!id) return /\b(pvt\.?|private)\s*(ltd|limited)\b/i.test(text)
    ? { label: 'Company registration (CIN)', status: 'warn', detail: 'The message says "Pvt Ltd" but gives no CIN. Ask for it and look it up on mca.gov.in.' } : null;
  if (/^[A-Z]{3}-\d{4}$/.test(id)) return { label: 'Company registration (CIN)', status: 'ok', detail: `Registered LLP (LLPIN ${id}). Check it on mca.gov.in under "Master data".` };
  const m = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/.exec(id), year = m && Number(m[4]);
  if (!m || !CIN_STATES[m[3]] || !CIN_TYPES[m[5]] || year < 1850 || year > new Date().getFullYear())
    return { label: 'Company registration (CIN)', status: 'bad', bad: true, detail: `"${raw}" is not a valid CIN or LLPIN. Every real Indian company has one; a made-up number is a strong scam sign.` };
  return { label: 'Company registration (CIN)', status: 'ok', detail: `${CIN_TYPES[m[5]]}, incorporated in ${year} in ${CIN_STATES[m[3]]}${m[1] === 'L' ? ', listed on an Indian stock exchange' : ''}. Check it on mca.gov.in under "Master data". Make sure the name on mca.gov.in matches the company in the message.` };
}

function scan({ text = '', company = '', website = '', cin = '' }) {
  // The site's own red-flag rules (LIB = lib/verify.js), including the brand-impersonation check
  const hits = LIB.textChecks(text, website);
  const checks = LIB.RED_FLAGS.map(r => { const h = hits.find(x => x.label === r.label); return { label: r.label, status: h ? r.level : 'ok', detail: h ? r.why : '' }; });
  for (const h of hits) if (!LIB.RED_FLAGS.some(r => r.label === h.label)) checks.unshift({ label: h.label, status: h.level, detail: h.why });
  let impact = hits.reduce((s, h) => s + h.impact, 0), bad = hits.filter(h => h.level === 'bad').length;
  const reg = regCheck(cin, text);
  if (reg) { checks.push(reg); if (reg.bad) { impact += 30; bad++; } }
  const known = Object.values(DATA.company).find(c => company && c.company.name.toLowerCase() === company.trim().toLowerCase());
  const score = Math.max(0, Math.min(100, 80 - impact + (known?.unlocked.level === 'verified' ? 10 : 0)));
  return { score, verdict: bad >= 2 || score < 50 ? 'scam' : bad === 1 || score < 70 ? 'suspicious' : 'clear', checks,
    known: known ? { id: known.company.id, name: known.company.name, website: known.company.website, score: known.unlocked.score, level: known.unlocked.level } : null };
}

const realFetch = window.fetch.bind(window);
// Where a job is posted is shown only with a paid pass (free-trial applies still open the real posting)
const hideSource = ({ source, apply_host, ...job }) => job;
const hideApplyHost = check => ({ ...check, passed: check.passed.map(p => p.label.startsWith('Apply link goes to')
  ? { label: 'Apply link goes to a known job board or the company\'s own site', detail: 'The exact site is shown with a paid pass' } : p) });
const hideBoards = c => c.feed ? { ...c, description: null } : c;
// A company looked up on the Company check page, if its jobs are on this page too
const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(inc|llc|ltd|limited|pvt|private|gmbh|corp|corporation|co)\b|[,.]/g, ' ').replace(/\s+/g, ' ').trim();
function onSite(name, aka = []) {
  const d = Object.values(DATA.company || {}).find(c => [name, ...aka].some(n => norm(n) === norm(c.company.name)));
  if (!d) return null;
  const jobs = (DATA.list?.jobs || []).filter(j => j.company_id === d.company.id).map(j => ({ id: j.id, title: j.title, location: j.location, posted_at: j.posted_at }));
  return { company_id: d.company.id, score: d.unlocked.score, level: d.unlocked.level, jobs: jobs.slice(0, 12), open: jobs.length, cin: null };
}
window.fetch = async (url, opts = {}) => {
  // Only the site's own /api/ calls are answered here; job boards and Wikidata go to the real internet
  if (!String(url).startsWith('/api/')) return realFetch(url, opts);
  const u = new URL(url, 'https://preview.local');
  const p = u.pathname, m = (opts.method || 'GET').toUpperCase();
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
  let x;
  // Company check (doesn't wait for the job boards): public records straight from Wikidata in the visitor's browser
  if (p === '/api/lookup/suggest') {
    try { return reply(200, { results: await ParakhProfile.suggestCompanies(u.searchParams.get('q') || '') }); }
    catch { return err(503, 'Company search is busy. Try again in a moment.'); }
  }
  if (p === '/api/lookup/site') return reply(200, { on_site: onSite(body.name, body.aka) });
  if ((x = p.match(/^\/api\/lookup\/(Q\d+)$/))) {
    try {
      const profile = await ParakhProfile.companyProfile(x[1]);
      return reply(200, { profile, domain_created: null, checks: ParakhProfile.profileChecks(profile), on_site: onSite(profile.name, profile.also_known_as) });
    } catch (e) { return err(/not found/i.test(e.message) ? 404 : 503, /not found/i.test(e.message) ? 'Company not found.' : 'Company records are busy. Try again in a moment.'); }
  }
  // Wait for the live job boards; if none could be reached, say so instead of showing anything made up
  const live = await READY.then(() => true, () => false);
  if (!live && (p === '/api/jobs' || p.startsWith('/api/jobs/') || p.startsWith('/api/companies/')))
    return err(503, LIVE_ERROR);
  if (p === '/api/sources') return reply(200, { sources: mock.plans.length ? DATA.sources.filter(s => s.open > 0) : [] });
  if (p === '/api/me') return reply(200, { user: mock.user, plans: mock.plans, trial: trial() });
  if (p === '/api/signup' || p === '/api/login') {
    const f = body instanceof FormData ? Object.fromEntries(body) : body;
    if (!f.email || !f.password || f.password.length < 8) return err(400, 'Enter an email and a password of at least 8 characters');
    const resume = f.resume?.name && /\.(pdf|docx?)$/i.test(f.resume.name) ? f.resume.name : null;
    if (p === '/api/signup' && !resume) return err(400, 'Upload your resume (PDF or Word, up to 5 MB) to create your account');
    mock.user = { id: 1, email: f.email, name: f.name || f.email.split('@')[0], skills: '', phone: '', target_role: '', hours: '', linkedin_url: '', experience_years: 0,
      resume_name: resume || 'resume.pdf', is_admin: 0 };
    return reply(200, { user: mock.user });
  }
  if (p === '/api/logout') { mock.user = null; mock.plans = []; mock.apps = []; return reply(200, { ok: true }); }
  if (p === '/api/profile' && m === 'PUT') { Object.assign(mock.user, body); return reply(200, { user: mock.user }); }
  if (p === '/api/profile/resume') {
    const f = body.get('resume');
    if (!f?.name || !/\.(pdf|docx?)$/i.test(f.name)) return err(400, 'Upload a PDF/DOC/DOCX up to 5 MB');
    mock.user.resume_name = f.name; return reply(200, { user: mock.user });
  }
  if (p === '/api/profile/applications') return reply(200, mock.apps);
  if ((x = p.match(/^\/api\/profile\/applications\/(\d+)$/))) { const a = mock.apps.find(a => a.job_id == x[1]); if (a) a.status = body.status; return reply(200, { ok: true }); }
  if (p === '/api/pricing') return reply(200, { ...DATA.pricing, payments: 'demo' });
  if (p === '/api/checkout') {
    const s = DATA.pricing.segments.find(s => s.key === body.segment);
    return reply(200, { mode: 'demo', subscription_id: s.key, amount_inr: s.inr });
  }
  if (p === '/api/checkout/verify') {
    const s = DATA.pricing.segments.find(s => s.key === body.subscription_id);
    mock.plans.unshift({ segment: s.key, amount_inr: s.inr, expires_at: today(DATA.pricing.days) });
    return reply(200, { ok: true, plans: mock.plans });
  }
  if (p === '/api/scan') {
    if ((body.text || '').trim().length < 30) return err(400, 'Paste the full job post or message, at least a few lines.');
    return reply(200, scan(body));
  }
  if (p === '/api/check-requests') {
    if (!mock.user) return err(401, 'Please log in first');
    if (mock.requests.includes(body.company.toLowerCase())) return err(409, 'You already asked for this company. We\'ll add its report after we research it.');
    mock.requests.push(body.company.toLowerCase()); return reply(200, { ok: true });
  }
  if (p === '/api/jobs') {
    const q = (u.searchParams.get('q') || '').toLowerCase(), seg = u.searchParams.get('segment'), cat = u.searchParams.get('category'), hq = (u.searchParams.get('hq') || '').toLowerCase();
    const jobs = DATA.list.jobs.filter(j => (!q || `${j.title} ${j.tags} ${j.company_name}`.toLowerCase().includes(q)) && (!seg || j.segment === seg) && (!cat || j.category === cat)
      && (!hq || (j.hq_country || '').toLowerCase() === hq)
      && (!u.searchParams.get('kind') || j.kind === u.searchParams.get('kind')) && (!u.searchParams.get('audience') || `,${j.audience},`.includes(`,${u.searchParams.get('audience')},`)) && (!u.searchParams.get('workplace') || (j.workplace || 'remote') === u.searchParams.get('workplace')))
      .map(j => ({ ...(covers(j.segment) ? j : hideSource(j)), match: matchOf(j) }));
    return reply(200, { ...DATA.list, jobs, companies: new Set(jobs.map(j => j.company_id)).size, internships: DATA.list.jobs.filter(j => j.kind === 'internship').length });
  }
  if ((x = p.match(/^\/api\/jobs\/(\d+)\/apply$/))) {
    const d = DATA.job[x[1]];
    if (!mock.user) return err(401, 'Please log in first');
    if (!mock.user.resume_name) return err(400, 'Upload your resume in your profile before applying', { code: 'NO_RESUME' });
    const paid = covers(d.job.segment), again = mock.apps.some(a => a.job_id == x[1]);
    if (!paid && !again && !trial().left) return err(402, `You've used your ${FREE} free applications.`, { code: 'NEED_PLAN', segment: d.job.segment });
    if (d.unlocked.level === 'risky' && !body?.confirmRisky) return err(409, 'This job failed our background check. Are you sure?', { code: 'RISKY' });
    if (!again) mock.apps.unshift({ job_id: d.job.id, title: d.job.title, company: d.company.name, applied_at: today(), status: 'applied', job_status: 'open' });
    return reply(200, { apply_url: DATA.applyUrl[x[1]], free: !paid && !again, trial: trial() });
  }
  if ((x = p.match(/^\/api\/jobs\/(\d+)$/))) {
    const d = DATA.job[x[1]]; if (!d) return err(404, 'Job not found');
    if (d.removed) return err(410, d.removed, { code: 'REMOVED' });
    if (d.pending) return err(410, d.pending, { code: 'PENDING' });
    const applied = mock.apps.some(a => a.job_id == x[1]);
    const paid = Boolean(mock.user && covers(d.job.segment));
    const free = Boolean(mock.user && !paid && (applied || trial().left > 0));
    const unlocked = paid || free;
    return reply(200, { job: { ...(paid ? d.job : hideSource(d.job)), match: matchOf(d.job) }, company: paid ? d.company : hideBoards(d.company), segment: d.segment,
      unlocked, paid, free, job_check: paid ? d.job_check : hideApplyHost(d.job_check),
      report: unlocked ? d.unlocked : d.locked, applied, trial: trial() });
  }
  if ((x = p.match(/^\/api\/companies\/(\d+)\/report$/))) return reply(200, { ok: true });
  if ((x = p.match(/^\/api\/companies\/(\d+)$/))) {
    const d = DATA.company[x[1]]; if (!d) return err(404, 'Company not found');
    const unlocked = Boolean(mock.user && (mock.plans.length || trial().left > 0));
    return reply(200, { company: mock.plans.length ? d.company : hideBoards(d.company), missing: d.missing, jobs: d.jobs, unlocked, report: unlocked ? d.unlocked : d.locked });
  }
  return err(404, 'Not available in the preview');
};

// Apply in the preview: the link is the job's own real posting, opened in a new tab. Clicking it records the
// application here, the way /go/<id> does on the live site.
function previewGo(id) { return DATA.applyUrl[id]; }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-go]');
  const id = a && loc.hash.match(/^#\/job\/(\d+)/)?.[1];
  if (!id || mock.apps.some(x => x.job_id == id)) return;
  const d = DATA.job[id];
  mock.apps.unshift({ job_id: d.job.id, title: d.job.title, company: d.company.name, applied_at: today(), status: 'applied', job_status: 'open' });
}, true);

// Navigation inside the preview: keep the route in memory (artifact links only carry a plain #name).
const loc = { _h: '#/', get hash() { return this._h; }, set hash(v) { this._h = v; route(); } };
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (a && !a.classList.contains('skip-link')) { e.preventDefault(); loc.hash = a.getAttribute('href'); }
});

// In-page confirmation (the viewer has no confirm())
function uiConfirm(message) {
  return new Promise(resolve => {
    const d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML = `<div class="card" role="dialog" aria-modal="true"><p></p><div class="acts" style="justify-content:flex-end;margin-top:14px">
      <button type="button" class="btn" data-v="0">Cancel</button><button type="button" class="btn primary" data-v="1">OK</button></div></div>`;
    d.querySelector('p').textContent = message;
    d.addEventListener('click', e => { const v = e.target.dataset?.v; if (v === undefined) return; d.remove(); resolve(v === '1'); });
    document.body.append(d); d.querySelector('[data-v="1"]').focus();
  });
}
