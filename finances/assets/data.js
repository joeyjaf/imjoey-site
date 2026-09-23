/* ═══════════════════════════════════════════════════════════
   data.js — vault shape, mock generator, detection + math
   No dependencies. Every function here is pure except loadState/saveState.
   ═══════════════════════════════════════════════════════════ */

export const START = '0000-01-01';   // no display floor — the vault's own range decides
export const TODAY = '2026-09-22';

/* ───────── date utils (string-based, timezone-proof) ───────── */
export const d = {
  parse: (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); },
  fmt:   (dt) => dt.toISOString().slice(0, 10),
  addDays: (s, n) => { const t = d.parse(s); t.setUTCDate(t.getUTCDate() + n); return d.fmt(t); },
  addMonths: (s, n) => {
    const t = d.parse(s); const day = t.getUTCDate();
    t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + n);
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, last)); return d.fmt(t);
  },
  diff:  (a, b) => Math.round((d.parse(b) - d.parse(a)) / 86400000),
  month: (s) => s.slice(0, 7),
  monthStart: (s) => s.slice(0, 7) + '-01',
  short: (s) => d.parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  monLabel: (s) => d.parse(s).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + " '" + s.slice(2, 4),
  long: (s) => d.parse(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
};

/* ───────── money ───────── */
export const money = (n, opts = {}) => {
  const { cents = false, sign = false } = opts;
  const v = Math.abs(n);
  const s = v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const pre = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
  return `${pre}$${s}`;
};
export const compact = (n) => {
  const v = Math.abs(n), p = n < 0 ? '−' : '';
  if (v >= 1e6) return `${p}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${p}$${(v / 1e3).toFixed(0)}K`;
  if (v >= 1e3) return `${p}$${(v / 1e3).toFixed(1)}K`;
  return `${p}$${Math.round(v)}`;
};

/* ───────── categories ─────────
   Slot is assigned by stable index (creation order), NEVER by rank —
   filtering or re-sorting must never repaint a category. Past 8 → Other. */
export const DEFAULT_CATEGORIES = [
  // money out
  { id: 'housing',   name: 'Housing',        slot: 1, side: 'out' },
  { id: 'food',      name: 'Food & Dining',  slot: 2, side: 'out' },
  { id: 'transport', name: 'Transport',      slot: 3, side: 'out' },
  { id: 'bills',     name: 'Bills & Utils',  slot: 4, side: 'out' },
  { id: 'shopping',  name: 'Shopping',       slot: 5, side: 'out' },
  { id: 'health',    name: 'Health',         slot: 6, side: 'out' },
  { id: 'subs',      name: 'Subscriptions',  slot: 7, side: 'out' },
  { id: 'cash',      name: 'Cash & ATM',     slot: 8, side: 'out' },
  // The palette carries eight hues by design — a ninth generated colour is
  // indistinguishable from an existing one, so overflow categories take the
  // neutral until a hue is deliberately reassigned.
  { id: 'entertainment', name: 'Entertainment', slot: 0, side: 'out' },
  // money in — a deposit is not a kind of spending, so it needs its own vocabulary
  { id: 'payroll',   name: 'Payroll',        slot: 0, side: 'in', isIncome: true },
  { id: 'income',    name: 'Other income',   slot: 0, side: 'in', isIncome: true },
  { id: 'refund',    name: 'Refund',         slot: 0, side: 'in', isIncome: true },
  // both
  { id: 'transfer',  name: 'Transfers',      slot: 0, side: 'both', excludeFromSpend: true },
  { id: 'other',     name: 'Uncategorised',  slot: 0, side: 'both' },
];
/* categories valid for a given direction */
export const catsFor = (cats, dir) =>
  cats.filter(c => !c.side || c.side === 'both' || c.side === dir);
export const slotColor = (slot) => slot >= 1 && slot <= 8 ? `var(--series-${slot})` : 'var(--series-other)';
export const catColor = (cats, id) => slotColor((cats.find(c => c.id === id) || {}).slot ?? 0);
export const catName  = (cats, id) => (cats.find(c => c.id === id) || {}).name ?? 'Uncategorised';

/* ───────── merchant normalisation ───────── */
export const normMerchant = (s) => (s || '')
  .toUpperCase()
  .replace(/[#*]+\s*\w*\d[\w\d]*/g, ' ')        // store / ref numbers
  .replace(/\b\d{4,}\b/g, ' ')                   // long digit runs
  .replace(/\b(PURCHASE|POS|DEBIT|CARD|RECURRING|PAYMENT|AUTOPAY|ACH|XX+\d*)\b/g, ' ')
  .replace(/[^A-Z0-9&' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ═══════════════ RECURRING DETECTION ═══════════════
   Groups on normalised merchant, then on amount similarity, then looks for a
   consistent gap. Returns cadence + confidence + next expected date. */
// `per` is the exact number of hits per month — derived from the calendar, not from
// dividing 30.4375 by a day count (which made a $4,200 rent read as $4,205/mo).
const CADENCES = [
  { id: 'weekly',      days: 7,       label: 'Weekly',        tol: 2,  per: 52 / 12 },
  { id: 'biweekly',    days: 14,      label: 'Every 2 weeks', tol: 3,  per: 26 / 12 },
  { id: 'semimonthly', days: 15.21875,label: 'Twice monthly', tol: 3,  per: 2 },
  { id: 'monthly',     days: 30.4375, label: 'Monthly',       tol: 5,  per: 1 },
  { id: 'quarterly',   days: 91.3125, label: 'Quarterly',     tol: 9,  per: 1 / 3 },
  { id: 'annual',      days: 365.25,  label: 'Annual',        tol: 20, per: 1 / 12 },
];
export const cadenceLabel = (id) => (CADENCES.find(c => c.id === id) || {}).label ?? id;
export const cadenceDays  = (id) => (CADENCES.find(c => c.id === id) || {}).days ?? 30.4;
export const perMonth     = (amount, cadenceId) => amount * ((CADENCES.find(c => c.id === cadenceId) || { per: 1 }).per);

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean   = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const stdev  = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

export function detectRecurring(txns, asOf = TODAY) {
  const groups = new Map();
  for (const t of txns) {
    if (t.category === 'transfer') continue;   // internal movement is not a bill
    const k = normMerchant(t.merchant || t.description);
    if (!k || k.length < 3) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }

  const out = [];
  for (const [key, all] of groups) {
    // split a merchant's history into amount-clusters (Netflix $15.49 vs a one-off $70)
    const dir = (t) => t.amount < 0 ? 'out' : 'in';
    for (const direction of ['out', 'in']) {
      const list = all.filter(t => dir(t) === direction).sort((a, b) => a.date < b.date ? -1 : 1);
      if (list.length < 2) continue;

      const clusters = [];
      for (const t of list) {
        const a = Math.abs(t.amount);
        const hit = clusters.find(c => {
          const m = median(c.map(x => Math.abs(x.amount)));
          return Math.abs(a - m) <= Math.max(2, m * 0.12);   // within 12% or $2
        });
        if (hit) hit.push(t); else clusters.push([t]);
      }

      for (const c of clusters) {
        if (c.length < 2) continue;
        const dates = c.map(t => t.date);
        const gaps = dates.slice(1).map((x, i) => d.diff(dates[i], x)).filter(g => g > 0);
        if (!gaps.length) continue;
        const g = median(gaps);

        // Pick the BEST-fitting cadence, not the first in the list — biweekly (14±3)
        // and semimonthly (15±3) overlap, and 26 vs 24 payments/yr is an 8% swing.
        const cands = CADENCES.filter(cc => Math.abs(g - cc.days) <= cc.tol);
        if (!cands.length) continue;
        let cad = cands.reduce((a, b) =>
          Math.abs(g - a.days) / a.days <= Math.abs(g - b.days) / b.days ? a : b);
        // Twice-a-month lands on two stable days-of-month (and often the month's last
        // day); biweekly drifts through the calendar. Disambiguate on that.
        if (cad.id === 'biweekly' || cad.id === 'semimonthly') {
          const doms = [...new Set(dates.map(x => +x.slice(8)))];
          const nearMonthEnd = dates.some(x => +x.slice(8) >= 28);
          cad = (doms.length <= 3 || nearMonthEnd)
            ? CADENCES.find(c => c.id === 'semimonthly')
            : CADENCES.find(c => c.id === 'biweekly');
        }

        const amts = c.map(t => Math.abs(t.amount));
        const amtMed = median(amts);
        const amtVar = amtMed ? stdev(amts) / amtMed : 1;
        const gapVar = g ? stdev(gaps) / g : 1;

        // COVERAGE is the discriminator that actually separates a bill from an
        // errand. Amount-steadiness is measured inside a cluster, so it is high by
        // construction and proves nothing. What distinguishes Netflix from Safeway
        // is that *every* Netflix charge is $22.99, while the $39 Safeway cluster is
        // one of many — a shop whose charges scatter across clusters is not a bill.
        const coverage = c.length / list.length;
        let conf = coverage * 0.42
                 + Math.max(0, 1 - gapVar * 2.5) * 0.24
                 + Math.max(0, 1 - amtVar * 6) * 0.19
                 + Math.min(1, (c.length - 1) / 3) * 0.15;
        // Weekly/biweekly is where errands look most like subscriptions —
        // demand more repeats before believing it.
        if ((cad.id === 'weekly' || cad.id === 'biweekly') && c.length < 4) conf *= 0.55;
        // a merchant billing many different amounts is a shop, not a subscription
        if (coverage < 0.5) conf *= 0.5;
        conf = Math.round(Math.max(0.05, Math.min(0.99, conf)) * 100);

        const last = dates[dates.length - 1];
        let next = d.addDays(last, Math.round(cad.days));
        while (next < asOf) next = d.addDays(next, Math.round(cad.days));
        out.push({
          id: `auto:${key}:${direction}:${Math.round(amtMed)}`,
          merchant: c[c.length - 1].merchant || key,
          key,
          direction,
          amount: Math.round(amtMed * 100) / 100,
          cadence: cad.id,
          confidence: conf,
          hits: c.length,
          coverage: Math.round(coverage * 100),
          lastSeen: last,
          nextDue: next,
          category: c[c.length - 1].category || 'other',
          txnIds: c.map(t => t.id),
          source: 'detected',
        });
      }
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || perMonth(b.amount, b.cadence) - perMonth(a.amount, a.cadence));
}

/* ═══════════════ RULES ═══════════════ */
/* Where a category came from decides whether it needs review.
   manual > rule > whatever the bank guessed > nothing. */
export function applyRules(txn, rules, manual) {
  if (manual[txn.id]) return { category: manual[txn.id], catSource: 'manual' };
  for (const r of rules) {
    if (!r.value) continue;
    const hay = String((r.field === 'description' ? txn.description : txn.merchant) || '').toLowerCase();
    const v = r.value.toLowerCase();
    const hit = r.op === 'equals' ? hay === v : r.op === 'startsWith' ? hay.startsWith(v) : hay.includes(v);
    if (hit) return { category: r.category, catSource: 'rule' };
  }
  if (txn.category && txn.category !== 'other') {
    return { category: txn.category, catSource: 'auto', catConfidence: txn.catConfidence || 'medium' };
  }
  return { category: 'other', catSource: 'none', catConfidence: 'none' };
}
export const categorise = (txns, rules, manual) =>
  txns.map(t => ({ ...t, ...applyRules(t, rules, manual) }));

/* Needs a human look: it still counts and nothing set its category by hand or by
   rule with any confidence. Money IN qualifies too — an odd deposit is either real
   income or somebody paying you back, and only Joey knows which. Payroll is
   excluded by the caller, since a matched recurring deposit needs no decision. */
export const needsReview = (t) =>
  t.counts !== false &&
  ((t.catSource === 'none') || (t.catSource === 'auto' && t.catConfidence === 'low'));

/* ═══════════════ EFFECTIVE AMOUNT (scheduled changes) ═══════════════
   The rent-drops-in-November case. Latest override with from <= monthStart wins. */
export function effectiveAmount(item, onDate) {
  const ov = (item.overrides || [])
    .filter(o => o.from <= onDate)
    .sort((a, b) => a.from < b.from ? -1 : 1);
  return ov.length ? Number(ov[ov.length - 1].amount) : Number(item.amount);
}

/* ═══════════════ PROJECTION ═══════════════
   balance[m] = balance[m-1] + income − fixed − variable (+ windfalls on the dotted line)
   One y-axis, dollars. Never a second scale. */
export function project({ startBalance, startDate, months = 12, recurring, variablePerMonth, windfalls }) {
  const pts = [{ month: d.monthStart(startDate), base: startBalance, wf: startBalance, income: 0, fixed: 0, variable: 0, windfall: 0, items: [] }];
  let base = startBalance, wf = startBalance;

  for (let i = 1; i <= months; i++) {
    const mStart = d.addMonths(d.monthStart(startDate), i);
    let income = 0, fixed = 0; const items = [];

    for (const r of recurring) {
      if (r.excluded) continue;
      const amt = effectiveAmount(r, mStart);
      const monthly = perMonth(amt, r.cadence);
      if (r.direction === 'in') { income += monthly; items.push({ name: r.merchant, amt: monthly, kind: 'in' }); }
      else { fixed += monthly; items.push({ name: r.merchant, amt: -monthly, kind: 'out' }); }
    }

    const variable = variablePerMonth;
    base += income - fixed - variable;

    const land = windfalls.filter(w => w.date && d.month(w.date) === d.month(mStart));
    const windfall = land.reduce((s, w) => s + Number(w.amount || 0), 0);
    wf += income - fixed - variable + windfall;

    pts.push({ month: mStart, base, wf, income, fixed, variable, windfall, windfallItems: land, items });
  }
  return pts;
}

/* first month the baseline line crosses zero */
export const cliffMonth = (pts) => (pts.find(p => p.base < 0) || {}).month ?? null;

/* ═══════════════ TYPICAL VARIABLE SPEND ═══════════════
   Recurring items are excluded so the forecast never double-counts them. */
/* Typical monthly variable spend — everything that isn't a recurring bill.
 *
 * Derived, never typed. The honest way to get a MONTHLY figure is to measure
 * whole months and take the median: a mean lets one $900 flight set the budget
 * forever, and scaling a part-month day-rate up to 30 days is worse still —
 * eight days that happen to contain a dinner and a flight extrapolate to a
 * number that never happens. Day-rate extrapolation is the fallback only, used
 * when there isn't a single complete month yet, and it says so in the UI.
 */
export function variableSpend(txns, recurring, asOf = TODAY) {
  const claimed = new Set(recurring.filter(r => !r.excluded).flatMap(r => r.txnIds || []));
  const out = txns.filter(t => t.amount < 0 && !claimed.has(t.id) && t.category !== 'transfer');
  if (!out.length) return { perMonth: 0, perDay: 0, days: 0, total: 0, byCategory: {}, method: 'none', months: 0 };

  const amt = (t) => Math.abs(t.netAmount ?? t.amount);
  const dates = out.map(t => t.date).sort();
  const first = dates[0], last = dates[dates.length - 1];
  const days = Math.max(1, d.diff(first, last) + 1);
  const total = out.reduce((s, t) => s + amt(t), 0);

  const byMonth = {};
  for (const t of out) byMonth[d.month(t.date)] = (byMonth[d.month(t.date)] || 0) + amt(t);

  // A month counts only if the data spans all of it — the first month is usually
  // clipped by when history starts, and the current one hasn't finished.
  const complete = Object.keys(byMonth).filter(mk => {
    const mStart = mk + '-01';
    const mEnd = d.addDays(d.addMonths(mStart, 1), -1);
    return mStart >= d.monthStart(first) && first <= mStart && mEnd <= last && d.month(asOf) !== mk;
  }).sort();

  let perMonth, method;
  if (complete.length >= 2) {
    const vals = complete.map(mk => byMonth[mk]).sort((a, b) => a - b);
    const m = vals.length >> 1;
    perMonth = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
    method = 'median';
  } else if (complete.length === 1) {
    perMonth = byMonth[complete[0]];
    method = 'single';
  } else {
    perMonth = total / days * 30.4375;
    method = 'extrapolated';
  }

  // per-category shares follow the same basis as the headline figure
  const byCategory = {};
  if (method === 'extrapolated') {
    for (const t of out) byCategory[t.category] = (byCategory[t.category] || 0) + amt(t) / days * 30.4375;
  } else {
    for (const t of out) {
      if (!complete.includes(d.month(t.date))) continue;
      byCategory[t.category] = (byCategory[t.category] || 0) + amt(t) / complete.length;
    }
  }

  return { perMonth, perDay: total / days, days, total, byCategory,
           method, months: complete.length, monthly: byMonth };
}

/* ═══════════════ EXCLUSIONS + NETTING ═══════════════
   Two different ideas, deliberately kept apart:
     · excluded  — "don't count this at all" (manual, or an auto-hidden past
                   gambling charge). It leaves every total.
     · applied   — a reimbursement pinned to the expense it pays back. Rather
                   than booking $200 out and $140 in, the dinner just cost $60.
                   Closer to what actually happened. */
export function resolve(txns, state) {
  const manualEx = state.excluded || {};
  const unhide   = state.unhidden || {};
  const applied  = state.appliedAgainst || {};

  // reimbursements roll up onto their target
  const credits = {};
  for (const [incomeId, targetId] of Object.entries(applied)) {
    const inc = txns.find(t => t.id === incomeId);
    if (!inc || !targetId) continue;
    credits[targetId] = (credits[targetId] || 0) + Math.abs(inc.amount);
  }

  return txns.map(t => {
    const autoHid = t.autoHidden && !unhide[t.id];
    const excluded = !!manualEx[t.id] || autoHid;
    const isApplied = !!applied[t.id];
    const credit = credits[t.id] || 0;
    // an expense of −200 credited 140 nets to −60, never past zero
    const netAmount = credit && t.amount < 0
      ? Math.min(0, t.amount + credit)
      : t.amount;
    return {
      ...t,
      excluded, autoHidden: autoHid, appliedTo: applied[t.id] || null,
      isApplied, credit, netAmount,
      counts: !excluded && !isApplied,
    };
  });
}

/* ═══════════════ LOCAL STATE ═══════════════ */
const KEY = 'ledger.v1';
export const DEFAULT_STATE = {
  categories: DEFAULT_CATEGORIES,
  rules: [],
  manual: {},
  windfalls: [],
  recurringEdits: {},     // id → { excluded, overrides[], amount, cadence, category }
  recurringManual: [],    // fully hand-added items
  variableOverride: null, // hand-set typical monthly variable spend
  hideWindfallLine: false,
  excluded: {},        // txnId → true  ("don't count this")
  unhidden: {},        // txnId → true  (override an auto-hide)
  appliedAgainst: {},  // incomeTxnId → expenseTxnId
  hideBefore: '2026-09-22',
  anchors: {},          // accountId → {amount,date}; balance carries forward from here
  pieMode: 'month',
  range: 'since',
};
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch { return structuredClone(DEFAULT_STATE); }
}
export function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

/* merge detected recurring with the user's edits + hand-added items */
/* Anything under this is listed for review but kept OUT of the forecast until
   Joey ticks it on — a wrong guess here silently distorts every projection. */
export const AUTO_INCLUDE_CONFIDENCE = 70;

export function mergeRecurring(detected, state, seeds = []) {
  const merged = detected.map(r => {
    const e = state.recurringEdits[r.id] || {};
    const autoOK = r.confidence >= AUTO_INCLUDE_CONFIDENCE;
    return {
      ...r, ...e,
      // an explicit user choice always wins; otherwise confidence decides
      excluded: e.excluded !== undefined ? e.excluded : !autoOK,
      lowConfidence: !autoOK,
      overrides: e.overrides || [],
    };
  });
  for (const sd of seeds) {
    if ((state.removedSeeds || {})[sd.id]) continue;
    const e = state.recurringEdits[sd.id] || {};
    merged.push({ ...sd, ...e, excluded: e.excluded !== undefined ? e.excluded : false,
                  overrides: e.overrides || sd.overrides || [] });
  }
  for (const m of state.recurringManual) {
    const e = state.recurringEdits[m.id] || {};
    merged.push({ confidence: 100, hits: 0, source: 'manual', txnIds: [], ...m, ...e, overrides: e.overrides || m.overrides || [] });
  }
  return merged;
}
