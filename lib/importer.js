// Imports real remote jobs from free public APIs and keeps only jobs Indian candidates can apply to.
// Run manually:  npm run import      (or from the Admin page)
const db = require('./db');
const { classifySegment } = require('./pricing');
const { refreshDomainAge } = require('./verify');

const INDIA_OK = /worldwide|anywhere|global|india|asia|apac|emea.*asia|remote$/i;

function upsertCompany({ name, website, logo }) {
  db.prepare(`INSERT INTO companies (name, website) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET website = COALESCE(companies.website, excluded.website)`)
    .run(name.trim(), website || null);
  return db.prepare('SELECT * FROM companies WHERE name = ?').get(name.trim());
}

function insertJob(j) {
  const r = db.prepare(`INSERT OR IGNORE INTO jobs
    (company_id, title, segment, category, description, salary_min, salary_max, location, india_eligible, apply_url, source, external_id, tags, posted_at)
    VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?)`)
    .run(j.company_id, j.title, classifySegment(j.title, j.category), j.category || null, j.description || null,
      j.salary_min || null, j.salary_max || null, j.location || 'Remote', j.apply_url, j.source, j.external_id,
      (j.tags || []).join(','), (j.posted_at || new Date().toISOString()).replace('T', ' ').slice(0, 19));
  return r.changes;
}

const stripHtml = s => (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function fromRemotive() {
  const res = await fetch('https://remotive.com/api/remote-jobs?limit=300', { signal: AbortSignal.timeout(20000) });
  const { jobs } = await res.json();
  let added = 0;
  for (const j of jobs) {
    if (!INDIA_OK.test(j.candidate_required_location || '')) continue;
    const c = upsertCompany({ name: j.company_name });
    added += insertJob({
      company_id: c.id, title: j.title, category: j.category, description: stripHtml(j.description).slice(0, 5000),
      location: j.candidate_required_location, apply_url: j.url, source: 'remotive', external_id: `remotive-${j.id}`,
      tags: j.tags, posted_at: j.publication_date,
    });
  }
  return added;
}

async function fromHimalayas() {
  const res = await fetch('https://himalayas.app/jobs/api?limit=100', { signal: AbortSignal.timeout(20000) });
  const { jobs } = await res.json();
  let added = 0;
  for (const j of jobs) {
    const locs = j.locationRestrictions || [];
    if (locs.length && !locs.some(l => INDIA_OK.test(l))) continue;
    const c = upsertCompany({ name: j.companyName });
    added += insertJob({
      company_id: c.id, title: j.title, category: (j.categories || [])[0], description: stripHtml(j.description).slice(0, 5000),
      salary_min: j.minSalary, salary_max: j.maxSalary, location: locs.join(', ') || 'Worldwide',
      apply_url: j.applicationLink, source: 'himalayas', external_id: `himalayas-${j.guid}`,
      tags: j.categories, posted_at: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : undefined,
    });
  }
  return added;
}

async function runImport() {
  const result = {};
  for (const [name, fn] of [['remotive', fromRemotive], ['himalayas', fromHimalayas]]) {
    try { result[name] = await fn(); } catch (e) { result[name] = `failed: ${e.message}`; }
  }
  // Jobs that disappeared from the source after 45 days are marked closed (feeds "hiring activity").
  db.prepare(`UPDATE jobs SET status='closed', closed_at=datetime('now') WHERE source != 'manual' AND status='open' AND posted_at < datetime('now','-45 days')`).run();
  // Background-check new company domains (slowly, to respect the free RDAP service).
  const unchecked = db.prepare(`SELECT * FROM companies WHERE website IS NOT NULL AND domain_checked_at IS NULL LIMIT 25`).all();
  for (const c of unchecked) await refreshDomainAge(c);
  return result;
}

module.exports = { runImport };

if (require.main === module) runImport().then(r => { console.log('Import done:', r); process.exit(0); });
