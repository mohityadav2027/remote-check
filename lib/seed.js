// Sample data so the site isn't empty on first run. All companies here are FICTIONAL examples.
// Use the Admin page or `npm run import` for real jobs.
const db = require('./db');
const { classifySegment } = require('./pricing');

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM companies').get().n > 0) return;
  const companies = [
    ['Northwind Cloud (sample)', 'https://example.com', 'https://www.linkedin.com/company/example', 2012, 420, 'USA', 'B2B cloud software company with a fully remote team across 30 countries.', '1995-08-14', 1],
    ['Brightpath Learning (sample)', 'https://example.org', 'https://www.linkedin.com/company/example-org', 2017, 85, 'UK', 'Online tutoring marketplace hiring remote tutors and support staff worldwide.', '1995-08-31', 0],
    ['QuickEarn Global (sample)', 'https://quickearn-jobs.example', null, 2025, 3, null, 'Work from home tasks, earn daily.', '2026-07-01', 0],
  ];
  const insC = db.prepare(`INSERT INTO companies (name, website, linkedin_url, founded_year, employee_count, hq_country, description, domain_created, domain_checked_at, verified_by_admin)
                           VALUES (?,?,?,?,?,?,?,?,datetime('now'),?)`);
  const ids = companies.map(c => insC.run(...c).lastInsertRowid);

  const jobs = [
    [ids[0], 'Senior Backend Engineer (Node.js)', 'Software Development', 'Build APIs for our cloud platform. 5+ years Node.js, PostgreSQL, AWS. Fully remote, open to candidates in India (IST overlap 4h).', 60000, 90000, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/1', 'node,postgresql,aws', 3],
    [ids[0], 'Customer Support Specialist', 'Customer Service', 'Help customers over chat and email. Excellent written English. Night shift for US hours, remote from India.', 9000, 14000, 'APAC, India', 'https://jobs.lever.co/example/2', 'support,english,zendesk', 10],
    [ids[0], 'UI/UX Designer', 'Design', 'Design dashboards in Figma. Portfolio required.', 30000, 50000, 'Worldwide', 'https://jobs.lever.co/example/3', 'figma,ux', 40],
    [ids[1], 'Online English Tutor (part-time)', 'Teaching', 'Teach English to students online, 10–20 hrs/week, flexible hours. Paid hourly via Payoneer/Wise.', 6000, 12000, 'Worldwide', 'https://www.linkedin.com/jobs/view/123', 'teaching,english,part-time', 5],
    [ids[1], 'Content Writer', 'Writing', 'Write educational blog posts. Part-time, paid per article.', 5000, 10000, 'Anywhere', 'https://www.linkedin.com/jobs/view/456', 'writing,seo', 20],
    [ids[2], 'Data Entry - Earn $300 per day', 'Data Entry', 'No interview needed! Earn $300 per day. Pay a small refundable registration fee and contact us on WhatsApp. Email quickearn.hr@gmail.com', 100000, 120000, 'Anywhere', 'https://quickearn-jobs.example/apply', 'data entry', 2],
  ];
  const insJ = db.prepare(`INSERT INTO jobs (company_id, title, segment, category, description, salary_min, salary_max, location, apply_url, tags, posted_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`);
  for (const [cid, title, cat, desc, smin, smax, loc, url, tags, daysAgo] of jobs)
    insJ.run(cid, title, classifySegment(title, cat), cat, desc, smin, smax, loc, url, tags, `-${daysAgo} days`);

  // Some history so "hiring activity" has data: past jobs that were filled.
  const hist = db.prepare(`INSERT INTO jobs (company_id, title, segment, category, apply_url, posted_at, status, closed_at)
                           VALUES (?,?,?,?,?, datetime('now', ?), 'closed', datetime('now', ?))`);
  [['Frontend Engineer', 120, 90], ['DevOps Engineer', 200, 160], ['Support Lead', 300, 270], ['QA Engineer', 75, 50]]
    .forEach(([t, p, c]) => hist.run(ids[0], t, classifySegment(t), 'Software Development', 'https://jobs.lever.co/example/x', `-${p} days`, `-${c} days`));
  hist.run(ids[1], 'Math Tutor', 'basic', 'Teaching', 'https://www.linkedin.com/jobs/view/789', '-150 days', '-120 days');
  console.log('Seeded sample data');
}

module.exports = seed;
