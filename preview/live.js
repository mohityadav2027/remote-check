// GitHub Pages version: builds the same job list, company reports and apply links the server builds, from REAL jobs.
// Normally it loads data.json, which GitHub builds every 10 hours by running this same file in Node (preview/data.js),
// so the page appears at once. Without a recent data.json it fetches the job sites in the visitor's browser instead.
// Uses the site's own parsers and checks (LIB).
const SEG_INFO = Object.fromEntries(DATA.pricing.segments.map(s => [s.key, s]));
Object.assign(DATA, { list: null, job: {}, company: {}, applyUrl: {}, sources: [] });

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);
const daysAgo = d => (Date.now() - Date.parse(d)) / 864e5;
const MIN_SCORE = 50;   // jobs scoring under this are not posted (same rule as the server)
const level = score => (score >= 70 ? 'verified' : score >= MIN_SCORE ? 'caution' : 'risky');

const PREBUILT_MAX_AGE = 3 * 864e5;   // data.json older than 3 days (the scheduled build stopped?) is not used

const READY = (async () => {
  // 0. Ready-made data from the scheduled build, when this page is on the web next to a recent data.json
  if (typeof window !== 'undefined' && /^https?:$/.test(location.protocol)) {
    try {
      const res = await fetch('data.json', { cache: 'no-cache' });
      const pre = res.ok ? await res.json() : null;
      if (pre?.list?.jobs?.length && Date.now() - Date.parse(pre.generated_at) < PREBUILT_MAX_AGE) { Object.assign(DATA, pre); return; }
    } catch { /* fall back to fetching the job sites here */ }
  }

  // 1. Fetch every job board at once; any that fail are skipped
  const results = await Promise.allSettled(LIB.BOARDS.map(b => withTimeout(b.fetch(), 25000)));
  const raw = [];
  results.forEach((r, i) => {
    const b = LIB.BOARDS[i];
    const list = r.status === 'fulfilled'
      ? r.value.filter(j => j && j.title && j.company && /^https?:\/\//.test(j.apply_url || '') && LIB.indiaEligible(j)) : [];
    DATA.sources.push({ label: b.label, site: b.site, open: list.length, ok: r.status === 'fulfilled' });
    for (const j of list) raw.push({ ...j, source: b.key, board: b.label });
  });
  // Indian companies' own careers pages: try each usual page name until one answers (browsers may block some)
  const indian = await Promise.all(LIB.INDIAN_COMPANIES.map(async c => {
    for (const board of c.boards) for (const type of Object.keys(LIB.ats)) {
      try {
        const jobs = await withTimeout(LIB.ats[type].fetch(board, c.name), 12000);
        if (jobs.length || !['smartrecruiters', 'workable'].includes(type)) return { c, label: `${c.name} careers page`, jobs };
      } catch { /* next */ }
    }
    return null;
  }));
  // Well-known companies with Indian offices: their careers pages are known
  const global = await Promise.all(LIB.CAREERS_COMPANIES.map(async c => {
    try { return { c, label: `${c.name} careers page`, jobs: await withTimeout(LIB.ats[c.ats_type].fetch(c.ats_board, c.name), 15000) }; } catch { return null; }
  }));
  // Remote jobs open to India, plus internships in Indian offices (in office or hybrid)
  const indianOpen = [...indian, ...global].filter(Boolean).flatMap(x => x.jobs.filter(j => j.title && /^https?:\/\//.test(j.apply_url || '') && (LIB.indiaEligible(j) || LIB.internshipInIndia(j)))
    .map(j => ({ ...j, source: 'careers', board: x.label })));
  raw.unshift(...indianOpen);   // the employer's own listing wins over a job-board copy
  DATA.sources.push({ label: 'Company careers pages', site: null, open: indianOpen.length, ok: true });
  if (!raw.length) throw new Error('no jobs');

  // 2. The same job listed on several boards counts once; remember which boards list it
  const byKey = new Map();
  for (const j of raw) {
    const k = `${j.company.trim().toLowerCase()}|${j.title.trim().toLowerCase()}`;
    if (byKey.has(k)) byKey.get(k).boards.add(j.board);
    else byKey.set(k, { ...j, company: j.company.trim(), title: j.title.trim(), boards: new Set([j.board]) });
  }
  const jobs = [...byKey.values()].sort((a, b) => (Date.parse(b.posted_at) || 0) - (Date.parse(a.posted_at) || 0));
  jobs.forEach((j, i) => { j.id = i + 1; });

  // 3. Companies, as seen in the listings
  const companies = new Map();
  for (const j of jobs) {
    const k = j.company.toLowerCase();
    if (!companies.has(k)) companies.set(k, { id: companies.size + 1, name: j.company, jobs: [] });
    companies.get(k).jobs.push(j);
  }

  // 4. Company details (founding year, website, size, LinkedIn) from Wikidata, a few lookups at a time.
  //    Companies we can't find stay "waiting for details" and their jobs aren't posted.
  const list4 = [...companies.values()];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < list4.length) {
      const c = list4[next++];
      try { c.details = await withTimeout(LIB.lookupCompany(c.name), 15000); } catch { c.details = null; }
      // Indian companies on our list: use the details we keep for them where Wikidata has none
      const ours = [...LIB.INDIAN_COMPANIES.map(x => ({ ...x, hq_country: 'India' })), ...LIB.CAREERS_COMPANIES].find(x => x.name.toLowerCase() === c.name.toLowerCase());
      if (ours) c.details = { employee_count: null, linkedin_url: null, description: null, from_team: !c.details, ...(c.details || {}),
        founded_year: c.details?.founded_year || ours.founded_year, website: c.details?.website || ours.website, hq_country: c.details?.hq_country || ours.hq_country, hq_city: ours.hq_city };
    }
  }));

  // 5. One score per company (same formula as the server where the data exists), shown everywhere
  const year = new Date().getFullYear();
  for (const c of companies.values()) {
    const n = c.jobs.length, boards = new Set(c.jobs.flatMap(j => [...j.boards])), d = c.details;
    const signals = [];
    const add = (impact, label, detail = '') => signals.push({ impact, label, detail });
    if (d) {
      const age = year - d.founded_year;
      if (age >= 5) add(+12, `Founded ${d.founded_year}`, `${age} years in business`);
      else if (age >= 2) add(+6, `Founded ${d.founded_year}`, `${age} years in business`);
      else add(-5, `Very young company (founded ${d.founded_year})`, 'Not a red flag alone, but check carefully');
      if (d.employee_count >= 50) add(+8, `${d.employee_count}+ employees`);
      else if (d.employee_count >= 10) add(+4, `${d.employee_count} employees`);
      else if (d.employee_count) add(0, `Small team (${d.employee_count})`);
      // Details from our own company list don't record LinkedIn pages, so a missing one only counts against Wikidata records
      if (d.linkedin_url) add(+5, 'Has LinkedIn company page'); else if (!d.from_team) add(-5, 'No LinkedIn company page');
      add(0, `Website: ${LIB.hostOf(d.website) || d.website}`, 'Website age is checked on the full Parakh site');
    }
    if (n > 25) add(+2, `${n} open remote roles right now`, 'Very high volume — check the roles are real');
    else add(+6, `Actively hiring: ${n} open remote role${n === 1 ? '' : 's'} right now`);
    if (boards.size >= 2) add(+5, `Listed on ${boards.size} job websites`, [...boards].join(', '));
    const monthly = {};
    for (const j of c.jobs) if (j.posted_at) monthly[j.posted_at.slice(0, 7)] = (monthly[j.posted_at.slice(0, 7)] || 0) + 1;
    c.stats = {
      posted30: c.jobs.filter(j => j.posted_at && daysAgo(j.posted_at) <= 30).length,
      posted90: c.jobs.filter(j => j.posted_at && daysAgo(j.posted_at) <= 90).length,
      open: n, closed: '–', avgDaysOpen: null, reports: {},
      monthly: Object.entries(monthly).sort().slice(-12).map(([month, k]) => ({ month, n: k })),
    };
    const score = Math.max(0, Math.min(100, 40 + signals.reduce((s, x) => s + x.impact, 0)));
    c.report = { score, level: level(score), signals, stats: c.stats };
    c.record = d
      ? { id: c.id, name: c.name, website: d.website, linkedin_url: d.linkedin_url, founded_year: d.founded_year, employee_count: d.employee_count,
          hq_country: d.hq_country, hq_city: d.hq_city || null, description: d.description, info_source: d.from_team ? 'team' : 'wikidata', wikidata_id: d.wikidata_id }
      : { id: c.id, name: c.name, feed: true, website: null, linkedin_url: null, founded_year: null, employee_count: null, hq_country: null,
          description: `Hiring on ${[...boards].join(', ')}.` };
    c.missing = d ? [] : ['founding year', 'website'];
  }

  // 6. Each job: pass/fail checks on the post itself, then the listing rules
  //    (scam-like post → removed; company without details → waiting; company under 50 → removed)
  const lockedOf = r => ({ score: r.score, level: r.level, locked: true, signals: r.signals.slice(0, 2), hidden_signals: Math.max(0, r.signals.length - 2), stats: {} });
  const list = [], blocked = [];
  let pending = 0;
  for (const j of jobs) {
    const c = companies.get(j.company.toLowerCase());
    const host = LIB.hostOf(j.apply_url);
    // The same job post checks the server runs (scam signs, apply link, apply page owner, description detail)
    const jobCheck = LIB.checkJob({ name: c.name, website: c.record.website || '' }, { title: j.title, description: j.description || '', apply_url: j.apply_url });
    const status = !jobCheck.ok ? 'failed' : c.missing.length ? 'pending' : c.report.score < MIN_SCORE ? 'failed' : 'listed';
    const segment = j.kind === 'internship' || LIB.isInternship(j) ? 'basic' : LIB.classifySegment(j.title, j.category);
    const job = { id: j.id, company_id: c.id, title: j.title, segment, category: j.category || null, description: j.description || '',
      salary_min: j.salary_min || null, salary_max: j.salary_max || null, location: j.location || 'Worldwide', source: [...j.boards].join(', '),
      ...(j.kind === 'internship' || LIB.isInternship(j) ? { kind: 'internship', audience: j.audience || LIB.audienceOf(`${j.title} ${j.description || ''}`) } : { kind: 'job' }),
      salary_currency: j.salary_currency || 'USD', pay_period: j.pay_period || 'year', deadline: j.deadline || null, unpaid: j.unpaid ? 1 : 0, workplace: j.kind === 'internship' || LIB.isInternship(j) ? (j.workplace || LIB.workplaceOf(j)) : 'remote',
      tags: (j.tags || []).join(','), posted_at: j.posted_at || new Date().toISOString(), apply_host: host };
    DATA.job[j.id] = { job, company: c.record, segment: SEG_INFO[segment], unlocked: c.report, locked: lockedOf(c.report), job_check: jobCheck, status };
    DATA.applyUrl[j.id] = j.apply_url;
    if (status === 'failed') {
      const why = [...jobCheck.problems.filter(p => p.level === 'bad').map(p => p.label),
        ...(c.report.score < MIN_SCORE ? c.report.signals.filter(x => x.impact < 0).map(x => x.label) : [])].slice(0, 4);
      DATA.job[j.id].removed = `"${j.title}" was removed because it failed our background check`
        + (c.report.score < MIN_SCORE ? ` (the company scored ${c.report.score}/100; we only post companies scoring ${MIN_SCORE} or more)` : '')
        + `.${why.length ? ` Reasons: ${why.join('; ')}.` : ''}`;
      blocked.push({ title: j.title, company: c.name, why: why.join(' · ') });
      continue;
    }
    if (status === 'pending') {
      DATA.job[j.id].pending = `"${j.title}" isn't posted yet. We couldn't find ${c.name}'s founding year or website, so we can't run a full background check. We only post jobs from companies we have proper details for.`;
      pending++;
      continue;
    }
    list.push({ ...job, company_name: c.name, founded_year: c.record.founded_year, hq_country: c.record.hq_country, hq_city: c.record.hq_city || null,
      snippet: job.description.slice(0, 180), trust_score: c.report.score, trust_level: c.report.level });
  }
  for (const c of companies.values())
    DATA.company[c.id] = { company: c.record, missing: c.missing, unlocked: c.report, locked: lockedOf(c.report),
      jobs: c.jobs.map(j => ({ id: j.id, title: j.title, segment: DATA.job[j.id].job.segment, status: 'open', posted_at: DATA.job[j.id].job.posted_at,
        removed: DATA.job[j.id].status === 'failed', pending: DATA.job[j.id].status === 'pending' })) };
  DATA.list = { jobs: list, categories: [...new Set(list.map(j => j.category).filter(Boolean))].sort(), hidden_risky: blocked.length, pending,
    blocked: blocked.slice(0, 10), min_score: MIN_SCORE, companies: new Set(list.map(j => j.company_id)).size, last_refresh: new Date().toISOString() };
})();
