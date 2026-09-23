/* ═══════════════════════════════════════════════════════════
   app.js — state, views, wiring
   ═══════════════════════════════════════════════════════════ */
import * as D from './data.js';
import { projectionChart, categoryBars, billCalendar, donutChart, monthCalendar, sparkline, showTip, hideTip } from './charts.js';
import * as G from './gambling.js';

const { d, money, compact, catColor, catName, slotColor, perMonth, cadenceLabel } = D;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Untrusted strings (merchant names, category names) never reach innerHTML raw. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let VAULT = null, S = null, VIEW = 'overview';

/* ═══════════════ GATE ═══════════════ */
const PASSCODE = '124512';

async function tryUnlock(code) {
  // Encrypted vault, if one was published. Wrong code → decryption genuinely fails.
  try {
    const res = await fetch('./vault.enc.json', { cache: 'no-store' });
    if (res.ok) {
      const blob = await res.json();
      const dec = await decryptVault(blob, code);
      if (dec) return dec;
      return null;
    }
  } catch {}
  // No encrypted vault present → design/demo mode. Loaded on demand so the
  // fabricated data never ships alongside a real vault.
  if (code === PASSCODE) {
    const { buildMockVault } = await import('./mock.js');
    return buildMockVault();
  }
  return null;
}

async function decryptVault(blob, code) {
  try {
    const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(blob.salt), iterations: blob.iterations || 600000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.data));
    return JSON.parse(new TextDecoder().decode(out));
  } catch { return null; }
}

$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('#gate-input'), btn = $('.gate-btn');
  btn.disabled = true; btn.textContent = 'Checking…';
  const v = await tryUnlock(inp.value.trim());
  btn.disabled = false; btn.textContent = 'Unlock';
  if (!v) {
    $('#gate-err').hidden = false;
    $('.gate-card').classList.remove('shake'); void $('.gate-card').offsetWidth;
    $('.gate-card').classList.add('shake');
    inp.value = ''; inp.focus();
    return;
  }
  sessionStorage.setItem('ledger.ok', '1');
  sessionStorage.setItem('ledger.k', inp.value.trim());
  boot(v);
});

function boot(vault) {
  VAULT = vault;
  S = D.loadState();
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#demo-banner').hidden = !vault.demo;
  $('#asof').textContent = 'as of ' + d.long(vault.asOf) +
    (vault.pulledAt ? ' · pulled ' + ago(vault.pulledAt) : '');
  buildChrome();
  render();
}

$('#btn-lock').addEventListener('click', () => { sessionStorage.removeItem('ledger.ok'); location.reload(); });

/* ═══════════════ DERIVED ═══════════════ */
function derive() {
  const cats = S.categories;
  const floor = VAULT.since || D.START;

  // 1. flag the gaming/crypto rails  2. settle exclusions + reimbursements
  // 3. categorise.  Order matters: netting must happen before anything sums.
  const flagged = G.annotate(VAULT.transactions, S.hideBefore || G.HIDE_BEFORE).txns;
  const resolved = D.resolve(flagged, S);
  const all = D.categorise(resolved, S.rules, S.manual);

  const counting = all.filter(t => t.counts);
  const shown = all.filter(t => t.date >= floor);
  const hiddenCount = all.filter(t => t.autoHidden).length;
  const excludedCount = all.filter(t => (S.excluded || {})[t.id]).length;

  const win = (RANGE_OPTS.find(o => o[0] === S.range) || [])[2];
  const from = win ? (() => { const c = d.addDays(VAULT.asOf, -win); return c > floor ? c : floor; })() : floor;
  const inRange = shown.filter(t => t.date >= from);

  // Detection reads EVERYTHING that counts — a one-week window can't reveal a
  // monthly bill — but never the rails or anything excluded.
  const detected = D.detectRecurring(counting, VAULT.asOf);
  const recurring = D.mergeRecurring(detected, S, VAULT.seedRecurring || []);
  const active = recurring.filter(r => !r.excluded);

  const incomeMo = active.filter(r => r.direction === 'in')
    .reduce((s, r) => s + perMonth(D.effectiveAmount(r, d.monthStart(VAULT.asOf)), r.cadence), 0);
  const fixedMo = active.filter(r => r.direction === 'out')
    .reduce((s, r) => s + perMonth(D.effectiveAmount(r, d.monthStart(VAULT.asOf)), r.cadence), 0);

  // measured across everything we hold, not the displayed slice — a one-week
  // window can't produce a monthly figure
  const vs = D.variableSpend(counting, active, VAULT.asOf);
  const variableMo = S.variableOverride != null ? Number(S.variableOverride) : vs.perMonth;
  // Era cannot see what is preloaded on the secured card — it reports cumulative
  // spend instead. So that account is anchored to a known amount on a known date
  // and carried forward by its own rows: a charge reduces it, "To Varo Believe"
  // increases it, "From Varo Believe" decreases it. Verified against the data:
  // every transfer mirrors exactly on the debit side.
  const anchorFor = (acc) => (S.anchors || {})[acc.id] || acc.anchor;
  const movementSince = (acc, since) => all
    .filter(t => t.account === acc.id && t.date > since)
    .reduce((s, t) => s + t.amount, 0);

  const accounts = VAULT.accounts.map(acc => {
    if (acc.balanceSource !== 'derived') return { ...acc, shownBalance: acc.balance };
    const an = anchorFor(acc);
    if (!an) return { ...acc, shownBalance: acc.balance };
    const moved = movementSince(acc, an.date);
    return { ...acc, anchor: an, moved, shownBalance: Number(an.amount) + moved };
  }).filter(acc => acc.shownBalance !== 0 || acc.spendable === false);
  const spendable = accounts.filter(a => a.spendable !== false).reduce((s, a) => s + a.shownBalance, 0);

  const pts = D.project({
    startBalance: spendable, startDate: VAULT.asOf, months: 12,
    recurring: active, variablePerMonth: variableMo,
    windfalls: S.windfalls.filter(w => w.date),
  });

  // ── category rollup over the selected range ──
  const spend = inRange.filter(t => t.counts && t.amount < 0 && t.category !== 'transfer');
  const roll = (list) => {
    const by = {};
    for (const t of list) {
      by[t.category] = by[t.category] || { value: 0, count: 0 };
      by[t.category].value += Math.abs(t.netAmount ?? t.amount);
      by[t.category].count++;
    }
    return Object.entries(by)
      .map(([id, v]) => ({ id, name: catName(cats, id), color: catColor(cats, id), ...v }))
      .sort((a, b) => b.value - a.value);
  };
  let catRows = roll(spend);
  if (catRows.length > 8) {
    const tail = catRows.slice(8);
    catRows = catRows.slice(0, 8).concat([{ id: '__other', name: 'Other (' + tail.length + ')',
      color: 'var(--series-other)', value: tail.reduce((s, r) => s + r.value, 0), count: tail.reduce((s, r) => s + r.count, 0) }]);
  }
  const spendTotal = spend.reduce((s, t) => s + Math.abs(t.netAmount ?? t.amount), 0);

  // ── months available for the donut ──
  const months = [...new Set(counting.filter(t => t.amount < 0).map(t => d.month(t.date)))].sort().reverse();
  const monthRows = (mk) => roll(counting.filter(t =>
    t.amount < 0 && t.category !== 'transfer' && d.month(t.date) === mk));
  // trailing 6-month average, aggregate only — this never lists old transactions
  const recent = months.slice(0, 6);
  const avgRows = (() => {
    const by = {};
    for (const mk of recent) for (const r of monthRows(mk)) {
      by[r.id] = by[r.id] || { id: r.id, name: r.name, color: r.color, value: 0, count: 0 };
      by[r.id].value += r.value; by[r.id].count += r.count;
    }
    const n = Math.max(1, recent.length);
    return Object.values(by).map(r => ({ ...r, value: r.value / n, count: Math.round(r.count / n) }))
      .sort((a, b) => b.value - a.value);
  })();

  const payrollIds = new Set(active.filter(r => r.direction === 'in').flatMap(r => r.txnIds || []));
  const reviewQ = shown.filter(t => D.needsReview(t) && !payrollIds.has(t.id))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  // How much can this forecast actually be trusted? A monthly bill needs two
  // sightings to be found at all, so a short window silently omits rent and
  // everything else that bills once a month — and an omitted cost reads as
  // surplus, which is the dangerous direction to be wrong in.
  const spanDays = shown.length ? d.diff(shown.at(-1).date, shown[0].date) + 1 : 0;
  const thin = spanDays < 75 || vs.method === 'extrapolated';
  const thinReason = spanDays < 75
    ? 'Only ' + spanDays + ' days of history is loaded, and a monthly bill needs two sightings before it can be found. Rent and most other monthly costs are almost certainly missing from this, which makes the line too optimistic.'
    : 'Variable spend is still estimated from a part-month rather than measured across whole months.';

  return { all, shown, counting, inRange, cats, detected, recurring, active, incomeMo, fixedMo, thin, thinReason, spanDays, accounts,
           vs, variableMo, spendable, pts, catRows, spendTotal, floor, from,
           months, monthRows, avgRows, recentMonths: recent, reviewQ, hiddenCount, excludedCount };
}

/* ═══════════════ CHROME ═══════════════ */
const TABS = [
  ['overview', 'Overview'], ['recurring', 'Recurring'], ['categories', 'Categories'],
  ['windfalls', 'Windfalls'], ['transactions', 'Transactions'], ['tools', 'Tools'],
];
// Presets are day-windows back from asOf. A window reaching past the display floor
// is identical to "since", so it's disabled rather than shown as a button that does
// nothing. They light up on their own as time passes.
const RANGE_OPTS = [['since', 'All', null], ['d7', '7 days', 7], ['d30', '30 days', 30], ['d90', '90 days', 90]];
// The range only scopes views that read transactions. Showing it above a
// forward-looking view would imply it filters something it doesn't.
const RANGE_SCOPED = new Set(['overview', 'categories', 'transactions']);

function buildChrome() {
  const bar = $('.filterbar');
  const scoped = RANGE_SCOPED.has(VIEW);
  $('#range-seg').style.display = scoped ? '' : 'none';
  $('.filterbar-label').style.display = scoped ? '' : 'none';

  const seg = $('#range-seg'); seg.innerHTML = '';
  const floor = VAULT.since || D.START;
  for (const [id, label, win] of RANGE_OPTS) {
    const b = document.createElement('button');
    b.textContent = label;
    const dead = win != null && d.addDays(VAULT.asOf, -win) <= floor;
    if (dead) {
      b.disabled = true; b.style.opacity = '.32'; b.style.cursor = 'default';
      b.title = 'Same as All — history only reaches back to ' + d.long(floor) + '.';
    }
    b.setAttribute('aria-pressed', String(S.range === id));
    if (!dead) b.onclick = () => { S.range = id; D.saveState(S); buildChrome(); render(); };
    seg.appendChild(b);
  }
  const tabs = $('#tabs'); tabs.innerHTML = '';
  for (const [id, label] of TABS) {
    const b = document.createElement('button');
    b.textContent = label; b.setAttribute('aria-selected', String(VIEW === id));
    b.onclick = () => { VIEW = id; buildChrome(); render(); };
    tabs.appendChild(b);
  }
}

/* ═══════════════ RENDER ═══════════════ */
function render() {
  const x = derive();
  for (const [id] of TABS) $('#view-' + id).hidden = id !== VIEW;
  ({ overview: viewOverview, recurring: viewRecurring, categories: viewCategories,
     windfalls: viewWindfalls, transactions: viewTransactions, tools: viewTools }[VIEW])(x);
  const bits = [x.shown.length + ' transactions', x.active.length + ' recurring items'];
  if (S.rules.length) bits.push(S.rules.length + (S.rules.length === 1 ? ' rule' : ' rules'));
  if (x.hiddenCount) bits.push(x.hiddenCount + ' hidden');
  $('#foot-counts').textContent = 'Showing ' + bits.slice(0, -1).join(', ') + ' and ' + bits.at(-1) + '.';
}

const tile = (label, value, delta = '', spark = '') =>
  '<div class="tile"><span class="tile-l">' + esc(label) + '</span>' +
  '<span class="tile-v">' + esc(value) + '</span>' +
  (delta ? '<span class="tile-d">' + delta + '</span>' : '') + spark + '</div>';

/* say where the number came from, in words */
const varBasis = (vs) =>
  vs.method === 'median' ? 'median of ' + vs.months + ' full months'
  : vs.method === 'single' ? 'one full month so far'
  : vs.method === 'extrapolated' ? 'estimated from ' + vs.days + ' days'
  : 'no spend yet';

const chip = (kind, text) =>
  '<span class="chip chip-' + kind + '"><span class="chip-dot"></span>' + esc(text) + '</span>';

/* ── the donut: whole = income, slices = where it went + what survived ── */
function buildPie(x, monthKey) {
  const rows = monthKey === '__avg' ? x.avgRows : x.monthRows(monthKey);
  const spent = rows.reduce((s, r) => s + r.value, 0);
  const income = x.incomeMo;
  // ≤7 slices — past that adjacent arcs stop being tellable apart
  let top = rows.slice(0, 5);
  const tail = rows.slice(5);
  // NB: distinct from Uncategorised, which is also neutral — two identical greys
  // in one legend is unreadable.
  if (tail.length) top = top.concat([{ id: '__other', name: 'Smaller (' + tail.length + ')',
    color: 'rgba(255,255,255,0.42)', value: tail.reduce((s, r) => s + r.value, 0) }]);
  const leftover = Math.max(0, income - spent);
  const slices = top.concat(leftover > 0
    ? [{ id: '__left', name: 'Kept', color: 'rgba(255,255,255,0.13)', value: leftover, isLeftover: true }]
    : []);
  return { slices, spent, income, leftover, over: spent > income, rows };
}

/* ── OVERVIEW ── */
function viewOverview(x) {
  const net = x.incomeMo - x.fixedMo - x.variableMo;
  const cliff = D.cliffMonth(x.pts);
  const end = x.pts.at(-1).base;
  const health = x.thin
    ? { k: 'warning', t: 'Too little history to project' }
    : cliff
    ? { k: 'critical', t: 'Runs dry ' + d.monLabel(cliff) }
    : end < x.spendable ? { k: 'warning', t: 'Down to ' + compact(end) + ' by ' + d.monLabel(x.pts.at(-1).month) }
    : { k: 'good', t: 'Up to ' + compact(end) + ' by ' + d.monLabel(x.pts.at(-1).month) };

  const pieMonth = S.pieMonth && (S.pieMonth === '__avg' || x.months.includes(S.pieMonth))
    ? S.pieMonth : (x.months[0] || '__avg');
  const pie = buildPie(x, pieMonth);

  $('#view-overview').innerHTML =
  '<div class="card hero-card" style="margin-bottom:14px">' +
    '<div class="hero-wrap"><div>' +
      '<div class="hero-label">Spendable right now</div>' +
      '<div class="hero">' + esc(money(x.spendable, { cents: true })) + '</div>' +
      '<div class="hero-sub">' + chip(health.k, health.t) + '</div></div>' +
      '<div class="hero-split">' + x.accounts.map(a =>
        '<div>' + esc(a.name) +
        (a.balanceSource === 'derived'
          ? ' <span class="by-hand" title="Anchored ' + esc(d.short(a.anchor.date)) + ', carried forward by its own transactions">tracked</span>' +
            '<button class="bal-edit" data-bal="' + esc(a.id) + '" title="Re-anchor if this has drifted from the app">' + esc(money(a.shownBalance, { cents: true })) + '</button>' +
            (a.moved ? '<span class="bal-move">' + esc(money(a.moved, { cents: true, sign: true })) + ' since ' + esc(d.short(a.anchor.date)) + '</span>' : '')
          : '<b>' + esc(money(a.shownBalance, { cents: true })) + '</b>')
        + '</div>').join('') +
      '</div></div></div>' +

  '<div class="grid g-kpi" style="margin-bottom:14px">' +
    tile('Income', money(x.incomeMo) + '/mo', '<span class="up">↑</span> ' + esc(VAULT.income?.label || 'recurring')) +
    tile('Fixed costs', money(x.fixedMo) + '/mo', x.active.filter(r => r.direction === 'out').length + ' recurring items') +
    tile('Typical variable', money(x.variableMo) + '/mo',
      S.variableOverride != null ? '<span style="color:var(--warning)">set by hand</span>' : esc(varBasis(x.vs))) +
    tile('Net', money(net, { sign: true }) + '/mo',
      net >= 0 ? '<span class="up">surplus</span>' : '<span class="down">deficit</span>') +
  '</div>' +

  '<div class="card" style="margin-bottom:14px">' +
    '<div class="card-h"><div><h2 class="card-t">Next 12 months</h2>' +
      '<p class="card-s">Balance carried forward: income minus fixed costs minus typical variable spend.</p></div>' +
      '<div class="card-act">' +
        (S.windfalls.some(w => w.date) ? '<button class="ghost-btn" id="tog-wf">' + (S.hideWindfallLine ? 'Show' : 'Hide') + ' windfalls</button>' : '') +
        '<button class="ghost-btn" id="edit-var">Override variable</button></div></div>' +
    (x.thin ? '<div class="caveat"><b>Not enough history to forecast yet.</b> ' + esc(x.thinReason) + '</div>' : '') +
    '<div id="proj"></div>' +
    '<details class="tv"><summary>Table view</summary><div class="tbl-wrap"><table class="tbl">' +
      '<thead><tr><th>Month</th><th class="num">Income</th><th class="num">Fixed</th><th class="num">Variable</th><th class="num">Windfall</th><th class="num">Projected</th><th class="num">With windfalls</th></tr></thead><tbody>' +
      x.pts.slice(1).map(p => '<tr><td>' + esc(d.monLabel(p.month)) + '</td><td class="num">' + esc(money(p.income)) +
        '</td><td class="num">' + esc(money(p.fixed)) + '</td><td class="num">' + esc(money(p.variable)) +
        '</td><td class="num">' + (p.windfall ? esc(money(p.windfall)) : '—') + '</td><td class="num">' + esc(money(p.base)) +
        '</td><td class="num">' + esc(money(p.wf)) + '</td></tr>').join('') +
      '</tbody></table></div></details></div>' +

  '<div class="grid g-2">' +
    // ── review queue (replaces safe-to-spend) ──
    '<div class="card">' +
      '<div class="card-h"><div><h2 class="card-t">Needs a category ' +
        (x.reviewQ.length ? '<span class="rev-count">' + x.reviewQ.length + '</span>' : '') + '</h2>' +
        '<p class="card-s">Money in and out that nothing has confidently sorted. Setting a category also writes a rule for that merchant. A deposit can instead be applied against the expense it paid back.</p></div></div>' +
      (x.reviewQ.length ? (() => {
        const byM = {};
        for (const t of x.reviewQ) { const k = D.normMerchant(t.merchant); (byM[k] = byM[k] || []).push(t); }
        const inFirst = (e) => e[1].every(t => t.amount > 0) ? 0 : 1;
        return Object.entries(byM).sort((a, b) => inFirst(a) - inFirst(b) || b[1].length - a[1].length).slice(0, 7).map(([k, list]) => {
          const t = list[0];
          const isIn = list.every(y => y.amount > 0);
          const sum = list.reduce((s, y) => s + Math.abs(y.netAmount ?? y.amount), 0);
          const noun = isIn ? 'deposit' : 'charge';
          return '<div class="rev-row" data-rev="' + esc(k) + '">' +
            '<div class="rev-l"><div class="rev-m">' + esc(t.merchant) +
              (isIn ? ' <span class="tag tag-applied">money in</span>' : '') + '</div>' +
              '<div class="rev-s">' + list.length + ' ' + noun + (list.length === 1 ? '' : 's') + ' · ' +
              (isIn ? '+' : '') + esc(money(sum)) + ' · latest ' + esc(d.short(t.date)) +
              (isIn ? ' · income, or paying you back?' : '') + '</div></div>' +
            '<div class="rev-a">' +
              (isIn && list.length === 1
                ? '<button class="btn btn-sm" data-rev-apply="' + esc(t.id) + '" title="Apply against the expense it reimbursed">Apply against…</button>'
                : '') +
              '<select class="inp rev-sel" data-rev-sel="' + esc(k) + '">' +
                '<option value="">' + (isIn ? 'Keep as income…' : 'Choose…') + '</option>' + catOptions(x.cats, null, isIn ? 'in' : 'out') + '<option value="__new">+ New category…</option></select>' +
              '<button class="icon-btn" data-rev-rec="' + esc(t.id) + '" title="This repeats — make it recurring">↻</button>' +
              '<button class="icon-btn" data-rev-skip="' + esc(k) + '" title="' + (isIn ? 'Not income — leave it out' : 'Not spending — leave it out') + '">✕</button>' +
            '</div></div>';
        }).join('') + (Object.keys(byM).length > 7 ? '<div class="rev-s" style="padding-top:10px">+ ' + (Object.keys(byM).length - 7) + ' more merchants</div>' : '');
      })() : '<div class="empty">Everything is categorised.</div>') +
    '</div>' +

    // ── donut ──
    '<div class="card">' +
      '<div class="card-h"><div><h2 class="card-t">Where it goes</h2>' +
        '<p class="card-s">The whole ring is a month of income. The pale slice is what never got spent.</p></div>' +
        '<div class="card-act"><select class="inp" id="pie-sel" style="width:auto;padding:6px 9px;font-size:12px">' +
          x.months.slice(0, 8).map(mk => '<option value="' + mk + '"' + (mk === pieMonth ? ' selected' : '') + '>' +
            esc(d.parse(mk + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })) +
            (mk === x.months[0] ? ' (this month)' : '') + '</option>').join('') +
          '<option value="__avg"' + (pieMonth === '__avg' ? ' selected' : '') + '>6-month average</option>' +
        '</select></div></div>' +
      (pie.over
        ? '<div class="over-note">' + esc(money(pie.spent - pie.income)) + ' more went out than came in' + (pieMonth === x.months[0] ? ' so far this month' : ' that month') + '.</div>'
        : '') +
      '<div class="donut-wrap"><div class="donut-svg" id="donut"></div>' +
        '<div class="donut-key">' + pie.slices.map(r =>
          (r.isLeftover
            ? '<div class="dk-row"><span class="dk-sw" style="background:' + r.color + ';border:1px dashed rgba(255,255,255,.3)"></span>' +
              '<span class="dk-n">' + esc(r.name) + '</span><span class="dk-v">' + esc(money(r.value)) + '</span></div>'
            : '<button class="dk-row dk-click" data-slice="' + esc(r.id) + '" title="See and recategorise these">' +
              '<span class="dk-sw" style="background:' + r.color + '"></span>' +
              '<span class="dk-n">' + esc(r.name) + '</span><span class="dk-v">' + esc(money(r.value)) + '</span></button>')
          ).join('') +
        '<div class="ring-key"><span><span class="ring-dot"></span>selected</span><span><span class="ring-dot dim"></span>6-mo average</span></div>' +
        '</div></div>' +
      '<details class="tv"><summary>Table view</summary><div class="tbl-wrap"><table class="tbl">' +
        '<thead><tr><th>Slice</th><th class="num">Selected</th><th class="num">6-mo avg</th></tr></thead><tbody>' +
        pie.slices.map(r => { const a = x.avgRows.find(y => y.id === r.id);
          return '<tr><td>' + esc(r.name) + '</td><td class="num">' + esc(money(r.value)) + '</td><td class="num">' +
            (r.isLeftover ? '—' : esc(money(a ? a.value : 0))) + '</td></tr>'; }).join('') +
        '</tbody></table></div></details>' +
    '</div>' +
  '</div>';

  const host = $('#proj');
  const showWf = S.windfalls.some(w => w.date) && !S.hideWindfallLine;
  const draw = () => projectionChart(host, x.pts, { hasWindfalls: showWf });
  draw();
  if (host._ro) host._ro.disconnect();
  host._ro = new ResizeObserver(() => draw()); host._ro.observe(host);

  const dh = $('#donut');
  const avgPie = buildPie(x, '__avg');
  const drawD = () => donutChart(dh, {
    inner: pie.slices, outer: avgPie.slices,
    centerTop: pieMonth === '__avg' ? '6-month average' : d.monLabel(pieMonth + '-01'),
    centerValue: compact(pie.spent),
    centerSub: 'of ' + compact(pie.income) + ' income',
    innerLabel: pieMonth === '__avg' ? '6-month average' : d.monLabel(pieMonth + '-01'),
    onSlice: (r) => r.isLeftover || openCategory(r.id, pieMonth, x),
    outerLabel: '6-month average',
  });
  drawD();
  if (dh._ro) dh._ro.disconnect();
  dh._ro = new ResizeObserver(() => drawD()); dh._ro.observe(dh);

  $('#pie-sel').onchange = (e) => { S.pieMonth = e.target.value; D.saveState(S); render(); };
  $$('[data-slice]').forEach(b => b.onclick = () => openCategory(b.dataset.slice, pieMonth, x));
  $$('[data-bal]').forEach(b => b.onclick = () => editBalance(b.dataset.bal, x));
  $('#edit-var').onclick = () => editVariable(x);
  const tw = $('#tog-wf');
  if (tw) tw.onclick = () => { S.hideWindfallLine = !S.hideWindfallLine; D.saveState(S); render(); };

  $$('[data-rev-sel]').forEach(sel => sel.onchange = (e) => {
    const key = sel.dataset.revSel;
    let cat = e.target.value; if (!cat) return;
    if (cat === '__new') {
      const row = sel.closest('.rev-row');
      const dir = row && row.textContent.includes('money in') ? 'in' : 'out';
      sel.value = '';
      addCategory(x, dir, (newId) => {
        for (const t of x.reviewQ) if (D.normMerchant(t.merchant) === key) S.manual[t.id] = newId;
        S.rules.push({ field: 'merchant', op: 'contains', value: key, category: newId });
        D.saveState(S); render();
      });
      return;
    }
    for (const t of x.reviewQ) if (D.normMerchant(t.merchant) === key) S.manual[t.id] = cat;
    S.rules.push({ field: 'merchant', op: 'contains', value: key, category: cat });
    D.saveState(S); render();
  });
  $$('[data-rev-apply]').forEach(b => b.onclick = () => applyAgainst(b.dataset.revApply, x));
  $$('[data-rev-rec]').forEach(b => b.onclick = () => {
    // carry whatever category is already picked in the row across
    const sel = b.closest('.rev-row').querySelector('.rev-sel');
    const c = sel && sel.value && sel.value !== '__new' ? sel.value : null;
    makeRecurring(b.dataset.revRec, x, c);
  });
  $$('[data-rev-skip]').forEach(b => b.onclick = () => {
    const key = b.dataset.revSkip;
    for (const t of x.reviewQ) if (D.normMerchant(t.merchant) === key) S.excluded[t.id] = true;
    D.saveState(S); render();
  });
}

/* ── RECURRING ── */
function viewRecurring(x) {
  const bySize = (a, b) =>
    (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1) ||
    perMonth(b.amount, b.cadence) - perMonth(a.amount, a.cadence);
  const NOISE = 15;
  const counted = x.recurring.filter(r => !r.excluded).sort(bySize);
  const maybe   = x.recurring.filter(r => r.excluded && r.confidence >= NOISE).sort(bySize);
  const hidden  = x.recurring.filter(r => r.excluded && r.confidence < NOISE).length;

  const head = '<thead><tr><th style="width:34px"></th><th>Merchant</th><th>Cadence</th>' +
    '<th class="num">Amount</th><th class="num">Per month</th><th>Next</th><th>Confidence</th><th></th></tr></thead>';

  const row = (r) => {
    const effNow = D.effectiveAmount(r, d.monthStart(VAULT.asOf));
    const future = (r.overrides || []).filter(o => o.from > VAULT.asOf).sort((a, b) => a.from < b.from ? -1 : 1);
    const ck = r.confidence >= 80 ? 'good' : r.confidence >= 55 ? 'warning' : 'serious';
    return '<tr data-id="' + esc(r.id) + '">' +
      '<td><input type="checkbox" ' + (r.excluded ? '' : 'checked') + ' data-act="toggle" aria-label="Include in forecast"></td>' +
      '<td>' + esc(r.merchant) + (r.direction === 'in' ? ' <span style="color:var(--good);font-size:11px">income</span>' : '') +
        (future.length ? '<div style="font-size:11px;color:var(--lilac);margin-top:2px">→ ' + esc(money(future[0].amount)) + ' from ' + esc(d.long(future[0].from)) + '</div>' : '') + '</td>' +
      '<td style="font-size:12.5px;color:var(--text-secondary)">' + esc(cadenceLabel(r.cadence)) + '</td>' +
      '<td class="num">' + esc(money(effNow, { cents: true })) + '</td>' +
      '<td class="num">' + esc(money(perMonth(effNow, r.cadence))) + '</td>' +
      '<td style="font-size:12.5px;color:var(--text-secondary)">' + (r.nextDue ? esc(d.short(r.nextDue)) : '—') + '</td>' +
      '<td>' + (r.source === 'manual' || r.source === 'declared' ? chip('good', 'declared')
        : r.source === 'seeded' ? chip('warning', 'assumed')
        : chip(ck, r.confidence + '%')) + '</td>' +
      '<td><button class="btn-x" data-act="edit">Change</button></td></tr>';
  };

  // calendar items — every hit of every active item inside the shown month
  const calMonth = S.calMonth || d.month(VAULT.asOf);
  const items = [];
  for (const r of x.active) {
    if (!r.nextDue) continue;
    const step = Math.round(D.cadenceDays(r.cadence));
    // walk backwards then forwards so the viewed month is covered either way
    let cur = r.nextDue;
    while (cur > calMonth + '-01') cur = d.addDays(cur, -step);
    for (let k = 0; k < 40 && cur <= calMonth + '-31'; k++) {
      if (d.month(cur) === calMonth)
        items.push({ merchant: r.merchant, amount: D.effectiveAmount(r, cur), direction: r.direction, dueDate: cur });
      cur = d.addDays(cur, step);
    }
  }
  const monthTotalOut = items.filter(i => i.direction !== 'in').reduce((s, i) => s + Math.abs(i.amount), 0);
  const monthTotalIn  = items.filter(i => i.direction === 'in').reduce((s, i) => s + Math.abs(i.amount), 0);

  $('#view-recurring').innerHTML =
  '<div class="card">' +
    '<div class="card-h"><div><h2 class="card-t">In your forecast</h2>' +
      '<p class="card-s">' + counted.length + ' items driving the 12-month projection. Untick anything that doesn\'t belong.</p></div>' +
      '<div class="card-act"><button class="btn btn-sm" id="add-rec">Add manually</button></div></div>' +
    '<div class="tbl-wrap"><table class="tbl">' + head + '<tbody>' + counted.map(row).join('') + '</tbody></table></div></div>' +

  '<div class="card" style="margin-top:14px">' +
    '<div class="card-h"><div><h2 class="card-t">Bill calendar</h2>' +
      '<p class="card-s">Tap a day to see what lands on it.</p></div>' +
      '<div class="card-act cal-nav">' +
        '<button class="icon-btn" id="cal-prev" aria-label="Previous month">‹</button>' +
        '<span class="cal-mo">' + esc(d.parse(calMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })) + '</span>' +
        '<button class="icon-btn" id="cal-next" aria-label="Next month">›</button>' +
      '</div></div>' +
    '<div id="billcal"></div>' +
    '<div class="row" style="justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:12.5px">' +
      '<span style="color:var(--muted)">' + items.length + ' charges this month</span>' +
      '<span class="num">' + esc(money(monthTotalIn, { sign: true })) + ' in · ' + esc(money(monthTotalOut)) + ' out</span></div>' +
  '</div>' +

  '<div class="card" style="margin-top:14px">' +
    '<h2 class="card-t">Possible, not counted</h2>' +
    '<p class="card-s">Repeats the detector noticed but isn\'t sure about — mostly shops you visit often rather than bills.' +
      (hidden ? ' ' + hidden + ' weaker guesses hidden.' : '') + '</p>' +
    (maybe.length ? '<details class="tv"><summary>' + maybe.length + ' candidates</summary>' +
      '<div class="tbl-wrap"><table class="tbl">' + head + '<tbody>' + maybe.map(row).join('') + '</tbody></table></div></details>'
      : '<div class="empty">Nothing pending.</div>') +
  '</div>';

  monthCalendar($('#billcal'), {
    month: calMonth, items, picked: S.calDay || null,
    onPick: (day) => { S.calDay = day; D.saveState(S); render(); },
  });
  $('#cal-prev').onclick = () => { S.calMonth = d.month(d.addMonths(calMonth + '-01', -1)); S.calDay = null; D.saveState(S); render(); };
  $('#cal-next').onclick = () => { S.calMonth = d.month(d.addMonths(calMonth + '-01', 1)); S.calDay = null; D.saveState(S); render(); };
  $('#add-rec').onclick = () => editRecurring(null, x);
  $$('#view-recurring tbody tr').forEach(tr => {
    const id = tr.dataset.id;
    $('[data-act="toggle"]', tr).onchange = (e) => {
      S.recurringEdits[id] = { ...(S.recurringEdits[id] || {}), excluded: !e.target.checked };
      D.saveState(S); render();
    };
    $('[data-act="edit"]', tr).onclick = () => editRecurring(x.recurring.find(r => r.id === id), x);
  });
}

/* ── CATEGORIES ── */
function viewCategories(x) {
  $('#view-categories').innerHTML = `
    <div class="grid g-2">
      <div class="card">
        <h2 class="card-t">Spend by category</h2>
        <p class="card-s">${esc(money(x.spendTotal))} across ${x.inRange.filter(t => t.amount < 0).length} charges in this range.</p>
        <div id="catbars2"></div>
        <details class="tv"><summary>Table view</summary>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Category</th><th class="num">Spend</th><th class="num">Share</th><th class="num">Count</th><th class="num">Per month</th></tr></thead>
            <tbody>${x.catRows.map(r => `<tr>
              <td><span class="cat-dot" style="background:${r.color};display:inline-block;margin-right:7px"></span>${esc(r.name)}</td>
              <td class="num">${esc(money(r.value, { cents: true }))}</td>
              <td class="num">${(x.spendTotal ? r.value / x.spendTotal * 100 : 0).toFixed(1)}%</td>
              <td class="num">${r.count}</td>
              <td class="num">${esc(money(x.vs.byCategory[r.id] || 0))}</td></tr>`).join('')}</tbody>
          </table></div>
        </details>
      </div>

      <div class="card">
        <div class="card-h"><div><h2 class="card-t">Rules</h2>
          <p class="card-s">First match wins. A category you set by hand on a single transaction always beats a rule.</p></div>
          <div class="card-act"><button class="btn btn-sm" id="add-rule">New rule</button></div></div>
        ${S.rules.length ? S.rules.map((r, i) => `
          <div class="row" style="justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.045)">
            <div style="font-size:12.5px;min-width:0">
              <span style="color:var(--muted)">${esc(r.field)} ${esc(r.op)}</span>
              <span style="font-family:var(--mono);color:var(--fg)">"${esc(r.value)}"</span>
              <span style="color:var(--muted)">→</span>
              <span class="cat-pill" style="cursor:default"><span class="cat-dot" style="background:${catColor(x.cats, r.category)}"></span>${esc(catName(x.cats, r.category))}</span>
            </div>
            <button class="btn-x" data-rule="${i}">Remove</button>
          </div>`).join('') : '<div class="empty">No rules yet. Add one, or open a transaction and turn it into a rule.</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-h"><div><h2 class="card-t">Your categories</h2>
        <p class="card-s">Colour follows the category, not its size — re-sorting never repaints anything.</p></div>
        <div class="card-act"><button class="btn btn-sm" id="add-cat">Add category</button></div></div>
      <div class="row">${x.cats.map(c => `
        <span class="cat-pill" style="cursor:default"><span class="cat-dot" style="background:${slotColor(c.slot)}"></span>${esc(c.name)}</span>`).join('')}</div>
    </div>`;

  categoryBars($('#catbars2'), x.catRows, x.spendTotal);
  $('#add-rule').onclick = () => editRule(x);
  $('#add-cat').onclick = () => addCategory(x, 'out');
  $$('[data-rule]').forEach(b => b.onclick = () => { S.rules.splice(+b.dataset.rule, 1); D.saveState(S); render(); });
}

/* ── WINDFALLS ── */
function viewWindfalls(x) {
  const total = S.windfalls.reduce((s, w) => s + Number(w.amount || 0), 0);
  const dated = S.windfalls.filter(w => w.date);
  $('#view-windfalls').innerHTML = `
    <div class="note-banner">
      Windfalls are notes. They are excluded from every balance, total and
      projection on this site — the only place they appear is the dashed line on
      the 12-month chart, and only if you've given one a date.
    </div>
    <div class="card">
      <div class="card-h">
        <div><h2 class="card-t">Expected windfalls</h2>
          <p class="card-s">${S.windfalls.length} tracked · ${esc(money(total))} total · ${dated.length} dated and on the chart</p></div>
        <div class="card-act"><button class="btn btn-sm" id="add-wf">Add windfall</button></div>
      </div>
      <div class="grid" style="gap:10px;margin-top:6px">
        ${S.windfalls.length ? S.windfalls.map((w, i) => `
          <div class="wf">
            <div class="wf-l">
              <div class="wf-name">${esc(w.name)}</div>
              <div class="wf-meta">${w.date ? esc(d.long(w.date)) : 'no date yet — not on the chart'}${w.confidence ? ` · ${esc(w.confidence)} confidence` : ''}</div>
              ${w.note ? `<div class="wf-note">${esc(w.note)}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="wf-amt">${esc(money(Number(w.amount || 0)))}</div>
              <div class="row" style="justify-content:flex-end;margin-top:7px">
                <button class="btn-x" data-wf-edit="${i}">Edit</button>
                <button class="btn-x" data-wf-del="${i}">Remove</button>
              </div>
            </div>
          </div>`).join('') : '<div class="empty">Nothing tracked yet.</div>'}
      </div>
    </div>`;
  $('#add-wf').onclick = () => editWindfall(null);
  $$('[data-wf-edit]').forEach(b => b.onclick = () => editWindfall(+b.dataset.wfEdit));
  $$('[data-wf-del]').forEach(b => b.onclick = () => { S.windfalls.splice(+b.dataset.wfDel, 1); D.saveState(S); render(); });
}

/* ── TRANSACTIONS ── */
let txSort = { k: 'date', dir: -1 }, txQ = '';
function viewTransactions(x) {
  const q = txQ.toLowerCase();
  const showHidden = !!S.showHidden;
  let rows = x.inRange.filter(t => showHidden || !t.excluded);
  if (q) rows = rows.filter(t => (t.merchant + ' ' + t.description).toLowerCase().includes(q));
  rows.sort((a, b) => {
    const k = txSort.k;
    const av = k === 'amount' ? (a.netAmount ?? a.amount) : k === 'category' ? catName(x.cats, a.category) : a[k];
    const bv = k === 'amount' ? (b.netAmount ?? b.amount) : k === 'category' ? catName(x.cats, b.category) : b[k];
    return (av < bv ? -1 : av > bv ? 1 : 0) * txSort.dir;
  });

  const hiddenInRange = x.inRange.filter(t => t.excluded).length;

  $('#view-transactions').innerHTML =
  '<div class="card">' +
    '<div class="card-h"><div><h2 class="card-t">Transactions</h2>' +
      '<p class="card-s">' + rows.length + ' shown' + (hiddenInRange ? ' · ' + hiddenInRange + ' hidden in this range' : '') +
      '. Use ⊘ to drop one from every total, and ⇄ on money in to apply it against what it paid back.</p></div>' +
      '<div class="card-act" style="gap:8px">' +
        '<button class="ghost-btn" id="tog-hidden" aria-pressed="' + showHidden + '">' + (showHidden ? 'Hide excluded' : 'Show excluded') + '</button>' +
        '<div style="flex:1 1 160px;max-width:230px"><input class="inp" id="tx-q" placeholder="Search merchant…" value="' + esc(txQ) + '"></div>' +
      '</div></div>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th class="sortable" data-k="date">Date</th>' +
      '<th class="sortable" data-k="merchant">Merchant</th>' +
      '<th>Account</th>' +
      '<th class="sortable" data-k="category">Category</th>' +
      '<th class="sortable num" data-k="amount">Amount</th>' +
      '<th style="width:74px"></th>' +
    '</tr></thead><tbody>' + rows.map(t => {
      const netted = t.credit > 0 && t.amount < 0;
      const target = t.appliedTo ? x.all.find(y => y.id === t.appliedTo) : null;
      return '<tr class="' + (t.excluded || t.isApplied ? 'is-out' : '') + '">' +
        '<td style="white-space:nowrap;color:var(--text-secondary);font-size:12.5px">' + esc(d.short(t.date)) + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">' + esc(t.merchant) +
          (t.autoHidden ? '<span class="tag tag-hidden">hidden</span>' : '') +
          (t.isApplied && target ? '<span class="tag tag-applied">→ ' + esc(target.merchant) + '</span>' : '') +
          '</div>' +
          (netted ? '<div class="tag-credit" style="margin-top:3px">' + esc(money(Math.abs(t.amount), { cents: true })) + ' less ' + esc(money(t.credit, { cents: true })) + ' paid back</div>' : '') +
        '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + esc((VAULT.accounts.find(a => a.id === t.account) || {}).name || t.account) + '</td>' +
        '<td><button class="cat-pill" data-tx="' + esc(t.id) + '"><span class="cat-dot" style="background:' + catColor(x.cats, t.category) + '"></span>' + esc(catName(x.cats, t.category)) + '</button></td>' +
        '<td class="num ' + ((t.netAmount ?? t.amount) < 0 ? 'neg' : 'pos') + '">' + esc(money(t.netAmount ?? t.amount, { cents: true, sign: true })) + '</td>' +
        '<td><div class="row" style="gap:4px;flex-wrap:nowrap">' +
          (t.amount > 0 && !t.excluded
            ? '<button class="icon-btn ' + (t.isApplied ? 'on' : '') + '" data-apply="' + esc(t.id) + '" title="Apply against an expense">⇄</button>' : '') +
          (!t.excluded && !t.isApplied && t.category !== 'transfer'
            ? '<button class="icon-btn" data-mkrec="' + esc(t.id) + '" title="Make this a recurring item">↻</button>' : '') +
          '<button class="icon-btn ' + (t.excluded ? 'on' : '') + '" data-excl="' + esc(t.id) + '" title="' + (t.excluded ? 'Count this again' : 'Leave out of every total') + '">' + (t.excluded ? '↺' : '⊘') + '</button>' +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div>' +
    (rows.length ? '' : '<div class="empty">Nothing matches.</div>') +
  '</div>';

  const qi = $('#tx-q');
  qi.oninput = (e) => { txQ = e.target.value; const p = e.target.selectionStart; render(); const n = $('#tx-q'); n.focus(); n.setSelectionRange(p, p); };
  $('#tog-hidden').onclick = () => { S.showHidden = !S.showHidden; D.saveState(S); render(); };
  $$('#view-transactions th.sortable').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    txSort = { k, dir: txSort.k === k ? -txSort.dir : (k === 'date' || k === 'amount' ? -1 : 1) };
    render();
  });
  $$('[data-tx]').forEach(b => b.onclick = () => assignCategory(b.dataset.tx, x));
  $$('[data-excl]').forEach(b => b.onclick = () => {
    const id = b.dataset.excl;
    const t = x.all.find(y => y.id === id);
    if (t.autoHidden) { S.unhidden[id] = true; }
    else if (S.excluded[id]) { delete S.excluded[id]; }
    else { S.excluded[id] = true; }
    D.saveState(S); render();
  });
  $$('[data-apply]').forEach(b => b.onclick = () => applyAgainst(b.dataset.apply, x));
  $$('[data-mkrec]').forEach(b => b.onclick = () => makeRecurring(b.dataset.mkrec, x));
}

/* ── apply a reimbursement against the expense it paid back ──
   Rather than booking \$218 out and \$109 in, the dinner just cost \$109. */
function applyAgainst(incomeId, x) {
  const inc = x.all.find(t => t.id === incomeId);
  const current = S.appliedAgainst[incomeId] || '';
  // candidates: money out, still counting, most recent first
  const cands = x.all
    .filter(t => t.amount < 0 && !t.excluded && t.date <= inc.date)
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
    .slice(0, 60);

  modal('Apply against',
    esc(inc.merchant) + ' · ' + esc(money(inc.amount, { cents: true, sign: true })) + ' · ' + esc(d.long(inc.date)) +
    '<br><span style="color:var(--muted-2)">Pick what this paid you back for. The expense shrinks; this stops counting as income.</span>',
    '<div class="field"><label>Search</label><input class="inp" id="ap-q" placeholder="Filter by merchant…"></div>' +
    '<div id="ap-list" style="margin-top:12px;max-height:290px;overflow-y:auto"></div>' +
    (current ? '<button class="btn-x" id="ap-clear" style="margin-top:12px">Unlink from current</button>' : ''),
    () => { if (picked !== undefined) { if (picked === null) delete S.appliedAgainst[incomeId]; else S.appliedAgainst[incomeId] = picked; } },
    'Save');

  let picked = current || undefined;
  const list = $('#ap-list');
  const paint = (filter = '') => {
    const f = filter.toLowerCase();
    const shown = cands.filter(t => !f || t.merchant.toLowerCase().includes(f));
    list.innerHTML = shown.length ? shown.map(t => {
      const already = (t.credit || 0);
      return '<label class="rev-row" style="cursor:pointer;gap:10px">' +
        '<input type="radio" name="apt" value="' + esc(t.id) + '"' + (picked === t.id ? ' checked' : '') + '>' +
        '<span class="rev-l"><span class="rev-m">' + esc(t.merchant) + '</span>' +
        '<span class="rev-s">' + esc(d.long(t.date)) + (already ? ' · ' + esc(money(already)) + ' already applied' : '') + '</span></span>' +
        '<span class="rev-v">' + esc(money(t.amount, { cents: true })) + '</span></label>';
    }).join('') : '<div class="empty">No matching expenses.</div>';
    $$('input[name="apt"]', list).forEach(r => r.onchange = () => { picked = r.value; });
  };
  paint();
  $('#ap-q').oninput = (e) => paint(e.target.value);
  const clr = $('#ap-clear');
  if (clr) clr.onclick = () => { picked = null; $$('input[name="apt"]', list).forEach(r => r.checked = false); };
}

/* ── TOOLS ── */
function viewTools(x) {
  // subscription audit — small, steady, monthly-or-faster charges
  const subs = x.active.filter(r => r.direction === 'out' && Math.abs(r.amount) <= 80 &&
    ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(r.cadence))
    .map(r => ({ ...r, yr: perMonth(D.effectiveAmount(r, VAULT.asOf), r.cadence) * 12 }))
    .sort((a, b) => b.yr - a.yr);
  const subsYr = subs.reduce((s, r) => s + r.yr, 0);

  // anomalies — a charge well above that merchant's own norm
  const byM = new Map();
  for (const t of x.counting.filter(t => t.amount < 0)) {
    const k = D.normMerchant(t.merchant); if (!byM.has(k)) byM.set(k, []); byM.get(k).push(t);
  }
  const anomalies = [];
  for (const [, list] of byM) {
    if (list.length < 4) continue;
    const amts = list.map(t => Math.abs(t.amount));
    const m = amts.reduce((s, v) => s + v, 0) / amts.length;
    const sd = Math.sqrt(amts.reduce((s, v) => s + (v - m) ** 2, 0) / amts.length);
    if (sd < 1) continue;
    for (const t of list) {
      if (t.date < x.floor) continue;
      const z = (Math.abs(t.amount) - m) / sd;
      if (z >= 2) anomalies.push({ ...t, z, typical: m });
    }
  }
  anomalies.sort((a, b) => b.z - a.z);

  // paycheck-to-paycheck buckets
  const payDates = x.all.filter(t => t.amount > 0 && t.date >= x.floor).map(t => t.date).sort();
  const periods = [];
  for (let i = 0; i < payDates.length; i++) {
    const a = payDates[i], b = payDates[i + 1] || VAULT.asOf;
    if (a === b) continue;
    const spent = x.all.filter(t => t.amount < 0 && t.category !== 'transfer' && t.date >= a && t.date < b)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    periods.push({ a, b, spent, open: !payDates[i + 1] });
  }

  const cliff = D.cliffMonth(x.pts);

  $('#view-tools').innerHTML = `
    <div class="note-banner">Extra instruments — tell me which of these earn their place and I'll keep those, cut the rest.</div>

    <div class="grid g-2">
      <div class="card">
        <h2 class="card-t">Subscription audit</h2>
        <p class="card-s">Small recurring charges, priced by the year — where the quiet money goes.</p>
        <div class="hero" style="font-size:34px">${esc(money(subsYr))}<span style="font-size:15px;color:var(--muted);font-weight:400">/yr</span></div>
        <div style="margin-top:14px">
          ${subs.length ? subs.map(r => `
            <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
              <span style="font-size:13px">${esc(r.merchant)}</span>
              <span class="num" style="font-size:12.5px;color:var(--text-secondary)">${esc(money(Math.abs(r.amount), { cents: true }))} ${esc(cadenceLabel(r.cadence).toLowerCase())} · <b style="color:var(--fg)">${esc(money(r.yr))}/yr</b></span>
            </div>`).join('') : '<div class="empty">None detected yet.</div>'}
        </div>
      </div>

      <div class="card">
        <h2 class="card-t">What-if</h2>
        <p class="card-s">Cut typical variable spend and watch the 12-month line move.</p>
        <div style="margin:18px 0 8px">
          <input type="range" id="whatif" min="0" max="50" value="0" step="5" style="width:100%;accent-color:var(--violet)">
        </div>
        <div class="row" style="justify-content:space-between;font-size:12px;color:var(--muted)"><span>no change</span><span>−50%</span></div>
        <div id="whatif-out" style="margin-top:18px"></div>
      </div>
    </div>

    <div class="grid g-2" style="margin-top:14px">
      <div class="card">
        <h2 class="card-t">Unusual charges</h2>
        <p class="card-s">More than 2 standard deviations above what that merchant normally costs you.</p>
        ${anomalies.length ? anomalies.slice(0, 8).map(t => `
          <div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <div style="min-width:0"><div style="font-size:13px">${esc(t.merchant)}</div>
              <div style="font-size:11.5px;color:var(--muted-2)">${esc(d.short(t.date))} · usually ${esc(money(t.typical))}</div></div>
            <span class="num" style="color:var(--warning)">${esc(money(Math.abs(t.amount), { cents: true }))}</span>
          </div>`).join('') : '<div class="empty">Nothing unusual — or not enough history yet.</div>'}
      </div>

      <div class="card">
        <h2 class="card-t">Paycheck to paycheck</h2>
        <p class="card-s">Spend bucketed between deposits, not by calendar month — closer to how it actually feels.</p>
        ${periods.length ? periods.map(p => {
          const max = Math.max(...periods.map(q => q.spent)) || 1;
          return `<div style="padding:8px 0">
            <div class="row" style="justify-content:space-between;font-size:12.5px">
              <span style="color:var(--text-secondary)">${esc(d.short(p.a))} → ${esc(p.open ? 'now' : d.short(p.b))}${p.open ? ' <span style="color:var(--muted-2)">(open)</span>' : ''}</span>
              <span class="num">${esc(money(p.spent))}</span></div>
            <div class="meter-track" style="margin-top:6px"><div class="meter-fill" style="width:${(p.spent / max * 100).toFixed(0)}%;background:var(--series-1);opacity:${p.open ? 0.5 : 1}"></div></div>
          </div>`;
        }).join('') : '<div class="empty">Not enough history yet.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div><h2 class="card-t">Hidden from everything</h2>
        <p class="card-s">Gaming and crypto-rail charges dated before ${esc(S.hideBefore || G.HIDE_BEFORE)} are out of every
          total, chart and forecast. Anything from that date on still shows up normally.</p></div>
        <div class="card-act"><button class="ghost-btn" id="unhide-all">Show them again</button></div></div>
      ${(() => {
        const rails = x.all.filter(t => t.autoHidden);
        const by = {};
        for (const t of rails) { by[t.gamblingGroup] = by[t.gamblingGroup] || { n: 0, v: 0 }; by[t.gamblingGroup].n++; by[t.gamblingGroup].v += Math.abs(t.amount); }
        const rows = Object.entries(by).sort((a, b) => b[1].v - a[1].v);
        if (!rows.length) return '<div class="empty">Nothing hidden.</div>';
        const stillOn = x.all.filter(t => t.gamblingGroup && !t.autoHidden).length;
        return rows.map(([g, v]) =>
          '<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.045)">' +
            '<span style="font-size:13px;color:var(--text-secondary)">' + esc(g) + '</span>' +
            '<span class="num" style="font-size:12.5px">' + v.n + ' · ' + esc(money(v.v)) + '</span></div>').join('') +
          '<div class="rev-s" style="padding-top:11px">' + rails.length + ' charges hidden' +
          (stillOn ? ', ' + stillOn + ' from on or after the cutoff still visible' : '') + '.</div>';
      })()}
    </div>

    <div class="card">
      <h2 class="card-t">Cliff date</h2>
      <p class="card-s">When the projection crosses zero, if nothing changes.</p>
      <div style="margin-top:8px">${cliff
        ? `${chip('critical', `Zero around ${d.monLabel(cliff)}`)} <span style="font-size:13px;color:var(--muted);margin-left:8px">${esc(money(x.spendable))} today, ${esc(money(x.incomeMo - x.fixedMo - x.variableMo, { sign: true }))}/mo</span>`
        : chip('good', 'No crossing inside 12 months')}</div>
    </div>`;

  const ua = $('#unhide-all');
  if (ua) ua.onclick = () => {
    for (const t of x.all) if (t.autoHidden) S.unhidden[t.id] = true;
    D.saveState(S); render();
  };

  const slider = $('#whatif'), out = $('#whatif-out');
  const upd = () => {
    const cut = +slider.value / 100;
    const pts = D.project({
      startBalance: x.spendable, startDate: VAULT.asOf, months: 12,
      recurring: x.active, variablePerMonth: x.variableMo * (1 - cut),
      windfalls: S.windfalls.filter(w => w.date),
    });
    const c = D.cliffMonth(pts);
    out.innerHTML = `
      <div class="row" style="justify-content:space-between;font-size:13px">
        <span style="color:var(--muted)">Variable spend</span>
        <span class="num">${esc(money(x.variableMo * (1 - cut)))}/mo</span></div>
      <div class="row" style="justify-content:space-between;font-size:13px;margin-top:7px">
        <span style="color:var(--muted)">Balance in 12 months</span>
        <span class="num" style="color:${pts.at(-1).base < 0 ? 'var(--critical)' : 'var(--good)'}">${esc(money(pts.at(-1).base))}</span></div>
      <div style="margin-top:12px">${c ? chip('critical', `Still runs dry ${d.monLabel(c)}`) : chip('good', 'Stays above zero')}</div>`;
  };
  slider.oninput = upd; upd();
}

/* Click a slice → its transactions, each recategorisable in place. */
function openCategory(catId, monthKey, x) {
  const inMonth = (t) => monthKey === '__avg' || d.month(t.date) === monthKey;
  const ids = catId === '__other'
    ? new Set(x.catRows.slice(8).map(r => r.id))
    : null;
  const rows = x.counting.filter(t =>
    t.amount < 0 && t.category !== 'transfer' && inMonth(t) &&
    (ids ? ids.has(t.category) : t.category === catId))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  const total = rows.reduce((s, t) => s + Math.abs(t.netAmount ?? t.amount), 0);
  const title = catId === '__other' ? 'Smaller categories' : catName(x.cats, catId);

  modal(title,
    rows.length + ' charge' + (rows.length === 1 ? '' : 's') + ' · ' + esc(money(total)) +
    ' · ' + esc(monthKey === '__avg' ? 'across all stored months' : d.monLabel(monthKey + '-01')) +
    '<br><span style="color:var(--muted-2)">Change any one here and it updates everywhere.</span>',
    rows.length
      ? '<div style="max-height:360px;overflow-y:auto;margin-top:4px">' + rows.map(t =>
          '<div class="rev-row"><div class="rev-l">' +
            '<div class="rev-m">' + esc(t.merchant) + '</div>' +
            '<div class="rev-s">' + esc(d.long(t.date)) + ' · ' + esc((VAULT.accounts.find(a => a.id === t.account) || {}).name || t.account) + '</div>' +
          '</div><div class="rev-a">' +
            '<span class="rev-v">' + esc(money(t.netAmount ?? t.amount, { cents: true })) + '</span>' +
            '<select class="inp rev-sel" data-drill="' + esc(t.id) + '">' +
              catOptions(x.cats, t.category, 'out') + '</select>' +
          '</div></div>').join('') + '</div>'
      : '<div class="empty">Nothing in here.</div>',
    () => {}, 'Done');

  $$('[data-drill]').forEach(sel => sel.onchange = (e) => {
    S.manual[sel.dataset.drill] = e.target.value;
    D.saveState(S);
    sel.closest('.rev-row').style.opacity = '.45';
  });
}

/* Promote a single transaction to a recurring item.
   With a short history the detector cannot see a monthly bill at all — it needs
   two sightings — so anything real has to be declared by hand. Every transaction
   from the same merchant is linked to it, so variable spend stops counting them
   twice. */
function makeRecurring(txnId, x, presetCat) {
  const t = x.all.find(y => y.id === txnId);
  if (!t) return;
  const key = D.normMerchant(t.merchant);
  const siblings = x.counting.filter(y => D.normMerchant(y.merchant) === key);
  const dir = t.amount > 0 ? 'in' : 'out';
  const cats = D.catsFor(x.cats, dir);
  const preset = presetCat || (t.catSource === 'manual' || t.catSource === 'rule' ? t.category : (dir === 'in' ? 'income' : 'other'));

  modal('Make recurring',
    esc(t.merchant) + ' · ' + esc(money(t.amount, { cents: true, sign: true })) + ' · ' + esc(d.long(t.date)) +
    '<br><span style="color:var(--muted-2)">' + (siblings.length > 1
      ? siblings.length + ' charges from this merchant will be linked so they are not counted twice.'
      : 'Only ' + esc(d.short(t.date)) + ' is in the loaded history — say how often it really repeats.') + '</span>',
    '<div class="row">' +
      '<div class="field"><label>How often</label><select class="inp" id="mr-cad">' +
        ['weekly','biweekly','semimonthly','monthly','quarterly','annual']
          .map(c => '<option value="' + c + '"' + (c === 'monthly' ? ' selected' : '') + '>' + esc(cadenceLabel(c)) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Amount</label><input class="inp" id="mr-amt" type="number" step="0.01" value="' + Math.abs(t.amount).toFixed(2) + '"></div>' +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      '<div class="field"><label>Next due</label><input class="inp" id="mr-next" type="date" value="' + esc(nextAfter(t.date, 'monthly', VAULT.asOf)) + '"></div>' +
      '<div class="field"><label>Category</label><select class="inp" id="mr-cat">' + catOptions(cats, preset) + '</select></div>' +
    '</div>' +
    '<p class="card-s" style="margin:14px 0 0">Shows as <b>declared</b> in Recurring, and drives the 12-month forecast.</p>',
    (m) => {
      const cad = $('#mr-cad', m).value;
      S.recurringManual.push({
        id: 'man:' + key + ':' + dir,
        merchant: t.merchant,
        amount: Math.abs(+$('#mr-amt', m).value) || Math.abs(t.amount),
        cadence: cad,
        direction: dir,
        category: $('#mr-cat', m).value,
        nextDue: $('#mr-next', m).value || nextAfter(t.date, cad, VAULT.asOf),
        txnIds: siblings.map(s => s.id),
        source: 'declared',
      });
      // a declared bill is categorised by definition
      for (const s of siblings) S.manual[s.id] = $('#mr-cat', m).value;
    }, 'Make recurring');

  // keep "next due" honest when the cadence changes
  const cadSel = $('#mr-cad'), nextInp = $('#mr-next');
  if (cadSel && nextInp) cadSel.onchange = () => { nextInp.value = nextAfter(t.date, cadSel.value, VAULT.asOf); };
}

/* first occurrence strictly after asOf, stepping by the cadence */
function nextAfter(fromDate, cadence, asOf) {
  const step = Math.round(D.cadenceDays(cadence));
  let n = d.addDays(fromDate, step);
  let guard = 0;
  while (n <= asOf && guard++ < 400) n = d.addDays(n, step);
  return n;
}

/* ═══════════════ MODALS ═══════════════ */
function modal(title, sub, bodyHTML, onSave, saveLabel = 'Save') {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">
    <h3>${esc(title)}</h3><p class="sub">${sub}</p>${bodyHTML}
    <div class="modal-foot"><button class="ghost-btn" data-x>Cancel</button><button class="btn" data-s>${esc(saveLabel)}</button></div>
  </div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('[data-x]', root).onclick = close;
  $('.modal-bg', root).onclick = (e) => { if (e.target.classList.contains('modal-bg')) close(); };
  $('[data-s]', root).onclick = () => { if (onSave($('.modal', root)) !== false) { D.saveState(S); close(); render(); } };
  const first = $('input,select,textarea', root); if (first) first.focus();
  return root;
}
const catOptions = (cats, sel, dir) => (dir ? D.catsFor(cats, dir) : cats).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

function assignCategory(txId, x) {
  const t = x.all.find(y => y.id === txId);
  modal('Category', `${esc(t.merchant)} · ${esc(money(t.amount, { cents: true, sign: true }))} · ${esc(d.long(t.date))}`, `
    <div class="field"><label>Category</label><select class="inp" id="m-cat">${catOptions(x.cats, t.category, t.amount > 0 ? 'in' : 'out')}</select></div>
    <label class="row" style="margin-top:14px;font-size:13px;color:var(--muted);cursor:pointer">
      <input type="checkbox" id="m-rule"> Also make a rule: every "<span style="color:var(--fg)">${esc(D.normMerchant(t.merchant))}</span>" goes here
    </label>`, (m) => {
    const cat = $('#m-cat', m).value;
    S.manual[txId] = cat;
    if ($('#m-rule', m).checked) {
      S.rules.push({ field: 'merchant', op: 'contains', value: D.normMerchant(t.merchant), category: cat });
    }
  });
}

function editRule(x) {
  modal('New rule', 'Applied top-down; first match wins.', `
    <div class="row">
      <div class="field"><label>Field</label><select class="inp" id="r-f"><option value="merchant">Merchant</option><option value="description">Description</option></select></div>
      <div class="field"><label>Test</label><select class="inp" id="r-o"><option value="contains">contains</option><option value="startsWith">starts with</option><option value="equals">equals</option></select></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Text</label><input class="inp" id="r-v" placeholder="e.g. SAFEWAY"></div>
    <div class="field" style="margin-top:12px"><label>Category</label><select class="inp" id="r-c">${catOptions(x.cats)}</select></div>`,
    (m) => {
      const v = $('#r-v', m).value.trim(); if (!v) return false;
      S.rules.push({ field: $('#r-f', m).value, op: $('#r-o', m).value, value: v, category: $('#r-c', m).value });
    }, 'Add rule');
}

function addCategory(x, side = 'out', after = null) {
  const used = new Set(S.categories.map(c => c.slot).filter(Boolean));
  const free = [1,2,3,4,5,6,7,8].filter(n => !used.has(n));
  modal('New category',
    free.length ? 'Takes the next free colour.'
      : 'All eight colours are in use, so this one takes the neutral grey — a ninth hue would be indistinguishable from an existing one.', `
    <div class="field"><label>Name</label><input class="inp" id="c-n" placeholder="e.g. Travel"></div>
    <div class="field" style="margin-top:12px"><label>Applies to</label>
      <select class="inp" id="c-side">${['out','in','both'].map(v => '<option value="' + v + '"' + (v === side ? ' selected' : '') + '>' +
        (v === 'out' ? 'Money out' : v === 'in' ? 'Money in' : 'Both') + '</option>').join('')}</select></div>`,
    (m) => {
      const n = $('#c-n', m).value.trim(); if (!n) return false;
      const slot = free.length ? free[0] : 0;
      const sd = $('#c-side', m) ? $('#c-side', m).value : side;
      const id = 'c' + Date.now().toString(36);
      S.categories = [...S.categories.filter(c => c.id !== 'other'),
        { id, name: n, slot, side: sd, isIncome: sd === 'in' },
        ...S.categories.filter(c => c.id === 'other')];
      if (after) { D.saveState(S); after(id); }
    }, 'Add');
}

function editWindfall(idx) {
  const w = idx == null ? { name: '', amount: '', date: '', confidence: 'likely', note: '' } : S.windfalls[idx];
  modal(idx == null ? 'Add windfall' : 'Edit windfall',
    'A note to yourself. It never touches a balance or a total — only the dashed forecast line, and only with a date.', `
    <div class="field"><label>What is it</label><input class="inp" id="w-n" value="${esc(w.name)}" placeholder="e.g. Waco sale proceeds"></div>
    <div class="row" style="margin-top:12px">
      <div class="field"><label>Amount</label><input class="inp" id="w-a" type="number" step="0.01" value="${esc(w.amount)}" placeholder="50000"></div>
      <div class="field"><label>Expected date <span style="color:var(--muted-2)">(optional)</span></label><input class="inp" id="w-d" type="date" value="${esc(w.date || '')}"></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Confidence</label>
      <select class="inp" id="w-c">${['certain', 'likely', 'maybe', 'long shot'].map(c => `<option ${c === w.confidence ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:12px"><label>Note</label><textarea class="inp" id="w-note" rows="2">${esc(w.note || '')}</textarea></div>`,
    (m) => {
      const name = $('#w-n', m).value.trim(); if (!name) return false;
      const rec = { name, amount: +$('#w-a', m).value || 0, date: $('#w-d', m).value || '', confidence: $('#w-c', m).value, note: $('#w-note', m).value.trim() };
      if (idx == null) S.windfalls.push(rec); else S.windfalls[idx] = rec;
    }, idx == null ? 'Add' : 'Save');
}

/* the rent-drops-in-November control */
function editRecurring(r, x) {
  const isNew = !r;
  const base = r || { id: 'man' + Date.now().toString(36), merchant: '', amount: '', cadence: 'monthly', direction: 'out', category: 'other', nextDue: VAULT.asOf, overrides: [] };
  const ov = (base.overrides || []).slice().sort((a, b) => a.from < b.from ? -1 : 1);

  modal(isNew ? 'Add recurring item' : base.merchant,
    isNew ? 'For anything the detector can\'t see yet — a bill that hasn\'t hit twice.'
          : 'Change the amount from a future date and the forecast picks it up from that month on.', `
    ${isNew ? `
      <div class="field"><label>Merchant</label><input class="inp" id="e-m" value=""></div>
      <div class="row" style="margin-top:12px">
        <div class="field"><label>Direction</label><select class="inp" id="e-dir"><option value="out">Money out</option><option value="in">Money in</option></select></div>
        <div class="field"><label>Amount</label><input class="inp" id="e-a" type="number" step="0.01"></div>
      </div>
      <div class="row" style="margin-top:12px">
        <div class="field"><label>Cadence</label><select class="inp" id="e-cad">
          ${['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual'].map(c => `<option value="${c}" ${c === 'monthly' ? 'selected' : ''}>${esc(cadenceLabel(c))}</option>`).join('')}</select></div>
        <div class="field"><label>Next due</label><input class="inp" id="e-next" type="date" value="${esc(VAULT.asOf)}"></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Category</label><select class="inp" id="e-cat">${catOptions(x.cats, 'other')}</select></div>
    ` : `
      <div class="row" style="font-size:13px;color:var(--muted);margin-bottom:16px">
        Currently ${esc(money(Number(base.amount), { cents: true }))} · ${esc(cadenceLabel(base.cadence).toLowerCase())}
      </div>`}

    <div style="margin-top:${isNew ? '18' : '0'}px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Scheduled changes</div>
      ${ov.length ? ov.map((o, i) => `
        <div class="row" style="justify-content:space-between;padding:5px 0">
          <span style="font-size:12.5px">${esc(money(Number(o.amount)))} from ${esc(d.long(o.from))}${o.note ? ` — ${esc(o.note)}` : ''}</span>
          <button class="btn-x" data-ov="${i}">Remove</button></div>`).join('')
        : '<div style="font-size:12.5px;color:var(--muted-2);padding-bottom:6px">None. The amount holds flat for all 12 months.</div>'}
      <div class="row" style="margin-top:10px">
        <div class="field"><label>New amount</label><input class="inp" id="e-ov-a" type="number" step="0.01" placeholder="2100"></div>
        <div class="field"><label>From</label><input class="inp" id="e-ov-d" type="date"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Why <span style="color:var(--muted-2)">(optional)</span></label><input class="inp" id="e-ov-n" placeholder="lease renewal"></div>
    </div>`,
    (m) => {
      const id = base.id;
      const prev = S.recurringEdits[id] || {};
      const overrides = (prev.overrides || base.overrides || []).slice();
      const a = $('#e-ov-a', m).value, dt = $('#e-ov-d', m).value;
      if (a && dt) overrides.push({ amount: +a, from: dt, note: $('#e-ov-n', m).value.trim() });

      if (isNew) {
        const mer = $('#e-m', m).value.trim(); if (!mer) return false;
        S.recurringManual.push({
          id, merchant: mer, amount: +$('#e-a', m).value || 0,
          cadence: $('#e-cad', m).value, direction: $('#e-dir', m).value,
          category: $('#e-cat', m).value, nextDue: $('#e-next', m).value, overrides, source: 'manual',
        });
      } else {
        S.recurringEdits[id] = { ...prev, overrides };
      }
    }, 'Save');

  $$('[data-ov]').forEach(b => b.onclick = () => {
    const prev = S.recurringEdits[base.id] || {};
    const list = (prev.overrides || base.overrides || []).slice();
    list.splice(+b.dataset.ov, 1);
    S.recurringEdits[base.id] = { ...prev, overrides: list };
    D.saveState(S); $('#modal-root').innerHTML = ''; render();
  });
}

/* Re-anchor. Normally never needed — the balance carries itself forward from the
   account's own rows. Use it only if the figure has drifted from what Varo shows,
   which would mean a charge landed that the pull hasn't seen. */
function editBalance(id, x) {
  const acc = x.accounts.find(a => a.id === id);
  const an = acc.anchor || { amount: acc.balance, date: VAULT.asOf };
  const rows = x.all.filter(t => t.account === id && t.date > an.date);
  modal('Re-anchor ' + acc.name,
    'This balance is worked out, not typed: ' + esc(money(Number(an.amount), { cents: true })) +
    ' on ' + esc(d.long(an.date)) + ', then ' + rows.length + ' transaction' + (rows.length === 1 ? '' : 's') +
    ' since — charges down, transfers in up, transfers out down.' +
    '<br><span style="color:var(--muted-2)">Only re-anchor if it has drifted from what Varo shows.</span>',
    '<div class="row">' +
      '<div class="field"><label>Balance Varo shows</label>' +
        '<input class="inp" id="b-a" type="number" step="0.01" value="' + esc(acc.shownBalance.toFixed(2)) + '"></div>' +
      '<div class="field"><label>As of</label>' +
        '<input class="inp" id="b-d" type="date" value="' + esc(VAULT.asOf) + '"></div>' +
    '</div>' +
    (rows.length ? '<details class="tv" style="margin-top:14px"><summary>' + rows.length + ' since the anchor</summary>' +
      '<div style="max-height:200px;overflow-y:auto">' + rows.map(t =>
        '<div class="row" style="justify-content:space-between;padding:4px 0;font-size:12.5px">' +
        '<span style="color:var(--text-secondary)">' + esc(d.short(t.date)) + ' ' + esc(t.merchant) + '</span>' +
        '<span class="num">' + esc(money(t.amount, { cents: true, sign: true })) + '</span></div>').join('') +
      '</div></details>' : '') +
    '<p class="card-s" style="margin:14px 0 0">Era reports ' + esc(money(acc.eraBalance ?? 0, { cents: true })) +
      ' for this card — that is everything ever spent on it, already counted in the transactions, so it is not used.</p>',
    (m) => {
      S.anchors = { ...(S.anchors || {}), [id]: { amount: +$('#b-a', m).value || 0, date: $('#b-d', m).value || VAULT.asOf } };
    }, 'Re-anchor');
}

function editVariable(x) {
  const vs = x.vs;
  const months = Object.entries(vs.monthly || {}).sort((a, b) => a[0] < b[0] ? 1 : -1);
  modal('Variable spend',
    'This is measured, not entered. Override it only if you know something the history doesn\'t.',
    '<div style="font-size:13px;color:var(--muted);margin-bottom:6px">Currently using <b style="color:var(--fg)">' +
      esc(money(vs.perMonth)) + '/mo</b> — ' + esc(varBasis(vs)) + '.</div>' +
    (months.length ? '<div style="margin:14px 0 4px">' + months.map(([mk, v]) => {
        const max = Math.max(...months.map(m => m[1])) || 1;
        const partial = mk === d.month(VAULT.asOf);
        return '<div style="padding:5px 0">' +
          '<div class="row" style="justify-content:space-between;font-size:12.5px">' +
            '<span style="color:var(--text-secondary)">' + esc(d.monLabel(mk + '-01')) +
            (partial ? ' <span style="color:var(--muted-2)">(still running)</span>' : '') + '</span>' +
            '<span class="num">' + esc(money(v)) + '</span></div>' +
          '<div class="meter-track" style="margin-top:5px"><div class="meter-fill" style="width:' +
            (v / max * 100).toFixed(0) + '%;background:var(--series-1);opacity:' + (partial ? 0.42 : 1) + '"></div></div>' +
        '</div>';
      }).join('') + '</div>' : '') +
    '<label class="row" style="margin-top:16px;font-size:13px;color:var(--muted);cursor:pointer">' +
      '<input type="checkbox" id="v-auto" ' + (S.variableOverride == null ? 'checked' : '') + '> Keep using the measured figure</label>' +
    '<div class="field" style="margin-top:12px"><label>Or use this instead</label>' +
      '<input class="inp" id="v-a" type="number" step="1" value="' + esc(S.variableOverride ?? Math.round(vs.perMonth)) + '"></div>',
    (m) => { S.variableOverride = $('#v-auto', m).checked ? null : (+$('#v-a', m).value || 0); });
}

/* ═══════════════ EXPORT / IMPORT ═══════════════ */
const ago = (iso) => {
  if (!iso) return 'unknown age';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const h = Math.round(mins / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(h / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
};

/* Re-reads the published vault. The page is static, so this picks up a newer
   pull — it cannot reach the bank itself. */
$('#btn-refresh').onclick = async () => {
  const b = $('#btn-refresh');
  b.disabled = true; b.textContent = 'Checking…';
  try {
    const res = await fetch('./vault.enc.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const fresh = await decryptVault(await res.json(), sessionStorage.getItem('ledger.k') || '');
      if (fresh && fresh.pulledAt !== VAULT.pulledAt) {
        VAULT = fresh; buildChrome(); render();
        b.textContent = 'Updated'; setTimeout(() => { b.disabled = false; updateStamp(); }, 1400);
        return;
      }
    }
    b.textContent = 'No new data';
  } catch { b.textContent = 'Failed'; }
  setTimeout(() => { b.disabled = false; updateStamp(); }, 1600);
};

function updateStamp() {
  $('#btn-refresh').textContent = 'Refresh';
  const s = $('#asof');
  s.textContent = 'as of ' + d.long(VAULT.asOf) + (VAULT.pulledAt ? ' · pulled ' + ago(VAULT.pulledAt) : '');
}

$('#btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ledger-settings-${VAULT.asOf}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
$('#btn-import').onclick = () => $('#file-input').click();
$('#file-input').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    S = { ...structuredClone(D.DEFAULT_STATE), ...JSON.parse(await f.text()) };
    D.saveState(S); buildChrome(); render();
  } catch { alert('That file did not parse.'); }
  e.target.value = '';
};

window.addEventListener('resize', hideTip);

/* mode note on the gate */
fetch('./vault.enc.json', { method: 'HEAD' })
  .then(r => { $('#gate-mode').textContent = r.ok ? 'encrypted vault' : 'demo data'; })
  .catch(() => { $('#gate-mode').textContent = 'demo data'; });
