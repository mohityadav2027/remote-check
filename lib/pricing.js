// Segment-based pricing: $2 – $4 per 30 days, charged in INR at the live exchange rate.
const SEGMENTS = {
  basic: {
    key: 'basic', name: 'Entry', usd: 2, rank: 1,
    covers: 'Entry-level work: customer support, data entry, virtual assistant, AI data annotation, transcription, moderation, tutoring, content writing',
  },
  pro: {
    key: 'pro', name: 'Professional', usd: 3, rank: 2,
    covers: 'Everything in Entry + managers and supervisors, developers, design, video, marketing, social media, sales, finance, accounting, HR, legal, translation, QA',
  },
  premium: {
    key: 'premium', name: 'Senior & Specialist', usd: 4, rank: 3,
    covers: 'Everything + senior managers, heads, directors and VPs, product and engineering managers, architects, AI/ML, data science, DevOps, security',
  },
};
const PLAN_DAYS = 30;
const FALLBACK_USD_INR = Number(process.env.FALLBACK_USD_INR || 84);

let fxCache = { rate: null, at: 0, source: 'fallback' };

// Free public FX API, cached for 6 hours. Falls back to a fixed rate if offline.
async function getUsdInr() {
  if (fxCache.rate && Date.now() - fxCache.at < 6 * 3600e3) return fxCache;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const rate = data?.rates?.INR;
    if (!rate) throw new Error('INR rate missing');
    fxCache = { rate, at: Date.now(), source: 'open.er-api.com' };
  } catch {
    fxCache = { rate: FALLBACK_USD_INR, at: Date.now(), source: 'fallback' };
  }
  return fxCache;
}

async function priceList() {
  const fx = await getUsdInr();
  return {
    fx_rate: fx.rate,
    fx_source: fx.source,
    days: PLAN_DAYS,
    segments: Object.values(SEGMENTS).map(s => ({ ...s, inr: Math.ceil(s.usd * fx.rate) })),
  };
}

// Decide which segment (price band) a job belongs to from its title/category.
// Checked in order: senior roles, then entry-level work, then skilled professional work. Anything else is entry level.
const SENIOR = /\b(senior|sr\.?|lead|principal|staff|head of|director|architect|vp|vice president|chief)\b|\b(engineering|product|program) manager\b|machine learning (engineer|scientist)|\b(ml|ai) (engineer|scientist|researcher)\b|data scien|devops|\bsre\b|site reliability|security (engineer|analyst)|blockchain/;
const ENTRY = /data entry|annotat|labell?ing|transcri|virtual assistant|personal assistant|admin(istrative)? assistant|customer (support|service|care)|support (agent|representative|specialist|associate)|call cent|chat (agent|support)|moderat|tutor|teach|intern\b|trainee|receptionist|appointment|scheduler|captioner|survey|search evaluator|rater|ai train/;
const PRO = /develop|engineer|programm|software|design|ux|ui\b|marketing|seo|social media|content (strategist|manager)|community manager|sales|account (executive|manager)|business development|finance|accountant|bookkeep|payroll|tax|analyst|product|\bqa\b|test|recruit|talent|\bhr\b|human resources|editor|video|motion|animation|illustrat|photograph|project manager|operations|legal|paralegal|lawyer|medical cod|nurse|pharmac|translat|localiz|copywrit|technical writ|consultant|data/;

const MANAGER = /\bmanager\b|management|supervisor|scrum master|agile coach|team leader/;

function classifySegment(title = '', category = '') {
  const t = `${title} ${category}`.toLowerCase();
  if (SENIOR.test(t)) return 'premium';
  if (MANAGER.test(title.toLowerCase())) return 'pro';   // e.g. "Customer Support Manager" is not entry level
  if (ENTRY.test(title.toLowerCase())) return 'basic';
  if (PRO.test(t)) return 'pro';
  return 'basic';
}

// A higher plan unlocks all lower segments.
function planCovers(planSegment, jobSegment) {
  return (SEGMENTS[planSegment]?.rank || 0) >= (SEGMENTS[jobSegment]?.rank || 99);
}

module.exports = { SEGMENTS, PLAN_DAYS, getUsdInr, priceList, classifySegment, planCovers };
