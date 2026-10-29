// Fills in company details (founding year, website, employees, LinkedIn page, country) from Wikidata,
// the free public database behind Wikipedia. Job listings don't include these, and we only post jobs
// from companies we have proper details for.
//
// A Wikidata entry is accepted only if its name matches the company exactly (ignoring "Inc", "Ltd" etc.),
// it describes a company, and it has both a founding date and an official website.
// Runs in Node (importer) and, unchanged, in the browser preview.

const COUNTRIES = { Q30: 'USA', Q668: 'India', Q145: 'UK', Q16: 'Canada', Q183: 'Germany', Q55: 'Netherlands', Q408: 'Australia',
  Q334: 'Singapore', Q27: 'Ireland', Q142: 'France', Q29: 'Spain', Q38: 'Italy', Q39: 'Switzerland', Q34: 'Sweden', Q35: 'Denmark',
  Q20: 'Norway', Q33: 'Finland', Q801: 'Israel', Q155: 'Brazil', Q96: 'Mexico', Q17: 'Japan', Q884: 'South Korea', Q148: 'China',
  Q36: 'Poland', Q213: 'Czech Republic', Q191: 'Estonia', Q218: 'Romania', Q212: 'Ukraine', Q40: 'Austria', Q31: 'Belgium',
  Q45: 'Portugal', Q664: 'New Zealand', Q258: 'South Africa', Q1033: 'Nigeria', Q114: 'Kenya', Q928: 'Philippines', Q252: 'Indonesia',
  Q881: 'Vietnam', Q869: 'Thailand', Q833: 'Malaysia', Q878: 'UAE', Q414: 'Argentina', Q298: 'Chile', Q739: 'Colombia', Q32: 'Luxembourg',
  Q41: 'Greece', Q43: 'Turkey', Q37: 'Lithuania', Q211: 'Latvia', Q28: 'Hungary', Q219: 'Bulgaria', Q224: 'Croatia', Q403: 'Serbia',
  Q215: 'Slovenia', Q214: 'Slovakia', Q843: 'Pakistan', Q902: 'Bangladesh', Q854: 'Sri Lanka', Q79: 'Egypt', Q865: 'Taiwan', Q8646: 'Hong Kong' };
const COMPANY_WORDS = /\b(company|business|enterprise|corporation|startup|start-up|firm|software|platform|provider|developer|publisher|agency|manufacturer|retailer|bank|service|organi[sz]ation|nonprofit|non-profit|website|marketplace|consultancy|studio)\b/i;
const NOT_COMPANY = /disambiguation|given name|family name|surname|\bfilm\b|album|\bsong\b|novel|television series|village|city in|river|species|genus/i;

const norm = name => String(name || '').toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/[,.]/g, ' ')
  .replace(/\b(inc|llc|ltd|limited|gmbh|pvt|private|plc|corp|corporation|co|bv|ag|sa|sas|srl|pty|oy|ab|as)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const headers = typeof window === 'undefined' ? { 'User-Agent': 'Parakh job site (company background checks)' } : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} from Wikidata`);
  return res.json();
}

const claim = (entity, prop) => (entity.claims?.[prop] || []).filter(c => c.mainsnak?.datavalue).map(c => ({ value: c.mainsnak.datavalue.value, qualifiers: c.qualifiers }));

// Pure: turn one Wikidata entity into company details, or null if it doesn't qualify.
function detailsFromEntity(entity, companyName) {
  const label = entity.labels?.en?.value || '';
  const description = entity.descriptions?.en?.value || '';
  if (!label || norm(label) !== norm(companyName)) return null;
  if (NOT_COMPANY.test(description) || !COMPANY_WORDS.test(description)) return null;
  const inception = claim(entity, 'P571')[0]?.value?.time;          // e.g. "+2011-10-01T00:00:00Z"
  const website = claim(entity, 'P856')[0]?.value;
  const year = inception && Number(inception.slice(1, 5));
  if (!year || !website || !/^https?:\/\//.test(website)) return null;
  // Employees: the most recent figure
  const employees = claim(entity, 'P1128')
    .map(c => ({ n: Number(c.value.amount), at: c.qualifiers?.P585?.[0]?.datavalue?.value?.time || '' }))
    .filter(e => e.n > 0).sort((a, b) => b.at.localeCompare(a.at))[0]?.n ?? null;
  const linkedin = claim(entity, 'P4264')[0]?.value;
  const countryId = claim(entity, 'P17')[0]?.value?.id;
  return {
    founded_year: year, website, employee_count: employees ? Math.round(employees) : null,
    linkedin_url: linkedin ? `https://www.linkedin.com/company/${linkedin}` : null,
    hq_country: COUNTRIES[countryId] || null, wikidata_id: entity.id, description: description || null,
  };
}

// Look a company up by name. Returns details or null.
async function lookupCompany(name) {
  const q = norm(name);
  if (q.length < 2) return null;
  const search = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=en&type=item&limit=5&search=${encodeURIComponent(name.replace(/\(.*?\)/g, '').trim())}`);
  const ids = (search.search || []).filter(r => norm(r.label) === q).map(r => r.id).slice(0, 3);
  if (!ids.length) return null;
  const data = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels|descriptions|claims&languages=en&ids=${ids.join('|')}`);
  for (const id of ids) {
    const details = data.entities?.[id] && detailsFromEntity(data.entities[id], name);
    if (details) return details;
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { lookupCompany, detailsFromEntity, norm };
