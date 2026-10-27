// Segment-based pricing: $2 – $4 per 30 days, charged in INR at the live exchange rate.
const SEGMENTS = {
  basic: {
    key: 'basic', name: 'Entry', usd: 2, rank: 1,
    covers: 'Entry-level & non-tech: customer support, data entry, virtual assistant, content writing, tutoring',
  },
  pro: {
    key: 'pro', name: 'Professional', usd: 3, rank: 2,
    covers: 'Everything in Entry + software, design, marketing, sales, finance, QA, product roles',
  },
  premium: {
    key: 'premium', name: 'Senior & Specialist', usd: 4, rank: 3,
    covers: 'Everything + senior, lead, manager, architect, AI/ML, data science, DevOps, security roles',
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
function classifySegment(title = '', category = '') {
  const t = `${title} ${category}`.toLowerCase();
  if (/\b(senior|sr\.?|lead|principal|staff|head|director|manager|architect|vp)\b|machine learning|\bml\b|\bai\b|data scien|devops|sre|security|blockchain/.test(t)) return 'premium';
  if (/developer|engineer|programmer|design|marketing|seo|sales|account|finance|analyst|product|qa|test|recruit|hr\b|writer.*tech|data/.test(t)) return 'pro';
  return 'basic';
}

// A higher plan unlocks all lower segments.
function planCovers(planSegment, jobSegment) {
  return (SEGMENTS[planSegment]?.rank || 0) >= (SEGMENTS[jobSegment]?.rank || 99);
}

module.exports = { SEGMENTS, PLAN_DAYS, getUsdInr, priceList, classifySegment, planCovers };
