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
    ['Meridian Telehealth (sample)', 'https://meridiantelehealth.example', 'https://www.linkedin.com/company/meridian-telehealth-example', 2015, 650, 'USA', 'Online doctor visits for US patients, supported by a remote clinical operations team.', '2014-02-11', 1],
    ['Orbit Commerce (sample)', 'https://orbitcommerce.example', 'https://www.linkedin.com/company/orbit-commerce-example', 2018, 220, 'Singapore', 'Runs online stores for 300 consumer brands across Asia and Australia.', '2017-08-23', 0],
    ['Kite Legal Services (sample)', 'https://kitelegal.example', 'https://www.linkedin.com/company/kite-legal-example', 2012, 150, 'UK', 'Contract review and legal research for UK and US law firms, done by remote lawyers and paralegals.', '2011-10-05', 0],
    ['Cobalt Cyber (sample)', 'https://cobaltcyber.example', 'https://www.linkedin.com/company/cobalt-cyber-example', 2016, 300, 'Netherlands', 'Round-the-clock security monitoring for mid-size companies, run by a fully remote team.', '2015-04-19', 1],
    ['Greenleaf Nonprofit Network (sample)', 'https://greenleafnetwork.example', 'https://www.linkedin.com/company/greenleaf-example', 2009, 60, 'Canada', 'Helps small charities raise funds and run volunteer programs online.', '2008-12-01', 0],
    ['NovaStart Labs (sample)', 'https://novastartlabs.example', 'https://www.linkedin.com/company/novastart-example', 2025, 8, 'USA', 'Early-stage startup building a budgeting app.', '2025-06-20', 0],
    ['Global Remote Hiring Desk (sample)', 'https://remote-hiring-desk.example', null, 2026, 2, null, 'Typing and data jobs, start today.', '2026-09-02', 0],
    // Indian companies (samples). The CINs follow the real format but end in 000xxx, so they don't belong to real companies.
    ['Kaveri Software Labs Pvt Ltd (sample)', 'https://kaverisoftware.example', 'https://www.linkedin.com/company/kaveri-software-example', 2013, 350, 'India', 'Product engineering for US and European SaaS companies, with a remote-first team across India.', '2012-11-04', 1, 'Bengaluru', 'U72900KA2013PTC000101'],
    ['Saffron Edtech Pvt Ltd (sample)', 'https://saffronedtech.example', 'https://www.linkedin.com/company/saffron-edtech-example', 2016, 180, 'India', 'Live online classes for school students in India and the Gulf, taught by remote tutors.', '2015-12-18', 0, 'Pune', 'U80900MH2016PTC000202'],
    ['Ganga Health Analytics Pvt Ltd (sample)', 'https://gangahealth.example', 'https://www.linkedin.com/company/ganga-health-example', 2012, 500, 'India', 'Medical coding, billing and claims analytics for US hospitals, from a remote team in India.', '2011-07-22', 0, 'Hyderabad', 'U85100TG2012PTC000303'],
    ['Lotus Fintech Ltd (sample)', 'https://lotusfintech.example', 'https://www.linkedin.com/company/lotus-fintech-example', 2009, 1200, 'India', 'Listed digital lending and payments company serving small businesses across India.', '2008-05-30', 1, 'Mumbai', 'L67190MH2009PLC000404'],
    ['Neem Digital Marketing LLP (sample)', 'https://neemdigital.example', 'https://www.linkedin.com/company/neem-digital-example', 2019, 40, 'India', 'SEO, content and social media for D2C brands. Fully remote team.', '2018-10-09', 0, 'Jaipur', 'AAQ-0505'],
    ['Bharat Work From Home Pvt Ltd (sample)', 'https://bharat-wfh-jobs.example', null, 2026, 3, 'India', 'Ghar baithe kamaiye. Daily payment.', '2026-08-15', 0, 'Delhi', null],
  ];
  const insC = db.prepare(`INSERT INTO companies (name, website, linkedin_url, founded_year, employee_count, hq_country, description, domain_created, domain_checked_at, verified_by_admin, hq_city, cin)
                           VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`);
  const ids = companies.map(c => insC.run(...c, ...Array(11 - c.length).fill(null)).lastInsertRowid);

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
    // More companies, each with a full background check
    [ids[8], 'Medical Scribe (Remote)', 'Healthcare', 'Write visit notes for US doctors during online appointments. Good English and medical terms. Training provided. Night shift IST.', 6000, 10000, 'India', 'https://boards.greenhouse.io/example/jobs/601', 'medical scribe,healthcare,night shift', 2],
    [ids[8], 'Telehealth Customer Care Agent', 'Customer Service', 'Help patients book online visits and fix login problems by phone and chat. US hours, fully remote.', 6500, 9500, 'Worldwide', 'https://boards.greenhouse.io/example/jobs/602', 'customer care,healthcare,chat', 4],
    [ids[8], 'Clinical Data Analyst', 'Data', 'Build reports on patient visits and outcomes in SQL and Looker. Healthcare data experience preferred.', 25000, 38000, 'APAC, India', 'https://boards.greenhouse.io/example/jobs/603', 'sql,looker,healthcare', 9],
    [ids[9], 'Shopify Store Manager', 'E-commerce', 'Run five Shopify stores: product listings, promotions and order issues. Fully remote, Singapore hours.', 12000, 18000, 'Asia', 'https://apply.workable.com/example/j/701', 'shopify,e-commerce,management', 3],
    [ids[9], 'Catalog Data Specialist', 'E-commerce', 'Keep product catalogs accurate: titles, prices, photos and stock across marketplaces.', 5000, 8000, 'Asia', 'https://apply.workable.com/example/j/702', 'catalog,excel,marketplaces', 6],
    [ids[9], 'Senior Frontend Developer', 'Software Development', 'Build storefront features in React and Next.js. 5+ years frontend experience.', 45000, 65000, 'APAC, India', 'https://apply.workable.com/example/j/703', 'react,nextjs,typescript', 11],
    [ids[9], 'Performance Marketing Manager', 'Marketing', 'Run Google and Meta ad campaigns for our brands. Own budgets and return on ad spend.', 20000, 30000, 'Asia', 'https://apply.workable.com/example/j/704', 'google ads,meta ads,marketing', 15],
    [ids[10], 'Remote Paralegal', 'Legal', 'Draft documents and research case law for UK law firms. Law degree (LLB) required.', 12000, 18000, 'India', 'https://jobs.lever.co/example/801', 'legal research,llb,drafting', 5],
    [ids[10], 'Contract Review Associate', 'Legal', 'Review commercial contracts against checklists and flag risks. LLB and strong English.', 15000, 22000, 'Worldwide', 'https://jobs.lever.co/example/802', 'contracts,legal,review', 8],
    [ids[11], 'SOC Security Analyst', 'Security', 'Watch security alerts and respond to incidents for client companies. Rotating shifts, fully remote.', 30000, 45000, 'APAC, India', 'https://jobs.ashbyhq.com/example/901', 'security,soc,siem', 4],
    [ids[11], 'IT Helpdesk Technician', 'IT', 'Fix laptop, email and access problems for client staff over chat and remote desktop.', 7000, 11000, 'Worldwide', 'https://jobs.ashbyhq.com/example/902', 'it support,helpdesk,windows', 7],
    [ids[11], 'QA Tester', 'Software Development', 'Test our monitoring dashboard before each release. Write clear bug reports.', 12000, 18000, 'Worldwide', 'https://jobs.ashbyhq.com/example/903', 'qa,testing,bug reports', 13],
    [ids[12], 'Grant Writer', 'Writing', 'Write grant applications for small charities. Part-time, paid per application.', 5000, 9000, 'Anywhere', 'https://www.linkedin.com/jobs/view/1001', 'grant writing,nonprofit,part-time', 3],
    [ids[12], 'Volunteer Program Manager', 'Management', 'Run online volunteer programs for 20 charities: recruiting, training and tracking hours.', 14000, 20000, 'Worldwide', 'https://www.linkedin.com/jobs/view/1002', 'volunteers,nonprofit,management', 10],
    [ids[12], 'Fundraising Coordinator', 'Nonprofit', 'Organise online fundraising campaigns and donor emails.', 7000, 11000, 'Worldwide', 'https://www.linkedin.com/jobs/view/1003', 'fundraising,email,nonprofit', 17],
    [ids[13], 'Growth Marketing Associate', 'Marketing', 'Help a small startup grow its app: run experiments on ads, emails and app store pages.', 10000, 16000, 'Worldwide', 'https://apply.workable.com/example/j/1101', 'growth,marketing,startup', 5],
    [ids[14], 'Remote Typing Job – ₹2,500/day', 'Data Entry', 'Urgent hiring! Simple typing work, earn ₹2,500 per day. Pay ₹999 registration fee for ID card. Message HR on Telegram @remote_desk_hr. Email remotedesk.hiring@gmail.com', 30000, 40000, 'India', 'https://remote-hiring-desk.example/apply', 'typing,data entry', 1],
    // Indian companies, remote jobs
    [ids[15], 'Backend Developer (Java, Remote)', 'Software Development', 'Build APIs for client SaaS products in Java and Spring Boot. 3+ years. Work from anywhere in India; core hours 11am–6pm IST.', 18000, 30000, 'India', 'https://jobs.lever.co/example/1201', 'java,spring boot,remote', 2],
    [ids[15], 'QA Automation Engineer', 'Software Development', 'Write and maintain Selenium and Playwright tests. 2+ years. Fully remote within India.', 12000, 20000, 'India', 'https://jobs.lever.co/example/1202', 'qa,selenium,playwright', 6],
    [ids[15], 'Technical Support Engineer (Night shift)', 'Customer Service', 'Solve technical tickets for US customers over email and chat. Night shift allowance. Remote.', 8000, 12000, 'India', 'https://jobs.lever.co/example/1203', 'support,saas,night shift', 9],
    [ids[16], 'Online Maths Tutor (Hindi & English)', 'Teaching', 'Teach maths to classes 6–10 in live online sessions. B.Sc/B.Ed preferred. Choose your hours.', 4000, 8000, 'India', 'https://www.linkedin.com/jobs/view/1301', 'teaching,maths,hindi', 3],
    [ids[16], 'Academic Content Writer', 'Writing', 'Write practice questions and notes for CBSE science. Part-time, remote, paid per chapter.', 3500, 6500, 'India', 'https://www.linkedin.com/jobs/view/1302', 'content writing,cbse,science', 8],
    [ids[16], 'Admissions Counsellor (Remote)', 'Sales', 'Call parents who sign up for a free class and help them pick a course. Fixed pay plus incentives.', 4500, 9000, 'India', 'https://www.linkedin.com/jobs/view/1303', 'counselling,sales,hindi', 12],
    [ids[17], 'Medical Coder (CPC, Remote)', 'Healthcare', 'Code US outpatient charts with ICD-10-CM and CPT. CPC certification required. Work from home.', 7000, 11000, 'India', 'https://boards.greenhouse.io/example/jobs/1401', 'medical coding,cpc,icd-10', 4],
    [ids[17], 'Claims Data Analyst', 'Data', 'Analyse insurance claim denials in SQL and Excel and suggest fixes. Remote.', 10000, 16000, 'India', 'https://boards.greenhouse.io/example/jobs/1402', 'sql,excel,healthcare', 10],
    [ids[18], 'Customer Support Executive (Hindi)', 'Customer Service', 'Help small business owners with loan and payment questions by phone and chat in Hindi and English. Remote.', 4000, 6500, 'India', 'https://apply.workable.com/example/j/1501', 'support,hindi,fintech', 2],
    [ids[18], 'Compliance Analyst (RBI)', 'Finance', 'Track RBI rules and prepare compliance reports. 2+ years in banking or NBFC compliance. Remote.', 12000, 18000, 'India', 'https://apply.workable.com/example/j/1502', 'compliance,rbi,nbfc', 7],
    [ids[18], 'Product Manager, Payments', 'Management', 'Own UPI and card payment flows for our merchant app. 4+ years in product. Remote with monthly meet-ups in Mumbai.', 35000, 50000, 'India', 'https://apply.workable.com/example/j/1503', 'product management,upi,payments', 11],
    [ids[19], 'SEO Specialist', 'Marketing', 'Plan keywords, write briefs and build links for D2C brands. Fully remote.', 5000, 9000, 'India', 'https://jobs.ashbyhq.com/example/1601', 'seo,content,d2c', 5],
    [ids[19], 'Social Media Executive', 'Marketing', 'Create and post daily content for three brands on Instagram and YouTube Shorts. Remote.', 4000, 7000, 'India', 'https://jobs.ashbyhq.com/example/1602', 'social media,instagram,reels', 9],
    [ids[20], 'Ghar Baithe Data Entry – ₹3,000 Daily', 'Data Entry', 'Bharat Work From Home Pvt Ltd hiring! No experience needed, earn ₹3,000 per day. Pay ₹799 registration fee for joining kit. Send Aadhaar and bank details on WhatsApp 98xxxxxx10.', 30000, 40000, 'India', 'https://bharat-wfh-jobs.example/apply', 'data entry,work from home', 1],
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
    [5, 'Motion Designer', 140, 100], [6, 'Accounts Payable Clerk', 70, 45], [7, 'Tamil–English Translator', 100, 70], [7, 'Speech Data Collector', 200, 175],
    [8, 'Medical Scribe', 80, 50], [8, 'Patient Support Agent', 170, 140], [8, 'Clinical Operations Coordinator', 260, 220],
    [9, 'Marketplace Assistant', 95, 70], [9, 'Frontend Developer', 210, 180], [10, 'Legal Researcher', 130, 100],
    [11, 'SOC Analyst', 120, 85], [11, 'IT Support Technician', 240, 205], [12, 'Grant Writer', 300, 260],
    [15, 'Frontend Developer (React)', 100, 70], [15, 'Support Engineer', 190, 160], [16, 'Science Tutor', 80, 55], [16, 'Content Writer', 210, 185],
    [17, 'Medical Coder', 60, 35], [17, 'AR Caller', 150, 120], [18, 'Customer Support Executive', 130, 100], [18, 'Risk Analyst', 250, 210],
    [19, 'Content Writer', 120, 90]])
    hist.run(ids[i], t, classifySegment(t), null, 'https://www.linkedin.com/jobs/view/900', `-${p} days`, `-${c} days`);
  console.log('Seeded sample data');
}

module.exports = seed;
