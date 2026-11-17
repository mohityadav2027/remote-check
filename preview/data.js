// Builds data.json for the GitHub Pages site: fetches every job site and careers page, looks up company details,
// runs every check, and saves the result, so visitors see jobs and internships at once instead of waiting
// for their browser to do all this. Runs every 10 hours on GitHub (.github/workflows/refresh-jobs.yml).
//   node preview/data.js [out/data.json]
// It runs live.js (the same code the page uses) in Node, where the job sites can be read without browser limits.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeLib } = require('./build');
const { priceList } = require('../lib/pricing');

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'data.json'));
  const prices = await priceList();
  const code = `const DATA = { pricing: ${JSON.stringify({ ...prices, payments: 'demo' })} };\n${makeLib({ browser: false })}\n`
    + `${fs.readFileSync(path.join(__dirname, 'live.js'), 'utf8')}\nmodule.exports = { READY, DATA };\n`;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parakh-')), 'live-node.js');
  fs.writeFileSync(tmp, code);
  const { READY, DATA } = require(tmp);
  await READY;

  const { list, job, company, applyUrl, sources } = DATA;
  const interns = list.jobs.filter(j => j.kind === 'internship').length;
  console.log(`${list.jobs.length} posted (${interns} internships), ${list.pending} waiting for company details, ${list.hidden_risky} failed checks`);
  for (const s of sources) console.log(`  ${s.ok ? 'ok ' : 'ERR'} ${s.label}: ${s.open}`);
  // Never replace good data with an empty list (e.g. every job site was down)
  if (!list.jobs.length) { console.error('No jobs found; data.json not written'); process.exit(1); }
  // Listings that aren't posted only need their "why not" message, not the full description
  for (const d of Object.values(job)) if (d.status !== 'listed') d.job = { ...d.job, description: '' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), list: { ...list, import_hours: 10 }, job, company, applyUrl, sources }));
  console.log('wrote', out, Math.round(fs.statSync(out).size / 1024), 'KB');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
