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
    ['Lumen Support Co (sample)', 'https://lumensupport.example', 'https://www.linkedin.com/company/lumen-support-example', 2014, 900, 'Philippines', 'Outsourced customer support and virtual assistant team for US and European brands.', '2013-05-02', 1],
    ['Harbor Health Billing (sample)', 'https://harborhealth.example', 'https://www.linkedin.com/company/harbor-health-example', 2010, 300, 'USA', 'Medical coding and billing for US clinics, with a remote team in Asia.', '2009-11-20', 0],
    ['Pixel & Pine Studio (sample)', 'https://pixelpine.example', 'https://www.linkedin.com/company/pixel-pine-example', 2016, 45, 'Canada', 'Design, video and social media studio working with creators and small brands.', '2015-09-14', 0],
    ['Ledgerly Books (sample)', 'https://ledgerly.example', 'https://www.linkedin.com/company/ledgerly-example', 2013, 120, 'Australia', 'Bookkeeping and payroll for small businesses in Australia, the UK and the US.', '2012-03-08', 1],
    ['Polyglot Labs (sample)', 'https://polyglotlabs.example', 'https://www.linkedin.com/company/polyglot-labs-example', 2011, 600, 'Ireland', 'Translation, transcription and AI training data, with linguists in 70 countries.', '2010-06-17', 0],
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
    // Every kind of remote work, not only engineering
    [ids[3], 'Customer Support Agent (Chat)', 'Customer Service', 'Answer customer chats for a US online store. Good written English, 40 hrs/week, US hours. Training provided, paid monthly by Wise.', 7000, 10000, 'Worldwide', 'https://apply.workable.com/example/j/101', 'support,chat,english', 1],
    [ids[3], 'Virtual Assistant', 'Admin', 'Manage email, calendars and travel bookings for two US founders. Organised, reliable, comfortable with Google Workspace.', 6000, 9000, 'APAC, India', 'https://apply.workable.com/example/j/102', 'virtual assistant,google workspace,calendar', 4],
    [ids[3], 'Sales Development Representative', 'Sales', 'Book meetings for our account executives by email and LinkedIn. Base pay plus commission.', 12000, 20000, 'Worldwide', 'https://apply.workable.com/example/j/103', 'sales,outreach,crm', 8],
    [ids[4], 'Medical Coder (CPC)', 'Healthcare', 'Code outpatient visits with ICD-10 and CPT. CPC or CCS certificate required. Remote, India shift available.', 10000, 16000, 'India', 'https://jobs.lever.co/example/201', 'medical coding,icd-10,cpt', 6],
    [ids[4], 'Nurse Case Reviewer', 'Healthcare', 'Registered nurse to review patient case files against insurance guidelines. BSc Nursing and 2 years clinical experience.', 14000, 22000, 'Worldwide', 'https://jobs.lever.co/example/202', 'nursing,healthcare,review', 12],
    [ids[5], 'Graphic Designer', 'Design', 'Design social posts, thumbnails and brand kits in Figma and Canva. Send a portfolio.', 9000, 15000, 'Worldwide', 'https://jobs.ashbyhq.com/example/301', 'design,figma,canva', 3],
    [ids[5], 'Video Editor (YouTube)', 'Video', 'Edit long-form YouTube videos and Shorts in Premiere Pro. Paid per video, steady weekly work.', 8000, 14000, 'Anywhere', 'https://jobs.ashbyhq.com/example/302', 'video editing,premiere pro,youtube', 7],
    [ids[5], 'Social Media Manager', 'Marketing', 'Plan and post content for five creator brands on Instagram, LinkedIn and X. Report monthly results.', 10000, 16000, 'Worldwide', 'https://jobs.ashbyhq.com/example/303', 'social media,instagram,content', 15],
    [ids[6], 'Bookkeeper (Xero)', 'Finance', 'Reconcile accounts and prepare monthly reports for small businesses in Xero. Xero certification is a plus.', 9000, 14000, 'APAC, India', 'https://boards.greenhouse.io/example/jobs/401', 'bookkeeping,xero,accounting', 5],
    [ids[6], 'Payroll Specialist', 'Finance', 'Run fortnightly payroll for Australian clients. Attention to detail, Excel skills.', 10000, 15000, 'APAC', 'https://boards.greenhouse.io/example/jobs/402', 'payroll,excel', 18],
    [ids[6], 'Senior Accountant', 'Finance', 'Lead month-end close for a portfolio of clients. CA, ACCA or CPA preferred.', 25000, 35000, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/403', 'accounting,ca,acca', 9],
    [ids[7], 'Translator (Hindi–English)', 'Translation', 'Translate websites and app text between Hindi and English. Paid per word, flexible hours.', 6000, 12000, 'India', 'https://www.linkedin.com/jobs/view/501', 'translation,hindi,english', 2],
    [ids[7], 'AI Data Annotator', 'AI Training', 'Label text and images to train AI models. No coding needed. Part-time, choose your hours, paid weekly.', 4000, 8000, 'Worldwide', 'https://www.linkedin.com/jobs/view/502', 'annotation,ai training,part-time', 1],
    [ids[7], 'Transcriptionist (Indian English)', 'Transcription', 'Transcribe recorded interviews and meetings. Fast typing and good listening. Paid per audio hour.', 3000, 7000, 'India', 'https://www.linkedin.com/jobs/view/503', 'transcription,typing', 6],
    [ids[7], 'Content Moderator', 'Trust & Safety', 'Review user posts against community guidelines for a social app. Night and weekend shifts available.', 5000, 8000, 'Asia', 'https://www.linkedin.com/jobs/view/504', 'moderation,trust and safety', 11],
    [ids[0], 'HR Recruiter', 'Human Resources', 'Source and screen candidates for engineering and support roles. 2+ years recruiting experience.', 14000, 22000, 'Worldwide', 'https://jobs.lever.co/example/4', 'recruiting,hr,sourcing', 13],
    [ids[0], 'Data Scientist', 'Data', 'Build forecasting models for customer usage. Python, SQL and statistics.', 55000, 80000, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/5', 'python,sql,statistics', 21],
    [ids[1], 'Online Science Teacher', 'Teaching', 'Teach middle school science to small online classes. B.Ed or teaching experience preferred.', 7000, 12000, 'Worldwide', 'https://www.linkedin.com/jobs/view/124', 'teaching,science,part-time', 16],
    // Remote management roles
    [ids[0], 'Engineering Manager (Remote)', 'Management', 'Lead a fully remote team of 6 backend engineers across India and Europe. Hiring, 1:1s, delivery planning. 2+ years managing engineers.', 70000, 100000, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/6', 'management,engineering,remote team', 2],
    [ids[0], 'Product Manager, Billing', 'Management', 'Own the billing product end to end: research, roadmap and launches. Work remotely with design and engineering.', 60000, 85000, 'APAC, India', 'https://boards.greenhouse.io/example/jobs/7', 'product management,roadmap,saas', 6],
    [ids[0], 'HR Manager (Remote)', 'Management', 'Run people operations for a remote team in 30 countries: onboarding, policies, performance reviews and contractor payroll partners.', 30000, 45000, 'Worldwide', 'https://jobs.lever.co/example/8', 'hr,people operations,management', 9],
    [ids[3], 'Customer Success Manager', 'Management', 'Look after 40 mid-size accounts: onboarding, renewals and check-in calls. Remote, US hours.', 20000, 30000, 'Worldwide', 'https://apply.workable.com/example/j/104', 'customer success,account management,renewals', 3],
    [ids[3], 'Support Team Supervisor', 'Management', 'Supervise a remote team of 12 chat and email agents: schedules, quality checks and coaching.', 14000, 20000, 'APAC, India', 'https://apply.workable.com/example/j/105', 'team management,support,quality', 5],
    [ids[3], 'Operations Manager', 'Management', 'Run day-to-day operations for our remote support centre: staffing forecasts, reporting and client SLAs.', 22000, 32000, 'Worldwide', 'https://apply.workable.com/example/j/106', 'operations,management,reporting', 10],
    [ids[5], 'Marketing Manager', 'Management', 'Plan campaigns for our studio and three client brands. Manage two freelancers. Fully remote.', 18000, 28000, 'Anywhere', 'https://jobs.ashbyhq.com/example/304', 'marketing,campaigns,management', 4],
    [ids[6], 'Finance Manager', 'Management', 'Own budgeting, cash flow and month-end reporting for 15 client businesses. CA or ACCA required. Remote.', 30000, 42000, 'APAC, India', 'https://boards.greenhouse.io/example/jobs/404', 'finance,budgeting,ca', 7],
    [ids[6], 'Director of Operations', 'Management', 'Lead our remote bookkeeping operations team of 40 across four countries. 8+ years, 3+ managing managers.', 55000, 75000, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/405', 'operations,leadership,director', 14],
    [ids[7], 'Localization Project Manager', 'Management', 'Run translation projects end to end: quotes, linguist teams, deadlines and quality checks. Fully remote.', 18000, 26000, 'India', 'https://www.linkedin.com/jobs/view/505', 'project management,localization,vendors', 3],
    [ids[7], 'Program Manager, AI Data', 'Management', 'Manage large AI training-data programs with 500+ remote annotators. Plan capacity, quality and client reporting.', 40000, 60000, 'Worldwide', 'https://www.linkedin.com/jobs/view/506', 'program management,ai data,operations', 8],
    [ids[4], 'Revenue Cycle Manager', 'Management', 'Lead remote medical billing and coding teams for US clinics. Improve claim approval rates. 5+ years US healthcare RCM.', 28000, 40000, 'India', 'https://jobs.lever.co/example/203', 'rcm,medical billing,management', 12],
    [ids[1], 'Community Manager', 'Management', 'Grow and moderate our online community of 20,000 tutors. Run events and newsletters. Remote, flexible hours.', 12000, 18000, 'Worldwide', 'https://www.linkedin.com/jobs/view/125', 'community,events,moderation', 6],
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
  for (const [i, t, p, c] of [[3, 'Customer Support Agent (Email)', 90, 60], [3, 'Executive Assistant', 160, 130], [4, 'Medical Billing Specialist', 110, 80],
    [5, 'Motion Designer', 140, 100], [6, 'Accounts Payable Clerk', 70, 45], [7, 'Tamil–English Translator', 100, 70], [7, 'Speech Data Collector', 200, 175]])
    hist.run(ids[i], t, classifySegment(t), null, 'https://www.linkedin.com/jobs/view/900', `-${p} days`, `-${c} days`);
  console.log('Seeded sample data');
}

module.exports = seed;
