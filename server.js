require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./lib/db');
const seed = require('./lib/seed');
const { SEGMENTS, PLAN_DAYS, priceList, classifySegment, planCovers } = require('./lib/pricing');
const { scoreCompany, refreshDomainAge, domainCreated, hostOf, registrableDomain, textChecks, RED_FLAGS } = require('./lib/verify');
const payments = require('./lib/payments');
const { runImport } = require('./lib/importer');
const { BOARDS, parseCareersUrl } = require('./lib/sources');

// Sample (fictional) data only for local development; production starts empty and imports real jobs.
if (process.env.NODE_ENV !== 'production' || process.env.SEED_SAMPLE === 'true') seed();
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 864e5 },
}));
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const currentUser = req => req.session.userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) : null;
const auth = (req, res, next) => (req.user = currentUser(req)) ? next() : res.status(401).json({ error: 'Please log in first' });
const admin = (req, res, next) => (req.user = currentUser(req))?.is_admin ? next() : res.status(403).json({ error: 'Admin only' });
const publicUser = u => u && (({ password_hash, resume_path, ...rest }) => rest)(u);
const isHttpUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };

function activePlans(userId) {
  return db.prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'paid' AND expires_at > datetime('now') ORDER BY expires_at DESC`).all(userId);
}
const hasAccess = (userId, segment) => activePlans(userId).some(p => planCovers(p.segment, segment));

// How well a job fits the user's skills (0–100)
function matchScore(user, job) {
  const skills = (user?.skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!skills.length) return null;
  const text = `${job.title} ${job.tags || ''} ${job.description || ''}`.toLowerCase();
  return Math.round(100 * skills.filter(s => text.includes(s)).length / skills.length);
}

// ---------- auth ----------
app.post('/api/signup', ah(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
  const isAdmin = process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase() ? 1 : 0;
  const r = db.prepare('INSERT INTO users (email, password_hash, name, is_admin) VALUES (?,?,?,?)')
    .run(email.toLowerCase(), await bcrypt.hash(password, 10), name.trim(), isAdmin);
  req.session.userId = Number(r.lastInsertRowid);
  res.json({ user: publicUser(currentUser(req)) });
}));

app.post('/api/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) return res.status(401).json({ error: 'Wrong email or password' });
  req.session.userId = u.id;
  res.json({ user: publicUser(u) });
}));

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json({ user: publicUser(u), plans: u ? activePlans(u.id) : [] });
});

// ---------- profile + resume ----------
app.put('/api/profile', auth, (req, res) => {
  const { name, phone, headline, skills, experience_years, target_role, hours, linkedin_url } = req.body || {};
  const clip = (v, n) => (v ? String(v).trim().slice(0, n) : null);
  db.prepare(`UPDATE users SET name=COALESCE(?,name), phone=?, headline=?, skills=?, experience_years=?, target_role=?, hours=?, linkedin_url=? WHERE id=?`)
    .run(clip(name, 80), clip(phone, 30), clip(headline, 120), clip(skills, 400), Number(experience_years) || 0,
      clip(target_role, 80), clip(hours, 60), clip(linkedin_url, 160), req.user.id);
  res.json({ user: publicUser(currentUser(req)) });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: db.RESUME_DIR,
    filename: (req, file, cb) => cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['.pdf', '.doc', '.docx'].includes(path.extname(file.originalname).toLowerCase())),
});

app.post('/api/profile/resume', auth, upload.single('resume'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PDF/DOC/DOCX up to 5 MB' });
  if (req.user.resume_path) fs.rm(req.user.resume_path, () => {});
  db.prepare('UPDATE users SET resume_path=?, resume_name=? WHERE id=?').run(req.file.path, req.file.originalname, req.user.id);
  res.json({ user: publicUser(currentUser(req)) });
});

app.get('/api/profile/resume', auth, (req, res) => {
  if (!req.user.resume_path) return res.status(404).json({ error: 'No resume uploaded' });
  res.download(req.user.resume_path, req.user.resume_name);
});

app.get('/api/profile/applications', auth, (req, res) => {
  res.json(db.prepare(`SELECT a.created_at applied_at, a.status, j.id job_id, j.title, j.status job_status, c.id company_id, c.name company
    FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.user_id=? ORDER BY a.id DESC`).all(req.user.id));
});

// Job seekers track what happened after they applied
app.put('/api/profile/applications/:jobId', auth, (req, res) => {
  const status = req.body?.status;
  if (!['applied', 'interview', 'offer', 'rejected'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const r = db.prepare('UPDATE applications SET status=? WHERE user_id=? AND job_id=?').run(status, req.user.id, req.params.jobId);
  if (!r.changes) return res.status(404).json({ error: 'Application not found' });
  res.json({ ok: true });
});

// ---------- jobs ----------
app.get('/api/jobs', (req, res) => {
  const user = currentUser(req);
  const { q = '', segment = '', category = '', minScore = '', showRisky = '' } = req.query;
  const rows = db.prepare(`SELECT j.*, c.name company_name, c.founded_year, c.hq_country FROM jobs j JOIN companies c ON c.id=j.company_id
    WHERE j.status='open' AND j.india_eligible=1
      AND (? = '' OR j.title LIKE ? OR j.tags LIKE ? OR c.name LIKE ?)
      AND (? = '' OR j.segment = ?) AND (? = '' OR j.category = ?)
    ORDER BY j.posted_at DESC LIMIT 300`)
    .all(q, `%${q}%`, `%${q}%`, `%${q}%`, segment, segment, category, category);

  const companyCache = {};
  const blocked = [];
  const jobs = rows.map(j => {
    const company = companyCache[j.company_id] ??= db.prepare('SELECT * FROM companies WHERE id=?').get(j.company_id);
    const { score, level, signals } = scoreCompany(company, j);
    if (level === 'risky') blocked.push({ title: j.title, company: j.company_name,
      why: signals.filter(x => x.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 3).map(x => x.label).join(' · ') });
    const { apply_url, description, ...rest } = j;
    return { ...rest, snippet: (description || '').slice(0, 180), trust_score: score, trust_level: level, match: matchScore(user, j) };
  }).filter(j => (showRisky === '1' || j.trust_level !== 'risky') && j.trust_score >= (Number(minScore) || 0));

  const categories = db.prepare(`SELECT DISTINCT category FROM jobs WHERE status='open' AND category IS NOT NULL ORDER BY category`).all().map(r => r.category);
  res.json({ jobs: jobs.slice(0, 100), categories, hidden_risky: blocked.length, blocked: blocked.slice(0, 10),
    companies: new Set(jobs.map(j => j.company_id)).size,
    last_refresh: db.prepare('SELECT MAX(last_run) t FROM source_status WHERE error IS NULL').get().t });
});

app.get('/api/jobs/:id', ah(async (req, res) => {
  const user = currentUser(req);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  let company = db.prepare('SELECT * FROM companies WHERE id=?').get(job.company_id);
  company = await refreshDomainAge(company);
  const report = scoreCompany(company, job);
  const unlocked = Boolean(user && (user.is_admin || hasAccess(user.id, job.segment)));
  const { apply_url, ...safeJob } = job;
  res.json({
    job: { ...safeJob, apply_host: new URL(apply_url).hostname, match: matchScore(user, job) },
    company,
    report: unlocked ? report : { score: report.score, level: report.level, locked: true,
      signals: report.signals.slice(0, 2), hidden_signals: Math.max(0, report.signals.length - 2), stats: { posted90: report.stats.posted90 } },
    unlocked,
    segment: SEGMENTS[job.segment],
    applied: Boolean(user && db.prepare('SELECT 1 FROM applications WHERE user_id=? AND job_id=?').get(user.id, job.id)),
  });
}));

// Applying happens on the ORIGINAL site (LinkedIn, Greenhouse, company careers…). We check, track and redirect.
app.post('/api/jobs/:id/apply', auth, (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!req.user.resume_path) return res.status(400).json({ error: 'Upload your resume in your profile before applying', code: 'NO_RESUME' });
  if (!req.user.is_admin && !hasAccess(req.user.id, job.segment))
    return res.status(402).json({ error: `This job needs the ${SEGMENTS[job.segment].name} plan`, code: 'NEED_PLAN', segment: job.segment });
  const company = db.prepare('SELECT * FROM companies WHERE id=?').get(job.company_id);
  const { level } = scoreCompany(company, job);
  if (level === 'risky' && !req.body?.confirmRisky)
    return res.status(409).json({ error: 'This job failed our background check. Are you sure?', code: 'RISKY' });
  db.prepare('INSERT OR IGNORE INTO applications (user_id, job_id) VALUES (?,?)').run(req.user.id, job.id);
  res.json({ apply_url: job.apply_url });
});

// ---------- companies ----------
app.get('/api/companies/:id', ah(async (req, res) => {
  const user = currentUser(req);
  let company = db.prepare('SELECT * FROM companies WHERE id=?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  company = await refreshDomainAge(company);
  const unlocked = Boolean(user && (user.is_admin || activePlans(user.id).length));
  const report = scoreCompany(company);
  const jobs = db.prepare(`SELECT id, title, segment, status, posted_at, closed_at FROM jobs WHERE company_id=? ORDER BY posted_at DESC LIMIT 50`).all(company.id);
  res.json({ company, report: unlocked ? report : { score: report.score, level: report.level, locked: true, signals: report.signals.slice(0, 2), stats: {} }, jobs, unlocked });
}));

app.post('/api/companies/:id/report', auth, (req, res) => {
  const { kind, note, job_id } = req.body || {};
  if (!['hired', 'interview', 'no_response', 'scam'].includes(kind)) return res.status(400).json({ error: 'Invalid report type' });
  const dup = db.prepare(`SELECT 1 FROM reports WHERE user_id=? AND company_id=? AND kind=? AND created_at > datetime('now','-30 days')`).get(req.user.id, req.params.id, kind);
  if (dup) return res.status(409).json({ error: 'You already reported this recently' });
  db.prepare('INSERT INTO reports (user_id, company_id, job_id, kind, note) VALUES (?,?,?,?,?)').run(req.user.id, req.params.id, job_id || null, kind, (note || '').slice(0, 1000));
  res.json({ ok: true });
});

// ---------- scan a job post or recruiter message ----------
// Small per-visitor limit, since every scan can trigger a domain lookup.
const scanHits = new Map();
function scanLimited(ip) {
  const now = Date.now(), recent = (scanHits.get(ip) || []).filter(t => now - t < 60e3);
  recent.push(now); scanHits.set(ip, recent);
  return recent.length > 20;
}

app.post('/api/scan', ah(async (req, res) => {
  if (scanLimited(req.ip)) return res.status(429).json({ error: 'Too many checks in a minute. Wait a moment and try again.' });
  const text = String(req.body?.text || '').slice(0, 6000).trim();
  const company = String(req.body?.company || '').trim().slice(0, 80);
  const website = String(req.body?.website || '').trim().slice(0, 120);
  if (text.length < 30) return res.status(400).json({ error: 'Paste the full job post or message, at least a few lines.' });

  const hits = textChecks(text, website);
  const checks = RED_FLAGS.map(r => {
    const hit = hits.find(h => h.label === r.label);
    return { label: r.label, status: hit ? r.level : 'ok', detail: hit ? r.why : '' };
  });
  for (const h of hits) if (!RED_FLAGS.some(r => r.label === h.label)) checks.unshift({ label: h.label, status: h.level, detail: h.why });

  let score = 80 - hits.reduce((s, h) => s + h.impact, 0);
  const created = website ? await domainCreated(website) : null;
  if (website) {
    const days = created ? (Date.now() - Date.parse(created)) / 864e5 : null;
    const fresh = days != null && days < 365;
    if (fresh) score -= 20;
    checks.push({ label: 'Website age', status: created ? (fresh ? 'bad' : 'ok') : 'warn',
      detail: created ? `${registrableDomain(hostOf(website))} was registered on ${created}.${fresh ? ' Scam sites are usually only weeks or months old.' : ''}`
        : 'We could not look up when this website was registered.' });
  }

  // Is the company already in our records?
  const domain = registrableDomain(hostOf(website || ''));
  const known = db.prepare(`SELECT * FROM companies WHERE (? != '' AND lower(name) = lower(?)) OR (? IS NOT NULL AND website LIKE ?) LIMIT 1`)
    .get(company, company, domain, `%${domain}%`);
  let knownCompany = null;
  if (known) {
    const r = scoreCompany(known);
    knownCompany = { id: known.id, name: known.name, website: known.website, score: r.score, level: r.level };
    if (r.level === 'verified') score += 10;
  }
  score = Math.max(0, Math.min(100, score));
  const bad = hits.filter(h => h.level === 'bad').length;
  const verdict = bad >= 2 || score < 45 ? 'scam' : bad === 1 || score < 70 ? 'suspicious' : 'clear';
  res.json({ score, verdict, checks, known: knownCompany });
}));

app.post('/api/check-requests', auth, (req, res) => {
  const company = String(req.body?.company || '').trim().slice(0, 80);
  const website = String(req.body?.website || '').trim().slice(0, 120);
  if (!company) return res.status(400).json({ error: 'Enter the company name first.' });
  const dup = db.prepare(`SELECT 1 FROM check_requests WHERE user_id=? AND lower(company)=lower(?)`).get(req.user.id, company);
  if (dup) return res.status(409).json({ error: 'You already asked for this company. We\'ll add its report after we research it.' });
  db.prepare('INSERT INTO check_requests (user_id, company, website) VALUES (?,?,?)').run(req.user.id, company, website || null);
  res.json({ ok: true });
});

// ---------- pricing + payment ----------
app.get('/api/pricing', ah(async (req, res) => res.json({ ...(await priceList()), payments: payments.enabled ? 'razorpay' : 'demo' })));

app.post('/api/checkout', auth, ah(async (req, res) => {
  const seg = SEGMENTS[req.body?.segment];
  if (!seg) return res.status(400).json({ error: 'Unknown plan' });
  const prices = await priceList();
  const inr = prices.segments.find(s => s.key === seg.key).inr;
  const sub = db.prepare(`INSERT INTO subscriptions (user_id, segment, amount_usd, amount_inr, fx_rate, provider) VALUES (?,?,?,?,?,?)`)
    .run(req.user.id, seg.key, seg.usd, inr, prices.fx_rate, payments.enabled ? 'razorpay' : 'demo');
  const subId = Number(sub.lastInsertRowid);
  if (!payments.enabled) return res.json({ mode: 'demo', subscription_id: subId, amount_inr: inr });
  const order = await payments.createOrder(inr, `sub_${subId}`);
  db.prepare('UPDATE subscriptions SET provider_order_id=? WHERE id=?').run(order.id, subId);
  res.json({ mode: 'razorpay', key_id: payments.keyId, order_id: order.id, amount: order.amount, subscription_id: subId,
    name: req.user.name, email: req.user.email, description: `${seg.name} plan – ${PLAN_DAYS} days` });
}));

app.post('/api/checkout/verify', auth, (req, res) => {
  const { subscription_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
  const sub = db.prepare(`SELECT * FROM subscriptions WHERE id=? AND user_id=? AND status='created'`).get(subscription_id, req.user.id);
  if (!sub) return res.status(404).json({ error: 'Order not found' });
  if (sub.provider === 'razorpay') {
    if (razorpay_order_id !== sub.provider_order_id || !payments.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature))
      return res.status(400).json({ error: 'Payment verification failed' });
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Demo payments are disabled in production' });
  }
  db.prepare(`UPDATE subscriptions SET status='paid', provider_payment_id=?, starts_at=datetime('now'), expires_at=datetime('now', ?) WHERE id=?`)
    .run(razorpay_payment_id || 'demo', `+${PLAN_DAYS} days`, sub.id);
  res.json({ ok: true, plans: activePlans(req.user.id) });
});

// ---------- admin ----------
app.get('/api/admin/check-requests', admin, (req, res) => {
  res.json(db.prepare(`SELECT r.id, r.company, r.website, r.status, r.created_at, u.name requested_by, COUNT(*) OVER (PARTITION BY lower(r.company)) asks
    FROM check_requests r JOIN users u ON u.id = r.user_id ORDER BY r.status = 'done', r.id DESC LIMIT 100`).all());
});
app.post('/api/admin/check-requests/:id/done', admin, (req, res) => {
  const r = db.prepare(`SELECT company FROM check_requests WHERE id=?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  db.prepare(`UPDATE check_requests SET status='done' WHERE lower(company)=lower(?)`).run(r.company);
  res.json({ ok: true });
});

app.get('/api/admin/companies', admin, (req, res) => res.json(db.prepare('SELECT id, name FROM companies ORDER BY name').all()));

app.post('/api/admin/companies', admin, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name required' });
  const careers = b.careers_url ? parseCareersUrl(b.careers_url) : null;
  if (b.careers_url && !careers) return res.status(400).json({ error: 'Careers link must be a Greenhouse, Lever or Ashby job board, e.g. https://jobs.lever.co/company' });
  db.prepare(`INSERT INTO companies (name, website, linkedin_url, founded_year, employee_count, hq_country, description, verified_by_admin, ats_type, ats_board)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET website=excluded.website, linkedin_url=excluded.linkedin_url,
    founded_year=excluded.founded_year, employee_count=excluded.employee_count, hq_country=excluded.hq_country,
    description=excluded.description, verified_by_admin=excluded.verified_by_admin,
    ats_type=COALESCE(excluded.ats_type, companies.ats_type), ats_board=COALESCE(excluded.ats_board, companies.ats_board)`)
    .run(b.name.trim(), b.website || null, b.linkedin_url || null, Number(b.founded_year) || null, Number(b.employee_count) || null,
      b.hq_country || null, b.description || null, b.verified_by_admin ? 1 : 0, careers?.type || null, careers?.board || null);
  const c = await refreshDomainAge({ ...db.prepare('SELECT * FROM companies WHERE name=?').get(b.name.trim()), domain_checked_at: null });
  res.json({ company: c });
}));

app.post('/api/admin/jobs', admin, (req, res) => {
  const b = req.body || {};
  if (!b.company_id || !b.title || !isHttpUrl(b.apply_url || '')) return res.status(400).json({ error: 'Company, title and a valid apply URL are required' });
  const r = db.prepare(`INSERT INTO jobs (company_id, title, segment, category, description, salary_min, salary_max, location, apply_url, tags)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(b.company_id, b.title, b.segment || classifySegment(b.title, b.category), b.category || null,
    b.description || null, Number(b.salary_min) || null, Number(b.salary_max) || null, b.location || 'Worldwide', b.apply_url, b.tags || null);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.post('/api/admin/jobs/:id/close', admin, (req, res) => {
  db.prepare(`UPDATE jobs SET status='closed', closed_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/import', admin, ah(async (req, res) => res.json(await runImport())));

// Status of every job source: last run, how many jobs it had, how many were new, and any error.
app.get('/api/admin/sources', admin, (req, res) => {
  const status = Object.fromEntries(db.prepare('SELECT * FROM source_status').all().map(r => [r.source, r]));
  const boards = BOARDS.map(b => ({ source: b.key, label: b.label, site: b.site, ...status[b.key] }));
  const careers = db.prepare(`SELECT name, ats_type, ats_board FROM companies WHERE ats_type IS NOT NULL`).all()
    .map(c => ({ source: `${c.ats_type}:${c.ats_board}`, label: `${c.name} careers page`, ...status[`${c.ats_type}:${c.ats_board}`] }));
  res.json({ boards, careers });
});

// Public list of where jobs come from (shown on the home page)
app.get('/api/sources', (req, res) => {
  const counts = Object.fromEntries(db.prepare(`SELECT source, COUNT(*) n FROM jobs WHERE status='open' GROUP BY source`).all().map(r => [r.source, r.n]));
  const careerJobs = Object.entries(counts).filter(([k]) => k.includes(':')).reduce((s, [, n]) => s + n, 0);
  res.json({
    sources: [...BOARDS.map(b => ({ label: b.label, site: b.site, open: counts[b.key] || 0 })),
      { label: 'Company careers pages', site: null, open: careerJobs }, { label: 'Added by our team', site: null, open: counts.manual || 0 }],
  });
});

app.get('/api/admin/stats', admin, (req, res) => {
  const one = sql => db.prepare(sql).get();
  res.json({
    users: one('SELECT COUNT(*) n FROM users').n,
    open_jobs: one(`SELECT COUNT(*) n FROM jobs WHERE status='open'`).n,
    companies: one('SELECT COUNT(*) n FROM companies').n,
    applications: one('SELECT COUNT(*) n FROM applications').n,
    paid_subscriptions: one(`SELECT COUNT(*) n FROM subscriptions WHERE status='paid'`).n,
    revenue_inr: one(`SELECT COALESCE(SUM(amount_inr),0) n FROM subscriptions WHERE status='paid' AND provider='razorpay'`).n,
    scam_reports: one(`SELECT COUNT(*) n FROM reports WHERE kind='scam'`).n,
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); });

// Re-import jobs every 6 hours if enabled
if (process.env.AUTO_IMPORT === 'true') {
  runImport().then(r => console.log('Import:', r)).catch(console.error);
  setInterval(() => runImport().catch(console.error), 6 * 3600e3);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RemoteCheck running on http://localhost:${PORT}  (payments: ${payments.enabled ? 'Razorpay' : 'DEMO mode'})`));
