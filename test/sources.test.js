// Run: npm test
// Each source gets a sample response in the format that site publishes, so the parsers are tested without network access.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remotecheck-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');

const FIXTURES = {
  'remotive.com': { jobs: [
    { id: 1, url: 'https://remotive.com/remote-jobs/software-dev/backend-1', title: 'Backend Engineer', company_name: 'Acme', category: 'Software Development',
      tags: ['node'], candidate_required_location: 'Worldwide', publication_date: '2026-10-20T10:00:00', description: '<p>Build &amp; ship APIs</p>' },
    { id: 2, url: 'https://remotive.com/remote-jobs/x/2', title: 'Sales Rep', company_name: 'USOnly Inc', category: 'Sales',
      tags: [], candidate_required_location: 'USA Only', publication_date: '2026-10-20T10:00:00', description: 'US only' },
  ] },
  'himalayas.app': { jobs: [
    { guid: 'h1', title: 'Customer Support Agent', companyName: 'Helpdesk Co', categories: ['Customer Support'], description: 'Help users',
      minSalary: 12000, maxSalary: 18000, locationRestrictions: ['India', 'Philippines'], applicationLink: 'https://himalayas.app/companies/helpdesk/jobs/1', pubDate: 1792000000 },
  ] },
  'remoteok.com': [
    { legal: 'API terms: link back to Remote OK' },
    { id: '99', position: 'Senior DevOps Engineer', company: 'CloudCo', tags: ['devops', 'aws'], description: '<b>Kubernetes</b>', location: 'Worldwide',
      salary_min: 90000, salary_max: 120000, url: 'https://remoteok.com/remote-jobs/99', date: '2026-10-21T00:00:00+00:00' },
    { id: '100', position: 'Designer', company: 'EUCo', tags: [], description: '', location: 'Europe', url: 'https://remoteok.com/remote-jobs/100', date: '2026-10-21T00:00:00+00:00' },
  ],
  'jobicy.com': { jobs: [
    { id: 7, url: 'https://jobicy.com/jobs/7-content-writer', jobTitle: 'Content Writer', companyName: 'WriteWell', jobIndustry: ['Copywriting'],
      jobType: ['part-time'], jobGeo: 'APAC', jobExcerpt: 'Write blogs', jobDescription: '<p>Write blogs</p>', pubDate: '2026-10-22 09:00:00',
      annualSalaryMin: '20000', annualSalaryMax: '30000', salaryCurrency: 'USD' },
  ] },
  'www.workingnomads.com': [
    { url: 'https://www.workingnomads.com/jobs/qa-tester', title: 'QA Tester', description: 'Test apps', company_name: 'TestLab',
      category_name: 'Development', tags: 'qa,testing', location: 'Anywhere', pub_date: '2026-10-23T08:00:00-04:00' },
  ],
  'weworkremotely.com': `<?xml version="1.0"?><rss><channel>
    <item><title>Globex: Virtual Assistant</title><region>Anywhere in the World</region><category>Customer Support</category>
      <description>&lt;p&gt;Manage calendars&lt;/p&gt;</description><pubDate>Thu, 24 Oct 2026 10:00:00 +0000</pubDate>
      <link>https://weworkremotely.com/remote-jobs/globex-virtual-assistant</link></item>
    <item><title>Initech: Accountant</title><region>USA Only</region><category>Finance</category><description>CPA</description>
      <pubDate>Thu, 24 Oct 2026 10:00:00 +0000</pubDate><link>https://weworkremotely.com/remote-jobs/initech-accountant</link></item>
  </channel></rss>`,
  'boards-api.greenhouse.io': { jobs: [
    { id: 501, title: 'Frontend Engineer', absolute_url: 'https://boards.greenhouse.io/gitlab/jobs/501', location: { name: 'Remote, APAC' },
      updated_at: '2026-10-25T00:00:00Z', first_published: '2026-10-25T00:00:00Z', content: '&lt;p&gt;Vue.js&lt;/p&gt;', departments: [{ name: 'Engineering' }] },
    { id: 502, title: 'Account Executive', absolute_url: 'https://boards.greenhouse.io/gitlab/jobs/502', location: { name: 'Remote, US' },
      updated_at: '2026-10-25T00:00:00Z', content: '', departments: [] },
    { id: 503, title: 'Office Manager', absolute_url: 'https://boards.greenhouse.io/gitlab/jobs/503', location: { name: 'Bengaluru, India' },
      updated_at: '2026-10-25T00:00:00Z', content: 'Work from our Bengaluru office', departments: [] },
  ] },
  'api.lever.co': [
    { id: 'abc', text: 'Data Analyst', hostedUrl: 'https://jobs.lever.co/acme/abc', categories: { location: 'India', team: 'Data', commitment: 'Full-time' },
      workplaceType: 'remote', descriptionPlain: 'SQL and dashboards', createdAt: 1792500000000 },
    { id: 'def', text: 'Operations Manager', hostedUrl: 'https://jobs.lever.co/acme/def', categories: { location: 'Mumbai, India', team: 'Ops' },
      workplaceType: 'onsite', descriptionPlain: 'Office role', createdAt: 1792500000000 },
  ],
  'api.ashbyhq.com': { jobs: [
    { id: 'z1', title: 'Support Engineer', department: 'Support', location: 'Remote', isRemote: true, isListed: true,
      jobUrl: 'https://jobs.ashbyhq.com/ramp/z1', descriptionPlain: 'Help customers', publishedAt: '2026-10-26T00:00:00Z', employmentType: 'FullTime' },
  ] },
};

global.fetch = async url => {
  const host = new URL(url).hostname;
  if (!(host in FIXTURES)) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
  const body = FIXTURES[host];
  return { ok: true, status: 200, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
};

const { BOARDS, ats, indiaEligible, parseCareersUrl } = require('../lib/sources');
const db = require('../lib/db');
const { runImport } = require('../lib/importer');

test('every job board parses into the common shape', async () => {
  for (const b of BOARDS) {
    const jobs = await b.fetch();
    assert.ok(jobs.length > 0, `${b.key} returned no jobs`);
    for (const j of jobs) {
      assert.ok(j.company && j.title && j.apply_url && j.external_id, `${b.key}: missing field in ${JSON.stringify(j)}`);
      assert.ok(!/<[a-z]/i.test(j.description || ''), `${b.key}: HTML left in description`);
      if (j.posted_at) assert.ok(!isNaN(Date.parse(j.posted_at)), `${b.key}: bad date`);
    }
  }
});

test('company career pages (Greenhouse, Lever, Ashby) parse', async () => {
  const gh = await ats.greenhouse.fetch('gitlab', 'GitLab');
  assert.equal(gh[0].description, 'Vue.js');
  assert.equal(gh[0].category, 'Engineering');
  const lv = await ats.lever.fetch('acme', 'Acme');
  assert.equal(lv[0].location, 'India');
  const ab = await ats.ashby.fetch('ramp', 'Ramp');
  assert.equal(ab[0].apply_url, 'https://jobs.ashbyhq.com/ramp/z1');
});

test('only jobs open to India / worldwide / Asia are kept', () => {
  for (const loc of ['Worldwide', 'Anywhere in the World', 'India', 'APAC', 'Remote, APAC', 'Remote', 'Asia'])
    assert.ok(indiaEligible({ location: loc }), loc);
  for (const loc of ['USA Only', 'Europe', 'Remote, US', 'Remote - Canada', ''])
    assert.ok(!indiaEligible({ location: loc }), loc);
});

test('only remote jobs: office jobs on company careers pages are skipped', async () => {
  const gh = await ats.greenhouse.fetch('gitlab', 'GitLab');
  assert.equal(gh.find(j => j.title === 'Frontend Engineer').remote, true);
  assert.equal(gh.find(j => j.title === 'Office Manager').remote, false);
  assert.ok(!indiaEligible(gh.find(j => j.title === 'Office Manager')), 'Bengaluru office job kept');
  const lv = await ats.lever.fetch('acme', 'Acme');
  assert.ok(indiaEligible(lv.find(j => j.title === 'Data Analyst')), 'remote India job dropped');
  assert.ok(!indiaEligible(lv.find(j => j.title === 'Operations Manager')), 'Mumbai onsite job kept');
});

test('careers page links are recognised', () => {
  assert.deepEqual(parseCareersUrl('https://boards.greenhouse.io/gitlab'), { type: 'greenhouse', board: 'gitlab' });
  assert.deepEqual(parseCareersUrl('https://job-boards.greenhouse.io/embed/job_board?for=stripe'), { type: 'greenhouse', board: 'stripe' });
  assert.deepEqual(parseCareersUrl('https://jobs.lever.co/netflix/123'), { type: 'lever', board: 'netflix' });
  assert.deepEqual(parseCareersUrl('https://jobs.ashbyhq.com/ramp'), { type: 'ashby', board: 'ramp' });
  assert.equal(parseCareersUrl('https://www.linkedin.com/company/x'), null);
});

test('import saves India-eligible jobs, skips duplicates, and closes jobs removed from a careers page', async () => {
  db.prepare(`INSERT INTO companies (name, ats_type, ats_board) VALUES ('GitLab', 'greenhouse', 'gitlab')`).run();
  // The same job also listed on a job board must not be counted twice
  FIXTURES['remotive.com'].jobs.push({ id: 3, url: 'https://remotive.com/remote-jobs/x/3', title: 'Frontend Engineer', company_name: 'GitLab',
    category: 'Software Development', tags: [], candidate_required_location: 'Worldwide', publication_date: new Date().toISOString(), description: 'dup' });

  const first = await runImport();
  const titles = db.prepare(`SELECT title FROM jobs ORDER BY title`).all().map(r => r.title);
  assert.ok(titles.includes('Backend Engineer') && titles.includes('Virtual Assistant') && titles.includes('Senior DevOps Engineer'));
  assert.ok(!titles.includes('Sales Rep') && !titles.includes('Accountant') && !titles.includes('Account Executive'), 'non-India jobs were imported');
  assert.ok(!titles.includes('Office Manager'), 'office (non-remote) job was imported');
  assert.equal(titles.filter(t => t === 'Frontend Engineer').length, 1, 'duplicate across sources');
  assert.equal(first['greenhouse:gitlab'].added, 1, 'careers page job saved');
  assert.equal(first.remotive.duplicate, 1, 'job-board copy of the same job skipped');

  // Re-running adds nothing new
  const second = await runImport();
  assert.equal(Object.values(second).reduce((s, r) => s + r.added, 0), 0);

  // The job disappears from GitLab's careers page -> marked closed
  FIXTURES['boards-api.greenhouse.io'].jobs = [];
  await runImport();
  const fe = db.prepare(`SELECT status FROM jobs WHERE external_id = 'greenhouse-gitlab-501'`).get();
  assert.equal(fe.status, 'closed');

  // A source that fails is recorded, not fatal
  delete FIXTURES['jobicy.com'];
  const third = await runImport();
  assert.match(third.jobicy.error, /503/);
  assert.match(db.prepare(`SELECT error FROM source_status WHERE source='jobicy'`).get().error, /503/);
});

test('scam scanner flags common scam messages and passes genuine ones', () => {
  const { textChecks } = require('../lib/verify');
  const scam = 'Hiring for Amazon work-from-home data entry. Earn ₹4,000 per day, no experience needed. Limited seats! Pay ₹1,499 one-time registration fee. Contact HR on Telegram @amazon_jobs_hr or email amazonhiring.india@gmail.com';
  const labels = textChecks(scam).map(h => h.label);
  for (const l of ['Asks you to pay money', 'Recruiter only on WhatsApp or Telegram', 'Personal email address (Gmail, Yahoo…)', 'Pay too good for the work', 'Pressure to act fast'])
    assert.ok(labels.includes(l), `missing: ${l}`);
  assert.ok(labels.some(l => l.startsWith("Uses Amazon's name")), 'brand impersonation not caught');
  assert.equal(textChecks('Remote React developer. Apply at https://boards.greenhouse.io/acme/jobs/1 or write to jobs@acme.com').length, 0);
  assert.equal(textChecks('Amazon is hiring. Apply on https://www.amazon.jobs/en/jobs/123').length, 0, 'real Amazon post flagged');
});

test('every kind of job gets a sensible plan, not just engineering', () => {
  const { classifySegment } = require('../lib/pricing');
  const expected = {
    basic: ['Data Entry Operator', 'AI Data Annotator', 'Virtual Assistant', 'Customer Support Specialist', 'Online English Tutor', 'Transcriptionist', 'Content Moderator', 'Content Writer'],
    pro: ['Social Media Manager', 'Bookkeeper', 'Video Editor', 'Graphic Designer', 'HR Recruiter', 'Translator (Hindi-English)', 'Medical Coder', 'Account Executive', 'Frontend Developer', 'Project Manager',
      'Customer Success Manager', 'Customer Support Manager', 'Support Team Supervisor', 'Operations Manager', 'Marketing Manager', 'Finance Manager', 'HR Manager', 'Community Manager', 'Scrum Master'],
    premium: ['Senior Backend Engineer', 'Machine Learning Engineer', 'Engineering Manager', 'Product Manager', 'Program Manager', 'Head of Marketing', 'Director of Operations', 'VP of Sales', 'Senior Project Manager', 'Data Scientist'],
  };
  for (const [seg, titles] of Object.entries(expected)) for (const t of titles) assert.equal(classifySegment(t), seg, t);
});

test('Indian company registration numbers (CIN / LLPIN) are read and checked', () => {
  const { parseRegistration } = require('../lib/verify');
  const infosys = parseRegistration('L85110KA1981PLC013115');
  assert.equal(infosys.valid, true);
  assert.equal(infosys.listed, true);
  assert.equal(infosys.state, 'Karnataka');
  assert.equal(infosys.year, 1981);
  assert.equal(infosys.type, 'Public limited company');
  assert.equal(parseRegistration('u72900ka2013ptc000101').type, 'Private limited company');
  assert.equal(parseRegistration('AAB-1234').kind, 'llp');
  for (const bad of ['12345', 'U72900ZZ2013PTC000101', 'U72900KA2099PTC000101', 'X72900KA2013PTC000101', 'U72900KA2013ABC000101'])
    assert.equal(parseRegistration(bad).valid, false, bad);
  assert.equal(parseRegistration(''), null);
});

test('company details from Wikidata are accepted only for a clear company match', () => {
  const { detailsFromEntity, norm } = require('../lib/enrich');
  const entity = {
    id: 'Q123', labels: { en: { value: 'Helpwise Inc.' } }, descriptions: { en: { value: 'American software company' } },
    claims: {
      P571: [{ mainsnak: { datavalue: { value: { time: '+2014-03-01T00:00:00Z' } } } }],
      P856: [{ mainsnak: { datavalue: { value: 'https://helpwise.example' } } }],
      P1128: [
        { mainsnak: { datavalue: { value: { amount: '+120' } } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2020-01-01T00:00:00Z' } } }] } },
        { mainsnak: { datavalue: { value: { amount: '+350' } } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2024-01-01T00:00:00Z' } } }] } },
      ],
      P4264: [{ mainsnak: { datavalue: { value: 'helpwise' } } }],
      P17: [{ mainsnak: { datavalue: { value: { id: 'Q30' } } } }],
    },
  };
  const d = detailsFromEntity(entity, 'Helpwise');
  assert.deepEqual([d.founded_year, d.website, d.employee_count, d.linkedin_url, d.hq_country, d.wikidata_id],
    [2014, 'https://helpwise.example', 350, 'https://www.linkedin.com/company/helpwise', 'USA', 'Q123']);
  assert.equal(norm('Acme Pvt. Ltd.'), 'acme');
  assert.equal(detailsFromEntity(entity, 'Helpwise Labs'), null, 'different name accepted');
  assert.equal(detailsFromEntity({ ...entity, descriptions: { en: { value: 'American footballer' } } }, 'Helpwise'), null, 'a person accepted');
  assert.equal(detailsFromEntity({ ...entity, descriptions: { en: { value: '2014 film' } } }, 'Helpwise'), null, 'a film accepted');
  assert.equal(detailsFromEntity({ ...entity, claims: { ...entity.claims, P856: [] } }, 'Helpwise'), null, 'no website accepted');
  assert.equal(detailsFromEntity({ ...entity, claims: { ...entity.claims, P571: [] } }, 'Helpwise'), null, 'no founding date accepted');
});

test('only jobs that pass every check, from companies with proper details, are posted', () => {
  const { checkJob, missingInfo, listingStatus } = require('../lib/verify');
  const good = { title: 'Support Agent', description: 'Help customers by email.', apply_url: 'https://jobs.lever.co/acme/1' };
  const scam = { title: 'Data entry', description: 'Pay a registration fee and message us on WhatsApp', apply_url: 'https://jobs.lever.co/acme/2' };
  const offsite = { title: 'Support Agent', description: 'Help customers.', apply_url: 'https://acme-jobs-apply.example/form' };
  const company = { id: 999999, name: 'Acme', founded_year: 2010, website: 'https://acme.example', linkedin_url: 'x', employee_count: 200, domain_created: '2009-01-01' };
  assert.equal(checkJob(company, good).ok, true);
  assert.equal(checkJob(company, scam).ok, false);
  assert.equal(checkJob(company, offsite).ok, false);
  assert.deepEqual(missingInfo({}), ['founding year', 'website']);
  assert.deepEqual(missingInfo(company), []);
  assert.equal(listingStatus(company, good).status, 'listed');
  assert.equal(listingStatus(company, scam).status, 'failed');
  assert.equal(listingStatus({ ...company, founded_year: null }, good).status, 'pending');
});

test('brand check flags hiring "for" a big brand, not mentions of its tools', () => {
  const { textChecks } = require('../lib/verify');
  const brand = s => textChecks(s, '').some(h => h.label.startsWith('Uses'));
  assert.equal(brand('Comfortable with Google Workspace and Microsoft Excel. Apply at https://apply.workable.com/x'), false);
  assert.equal(brand('Experience with AWS. Apply at https://boards.greenhouse.io/x'), false);
  assert.equal(brand('Work at Google from home! Register at https://google-jobs-now.example'), true);
  assert.equal(brand('Amazon HR team: contact on Telegram. Mail hr.amazon@gmail.com'), true);
});
