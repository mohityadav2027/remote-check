# RemoteCheck – verified international remote jobs for India

Job seekers create a profile, upload a resume and browse remote jobs from international companies that **accept candidates from India**.
Every company gets a **background check** before anyone applies. Applying happens on the **original site** (LinkedIn, Greenhouse, Lever, company careers page). RemoteCheck checks the job, records the application and sends the user to that site.

## Run it
```bash
# Needs Node.js 22.5 or newer
npm install
cp .env.example .env      # set ADMIN_EMAIL, SESSION_SECRET, Razorpay keys
npm start                 # http://localhost:3000
```
Sign up with the `ADMIN_EMAIL` address to get the **Admin** page. There you can add companies and jobs by hand, or click **Run import** to pull real jobs.

## What the background check looks at (`lib/verify.js`)
| Check | Why it matters |
|---|---|
| Founding year, employee count, LinkedIn page | Real companies have a history and a public presence |
| Website domain age (RDAP/WHOIS lookup) | Scam sites are usually only weeks or months old |
| Jobs posted in the last 30/90/365 days, per-month chart | Shows how actively the company is hiring |
| Openings closed or filled, average days a job stays open | Shows whether the company actually recruits |
| Same job reposted 3+ times, jobs open 60+ days | Signs of "ghost jobs" |
| Member reports: hired, interview, no response, scam | Feedback from people who applied |
| Job text: fees, WhatsApp/Telegram, "earn $X per day", gmail addresses, crypto | Classic scam patterns |
| Where the apply link goes | Must be a known job board or the company's own domain |

The score runs from 0 to 100: **Verified** is 70 or more, **Check carefully** is 45–69, **Risky** is below 45. Risky jobs are hidden from the job list.

## Pricing (`lib/pricing.js`)
| Plan | USD / 30 days | Covers |
|---|---|---|
| Starter | $2 | Entry-level and non-tech roles (support, data entry, tutoring, writing) |
| Professional | $3 | + developer, design, marketing, sales, finance roles |
| Senior / Specialist | $4 | + senior, lead, manager, AI/ML, DevOps, security roles |

Prices are converted to INR using the live USD→INR rate. If that rate can't be fetched, `FALLBACK_USD_INR` is used. Each job is put into a segment automatically from its title. A higher plan also unlocks the lower ones.

Payments go through **Razorpay** (UPI, cards, netbanking). If no Razorpay keys are set, the app runs in **DEMO mode** and payments are simulated. Demo payments are refused when `NODE_ENV=production`.

## Job sources (`lib/importer.js`)
Free public APIs: **Remotive** and **Himalayas**. Only jobs marked Worldwide, Anywhere, India, Asia or APAC are imported.
LinkedIn has no public jobs API and does not allow scraping. To list a LinkedIn job, add it from the Admin page with its LinkedIn URL as the apply link.

## Before going live
- Set a strong `SESSION_SECRET` and `NODE_ENV=production`, and serve over HTTPS.
- Sessions are kept in memory, so everyone is logged out on restart. Use a persistent session store (for example `connect-sqlite3`) for real users.
- Back up the `data/` folder (database + resumes), which hold personal data.
- Add a privacy policy and terms of service. You store resumes, so India's DPDP Act 2023 applies.

## Deploy (get a public link)
**Render** (uses `render.yaml`): push this folder to GitHub → render.com → **New → Blueprint** → pick the repo → enter `ADMIN_EMAIL` (and Razorpay keys) → Deploy. Your link will be `https://remotecheck-xxxx.onrender.com`. The 1 GB disk at `/app/data` keeps the database and resumes.

**Railway**: New Project → Deploy from GitHub repo (it uses the `Dockerfile`) → add a Volume mounted at `/app/data` → set `SESSION_SECRET`, `ADMIN_EMAIL`, `NODE_ENV=production`, `AUTO_IMPORT=true` → Settings → Networking → Generate Domain.

In production the sample companies are not loaded; with `AUTO_IMPORT=true` real jobs are imported at startup and every 6 hours.
