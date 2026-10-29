// Imports jobs from every source in lib/sources.js and keeps only jobs Indian candidates can apply to.
// Run manually:  npm run import      (or from the Admin page)
const db = require('./db');
const { classifySegment } = require('./pricing');
const { refreshDomainAge } = require('./verify');
const { BOARDS, ats, indiaEligible } = require('./sources');
const { lookupCompany } = require('./enrich');

async function enrichCompanies(limit = 60) {
  const todo = db.prepare(`SELECT * FROM companies c WHERE (founded_year IS NULL OR website IS NULL)
      AND (info_checked_at IS NULL OR info_checked_at < datetime('now','-30 days'))
      AND EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id AND j.status = 'open') LIMIT ?`).all(limit);
  const result = { checked: 0, found: 0, fetched: 0, added: 0 };
  for (const c of todo) {
    let details;
    try { details = await lookupCompany(c.name); } catch { continue; }   // offline: try again next run
    result.checked++;
    if (details) {
      result.found++;
      // Fill only what's missing: details an admin entered are never overwritten
      db.prepare(`UPDATE companies SET founded_year = COALESCE(founded_year, ?), website = COALESCE(website, ?), employee_count = COALESCE(employee_count, ?),
          linkedin_url = COALESCE(linkedin_url, ?), hq_country = COALESCE(hq_country, ?), description = COALESCE(description, ?),
          wikidata_id = ?, info_source = COALESCE(info_source, 'wikidata') WHERE id = ?`)
        .run(details.founded_year, details.website, details.employee_count, details.linkedin_url, details.hq_country, details.description, details.wikidata_id, c.id);
    }
    db.prepare(`UPDATE companies SET info_checked_at = datetime('now') WHERE id = ?`).run(c.id);
  }
  return result;
}

const isHttpUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };

function upsertCompany(name) {
  db.prepare(`INSERT INTO companies (name) VALUES (?) ON CONFLICT(name) DO NOTHING`).run(name);
  return db.prepare('SELECT id FROM companies WHERE name = ?').get(name).id;
}

// Returns 'added' | 'known' | 'duplicate' | 'skipped'
function saveJob(j, source, companyId = null) {
  const company = (j.company || '').trim();
  if (!company || !j.title || !isHttpUrl(j.apply_url || '')) return 'skipped';
  if (!indiaEligible(j)) return 'skipped';
  if (db.prepare('SELECT 1 FROM jobs WHERE external_id = ?').get(j.external_id)) return 'known';
  const cid = companyId || upsertCompany(company);
  // The same opening is often on several boards. Count it once, or it would look like a "reposted ghost job".
  const dup = db.prepare(`SELECT 1 FROM jobs WHERE company_id = ? AND lower(title) = lower(?) AND posted_at >= datetime('now','-30 days')`).get(cid, j.title.trim());
  if (dup) return 'duplicate';
  db.prepare(`INSERT INTO jobs (company_id, title, segment, category, description, salary_min, salary_max, location, india_eligible, apply_url, source, external_id, tags, posted_at)
              VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?)`)
    .run(cid, j.title.trim(), classifySegment(j.title, j.category), j.category || null, (j.description || '').slice(0, 5000) || null,
      j.salary_min || null, j.salary_max || null, j.location || 'Remote', j.apply_url, source, j.external_id,
      (j.tags || []).filter(Boolean).join(','), (j.posted_at || new Date().toISOString()).replace('T', ' ').slice(0, 19));
  return 'added';
}

function record(source, label, result, error) {
  db.prepare(`INSERT INTO source_status (source, label, last_run, fetched, added, error) VALUES (?,?,datetime('now'),?,?,?)
              ON CONFLICT(source) DO UPDATE SET label=excluded.label, last_run=excluded.last_run, fetched=excluded.fetched, added=excluded.added, error=excluded.error`)
    .run(source, label, result.fetched, result.added, error || null);
}

async function importSource(key, label, fetchJobs, companyId = null) {
  const result = { fetched: 0, added: 0, duplicate: 0, skipped: 0 };
  try {
    const jobs = await fetchJobs();
    result.fetched = jobs.length;
    for (const j of jobs) {
      const r = saveJob(j, key, companyId);
      if (r in result) result[r]++;
    }
    record(key, label, result);
    return { result, jobs };
  } catch (e) {
    record(key, label, result, e.message);
    return { result: { ...result, error: e.message }, jobs: null };
  }
}

async function runImport() {
  const summary = {};

  // Company career pages first: they come straight from the employer, and their list is complete,
  // so a job that disappears from it really was closed or filled.
  const boards = db.prepare(`SELECT id, name, ats_type, ats_board FROM companies WHERE ats_type IS NOT NULL AND ats_board IS NOT NULL`).all();
  for (const c of boards) {
    const sys = ats[c.ats_type];
    if (!sys) continue;
    const key = `${c.ats_type}:${c.ats_board}`;
    const { result, jobs } = await importSource(key, `${c.name} (${sys.label})`, () => sys.fetch(c.ats_board, c.name), c.id);
    if (jobs) {
      const live = new Set(jobs.map(j => j.external_id));
      const open = db.prepare(`SELECT id, external_id FROM jobs WHERE company_id = ? AND source = ? AND status = 'open'`).all(c.id, key);
      for (const o of open) if (!live.has(o.external_id)) db.prepare(`UPDATE jobs SET status='closed', closed_at=datetime('now') WHERE id=?`).run(o.id);
    }
    summary[key] = result;
  }

  // Job boards after careers pages, so when a job is on both, the employer's own listing is the one kept.
  for (const b of BOARDS) summary[b.key] = (await importSource(b.key, b.label, () => b.fetch())).result;

  // Job boards only show recent jobs, so there we close imported jobs after 45 days.
  db.prepare(`UPDATE jobs SET status='closed', closed_at=datetime('now') WHERE source != 'manual' AND source NOT LIKE '%:%' AND status='open' AND posted_at < datetime('now','-45 days')`).run();

  // Company details (founding year, website…) for companies with open jobs that are missing them.
  // Jobs from companies without proper details aren't posted. Each company is looked up at most once a month.
  summary.company_details = await enrichCompanies();

  // Background-check new company domains (slowly, to respect the free RDAP service).
  const unchecked = db.prepare(`SELECT * FROM companies WHERE website IS NOT NULL AND domain_checked_at IS NULL LIMIT 60`).all();
  for (const c of unchecked) await refreshDomainAge(c);
  return summary;
}

module.exports = { runImport, saveJob, enrichCompanies };

if (require.main === module) runImport().then(r => { console.table(r); process.exit(0); });
