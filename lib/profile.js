// Full company profile from public records, for the "Company check" page: type a company's name, pick it,
// and see when it was founded, who founded and runs it, where it's based, how many people work there,
// its industry, website, stock listing and a plain description from Wikipedia.
//
// Sources: Wikidata (the free public database behind Wikipedia) and Wikipedia's page summary.
// Runs in Node (server) and, unchanged, in the browser preview.

(() => {   // kept in its own scope: in the browser this file sits next to the site's own script
const WD = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
const UA = 'Parakh job site (company background checks; https://github.com/mohityadav2027/remote-check)';

async function getJson(url, tries = 4) {
  const headers = typeof window === 'undefined' ? { 'User-Agent': UA } : {};   // Wikimedia asks servers to name themselves
  for (let i = 1; ; i++) {
    let res;
    // In a browser, a "too many requests" answer arrives as a network error, so those are retried too
    try { res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) }); }
    catch (e) { if (i >= tries || e.name === 'TimeoutError') throw e; await new Promise(r => setTimeout(r, 700 * i)); continue; }
    if (res.ok) return res.json();
    // Busy (too many requests from a shared connection): wait a moment and try again
    if (i >= tries || ![429, 503].includes(res.status)) throw new Error(`${res.status} from ${new URL(url).hostname}`);
    await new Promise(r => setTimeout(r, 700 * i));
  }
}

// Descriptions that mean "not a company" (people, places, films…), so they go to the bottom of suggestions
const NOT_COMPANY = /disambiguation|given name|family name|surname|\bfilm\b|album|\bsong\b|novel|television|episode|village|city|town|river|species|genus|human|politician|actor|actress|footballer|cricketer|singer|scientific article|painting|book/i;
const COMPANY_HINT = /company|business|corporation|startup|firm|software|platform|provider|bank|agency|manufacturer|retailer|marketplace|service|conglomerate|organi[sz]ation|brand|enterprise|subsidiary|unicorn|developer|publisher|consultancy|studio|fintech|e-?commerce/i;

// Suggestions while typing: Wikidata entries whose name matches, companies first
async function suggestCompanies(q) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const r = await getJson(`${WD}&action=wbsearchentities&language=en&uselang=en&type=item&limit=10&search=${encodeURIComponent(q)}`);
  return (r.search || [])
    .map(s => ({ id: s.id, name: s.label, description: s.description || '', company: COMPANY_HINT.test(s.description || '') && !NOT_COMPANY.test(s.description || '') }))
    .filter(s => s.name && !NOT_COMPANY.test(s.description))
    .sort((a, b) => b.company - a.company)
    .slice(0, 7);
}

const values = (e, p) => (e.claims?.[p] || []).filter(c => c.mainsnak?.datavalue && c.rank !== 'deprecated')
  .sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred'));
const first = (e, p) => values(e, p)[0]?.mainsnak.datavalue.value;
const ids = (e, p, n = 5) => values(e, p).map(c => c.mainsnak.datavalue.value?.id).filter(Boolean).slice(0, n);
const when = c => c.qualifiers?.P585?.[0]?.datavalue?.value?.time || c.qualifiers?.P580?.[0]?.datavalue?.value?.time || '';
const isCurrent = c => !c.qualifiers?.P582;   // no end date
const year = t => (t ? Number(String(t).slice(1, 5)) : null);
const dateOf = t => {   // Wikidata time "+2014-01-15T00:00:00Z" with precision: show what is known
  if (!t) return null;
  const [y, m, d] = String(t).slice(1, 11).split('-').map(Number);
  return { year: y, month: m || null, day: d || null };
};

// Most recent figure of a quantity property (employees, revenue)
function latest(e, p) {
  const best = values(e, p).map(c => ({ n: Number(c.mainsnak.datavalue.value.amount), unit: c.mainsnak.datavalue.value.unit, at: when(c) }))
    .filter(x => x.n > 0).sort((a, b) => b.at.localeCompare(a.at))[0];
  return best ? { n: Math.round(best.n), year: year(best.at), unit: best.unit } : null;
}

const CURRENCY = { Q4917: 'USD', Q80524: 'INR', Q4916: 'EUR', Q25224: 'GBP', Q8146: 'JPY', Q1104069: 'CAD', Q259502: 'AUD', Q39099: 'CNY', Q190951: 'SGD' };

// Everything public about one company (by its Wikidata id, e.g. Q109985545)
async function companyProfile(qid) {
  if (!/^Q\d+$/.test(qid || '')) throw new Error('Not a valid company id');
  const r = await getJson(`${WD}&action=wbgetentities&props=labels|descriptions|claims|sitelinks|aliases&languages=en&sitefilter=enwiki&ids=${qid}`);
  const e = r.entities?.[qid];
  if (!e || e.missing !== undefined) throw new Error('Company not found');

  // People and places are stored as ids: look up their names in one go
  const ceoClaims = values(e, 'P169').filter(isCurrent);
  const ref = {
    founders: ids(e, 'P112', 6), ceo: ceoClaims.map(c => c.mainsnak.datavalue.value.id).slice(0, 1),
    hq: ids(e, 'P159', 1), country: ids(e, 'P17', 1), industry: ids(e, 'P452', 4), parent: ids(e, 'P749', 1),
    exchange: ids(e, 'P414', 1), legal: ids(e, 'P1454', 1), products: ids(e, 'P1056', 6), owner: ids(e, 'P127', 2),
  };
  const all = [...new Set(Object.values(ref).flat())];
  const names = {};
  if (all.length) {
    const lr = await getJson(`${WD}&action=wbgetentities&props=labels&languages=en&ids=${all.slice(0, 50).join('|')}`);
    for (const [id, x] of Object.entries(lr.entities || {})) names[id] = x.labels?.en?.value;
  }
  const label = list => list.map(id => names[id]).filter(Boolean);

  // Plain-language description from Wikipedia, when the company has an article
  const title = e.sitelinks?.enwiki?.title;
  let about = null, wikipedia = null;
  if (title) {
    try {
      const w = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      about = w.extract || null;
      wikipedia = w.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    } catch { wikipedia = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`; }
  }

  const ticker = values(e, 'P414')[0]?.qualifiers?.P249?.[0]?.datavalue?.value || null;
  const revenue = latest(e, 'P2139');
  const logo = first(e, 'P154');
  const linkedin = first(e, 'P4264'), twitter = first(e, 'P2002');
  return {
    id: qid,
    name: e.labels?.en?.value || qid,
    official_name: first(e, 'P1448')?.text || null,
    also_known_as: (e.aliases?.en || []).map(a => a.value).slice(0, 4),
    description: e.descriptions?.en?.value || null,
    about, wikipedia, wikidata: `https://www.wikidata.org/wiki/${qid}`,
    founded: dateOf(first(e, 'P571')?.time),
    closed: dateOf(first(e, 'P576')?.time),
    founders: label(ref.founders), ceo: label(ref.ceo)[0] || null,
    headquarters: label(ref.hq)[0] || null, country: label(ref.country)[0] || null,
    industry: label(ref.industry), parent: label(ref.parent)[0] || null, owners: label(ref.owner),
    legal_form: label(ref.legal)[0] || null, products: label(ref.products),
    employees: latest(e, 'P1128'),
    revenue: revenue && { amount: revenue.n, year: revenue.year, currency: CURRENCY[String(revenue.unit).split('/').pop()] || null },
    stock: ref.exchange.length ? { exchange: label(ref.exchange)[0] || null, ticker } : null,
    website: first(e, 'P856') || null,
    linkedin: linkedin ? `https://www.linkedin.com/company/${linkedin}` : null,
    twitter: twitter ? `https://x.com/${twitter}` : null,
    logo: logo ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logo)}?width=160` : null,
  };
}

// What the profile tells a job seeker, as pass / warn / bad checks. Pure, so the browser preview runs it too.
function profileChecks(p, { domainCreated = null, now = new Date() } = {}) {
  const out = [], add = (level, label, detail = '') => out.push({ level, label, detail });
  const thisYear = now.getFullYear();
  if (p.closed) add('bad', `Company closed in ${p.closed.year}`, 'A company that no longer exists cannot hire you. Any job using its name is fake.');
  if (p.founded) {
    const age = thisYear - p.founded.year;
    add(age >= 5 ? 'ok' : age >= 2 ? 'warn' : 'warn', `Founded ${p.founded.year}`, `${age} year${age === 1 ? '' : 's'} in business${age < 2 ? ': very young, check carefully' : ''}`);
  } else add('warn', 'Founding year not on public record', 'Ask the recruiter when the company started');
  if (p.employees) add(p.employees.n >= 50 ? 'ok' : 'warn', `${p.employees.n.toLocaleString('en-IN')} employees`, p.employees.year ? `Figure from ${p.employees.year}` : '');
  else add('warn', 'Team size not on public record', 'Look at the company page on LinkedIn');
  if (p.website) {
    if (domainCreated) {
      const age = thisYear - Number(String(domainCreated).slice(0, 4));
      add(age >= 2 ? 'ok' : 'warn', `Website registered ${String(domainCreated).slice(0, 4)}`, age >= 2 ? `${age} years old` : 'A new website for an old company is a warning sign');
    } else add('ok', 'Official website on record', p.website);
  } else add('warn', 'No official website on record', 'Real companies have a website; recruiters should write from its domain');
  if (p.wikipedia) add('ok', 'Has a Wikipedia article', 'Independent writers have covered this company');
  if (p.linkedin) add('ok', 'LinkedIn company page on record', 'Check that the recruiter works there on LinkedIn');
  if (p.stock) add('ok', `Listed on ${p.stock.exchange || 'a stock exchange'}${p.stock.ticker ? ` (${p.stock.ticker})` : ''}`, 'Public companies report to regulators');
  if (p.founders.length || p.ceo) add('ok', 'Leadership is public', [p.ceo && `CEO: ${p.ceo}`, p.founders.length && `Founders: ${p.founders.join(', ')}`].filter(Boolean).join(' · '));
  return out;
}

const api = { suggestCompanies, companyProfile, profileChecks, UA };
if (typeof module !== 'undefined') module.exports = api;
else window.ParakhProfile = api;
})();
