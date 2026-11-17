// Builds the static GitHub Pages version of the site (no server): one page that shows real jobs and internships.
//   node preview/build.js [outDir]   ->  outDir/index.html (GitHub Pages) and outDir/artifact.html (claude.ai preview)
// The page reads data.json next to it, which preview/data.js builds every 10 hours on GitHub (see .github/workflows).
// If data.json is missing or old, the page fetches the job sites itself in the visitor's browser (slower).
// The site's own parsers and checks (lib/sources.js, lib/pricing.js, part of lib/verify.js) are bundled as LIB.
const fs = require('fs');
const path = require('path');
const S = __dirname, R = path.join(__dirname, '..'), P = R + '/public';
const must = (s, from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from); return s.split(from).join(to); };

// LIB: the server's parsers and checks as one script. For the browser, custom headers are removed
// (they would trigger CORS pre-checks) and fewer Himalayas pages are read.
function makeLib({ browser }) {
  let sources = fs.readFileSync(R + '/lib/sources.js', 'utf8');
  if (browser) {
    sources = must(sources, "headers: { 'User-Agent': 'RemoteCheck job importer', Accept: 'application/json' }, ", '');
    sources = must(sources, "headers: { 'User-Agent': 'RemoteCheck job importer' }, ", '');
    sources = must(sources, 'offset < 1000', 'offset < 200');
  }
  sources = sources.replace(/module\.exports[\s\S]*$/, '');
  let pricing = fs.readFileSync(R + '/lib/pricing.js', 'utf8');
  pricing = must(pricing, 'process.env.FALLBACK_USD_INR', 'undefined').replace(/module\.exports[\s\S]*$/, '');
  const verify = fs.readFileSync(R + '/lib/verify.js', 'utf8');
  const checks = verify.slice(verify.indexOf('const RED_FLAGS'), verify.indexOf('// Domain registration date via RDAP'));
  const enrich = fs.readFileSync(R + '/lib/enrich.js', 'utf8');
  // The job post checks (description detail, apply page owner) and the Company check page's profile code
  const jobChecks = verify.slice(verify.indexOf('function checkJob('), verify.indexOf('// The page name on a hiring system'))
    + verify.slice(verify.indexOf('// The page name on a hiring system'), verify.indexOf('// Open the original posting'));
  const lib = `const LIB = (() => {\n${sources}\n${pricing}\n${checks}\nconst { lookupCompany } = (() => {\n${enrich}\nreturn { lookupCompany };\n})();\n${jobChecks}\nconst INDIAN_COMPANIES = ${JSON.stringify(require(R + '/lib/indian-companies'))};\nconst CAREERS_COMPANIES = ${JSON.stringify(require(R + '/lib/careers-companies'))};\nreturn { BOARDS, ats, INDIAN_COMPANIES, CAREERS_COMPANIES, checkJob, isInternship, internshipInIndia, workplaceOf, audienceOf, indiaEligible, classifySegment, textChecks, RED_FLAGS, hostOf, TRUSTED_APPLY_HOSTS, lookupCompany };\n})();`;
  return lib;
}

if (require.main === module) (async () => {
  const OUT = path.resolve(process.argv[2] || path.join(S, 'out'));
  const lib = makeLib({ browser: true });
  const profile = fs.readFileSync(R + '/lib/profile.js', 'utf8');
  const { priceList } = require(R + '/lib/pricing');
  const prices = await priceList();

  // --- front end, routed in memory and with apply links straight to the real postings ---
  let js = fs.readFileSync(P + '/app.js', 'utf8');
  js = must(js, 'location.hash', 'loc.hash');
  js = must(js, "window.addEventListener('hashchange', route);", '');
  js = must(js, "history.replaceState(null, '', '#/' + (qs ? '?' + qs : ''));", "loc._h = '#/' + (qs ? '?' + qs : '');");
  js = must(js, 'confirm(', 'await uiConfirm(');
  js = must(js, 'const goHref = id => `/go/${id}`;', 'const goHref = id => previewGo(id);');
  js = must(js, '<a class="name" href="/api/profile/resume">', '<a class="name">');
  // The preview only has listing data, so describe the checks it actually runs
  js = must(js, "We check each company's founding year, website age, how many jobs it posts, how many it fills, and whether the apply link is on the company's own hiring system. You apply on the employer's page.",
    "We check every listing for scam signs, how many roles the company is hiring for, how many job websites list it, how recent it is, and where the Apply link goes. You apply on the employer's page.");

  let css = fs.readFileSync(P + '/styles.css', 'utf8');
  const dark = css.match(/@media \(prefers-color-scheme: dark\) \{ :root \{([\s\S]*?)\} \}/);
  css = css.replace(dark[0], `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${dark[1]}} }
:root[data-theme="dark"] {${dark[1]}}`);
  css += `
.preview-bar { background: var(--ok-soft); color: var(--ink); font-size: 13px; text-align: center; padding-block: 8px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.modal { position: fixed; inset: 0; background: rgba(8,14,24,.45); display: grid; place-items: center; padding: 16px; z-index: 80; }
.modal .card { max-width: 420px; width: 100%; }
`;

  const html = fs.readFileSync(P + '/index.html', 'utf8');
  const fonts = html.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
  const bodyInner = html.match(/<body>([\s\S]*?)<script src/)[1];
  const body = `<div class="preview-bar"><b>Live jobs:</b> real remote jobs and internships open to India, collected from public job websites and company careers pages every 10 hours. Apply opens the real posting. Sign-up and payments here are a demo.</div>
${bodyInner}
<script>const DATA = { pricing: ${JSON.stringify({ ...prices, payments: 'demo' })} };</script>
<script>${lib}</script>
<script>${profile}</script>
<script>${fs.readFileSync(S + '/live.js', 'utf8')}</script>
<script>${fs.readFileSync(S + '/mock.js', 'utf8')}</script>
<script>${js}</script>
`;
  const title = '<title>Parakh</title>';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUT + '/artifact.html', `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>${css}</style>\n${body}`);
  fs.writeFileSync(OUT + '/index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Parakh: real remote jobs open to Indian candidates, with a background check on every company.">\n${title}\n${fonts}\n<style>${css}</style>\n</head>\n<body>\n${body}</body>\n</html>\n`);
  console.log('built', OUT + '/index.html');
})();

module.exports = { makeLib };
