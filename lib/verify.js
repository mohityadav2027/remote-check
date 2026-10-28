// Company background check + job genuineness scoring.
// Produces a 0–100 trust score with the reasons behind it, so users can see WHY a job is trusted.
const db = require('./db');

// Jobs scoring below this are not posted on the site at all (no listing, no job page, no apply link).
const MIN_SCORE = Number(process.env.MIN_SCORE || 50);

// Red flags in a job post or recruiter message. Used for every listed job and by the "Scan a job" page.
// level: 'bad' = a scam sign on its own, 'warn' = suspicious. impact = points taken off the trust score.
const RED_FLAGS = [
  { re: /(registration|joining|security|training|processing|refundable|kit)\s*(fee|deposit|charge)|pay (a|the)? ?(small )?fee|pay\s*(₹|rs\.?|inr|\$)\s*\d/i,
    label: 'Asks you to pay money', why: 'Real employers never charge to apply, train or send an offer.', level: 'bad', impact: 25 },
  { re: /whats\s?app|telegram|t\.me\/|wa\.me\//i,
    label: 'Recruiter only on WhatsApp or Telegram', why: 'Genuine recruiters use a company email or the company\'s hiring site.', level: 'bad', impact: 25 },
  { re: /@(gmail|yahoo|outlook|hotmail|rediffmail|proton)\./i,
    label: 'Personal email address (Gmail, Yahoo…)', why: 'Recruiters at real companies write from the company\'s own domain.', level: 'bad', impact: 10 },
  { re: /no (interview|experience) (needed|required).{0,40}(earn|\$|usd|₹)|earn\s*(\$|₹|rs\.?)\s*[\d,]{3,}.{0,20}(per|a|\/)\s*(day|week|task|hour)|per task|like (videos|posts)|rate (products|hotels)|task.based earning/i,
    label: 'Pay too good for the work', why: 'High daily pay for simple tasks is the most common task-scam hook.', level: 'bad', impact: 25 },
  { re: /gift ?card|crypto(currency)? payment|bitcoin|usdt/i,
    label: 'Gift cards or crypto payments', why: 'Employers pay salaries by bank transfer, Wise or Payoneer, not gift cards or crypto.', level: 'bad', impact: 25 },
  { re: /aadhaar|pan card|bank (details|account)|\botp\b|upi pin|send (your )?passport/i,
    label: 'Asks for ID or bank details early', why: 'Never share Aadhaar, PAN, bank details or OTPs before a signed offer.', level: 'bad', impact: 25 },
  { re: /limited seats|urgent(ly)? hiring|only today|act now|last \d+ (seats|slots)/i,
    label: 'Pressure to act fast', why: 'Urgency is used to stop you from checking.', level: 'warn', impact: 8 },
];

// Big employers that scammers pretend to be. If the post names one but the website/email is elsewhere, flag it.
const BRANDS = { amazon: 'amazon', flipkart: 'flipkart', google: 'google', microsoft: 'microsoft', meta: 'meta', tcs: 'tcs', infosys: 'infosys',
  wipro: 'wipro', accenture: 'accenture', deloitte: 'deloitte', ibm: 'ibm', 'hcl': 'hcl', netflix: 'netflix', apple: 'apple' };

function textChecks(text, website = '') {
  const hits = RED_FLAGS.filter(r => r.re.test(text)).map(({ label, why, level, impact }) => ({ label, why, level, impact }));
  const domains = [...text.matchAll(/@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi), ...text.matchAll(/https?:\/\/([^\s/]+)/gi)].map(m => m[1].toLowerCase());
  const site = hostOf(website || '');
  if (site) domains.push(site);
  for (const [name, domain] of Object.entries(BRANDS)) {
    if (!new RegExp(`\\b${name}\\b`, 'i').test(text)) continue;
    if (domains.length && !domains.some(d => d.split('.').includes(domain))) {
      const brand = ['tcs', 'ibm', 'hcl'].includes(name) ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1);
      hits.push({ label: `Uses ${brand}'s name, but not its website or email`, level: 'bad', impact: 25,
        why: `Real ${brand} recruiters write from their company email and list jobs on ${brand}'s own careers site.` });
      break;
    }
  }
  return hits;
}

const TRUSTED_APPLY_HOSTS = /(^|\.)(linkedin\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|bamboohr\.com|myworkdayjobs\.com|wellfound\.com|remotive\.com|himalayas\.app|weworkremotely\.com|remoteok\.com|jobicy\.com|workingnomads\.com|indeed\.com|naukri\.com|recruitee\.com|breezy\.hr|teamtailor\.com|jobvite\.com|icims\.com)$/i;

function hostOf(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
}
function registrableDomain(host) {
  if (!host) return null;
  const parts = host.split('.');
  return parts.length > 2 && parts.at(-2).length <= 3 ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

// Domain registration date via RDAP (the modern, free WHOIS). Cached on the company row for 30 days.
// Domain registration date via RDAP (the modern, free WHOIS). Returns 'YYYY-MM-DD', or null if unknown.
async function domainCreated(website) {
  const domain = registrableDomain(hostOf(website || ''));
  if (!domain) return null;
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const ev = ((await res.json()).events || []).find(e => e.eventAction === 'registration');
    return ev?.eventDate ? ev.eventDate.slice(0, 10) : null;
  } catch { return null; }   // offline or rate limited
}

// Same lookup for a company, cached on its row for 30 days.
async function refreshDomainAge(company) {
  if (!registrableDomain(hostOf(company.website || ''))) return company;
  const fresh = company.domain_checked_at && Date.now() - Date.parse(company.domain_checked_at + 'Z') < 30 * 864e5;
  if (fresh) return company;
  const created = (await domainCreated(company.website)) ?? company.domain_created;
  db.prepare(`UPDATE companies SET domain_created = ?, domain_checked_at = datetime('now') WHERE id = ?`).run(created ?? null, company.id);
  return { ...company, domain_created: created };
}

// Indian registration numbers. A CIN (e.g. L85110KA1981PLC013115) encodes:
// L/U = listed or unlisted, 5-digit industry code, state, year of incorporation, company type, registration number.
// An LLP has an LLPIN instead (e.g. AAB-1234).
const CIN_STATES = { AN: 'Andaman and Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh',
  CT: 'Chhattisgarh', DL: 'Delhi', DN: 'Dadra and Nagar Haveli', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana', JH: 'Jharkhand',
  JK: 'Jammu and Kashmir', KA: 'Karnataka', KL: 'Kerala', LD: 'Lakshadweep', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur', MP: 'Madhya Pradesh',
  MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan', SK: 'Sikkim', TG: 'Telangana', TN: 'Tamil Nadu',
  TR: 'Tripura', UP: 'Uttar Pradesh', UR: 'Uttarakhand', WB: 'West Bengal' };
const CIN_TYPES = { PTC: 'Private limited company', PLC: 'Public limited company', OPC: 'One person company', NPL: 'Not-for-profit (Section 8) company',
  FTC: 'Indian subsidiary of a foreign company', FLC: 'Indian public subsidiary of a foreign company', GOI: 'Central government company',
  SGC: 'State government company', GAP: 'Public company limited by guarantee', GAT: 'Private company limited by guarantee',
  ULL: 'Public unlimited company', ULT: 'Private unlimited company' };

// Returns null when there's no number, { valid: false } when it's malformed, or what the number says about the company.
function parseRegistration(raw) {
  const id = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!id) return null;
  const llp = /^[A-Z]{3}-\d{4}$/.test(id);
  if (llp) return { valid: true, kind: 'llp', id, label: `Registered LLP in India (LLPIN ${id})`, detail: 'Check it on mca.gov.in under "Master data".' };
  const m = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/.exec(id);
  const year = m && Number(m[4]);
  if (!m || !CIN_STATES[m[3]] || !CIN_TYPES[m[5]] || year < 1850 || year > new Date().getFullYear()) return { valid: false, id };
  const listed = m[1] === 'L';
  return { valid: true, kind: 'cin', id, listed, state: CIN_STATES[m[3]], year, type: CIN_TYPES[m[5]],
    label: `Registered company in India (CIN ${id})`,
    detail: `${CIN_TYPES[m[5]]}, incorporated in ${year} in ${CIN_STATES[m[3]]}${listed ? ', listed on an Indian stock exchange' : ''}. Check it on mca.gov.in under "Master data".` };
}

// Hiring activity numbers for the company (what the user asked for: how much they post / recruit).
function hiringStats(companyId) {
  const q = sql => db.prepare(sql).get(companyId);
  const posted30 = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND posted_at >= datetime('now','-30 days')`).n;
  const posted90 = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND posted_at >= datetime('now','-90 days')`).n;
  const posted365 = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND posted_at >= datetime('now','-365 days')`).n;
  const open = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND status='open'`).n;
  const closed = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND status='closed'`).n;
  const avgDaysOpen = q(`SELECT ROUND(AVG(julianday(COALESCE(closed_at, datetime('now'))) - julianday(posted_at))) d FROM jobs WHERE company_id=?`).d;
  const staleOpen = q(`SELECT COUNT(*) n FROM jobs WHERE company_id=? AND status='open' AND posted_at < datetime('now','-60 days')`).n;
  const reposts = db.prepare(`SELECT title, COUNT(*) n FROM jobs WHERE company_id=? AND posted_at >= datetime('now','-90 days')
                              GROUP BY lower(title) HAVING n >= 3`).all(companyId);
  const reports = Object.fromEntries(
    db.prepare(`SELECT kind, COUNT(*) n FROM reports WHERE company_id=? GROUP BY kind`).all(companyId).map(r => [r.kind, r.n]));
  const monthly = db.prepare(`SELECT strftime('%Y-%m', posted_at) month, COUNT(*) n FROM jobs WHERE company_id=?
                              AND posted_at >= datetime('now','-12 months') GROUP BY month ORDER BY month`).all(companyId);
  return { posted30, posted90, posted365, open, closed, avgDaysOpen, staleOpen, reposts, reports, monthly };
}

// Score a company (and optionally a specific job). Returns { score, level, signals, stats }.
function scoreCompany(company, job = null) {
  const signals = [];
  const add = (impact, label, detail = '') => signals.push({ impact, label, detail });
  const stats = hiringStats(company.id);
  const year = new Date().getFullYear();
  let score = 40; // neutral start

  // 1. Company age
  if (company.founded_year) {
    const age = year - company.founded_year;
    if (age >= 5) add(+12, `Founded ${company.founded_year}`, `${age} years in business`);
    else if (age >= 2) add(+6, `Founded ${company.founded_year}`, `${age} years in business`);
    else add(-5, `Very young company (founded ${company.founded_year})`, 'Not a red flag alone, but check carefully');
  } else add(-4, 'Founding year unknown');

  // 2. Domain age (hard to fake — scam sites are usually weeks/months old)
  if (company.domain_created) {
    const days = (Date.now() - Date.parse(company.domain_created)) / 864e5;
    if (days > 3 * 365) add(+12, 'Website domain registered ' + company.domain_created, `${Math.floor(days / 365)} years old`);
    else if (days > 365) add(+5, 'Website domain registered ' + company.domain_created);
    else add(-15, 'Website domain is less than 1 year old', `Registered ${company.domain_created}`);
  } else if (company.website) add(0, 'Domain age not checked yet');
  else add(-10, 'No company website');

  // 3. Size & presence
  if (company.employee_count >= 50) add(+8, `${company.employee_count}+ employees`);
  else if (company.employee_count >= 10) add(+4, `${company.employee_count} employees`);
  else if (company.employee_count) add(0, `Small team (${company.employee_count})`);
  if (company.linkedin_url) add(+5, 'Has LinkedIn company page'); else add(-5, 'No LinkedIn company page');
  if (company.verified_by_admin) add(+15, 'Manually verified by our team');

  // 3b. Indian companies: registration with the Ministry of Corporate Affairs (MCA)
  const reg = parseRegistration(company.cin);
  if (reg?.valid) add(reg.kind === 'llp' ? +8 : +10, reg.label, reg.detail);
  else if (reg) add(-20, `Registration number "${company.cin}" is not a valid CIN or LLPIN`, 'Every real Indian company has one. A made-up number is a strong scam sign.');
  else if (/^india$/i.test(company.hq_country || '')) add(-5, 'Indian company with no registration number (CIN) on record',
    'Ask the recruiter for the company\'s CIN and look it up on mca.gov.in before sharing documents.');

  // 4. Hiring activity
  if (stats.posted90 >= 1 && stats.posted90 <= 25) add(+6, `Actively hiring: ${stats.posted90} jobs in last 90 days`);
  else if (stats.posted90 > 25) add(+2, `${stats.posted90} jobs in 90 days`, 'Very high volume — check roles are real');
  if (stats.closed > 0) add(+5, `${stats.closed} past openings closed/filled`);
  if (stats.reposts.length) add(-8, 'Same job reposted again and again', stats.reposts.map(r => `${r.title} ×${r.n}`).join(', ') + ' — possible "ghost job"');
  if (stats.staleOpen >= 3) add(-5, `${stats.staleOpen} openings open for 60+ days`);

  // 5. Community reports from our own users
  const r = stats.reports;
  if (r.hired) add(Math.min(15, r.hired * 5), `${r.hired} member(s) reported getting hired`);
  if (r.interview) add(Math.min(6, r.interview * 2), `${r.interview} member(s) got interviews`);
  if (r.no_response >= 5) add(-3, `${r.no_response} members never heard back`);
  if (r.scam) add(-Math.min(40, r.scam * 15), `${r.scam} scam report(s) from members`);

  // 6. Job-level checks
  if (job) {
    const text = `${job.title}\n${job.description || ''}`;
    for (const f of textChecks(text, company.website)) add(-f.impact, f.label, f.why);
    const applyHost = hostOf(job.apply_url);
    const companyDomain = registrableDomain(hostOf(company.website || ''));
    if (applyHost && (TRUSTED_APPLY_HOSTS.test(applyHost) || (companyDomain && applyHost.endsWith(companyDomain))))
      add(+5, `Apply link goes to ${applyHost}`, 'Known job board or the company\'s own site');
    else add(-10, `Apply link goes to unknown site (${applyHost || 'invalid'})`);
    if (job.salary_max && job.salary_currency === 'USD' && job.salary_max > 400000) add(-8, 'Salary looks unrealistically high');
  }

  score = Math.max(0, Math.min(100, score + signals.reduce((s, x) => s + x.impact, 0)));
  const level = score >= 70 ? 'verified' : score >= MIN_SCORE ? 'caution' : 'risky';
  return { score, level, signals, stats };
}

module.exports = { MIN_SCORE, scoreCompany, hiringStats, refreshDomainAge, domainCreated, hostOf, registrableDomain, textChecks, RED_FLAGS, parseRegistration };
