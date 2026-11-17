// Job sources. Each one fetches a public feed and returns jobs in one common shape:
// { company, title, category, description, salary_min, salary_max, location, apply_url, external_id, tags, posted_at }
// Only jobs that say they accept candidates from India (or worldwide / Asia) are kept.
//
// Sites with no public API (LinkedIn, Indeed, Naukri, Glassdoor) forbid scraping in their terms,
// so their jobs are added by hand from the Admin page with the original link as the apply URL.

// Indian cities count too: a remote job tied to Bengaluru or Pune is open to people in India
const INDIA_OK = /worldwide|anywhere|global|india|asia|apac|\bremote\s*$|bengaluru|bangalore|mumbai|delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi/i;
const REMOTE = /remote|anywhere|work from home|\bwfh\b|distributed/i;

const stripHtml = s => (s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/\s+/g, ' ').trim();
// Greenhouse sends HTML that is itself HTML-escaped
// Job descriptions keep their shape: paragraphs and headings become line breaks, list items become "• " lines
const htmlToText = s => stripHtml(String(s || '')
  .replace(/<li[^>]*>/gi, '\uE000• ').replace(/<br\s*\/?>|<\/(p|div|li|ul|ol|h\d|tr)>|<h\d[^>]*>/gi, '\uE000'))
  .replace(/\s*\uE000\s*/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
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
      company: j.company_name, title: j.title, category: j.category, description: htmlToText(j.description),
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
      company: j.companyName, title: j.title, category: (j.categories || [])[0], description: htmlToText(j.description),
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
      company: j.company, title: j.position, category: (j.tags || [])[0], description: htmlToText(j.description),
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
      description: htmlToText(j.jobDescription || j.jobExcerpt),
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
      company: j.company_name, title: j.title, category: j.category_name, description: htmlToText(j.description),
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
      category: stripHtml(tag(item, 'category')), description: htmlToText(unescapeHtml(tag(item, 'description'))),
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
        company, title: j.title, category: j.departments?.[0]?.name, description: htmlToText(unescapeHtml(j.content)),
        location: j.location?.name, apply_url: j.absolute_url, external_id: `greenhouse-${board}-${j.id}`,
        remote: REMOTE.test(j.location?.name || ''),
        tags: [], posted_at: toIso(j.first_published || j.updated_at),
      }));
    },
  },
  lever: {
    label: 'Lever',
    async fetch(board, company) {
      const jobs = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`);
      return jobs.map(j => ({
        company, title: j.text, category: j.categories?.team, description: j.descriptionPlain || htmlToText(j.description),
        location: [...new Set([j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean))].join(' · ') || (j.workplaceType === 'remote' ? 'Remote' : ''),
        workplace: j.workplaceType === 'hybrid' ? 'hybrid' : undefined,
        apply_url: j.hostedUrl, external_id: `lever-${board}-${j.id}`,
        remote: j.workplaceType === 'remote' || REMOTE.test(j.categories?.location || ''),
        tags: [j.categories?.commitment].filter(Boolean), posted_at: toIso(j.createdAt),
      }));
    },
  },
  ashby: {
    label: 'Ashby',
    async fetch(board, company) {
      const { jobs = [] } = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
      return jobs.filter(j => j.isListed !== false).map(j => ({
        company, title: j.title, category: j.department, description: j.descriptionPlain || htmlToText(j.descriptionHtml),
        location: [j.location, ...(j.secondaryLocations || []).map(l => l.location)].filter(Boolean).join(', ') || (j.isRemote ? 'Remote' : ''),
        apply_url: j.jobUrl || j.applyUrl, external_id: `ashby-${board}-${j.id}`,
        remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || '') || REMOTE.test(j.location || ''),
        tags: [j.employmentType].filter(Boolean), posted_at: toIso(j.publishedAt),
      }));
    },
  },
  // SmartRecruiters (e.g. Swiggy, Bosch, ServiceNow): Indian postings only, since big employers list thousands worldwide.
  // Its list has no descriptions, so they're read one by one, only for postings we keep (remote, or internships).
  smartrecruiters: {
    label: 'SmartRecruiters',
    async fetch(board, company) {
      const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings`;
      const list = [];
      for (let offset = 0; offset < 2000; offset += 100) {
        const d = await getJson(`${base}?country=in&limit=100&offset=${offset}`);
        list.push(...(d.content || []));
        if (offset + 100 >= (d.totalFound || 0)) break;
      }
      const intern = p => /intern/i.test(`${p.typeOfEmployment?.id} ${p.experienceLevel?.id}`) || isInternship({ title: p.name });
      const keep = list.filter(p => p.location?.remote || intern(p));
      const out = [];
      for (const p of keep) {
        let ad = {};
        try { ad = await getJson(`${base}/${p.id}`); } catch { /* list details are enough */ }
        const sec = ad.jobAd?.sections || {};
        out.push({
          company, title: p.name, category: p.function?.label || p.department?.label,
          description: htmlToText([sec.jobDescription?.text, sec.qualifications?.text, sec.additionalInformation?.text].filter(Boolean).join('<br>')),
          location: p.location?.fullLocation || [p.location?.city, 'India'].filter(Boolean).join(', '),
          remote: Boolean(p.location?.remote), workplace: p.location?.remote ? 'remote' : p.location?.hybrid ? 'hybrid' : 'office',
          kind: intern(p) ? 'internship' : undefined,
          apply_url: ad.postingUrl || `https://jobs.smartrecruiters.com/${encodeURIComponent(board)}/${p.id}`,
          external_id: `smartrecruiters-${board}-${p.id}`, tags: [p.typeOfEmployment?.label].filter(Boolean), posted_at: toIso(p.releasedDate),
        });
      }
      return out;
    },
  },
  // Workable: its public job widget lists every open role with the description
  workable: {
    label: 'Workable',
    async fetch(board, company) {
      const { jobs = [] } = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board)}?details=true`);
      return jobs.map(j => {
        const where = [j.city, j.state, j.country].filter(Boolean).join(', ');
        return {
          company, title: j.title, category: j.department || null, description: htmlToText(j.description),
          location: j.telecommuting ? (where ? `Remote, ${where}` : 'Remote') : where,
          remote: Boolean(j.telecommuting), workplace: j.telecommuting ? 'remote' : 'office',
          apply_url: j.url || j.application_url || `https://apply.workable.com/${board}/j/${j.shortcode}/`,
          external_id: `workable-${board}-${j.shortcode}`, tags: [j.employment_type].filter(Boolean), posted_at: toIso(j.published_on || j.created_at),
        };
      });
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
  if ((host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') && first) return { type: 'smartrecruiters', board: first };
  if (host === 'apply.workable.com' && first) return { type: 'workable', board: first };
  return null;
}

// ---------- internships ----------
// Who an internship is for, read from the post: 'ug' (undergraduates), 'pg' (master's students), 'mba' (MBA / PGDM / BBA-style business programmes)
const isInternship = j => /\bintern(ship)?s?\b|\btrainee\b|\bapprentice(ship)?\b/i.test(`${j.title} ${j.category || ''}`);
function audienceOf(text) {
  const t = String(text || ''), out = new Set();
  if (/\bmba\b|\bpgdm\b|business school|b-school|\bpgp\b/i.test(t)) out.add('mba');
  if (/master'?s|post.?grad|\bm\.?tech\b|\bm\.?sc\b|\bmca\b|\bm\.?com\b|\bpg\b/i.test(t)) out.add('pg');
  if (/under.?grad|bachelor|\bb\.?tech\b|\bb\.?e\b|\bbba\b|\bb\.?com\b|\bb\.?sc\b|\bbca\b|college student|currently (enrolled|pursuing)|final.year/i.test(t)) out.add('ug');
  if (!out.size) { out.add('ug'); out.add('pg'); }   // an internship that names no programme is open to students in general
  return [...out].join(',');
}

// Internships in offices in India (from company careers pages): the employer's own listing, in an Indian city
const INDIA_PLACE = /india|bengaluru|bangalore|mumbai|delhi|gurugram|gurgaon|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore/i;
const internshipInIndia = j => (j.kind === 'internship' || isInternship(j)) && INDIA_PLACE.test(j.location || '');
const workplaceOf = j => j.remote !== false ? 'remote' : /hybrid/i.test(`${j.location} ${j.workplace || ''}`) ? 'hybrid' : 'office';

const BOARDS = [remotive, himalayas, remoteok, jobicy, workingnomads, weworkremotely];

// Remote only. The job boards above list nothing but remote jobs; company careers pages also list
// office jobs, so those parsers set `remote`, and anything not marked remote (e.g. "Bengaluru office") is skipped.
const indiaEligible = job => job.remote !== false && INDIA_OK.test(job.location || '');

module.exports = { BOARDS, ats, indiaEligible, isInternship, internshipInIndia, workplaceOf, audienceOf, stripHtml, htmlToText, parseWwrRss, parseCareersUrl, INDIA_OK };
