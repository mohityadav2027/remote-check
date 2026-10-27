// Company background check + job genuineness scoring.
// Produces a 0–100 trust score with the reasons behind it, so users can see WHY a job is trusted.
const db = require('./db');

const SCAM_PATTERNS = [
  [/registration fee|joining fee|security deposit|training fee|pay (a|the)? ?(small )?fee|refundable/i, 'Asks candidate to pay a fee'],
  [/whats\s?app|telegram/i, 'Asks to continue on WhatsApp/Telegram'],
  [/gift ?card|crypto(currency)? payment|bitcoin|usdt/i, 'Mentions gift cards / crypto payments'],
  [/no (interview|experience) (needed|required).{0,40}(\$|usd|₹)\s?\d{3,}/i, 'Unrealistic pay with no interview/experience'],
  [/earn (\$|₹|rs\.?)\s?\d{3,}.{0,20}(per|a) (day|week)/i, '"Earn X per day" style promise'],
  [/send (your )?(bank|aadhaar|pan|passport) (details|card|number)/i, 'Asks for bank / ID documents up front'],
  [/like (videos|posts)|rate (products|hotels)|task.based earning/i, 'Typical "task" scam pattern'],
];
const FREE_EMAIL = /@(gmail|yahoo|outlook|hotmail|proton|rediff)\./i;
const TRUSTED_APPLY_HOSTS = /(^|\.)(linkedin\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|bamboohr\.com|myworkdayjobs\.com|wellfound\.com|remotive\.com|himalayas\.app|weworkremotely\.com|remoteok\.com|indeed\.com|naukri\.com|recruitee\.com|breezy\.hr|teamtailor\.com|jobvite\.com|icims\.com)$/i;

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
async function refreshDomainAge(company) {
  const domain = registrableDomain(hostOf(company.website || ''));
  if (!domain) return company;
  const fresh = company.domain_checked_at && Date.now() - Date.parse(company.domain_checked_at + 'Z') < 30 * 864e5;
  if (fresh) return company;
  let created = company.domain_created;
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const ev = (data.events || []).find(e => e.eventAction === 'registration');
      if (ev?.eventDate) created = ev.eventDate.slice(0, 10);
    }
  } catch { /* offline or rate limited: keep old value */ }
  db.prepare(`UPDATE companies SET domain_created = ?, domain_checked_at = datetime('now') WHERE id = ?`).run(created ?? null, company.id);
  return { ...company, domain_created: created };
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
    for (const [re, label] of SCAM_PATTERNS) if (re.test(text)) add(-25, label, 'Genuine employers never ask for this');
    if (FREE_EMAIL.test(text)) add(-10, 'Uses a free email (gmail/yahoo) for hiring');
    const applyHost = hostOf(job.apply_url);
    const companyDomain = registrableDomain(hostOf(company.website || ''));
    if (applyHost && (TRUSTED_APPLY_HOSTS.test(applyHost) || (companyDomain && applyHost.endsWith(companyDomain))))
      add(+5, `Apply link goes to ${applyHost}`, 'Known job board or the company\'s own site');
    else add(-10, `Apply link goes to unknown site (${applyHost || 'invalid'})`);
    if (job.salary_max && job.salary_currency === 'USD' && job.salary_max > 400000) add(-8, 'Salary looks unrealistically high');
  }

  score = Math.max(0, Math.min(100, score + signals.reduce((s, x) => s + x.impact, 0)));
  const level = score >= 70 ? 'verified' : score >= 45 ? 'caution' : 'risky';
  return { score, level, signals, stats };
}

module.exports = { scoreCompany, hiringStats, refreshDomainAge, hostOf };
