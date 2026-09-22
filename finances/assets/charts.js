/* ═══════════════════════════════════════════════════════════
   charts.js — hand-rolled SVG. No chart library.
   Specs from the dataviz method: 2px lines, ≥8px markers with a 2px
   surface ring, solid hairline grid, ~10% area wash, legend for ≥2
   series, selective direct labels, crosshair that snaps to nearest X,
   and a table-view twin for every chart.
   ═══════════════════════════════════════════════════════════ */
import { money, compact, d } from './data.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const SURFACE = '#0a0418';

/* nice round axis ticks */
function ticks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

/* ── tooltip singleton ── */
const tt = () => document.getElementById('tooltip');
export function showTip(html, x, y) {
  const t = tt(); t.innerHTML = html; t.hidden = false;
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y - r.height / 2;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (left < 8) left = 8;
  top = Math.max(8, Math.min(top, innerHeight - r.height - 8));
  t.style.left = left + 'px'; t.style.top = top + 'px';
}
export const hideTip = () => { tt().hidden = true; };

/* ═══════════════ PROJECTION — 12-month rolling balance ═══════════════
   Two series on ONE y-axis (dollars). Solid = recurring only.
   Dotted = same plus the windfalls Joey has dated. Never a second scale. */
export function projectionChart(host, pts, opts = {}) {
  const { hasWindfalls = false } = opts;
  host.innerHTML = '';
  const W = Math.max(320, host.clientWidth || 640);
  const isNarrow = W < 520;
  const P = { t: 18, r: isNarrow ? 14 : 62, b: 30, l: isNarrow ? 46 : 58 };
  const H = isNarrow ? 240 : 290;              // includes the x-axis band
  const iw = W - P.l - P.r, ih = H - P.t - P.b;

  const vals = pts.flatMap(p => hasWindfalls ? [p.base, p.wf] : [p.base]);
  const tk = ticks(Math.min(0, ...vals), Math.max(...vals), isNarrow ? 4 : 5);
  const yMin = tk[0], yMax = tk[tk.length - 1];
  const X = (i) => P.l + (i / (pts.length - 1)) * iw;
  const Y = (v) => P.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
  svg.appendChild(el('title')).textContent =
    'Projected balance over the next 12 months';

  // grid — solid hairlines, recessive
  for (const v of tk) {
    svg.appendChild(el('line', { class: 'grid-line', x1: P.l, x2: P.l + iw, y1: Y(v), y2: Y(v) }));
    const lb = el('text', { class: 'ax-label', x: P.l - 8, y: Y(v) + 4, 'text-anchor': 'end' });
    lb.textContent = compact(v); svg.appendChild(lb);
  }
  // zero reference, only when the plot actually crosses it
  if (yMin < 0 && yMax > 0) {
    svg.appendChild(el('line', { class: 'zero-line', x1: P.l, x2: P.l + iw, y1: Y(0), y2: Y(0) }));
    const z = el('text', { class: 'ax-label', x: P.l + iw, y: Y(0) - 6, 'text-anchor': 'end', fill: 'var(--critical)' });
    z.textContent = '$0'; svg.appendChild(z);
  }
  svg.appendChild(el('line', { class: 'axis-line', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));

  // x labels — every other month when narrow
  pts.forEach((p, i) => {
    if (isNarrow && i % 3 !== 0) return;
    if (!isNarrow && i % 2 !== 0) return;
    const lb = el('text', { class: 'ax-label', x: X(i), y: H - 9, 'text-anchor': 'middle' });
    lb.textContent = d.monLabel(p.month); svg.appendChild(lb);
  });

  const line = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ');

  // area wash under the baseline — ~10%, never a saturated block
  svg.appendChild(el('path', {
    d: `${line('base')} L${X(pts.length - 1)},${Y(yMin)} L${X(0)},${Y(yMin)} Z`,
    fill: 'var(--series-1)', opacity: 0.10, stroke: 'none',
  }));

  // dotted = hypothetical (windfalls). The dash encodes "not counted on".
  if (hasWindfalls) {
    svg.appendChild(el('path', {
      d: line('wf'), fill: 'none', stroke: 'var(--series-3)', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '5 5',
    }));
  }
  svg.appendChild(el('path', {
    d: line('base'), fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  // windfall landing markers — ≥8px, 2px surface ring
  pts.forEach((p, i) => {
    if (!hasWindfalls || !p.windfall) return;
    svg.appendChild(el('circle', { cx: X(i), cy: Y(p.wf), r: 5, fill: 'var(--series-3)', stroke: SURFACE, 'stroke-width': 2 }));
  });

  // endpoint dots + selective direct labels (endpoint only — never every point)
  const last = pts.length - 1;
  svg.appendChild(el('circle', { cx: X(last), cy: Y(pts[last].base), r: 4.5, fill: 'var(--series-1)', stroke: SURFACE, 'stroke-width': 2 }));
  if (!isNarrow) {
    const t1 = el('text', { class: 'dlabel', x: X(last) + 9, y: Y(pts[last].base) + 4 });
    t1.textContent = compact(pts[last].base); svg.appendChild(t1);
    if (hasWindfalls) {
      const dy = Math.abs(Y(pts[last].wf) - Y(pts[last].base)) < 15 ? -13 : 4;
      const t2 = el('text', { class: 'dlabel-s', x: X(last) + 9, y: Y(pts[last].wf) + dy });
      t2.textContent = compact(pts[last].wf); svg.appendChild(t2);
    }
  }

  // ── crosshair: the reader aims at a month, never at a 2px line ──
  const cross = el('line', { class: 'crosshair', y1: P.t, y2: P.t + ih, opacity: 0 });
  svg.appendChild(cross);
  const dot1 = el('circle', { r: 4.5, fill: 'var(--series-1)', stroke: SURFACE, 'stroke-width': 2, opacity: 0 });
  const dot2 = el('circle', { r: 4.5, fill: 'var(--series-3)', stroke: SURFACE, 'stroke-width': 2, opacity: 0 });
  svg.appendChild(dot1); svg.appendChild(dot2);

  const at = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) * (W / r.width);
    return Math.max(0, Math.min(pts.length - 1, Math.round((px - P.l) / iw * (pts.length - 1))));
  };
  const move = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const i = at(cx), p = pts[i];
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
    dot1.setAttribute('cx', X(i)); dot1.setAttribute('cy', Y(p.base)); dot1.setAttribute('opacity', 1);
    if (hasWindfalls) { dot2.setAttribute('cx', X(i)); dot2.setAttribute('cy', Y(p.wf)); dot2.setAttribute('opacity', 1); }

    const esc = (s) => { const n = document.createElement('span'); n.textContent = s; return n.innerHTML; };
    let h = `<div class="tt-h">${esc(d.monLabel(p.month))}</div>`;
    h += `<div class="tt-r"><span class="tt-key" style="background:var(--series-1)"></span><span class="tt-n">Projected</span><span class="tt-v">${esc(money(p.base))}</span></div>`;
    if (hasWindfalls) h += `<div class="tt-r"><span class="tt-key" style="background:var(--series-3);opacity:.9"></span><span class="tt-n">With windfalls</span><span class="tt-v">${esc(money(p.wf))}</span></div>`;
    if (i > 0) {
      h += `<div class="tt-note">in ${esc(money(p.income))} · fixed ${esc(money(p.fixed))} · variable ${esc(money(p.variable))}</div>`;
      if (p.windfall) h += `<div class="tt-note">windfall ${esc(money(p.windfall))} — ${esc((p.windfallItems || []).map(w => w.name).join(', '))}</div>`;
    }
    showTip(h, cx, cy);
  };
  const leave = () => { cross.setAttribute('opacity', 0); dot1.setAttribute('opacity', 0); dot2.setAttribute('opacity', 0); hideTip(); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', leave);
  svg.addEventListener('touchmove', (e) => { move(e); }, { passive: true });
  svg.addEventListener('touchend', leave);

  host.appendChild(svg);

  // legend — always present for ≥2 series
  const lg = document.createElement('div'); lg.className = 'legend';
  lg.innerHTML =
    `<span class="legend-i"><span class="legend-line" style="background:var(--series-1)"></span>Projected balance</span>` +
    (hasWindfalls ? `<span class="legend-i"><span class="legend-line" style="background:repeating-linear-gradient(90deg,var(--series-3) 0 4px,transparent 4px 8px)"></span>With expected windfalls</span>` : '');
  host.appendChild(lg);
}

/* ═══════════════ SPARKLINE (stat tiles) ═══════════════ */
export function sparkline(values, w = 104, h = 26, color = 'var(--series-1)') {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pathD = values.map((v, i) =>
    `${i ? 'L' : 'M'}${(i / (values.length - 1) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 5)).toFixed(1)}`
  ).join(' ');
  const lx = w - 1, ly = h - 2 - ((values.at(-1) - min) / span) * (h - 5);
  return `<svg class="tile-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.5" fill="${color}"/></svg>`;
}

/* ═══════════════ CATEGORY BARS ═══════════════
   Horizontal — category names are long. One row per category, value at the tip. */
export function categoryBars(host, rows, total) {
  host.innerHTML = '';
  if (!rows.length) { host.innerHTML = '<div class="empty">Nothing to show in this range.</div>'; return; }
  const max = Math.max(...rows.map(r => r.value)) || 1;
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'hbar-row';
    row.tabIndex = 0;
    const pct = total ? (r.value / total * 100) : 0;

    const name = document.createElement('div');
    name.className = 'hbar-name'; name.textContent = r.name; name.title = r.name;

    const track = document.createElement('div'); track.className = 'hbar-track';
    const fill = document.createElement('div');
    fill.className = 'hbar-fill';
    fill.style.width = Math.max(2, r.value / max * 100) + '%';
    fill.style.background = r.color;
    track.appendChild(fill);

    const val = document.createElement('div');
    val.className = 'hbar-val'; val.textContent = money(r.value);

    row.append(name, track, val);
    const tip = (e) => {
      const esc = (s) => { const n = document.createElement('span'); n.textContent = s; return n.innerHTML; };
      showTip(
        `<div class="tt-h">${esc(r.name)}</div>
         <div class="tt-r"><span class="tt-key" style="background:${r.color}"></span><span class="tt-n">Spend</span><span class="tt-v">${esc(money(r.value, { cents: true }))}</span></div>
         <div class="tt-r"><span class="tt-key" style="background:transparent"></span><span class="tt-n">Share</span><span class="tt-v">${pct.toFixed(1)}%</span></div>
         ${r.count ? `<div class="tt-note">${r.count} transaction${r.count === 1 ? '' : 's'}</div>` : ''}`,
        e.clientX ?? (e.target.getBoundingClientRect().right), e.clientY ?? (e.target.getBoundingClientRect().top)
      );
    };
    row.addEventListener('pointermove', tip);
    row.addEventListener('pointerleave', hideTip);
    row.addEventListener('focus', (e) => { const b = row.getBoundingClientRect(); tip({ clientX: b.right, clientY: b.top + b.height / 2, target: row }); });
    row.addEventListener('blur', hideTip);
    host.appendChild(row);
  }
}

/* ═══════════════ BILL CALENDAR ═══════════════
   Which days of the month the fixed charges cluster on. */
export function billCalendar(host, items) {
  host.innerHTML = '';
  const byDay = new Map();
  for (const it of items) {
    const day = +String(it.nextDue || '').slice(8) || 1;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(it);
  }
  const maxAmt = Math.max(1, ...[...byDay.values()].map(v => v.reduce((s, x) => s + Math.abs(x.amount), 0)));

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:4px';
  for (let day = 1; day <= 31; day++) {
    const list = byDay.get(day) || [];
    const sum = list.reduce((s, x) => s + Math.abs(x.amount), 0);
    const cell = document.createElement('div');
    cell.tabIndex = list.length ? 0 : -1;
    // sequential: one hue, more-is-darker (here more-is-stronger on a dark surface)
    const a = sum ? 0.16 + (sum / maxAmt) * 0.72 : 0;
    cell.style.cssText = `aspect-ratio:1;display:grid;place-items:center;border-radius:7px;font-size:11px;
      font-family:var(--mono);border:1px solid ${sum ? 'transparent' : 'rgba(255,255,255,0.06)'};
      background:${sum ? `color-mix(in srgb, var(--series-1) ${(a * 100).toFixed(0)}%, transparent)` : 'transparent'};
      color:${sum ? 'rgba(255,255,255,0.95)' : 'var(--muted-2)'};cursor:${sum ? 'pointer' : 'default'}`;
    cell.textContent = day;
    if (sum) {
      const tip = (e) => {
        const esc = (s) => { const n = document.createElement('span'); n.textContent = s; return n.innerHTML; };
        showTip(`<div class="tt-h">Day ${day}</div>` +
          list.map(x => `<div class="tt-r"><span class="tt-key" style="background:var(--series-1)"></span><span class="tt-n">${esc(x.merchant)}</span><span class="tt-v">${esc(money(Math.abs(x.amount)))}</span></div>`).join('') +
          `<div class="tt-note">${esc(money(sum))} due this day</div>`,
          e.clientX ?? 0, e.clientY ?? 0);
      };
      cell.addEventListener('pointermove', tip);
      cell.addEventListener('pointerleave', hideTip);
      cell.addEventListener('focus', () => { const b = cell.getBoundingClientRect(); tip({ clientX: b.right, clientY: b.top }); });
      cell.addEventListener('blur', hideTip);
    }
    grid.appendChild(cell);
  }
  host.appendChild(grid);
}

/* ═══════════════ NESTED DONUT ═══════════════
   Whole = income. Slices = where it went, plus what never got spent.
   Inner ring = the selected month · outer ring = the 6-month average, so the
   two are read against one shared whole instead of two axes.
   Segment count is capped — past ~7 slices adjacent arcs stop being tellable
   apart, so the tail folds into "Other". */
const TAU = Math.PI * 2;
function arc(cx, cy, rOuter, rInner, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const big = (a1 - a0) > Math.PI ? 1 : 0;
  const [x0, y0] = p(rOuter, a0), [x1, y1] = p(rOuter, a1);
  const [x2, y2] = p(rInner, a1), [x3, y3] = p(rInner, a0);
  return `M${x0},${y0} A${rOuter},${rOuter} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${rInner},${rInner} 0 ${big} 0 ${x3},${y3} Z`;
}

export function donutChart(host, { inner, outer, centerTop, centerValue, centerSub, innerLabel, outerLabel, onSlice }) {
  host.innerHTML = '';
  const W = Math.max(230, Math.min(host.clientWidth || 300, 310));
  const H = W;
  const cx = W / 2, cy = H / 2;
  const R = W / 2 - 4;

  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
  svg.appendChild(el('title')).textContent = `${centerTop}: ${centerValue}`;

  const ring = (rows, rOut, rIn, dim) => {
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    // 2px surface gap between segments — the separation is negative space, not a stroke
    const gap = Math.min(0.045, (2 / rOut));
    let a = 0;
    rows.forEach((r) => {
      const sweep = (r.value / total) * TAU;
      if (sweep <= 0.0005) { a += sweep; return; }
      const a0 = a + gap / 2, a1 = a + sweep - gap / 2;
      if (a1 > a0) {
        const path = el('path', {
          d: arc(cx, cy, rOut, rIn, a0, a1),
          fill: r.color, opacity: dim ? 0.58 : 1,
          tabindex: dim ? -1 : 0, role: 'img',
        });
        path.style.cursor = onSlice && !dim ? 'pointer' : 'default';
        if (onSlice && !dim) {
          path.addEventListener('click', () => onSlice(r));
          path.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSlice(r); } });
        }
        path.style.transition = 'opacity .15s';
        const tip = (e) => {
          const pct = (r.value / total * 100).toFixed(1);
          showTip(
            `<div class="tt-h">${escSvg(dim ? outerLabel : innerLabel)}</div>
             <div class="tt-r"><span class="tt-key" style="background:${r.color}"></span><span class="tt-n">${escSvg(r.name)}</span><span class="tt-v">${escSvg(money(r.value))}</span></div>
             <div class="tt-note">${pct}% of ${escSvg(money(total))}</div>`,
            e.clientX ?? cx, e.clientY ?? cy);
          path.setAttribute('opacity', dim ? 0.6 : 0.82);
        };
        const out = () => { hideTip(); path.setAttribute('opacity', dim ? 0.58 : 1); };
        path.addEventListener('pointermove', tip);
        path.addEventListener('pointerleave', out);
        path.addEventListener('focus', () => { const b = svg.getBoundingClientRect(); tip({ clientX: b.left + cx, clientY: b.top + cy }); });
        path.addEventListener('blur', out);
        svg.appendChild(path);
      }
      a += sweep;
    });
  };

  // outer = comparison (recessive), inner = the subject
  if (outer && outer.length) ring(outer, R, R - W * 0.085, true);
  ring(inner, R - W * 0.105, R - W * 0.235, false);

  const t1 = el('text', { x: cx, y: cy - W * 0.055, 'text-anchor': 'middle', class: 'ax-label' });
  t1.textContent = centerTop; svg.appendChild(t1);
  const t2 = el('text', { x: cx, y: cy + W * 0.035, 'text-anchor': 'middle' });
  t2.setAttribute('style', `font-family:var(--body);font-weight:600;font-size:${Math.round(W * 0.115)}px;fill:var(--text-primary);letter-spacing:-0.02em`);
  t2.textContent = centerValue; svg.appendChild(t2);
  if (centerSub) {
    const t3 = el('text', { x: cx, y: cy + W * 0.095, 'text-anchor': 'middle', class: 'ax-label' });
    t3.textContent = centerSub; svg.appendChild(t3);
  }
  host.appendChild(svg);
}
const escSvg = (s) => { const n = document.createElement('span'); n.textContent = String(s ?? ''); return n.innerHTML; };

/* ═══════════════ MONTH CALENDAR ═══════════════
   A real calendar. Days carrying a recurring charge show the day's total;
   clicking one opens the detail underneath. */
export function monthCalendar(host, { month, items, onPick, picked }) {
  host.innerHTML = '';
  const first = month + '-01';
  const y = +month.slice(0, 4), mo = +month.slice(5, 7);
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();

  const byDay = new Map();
  for (const it of items) {
    const day = +String(it.dueDate || '').slice(8);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(it);
  }

  const wrap = document.createElement('div');
  wrap.className = 'cal';
  for (const w of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const h = document.createElement('div'); h.className = 'cal-dow'; h.textContent = w; wrap.appendChild(h);
  }
  for (let i = 0; i < lead; i++) wrap.appendChild(Object.assign(document.createElement('div'), { className: 'cal-pad' }));

  for (let day = 1; day <= daysIn; day++) {
    const list = byDay.get(day) || [];
    const sum = list.reduce((s, x) => s + Math.abs(x.amount), 0);
    const income = list.some(x => x.direction === 'in');
    const cell = document.createElement(list.length ? 'button' : 'div');
    cell.className = 'cal-day' + (list.length ? ' has' : '') + (picked === day ? ' on' : '');
    cell.innerHTML = `<span class="cal-n">${day}</span>` +
      (sum ? `<span class="cal-amt ${income ? 'in' : ''}">${income ? '+' : ''}${money(sum)}</span>` : '');
    if (list.length) {
      cell.onclick = () => onPick(picked === day ? null : day);
      cell.setAttribute('aria-expanded', String(picked === day));
    }
    wrap.appendChild(cell);
  }
  host.appendChild(wrap);

  if (picked && byDay.has(picked)) {
    const det = document.createElement('div');
    det.className = 'cal-det';
    const list = byDay.get(picked);
    det.innerHTML = `<div class="cal-det-h">${d.long(month + '-' + String(picked).padStart(2, '0'))}</div>` +
      list.map(x => `<div class="cal-det-r">
          <span class="cal-dot" style="background:${x.direction === 'in' ? 'var(--good)' : 'var(--series-1)'}"></span>
          <span class="cal-det-n">${escSvg(x.merchant)}</span>
          <span class="cal-det-v">${x.direction === 'in' ? '+' : '−'}${escSvg(money(Math.abs(x.amount)))}</span>
        </div>`).join('') +
      `<div class="cal-det-t">${list.length} item${list.length === 1 ? '' : 's'} · net ${money(list.reduce((s, x) => s + (x.direction === 'in' ? Math.abs(x.amount) : -Math.abs(x.amount)), 0), { sign: true })}</div>`;
    host.appendChild(det);
  }
}
