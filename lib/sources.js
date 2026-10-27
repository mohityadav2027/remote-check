// Job sources. Each one fetches a public feed and returns jobs in one common shape:
// { company, title, category, description, salary_min, salary_max, location, apply_url, external_id, tags, posted_at }
// Only jobs that say they accept candidates from India (or worldwide / Asia) are kept.
//
// Sites with no public API (LinkedIn, Indeed, Naukri, Glassdoor) forbid scraping in their terms,
// so their jobs are added by hand from the Admin page with the original link as the apply URL.

const INDIA_OK = /worldwide|anywhere|global|india|asia|apac|\bremote\s*$/i;

const stripHtml = s => (s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/\s+/g, ' ').trim();
// Greenhouse sends HTML that is itself HTML-escaped
const unescapeHtml = s => (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const toIso = v => {
  if (v == null || v === '') return undefined;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return isNaN(d) ? undefined : d.toISOString();
};
const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'RemoteCheck job importer', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'RemoteCheck job importer' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  return res.text();
}

// ---------- remote-job boards (aggregators) ----------

const remotive = {
  key: 'remotive', label: 'Remotive', site: 'https://remotive.com',
  async fetch() {
    // No limit: every category (support, writing, design, sales, finance, HR, teaching…), not just the newest tech jobs
    const { jobs = [] } = await getJson('https://remotive.com/api/remote-jobs');
    return jobs.map(j => ({
      company: j.company_name, title: j.title, category: j.category, description: stripHtml(j.description),
      location: j.candidate_required_location, apply_url: j.url, external_id: `remotive-${j.id}`,
      tags: j.tags, posted_at: toIso(j.publication_date),
    }));
  },
};

const himalayas = {
  key: 'himalayas', label: 'Himalayas', site: 'https://himalayas.app',
  async fetch() {
    // Read page by page (up to 1,000 jobs) so every kind of role is included
    const jobs = [], seen = new Set();
    for (let offset = 0; offset < 1000; offset += 20) {
      const page = (await getJson(`https://himalayas.app/jobs/api?limit=20&offset=${offset}`)).jobs || [];
      const fresh = page.filter(j => !seen.has(j.guid));
      if (!fresh.length) break;
      fresh.forEach(j => { seen.add(j.guid); jobs.push(j); });
      if (page.length < 20) break;
    }
    return jobs.map(j => ({
      company: j.companyName, title: j.title, category: (j.categories || [])[0], description: stripHtml(j.description),
      salary_min: num(j.minSalary), salary_max: num(j.maxSalary),
      location: (j.locationRestrictions || []).join(', ') || 'Worldwide',
      apply_url: j.applicationLink, external_id: `himalayas-${j.guid}`, tags: j.categories, posted_at: toIso(j.pubDate),
    }));
  },
};

// Remote OK asks for a link back to them; the apply link and the "via remoteok" label do that.
const remoteok = {
  key: 'remoteok', label: 'Remote OK', site: 'https://remoteok.com',
  async fetch() {
    const data = await getJson('https://remoteok.com/api');
    return data.filter(j => j.id && j.position).map(j => ({
      company: j.company, title: j.position, category: (j.tags || [])[0], description: stripHtml(j.description),
      salary_min: num(j.salary_min), salary_max: num(j.salary_max), location: j.location,
      apply_url: j.url || j.apply_url, external_id: `remoteok-${j.id}`, tags: j.tags, posted_at: toIso(j.date || j.epoch),
    }));
  },
};

const jobicy = {
  key: 'jobicy', label: 'Jobicy', site: 'https://jobicy.com',
  async fetch() {
    const { jobs = [] } = await getJson('https://jobicy.com/api/v2/remote-jobs?count=100');
    return jobs.map(j => ({
      company: j.companyName, title: j.jobTitle, category: [].concat(j.jobIndustry || [])[0],
      description: stripHtml(j.jobDescription || j.jobExcerpt),
      salary_min: j.salaryCurrency === 'USD' ? num(j.annualSalaryMin) : null,
      salary_max: j.salaryCurrency === 'USD' ? num(j.annualSalaryMax) : null,
      location: j.jobGeo, apply_url: j.url, external_id: `jobicy-${j.id}`,
      tags: [].concat(j.jobIndustry || [], j.jobType || []), posted_at: toIso(j.pubDate),
    }));
  },
};

const workingnomads = {
  key: 'workingnomads', label: 'Working Nomads', site: 'https://www.workingnomads.com',
  async fetch() {
    const data = await getJson('https://www.workingnomads.com/api/exposed_jobs/');
    return data.map(j => ({
      company: j.company_name, title: j.title, category: j.category_name, description: stripHtml(j.description),
      location: j.location, apply_url: j.url, external_id: `workingnomads-${j.url}`,
      tags: String(j.tags || '').split(',').map(s => s.trim()).filter(Boolean), posted_at: toIso(j.pub_date),
    }));
  },
};

// We Work Remotely publishes RSS. Titles look like "Company: Job title"; <region> says who can apply.
const weworkremotely = {
  key: 'weworkremotely', label: 'We Work Remotely', site: 'https://weworkremotely.com',
  async fetch() {
    return parseWwrRss(await getText('https://weworkremotely.com/remote-jobs.rss'));
  },
};
function parseWwrRss(xml) {
  const tag = (item, name) => {
    const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
  };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const full = stripHtml(tag(item, 'title'));
    const i = full.indexOf(':');
    const link = tag(item, 'link');
    return {
      company: i > 0 ? full.slice(0, i).trim() : 'Unknown', title: i > 0 ? full.slice(i + 1).trim() : full,
      category: stripHtml(tag(item, 'category')), description: stripHtml(unescapeHtml(tag(item, 'description'))),
      location: stripHtml(tag(item, 'region')) || 'Anywhere in the World', apply_url: link,
      external_id: `wwr-${link}`, tags: [], posted_at: toIso(tag(item, 'pubDate')),
    };
  });
}

// ---------- company career pages (applicant tracking systems) ----------
// These come straight from the employer, so they are the most trustworthy source.
// Admin sets a company's ATS (greenhouse / lever / ashby) and its board name, e.g. "gitlab".

const ats = {
  greenhouse: {
    label: 'Greenhouse',
    async fetch(board, company) {
      const { jobs = [] } = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
      return jobs.map(j => ({
        company, title: j.title, category: j.departments?.[0]?.name, description: stripHtml(unescapeHtml(j.content)),
        location: j.location?.name, apply_url: j.absolute_url, external_id: `greenhouse-${board}-${j.id}`,
        tags: [], posted_at: toIso(j.first_published || j.updated_at),
      }));
    },
  },
  lever: {
    label: 'Lever',
    async fetch(board, company) {
      const jobs = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
      return jobs.map(j => ({
        company, title: j.text, category: j.categories?.team, description: j.descriptionPlain || stripHtml(j.description),
        location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).join(', ') || (j.workplaceType === 'remote' ? 'Remote' : ''),
        apply_url: j.hostedUrl, external_id: `lever-${board}-${j.id}`,
        tags: [j.categories?.commitment].filter(Boolean), posted_at: toIso(j.createdAt),
      }));
    },
  },
  ashby: {
    label: 'Ashby',
    async fetch(board, company) {
      const { jobs = [] } = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
      return jobs.filter(j => j.isListed !== false).map(j => ({
        company, title: j.title, category: j.department, description: j.descriptionPlain || stripHtml(j.descriptionHtml),
        location: [j.location, ...(j.secondaryLocations || []).map(l => l.location)].filter(Boolean).join(', ') || (j.isRemote ? 'Remote' : ''),
        apply_url: j.jobUrl || j.applyUrl, external_id: `ashby-${board}-${j.id}`,
        tags: [j.employmentType].filter(Boolean), posted_at: toIso(j.publishedAt),
      }));
    },
  },
};

// Turn a careers page link into { type, board }, e.g. https://jobs.lever.co/netflix -> { type: 'lever', board: 'netflix' }
function parseCareersUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const first = u.pathname.split('/').filter(Boolean)[0];
  const host = u.hostname.replace(/^www\./, '');
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const board = u.searchParams.get('for') || first;   // boards.greenhouse.io/gitlab or .../embed/job_board?for=gitlab
    return board && board !== 'embed' ? { type: 'greenhouse', board } : null;
  }
  if (/^jobs\.(eu\.)?lever\.co$/.test(host) && first) return { type: 'lever', board: first };
  if (host === 'jobs.ashbyhq.com' && first) return { type: 'ashby', board: first };
  return null;
}

const BOARDS = [remotive, himalayas, remoteok, jobicy, workingnomads, weworkremotely];

const indiaEligible = job => INDIA_OK.test(job.location || '');

module.exports = { BOARDS, ats, indiaEligible, stripHtml, parseWwrRss, parseCareersUrl, INDIA_OK };
