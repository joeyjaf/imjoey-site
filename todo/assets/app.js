// imjoey.me/todo, the public half.
// Everything private (tasks, people, entries, results) comes from the runner on Joey's
// PC at localhost:8440 after login. This file knows nothing about any of it.

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = LOCAL ? '' : 'http://localhost:8440';
const TOKEN_KEY = 'todo.token.v1';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : null);
const linkify = (escaped) => escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

// ── token ─────────────────────────────────────────────────────
let token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
const setToken = (t) => {
  token = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

class Offline extends Error {}
class Unauthed extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Offline(); }
  if (res.status === 401 && path !== '/api/login') throw new Unauthed();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

// ── time helpers (the runner works in Pacific; so does Joey) ───────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymdToDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const addDays = (ymd, n) => new Date(ymdToDate(ymd).getTime() + n * 864e5).toISOString().slice(0, 10);
const dowOf = (ymd) => ymdToDate(ymd).getUTCDay();
const md = (ymd) => { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; };
const dayLabel = (ymd) => `${DAYS[dowOf(ymd)]} ${md(ymd)}`;
const mondayOf = (ymd) => addDays(ymd, -((dowOf(ymd) + 6) % 7));
const ymdOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).replace(' AM', 'a').replace(' PM', 'p');
const when = (ms) => {
  if (!ms) return '';
  const d = ymdOf(ms);
  if (d === S.today) return clock(ms);
  return `${d > addDays(S.today, -7) ? DAYS[dowOf(d)] : md(d)} ${clock(ms)}`;
};
const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

// ── screens ───────────────────────────────────────────────────
const show = (id) => { for (const s of ['boot', 'gate', 'offline', 'app']) $(`#${s}`).hidden = s !== id; };
let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast${bad ? ' bad' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3000);
}
const fail = (e) => {
  if (e instanceof Unauthed) { setToken(null); return showGate(); }
  if (e instanceof Offline) return toast('Runner not reachable. Is WSL running?', true);
  toast(e.message, true);
};

// ── state ─────────────────────────────────────────────────────
let S = null;                       // latest /api/state
const UI = {
  inputs: null,                     // Joey's entries; local copy is authoritative once loaded
  week: null,                       // perf review week being viewed (a Monday)
  expanded: new Set(),              // run ids with full text open
  logs: new Map(),                  // run id -> full log (when the log panel is open)
  view: new Map(),                  // live key -> run id picked from history
  sig: new Map(),                   // live key -> last rendered signature
  lastSync: 0,
};

async function boot() {
  show('boot');
  try { await api('/api/health'); } catch { return show('offline'); }
  if (!token) return showGate();
  try { S = await api('/api/state'); } catch (e) {
    if (e instanceof Unauthed) { setToken(null); return showGate(); }
    if (e instanceof Offline) return show('offline');
    throw e;
  }
  startApp();
}

function showGate() {
  show('gate');
  const input = $('#gate-input');
  input.value = '';
  setTimeout(() => input.focus(), 30);
}

$('#gate-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = $('#gate-err');
  err.hidden = true;
  try {
    const { token: t } = await api('/api/login', { method: 'POST', body: { password: $('#gate-input').value } });
    setToken(t);
    boot();
  } catch (e) {
    err.textContent = e instanceof Offline ? 'Runner not reachable.' : e.message;
    err.hidden = false;
    $('.gate-card').classList.remove('shake'); void $('.gate-card').offsetWidth; $('.gate-card').classList.add('shake');
    $('#gate-input').select();
  }
});
$('#offline-retry').addEventListener('click', boot);
$('#btn-lock').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* token dropped either way */ }
  setToken(null);
  stopPolling();
  showGate();
});

// ── polling ───────────────────────────────────────────────────
let pollTimer = null;
const busy = () => S && (S.runs.some((r) => r.status === 'queued' || r.status === 'running')
  || S.systems.some((x) => x.state === 'checking' || x.state === 'login'));
function schedulePoll() { clearTimeout(pollTimer); pollTimer = setTimeout(poll, busy() ? 2500 : 15000); }
function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }
async function poll() {
  try { S = await api('/api/state'); UI.lastSync = Date.now(); update(); } catch (e) {
    if (e instanceof Unauthed) { setToken(null); stopPolling(); return showGate(); }
  }
  schedulePoll();
}
const refresh = () => { clearTimeout(pollTimer); return poll(); };
window.addEventListener('focus', () => { if (S && !$('#app').hidden) refresh(); });

function startApp() {
  UI.inputs = structuredClone(S.inputs || {});
  const pr = S.tasks.find((t) => t.id === 'perf-review');
  UI.week = pr?.status.reviewWeek || mondayOf(S.today);
  UI.lastSync = Date.now();
  show('app');
  renderAll();
  update();
  const stale = S.systems.some((x) => !x.checkedAt || Date.now() - x.checkedAt > 20 * 60e3 || x.state === 'unknown');
  if (stale) checkSystems(true);
  schedulePoll();
}

// ── systems strip (BackOffice + CXP) ──────────────────────────
function renderSystems() {
  const el = $('#systems');
  const checking = S.systems.some((x) => x.state === 'checking');
  const last = Math.max(0, ...S.systems.map((x) => x.checkedAt || 0));
  const html = S.systems.map((x) => {
    let light = ''; let text = 'Not checked yet'; let bad = false; let action = '';
    if (x.state === 'ok') { light = 'ok'; text = `Logged in · ready to roll`; }
    else if (x.state === 'expired') { light = 'bad'; bad = true; text = 'Signed out'; }
    else if (x.state === 'checking') { light = 'wait'; text = 'Checking…'; }
    else if (x.state === 'login') { light = 'wait'; text = 'Sign in in the Chrome window, then close it'; }
    else if (x.state === 'busy') { light = 'bad'; bad = true; text = x.message || 'Browser profile busy'; }
    else if (x.state === 'error') { light = 'bad'; bad = true; text = `Check failed${x.message ? `: ${x.message}` : ''}`; }
    if (['expired', 'error', 'unknown', 'busy'].includes(x.state) || !x.state) {
      action = `<button class="btn btn-sm ${x.state === 'expired' ? 'btn-danger' : ''}" data-act="login" data-sys="${esc(x.id)}" ${S.profileBusy ? 'disabled' : ''}>Re-auth</button>`;
    }
    return `<div class="sys" data-sys="${esc(x.id)}">
      <div class="sys-body">
        <div class="sys-name">${esc(x.name)}</div>
        <div class="sys-state ${bad ? 'bad' : ''}" title="${esc(text)}">${esc(text)}</div>
      </div>
      <div class="sys-actions">${action}<span class="light ${light}" aria-label="${esc(x.state || 'unknown')}"></span></div>
    </div>`;
  }).join('');
  const refreshBtn = `<button class="sys-refresh ${checking ? 'spinning' : ''}" data-act="check" ${checking || S.profileBusy ? 'disabled' : ''}>
      <span><span class="ico">↻</span> Refresh</span><small>${last ? `checked ${ago(last)}` : 'never checked'}</small></button>`;
  const next = html + refreshBtn;
  if (el.dataset.sig !== next) { el.innerHTML = next; el.dataset.sig = next; }
}

async function checkSystems(quiet = false) {
  try { await api('/api/systems/check', { method: 'POST' }); if (!quiet) toast('Checking BackOffice and CXP…'); refresh(); } catch (e) { fail(e); }
}

// ── build ─────────────────────────────────────────────────────
const tasksIn = (section) => S.tasks.filter((t) => t.section === section);
const taskById = (id) => S.tasks.find((t) => t.id === id);

function renderAll() {
  $('#today').textContent = ymdToDate(S.today).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
  $('#sections').innerHTML = S.sections.map((sec) => `
    <section class="section">
      <div class="section-h"><h2 class="section-title">${esc(sec.title)}</h2><span class="section-sub">${esc(sec.sub)}</span></div>
      <div class="grid">${tasksIn(sec.id).map(cardHtml).join('')}</div>
    </section>`).join('');
  UI.sig.clear();
}

const linksHtml = (links) => (links?.length
  ? `<div class="card-links">${links.map((l) => safeUrl(l.url) ? `<a class="linkchip" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>` : '').join('')}</div>` : '');

function cardHtml(t) {
  if (t.kind === 'people') return perfCardHtml(t);
  const inp = UI.inputs[t.id]?.form || {};
  const fields = (t.fields || []).map((f) => `
    <div class="field">
      <label for="f-${t.id}-${f.key}">${esc(f.label)}</label>
      <textarea class="textarea" id="f-${t.id}-${f.key}" rows="${f.rows || 3}" data-field="${esc(f.key)}" data-task="${t.id}"
        placeholder="${esc(f.placeholder || '')}">${esc(inp[f.key] || '')}</textarea>
    </div>`).join('');
  const checklist = t.checklist ? `<ul class="checklist">${t.checklist.map((c) => `<li><label class="check"><input type="checkbox"> <span>${esc(c)}</span></label></li>`).join('')}</ul>` : '';
  const runnable = t.kind === 'prompt';
  return `<article class="card" data-card="${t.id}">
    <div class="card-h"><h3 class="card-title">${esc(t.title)}</h3><span class="chip" data-chip></span></div>
    <p class="card-blurb">${esc(t.blurb || '')}</p>
    ${linksHtml(t.links)}
    ${checklist}
    ${fields}
    <div class="card-actions" data-actions></div>
    ${runnable ? `<div class="live" data-live="${t.id}|"></div>` : ''}
  </article>`;
}

// ── performance review card ───────────────────────────────────
const prKey = (slug) => `${UI.week}|${slug}`;
const prInput = (slug) => {
  const all = (UI.inputs['perf-review'] ||= {});
  return (all[prKey(slug)] ||= { days: {}, extraDays: [], confirmed: false, notes: '' });
};
const weekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
const personDays = (p, inp) => weekDays(UI.week).filter((d) => p.workdays.includes(dowOf(d)) || (inp.extraDays || []).includes(d));

function perfCardHtml(t) {
  return `<article class="card wide" data-card="${t.id}">
    <div class="card-h"><h3 class="card-title">${esc(t.title)}</h3><span class="chip" data-chip></span></div>
    <p class="card-blurb">${esc(t.blurb || '')}</p>
    ${linksHtml(t.links)}
    <div data-pr-body></div>
  </article>`;
}

function renderPerfBody() {
  const host = $('[data-card="perf-review"] [data-pr-body]');
  if (!host) return;
  const thisMonday = mondayOf(S.today);
  const hourly = S.people.filter((p) => p.group === 'hourly');
  const vas = S.people.filter((p) => p.group === 'va');
  host.innerHTML = `
    <div class="pr-bar">
      <div class="weeknav">
        <button data-act="week" data-dir="-1" aria-label="Previous week">‹</button>
        <span>${dayLabel(UI.week)} – ${dayLabel(addDays(UI.week, 6))}</span>
        <button data-act="week" data-dir="1" aria-label="Next week" ${UI.week >= thisMonday ? 'disabled' : ''}>›</button>
      </div>
      <button class="btn" data-act="runall">Run everyone who's ready</button>
    </div>
    <div class="pr-group-label">Hourly · times from Rippling</div>
    <p class="legend">Times like 8:02, 802 or 4:31p all work. Meal: minutes (30) or the actual break (12:04-12:36). Excl: minutes of meetings, training, documented downtime or approved leave; say which in the note if it isn't a meeting.</p>
    <div class="people">${hourly.map(hourlyHtml).join('')}</div>
    <div class="pr-group-label">VAs · straight from CXP, nothing to enter</div>
    <div class="people va">${vas.map(vaHtml).join('')}</div>`;
  for (const p of S.people) updatePerson(p.slug);
  UI.sig.clear();
}

function hourlyHtml(p) {
  const inp = prInput(p.slug);
  const days = personDays(p, inp);
  const rows = days.map((d) => {
    const r = inp.days[d] || {};
    const extra = !p.workdays.includes(dowOf(d));
    const cell = (k, ph) => `<td><input type="text" data-p="${p.slug}" data-d="${d}" data-k="${k}" value="${esc(r[k] ?? '')}" placeholder="${ph}" autocomplete="off" spellcheck="false"></td>`;
    return `<tr class="${r.off ? 'off' : ''}" data-row="${d}">
      <td class="day"><b>${DAYS[dowOf(d)]}</b> ${md(d)}</td>
      ${cell('in', '8:00a')}${cell('out', '4:30p')}${cell('meal', '30')}${cell('excl', '0')}
      <td class="offcell"><input type="checkbox" data-p="${p.slug}" data-d="${d}" data-k="off" ${r.off ? 'checked' : ''} aria-label="Did not work ${dayLabel(d)}"></td>
      <td>${extra ? `<button class="rm" data-act="rmday" data-p="${p.slug}" data-d="${d}" title="Remove day">×</button>` : ''}</td>
    </tr>`;
  }).join('');
  const addable = weekDays(UI.week).filter((d) => !days.includes(d));
  return `<div class="person" data-person="${p.slug}">
    <div class="person-h"><div><span class="person-name">${esc(p.name)}</span>${p.note ? ` <span class="person-note">· ${esc(p.note)}</span>` : ''}</div><span class="chip" data-pchip></span></div>
    <table class="tc">
      <colgroup><col style="width:66px"><col style="width:17%"><col style="width:17%"><col><col style="width:11%"><col style="width:28px"><col style="width:16px"></colgroup>
      <thead><tr><th>Day</th><th>In</th><th>Out</th><th>Meal</th><th title="Minutes excluded from productive time">Excl</th><th title="Did not work">Off</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${addable.length ? `<div class="adddays">${addable.map((d) => `<button class="btn btn-sm" data-act="addday" data-p="${p.slug}" data-d="${d}">+ ${DAYS[dowOf(d)]}</button>`).join('')}</div>` : ''}
    <label class="check"><input type="checkbox" data-p="${p.slug}" data-k="confirmed" ${inp.confirmed ? 'checked' : ''}> <span>Nothing else to exclude this week (no other meetings, training, downtime or leave)</span></label>
    ${noteHtml(p, inp)}
    <div class="card-actions"><button class="btn btn-primary" data-act="run" data-task="perf-review" data-p="${p.slug}">Run ${esc(p.short)}</button><span class="hint" data-hint></span><span style="flex:1"></span><span data-done></span></div>
    <div class="live" data-live="perf-review|${p.slug}"></div>
  </div>`;
}

function vaHtml(p) {
  const inp = prInput(p.slug);
  return `<div class="person" data-person="${p.slug}">
    <div class="person-h"><span class="person-name">${esc(p.name)}</span><span class="chip" data-pchip></span></div>
    <p class="person-va-note">Pulls the week's calls from CXP, writes a record for each day worked, and the weekly summary once the week is over.</p>
    ${noteHtml(p, inp)}
    <div class="card-actions"><button class="btn btn-primary" data-act="run" data-task="perf-review" data-p="${p.slug}">Run ${esc(p.short)}</button><span class="hint" data-hint></span><span style="flex:1"></span><span data-done></span></div>
    <div class="live" data-live="perf-review|${p.slug}"></div>
  </div>`;
}

const noteHtml = (p, inp) => `<details class="note" ${inp.notes ? 'open' : ''}><summary>Note for Claude</summary>
  <textarea class="textarea" rows="2" data-p="${p.slug}" data-k="notes" placeholder="Anything to know about ${esc(p.short)}'s week">${esc(inp.notes || '')}</textarea></details>`;

// Time entry: accepts 8:02, 802, 0802, 8a, 4:31p, 16:31. Returns {text} normalized or {err}.
function parseClock(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  const h = +m[1]; const min = m[2] ? +m[2] : 0; const mer = m[3];
  if (min > 59 || h > 23) return null;
  if (mer) { if (h < 1 || h > 12) return null; return { h24: (h % 12) + (mer[0] === 'p' ? 12 : 0), min, sure: true }; }
  if (h === 0 || h > 12) return { h24: h, min, sure: true };
  return { h12: h, min, sure: false };
}
const fmt24 = (h24, min) => `${((h24 + 11) % 12) + 1}:${String(min).padStart(2, '0')}${h24 < 12 ? 'a' : 'p'}`;
function normClock(raw, kind, ref) {
  const c = parseClock(raw);
  if (!c) return null;
  if (c.sure) return { text: fmt24(c.h24, c.min), mins: c.h24 * 60 + c.min };
  const am = (c.h12 % 12) * 60 + c.min;
  const pm = am + 12 * 60;
  let mins;
  if (kind === 'in' || ref == null) mins = c.h12 >= 5 && c.h12 <= 11 ? am : pm;
  else mins = am > ref && am - ref <= 16 * 60 ? am : pm;
  return { text: fmt24(Math.floor(mins / 60), mins % 60), mins };
}
function normMeal(raw) {
  const s = String(raw).trim();
  if (!s) return { text: '' };
  const n = s.match(/^(\d{1,3})\s*(m|min|mins|minutes)?$/i);
  if (n) return { text: n[1] };
  const r = s.split(/\s*(?:-|–|to)\s*/i);
  if (r.length === 2) {
    const a = normClock(r[0], 'in'); const b = a && normClock(r[1], 'out', a.mins);
    if (a && b) return { text: `${a.text}-${b.text}` };
  }
  return null;
}
const isMinutes = (v) => /^\d{0,3}$/.test(String(v ?? '').trim());

function rowState(r) {
  if (r.off) return { ok: true };
  const inn = String(r.in || '').trim(); const out = String(r.out || '').trim();
  const bad = [];
  if (inn && !normClock(inn, 'in')) bad.push('in');
  if (out && !normClock(out, 'out')) bad.push('out');
  if (r.meal && !normMeal(r.meal)) bad.push('meal');
  if (!isMinutes(r.excl)) bad.push('excl');
  return { ok: !!inn && !!out && !bad.length, missing: !inn || !out, bad };
}

function hourlyReady(p) {
  const inp = prInput(p.slug);
  if (UI.week >= mondayOf(S.today)) return 'Week not over yet';
  const days = personDays(p, inp);
  const probs = days.filter((d) => !rowState(inp.days[d] || {}).ok);
  if (probs.length) return `Missing ${probs.map((d) => DAYS[dowOf(d)]).join(', ')}`;
  if (days.every((d) => (inp.days[d] || {}).off)) return 'Every day is marked off';
  return null;
}

// Done-ness for the viewed week comes from runs + manual marks, not just this Monday's status.
const personRuns = (slug) => S.runs.filter((r) => r.taskId === 'perf-review' && r.target === slug && r.week === UI.week);
const personManual = (slug) => (S.manual || []).filter((m) => m.taskId === 'perf-review' && m.target === slug && m.week === UI.week).sort((a, b) => b.at - a.at)[0];

function updatePerson(slug) {
  const el = $(`[data-person="${slug}"]`);
  if (!el) return;
  const p = S.people.find((x) => x.slug === slug);
  const runs = personRuns(slug);
  const running = runs.find((r) => r.status === 'queued' || r.status === 'running');
  const doneRun = runs.find((r) => r.status === 'done');
  const manual = personManual(slug);
  const latest = runs[0];
  const why = p.group === 'hourly' ? hourlyReady(p) : null;

  let chip = ['plain', 'Ready'];
  if (running) chip = ['run', running.status === 'queued' ? 'Queued' : 'Running'];
  else if (doneRun || manual) chip = ['good', `Done ${when(doneRun?.endedAt || manual.at)}`];
  else if (latest?.status === 'needs_input') chip = ['warn', 'Needs input'];
  else if (latest?.status === 'failed') chip = ['bad', 'Failed'];
  else if (why) chip = ['plain', p.group === 'hourly' ? 'Needs times' : why];
  setChip($('[data-pchip]', el), chip);
  el.classList.toggle('is-done', !!(doneRun || manual));

  const btn = $('[data-act="run"]', el);
  btn.disabled = !!running || !!why;
  btn.textContent = doneRun || manual ? `Run ${p.short} again` : `Run ${p.short}`;
  const hint = $('[data-hint]', el);
  hint.textContent = running ? '' : why || '';
  $('[data-done]', el).innerHTML = manual
    ? `<button class="linkbtn" data-act="undo" data-id="${esc(manual.id)}">Undo mark done</button>`
    : (doneRun || running ? '' : `<button class="linkbtn" data-act="done" data-task="perf-review" data-p="${slug}">Mark done</button>`);

  if (p.group === 'hourly') {
    const inp = prInput(slug);
    for (const tr of $$('tr[data-row]', el)) {
      const r = inp.days[tr.dataset.row] || {};
      const st = rowState(r);
      tr.classList.toggle('off', !!r.off);
      for (const k of ['in', 'out', 'meal', 'excl']) {
        const i = $(`input[data-k="${k}"]`, tr);
        i.classList.toggle('invalid', (st.bad || []).includes(k));
        i.classList.toggle('missing', !r.off && (k === 'in' || k === 'out') && !String(r[k] || '').trim());
      }
    }
  }
}

// ── generic card state ────────────────────────────────────────
function setChip(el, [cls, text]) {
  if (!el) return;
  el.className = `chip ${cls}`;
  el.textContent = text;
}

function chipFor(t) {
  const s = t.status;
  const running = S.runs.some((r) => r.taskId === t.id && (r.status === 'queued' || r.status === 'running'));
  if (t.cadence.type === 'multi') return running ? ['run', 'Running'] : s.today ? ['good', `${s.today} today`] : ['plain', 'Not yet today'];
  if (t.cadence.type === 'asNeeded') return running ? ['run', 'Running'] : ['plain', s.lastAt ? `Last ${when(s.lastAt)}` : 'As needed'];
  const extra = t.id === 'perf-review' ? ` · ${s.doneCount}/${S.people.length}` : '';
  if (s.state === 'done') return ['good', `Done ${when(s.doneAt)}`];
  if (running && t.id !== 'perf-review') return ['run', 'Running'];
  if (s.state === 'due') return ['warn', `Due today${extra}`];
  if (s.state === 'overdue') return ['bad', `Overdue since ${dayLabel(s.period.due)}${extra}`];
  return ['plain', `${dayLabel(s.period.due)} · in ${s.daysUntil}d`];
}

function actionsHtml(t) {
  const s = t.status;
  const running = S.runs.find((r) => r.taskId === t.id && (r.status === 'queued' || r.status === 'running'));
  const parts = [];
  if (t.kind === 'prompt') {
    parts.push(`<button class="btn btn-primary" data-act="run" data-task="${t.id}" ${running ? 'disabled' : ''}>${esc(t.runLabel || 'Run')}</button>`);
  }
  if (t.cadence.type === 'multi') {
    parts.push(`<button class="btn" data-act="done" data-task="${t.id}">Log a pass</button>`);
    const lastManual = (s.manualToday || [])[0];
    if (lastManual) parts.push(`<button class="linkbtn" data-act="undo" data-id="${esc(lastManual)}">Undo</button>`);
  } else if (t.cadence.type !== 'asNeeded') {
    if (s.state === 'done' && s.manual) parts.push(`<button class="linkbtn" data-act="undo" data-id="${esc(s.manual)}">Undo mark done</button>`);
    else if (s.state !== 'done') parts.push(`<button class="${t.kind === 'manual' ? 'btn' : 'linkbtn'}" data-act="done" data-task="${t.id}">Mark done</button>`);
  }
  return parts.join('');
}

// ── run panel ─────────────────────────────────────────────────
const STATUS = {
  done: ['good', 'Done'], needs_input: ['warn', 'Needs input'], failed: ['bad', 'Failed'],
  canceled: ['plain', 'Canceled'], running: ['run', 'Running'], queued: ['run', 'Queued'],
};

function runsFor(key) {
  const [taskId, target] = key.split('|');
  return S.runs.filter((r) => r.taskId === taskId && (r.target || '') === target && (taskId !== 'perf-review' || r.week === UI.week));
}

function runHtml(r, key, others) {
  const [cls, label] = STATUS[r.status] || ['plain', r.status];
  const active = r.status === 'queued' || r.status === 'running';
  const logOpen = UI.logs.has(r.id);
  const logList = (lines) => `<ul class="logtail">${lines.map((l) => `<li class="${esc(l.kind)}"><span class="t">${clock(l.t)}</span>${esc(l.text)}</li>`).join('')}</ul>`;
  let body = '';
  if (active) {
    body = `<div class="run-live"><span class="spinner"></span><span class="run-phase">${esc(r.status === 'queued' ? 'Waiting for a free slot' : r.phase || 'Working')}</span>
        <span class="run-elapsed" data-since="${r.startedAt || r.createdAt}">${dur(Date.now() - (r.startedAt || r.createdAt))}</span></div>
      ${r.log?.length && !logOpen ? logList(r.log.slice(-5)) : ''}`;
  } else {
    const open = UI.expanded.has(r.id);
    const long = (r.text || '').split('\n').length > 7 || (r.text || '').length > 600;
    body = `<div class="run-top"><span class="chip ${cls}">${label}</span><span class="run-when">${when(r.endedAt)}${r.startedAt ? ` · took ${dur(r.endedAt - r.startedAt)}` : ''}</span></div>
      ${r.headline ? `<p class="run-headline">${esc(r.headline)}</p>` : ''}
      ${r.needs ? `<div class="run-needs">${linkify(esc(r.needs))}</div>` : ''}
      ${r.text && r.text !== r.headline ? `<div class="run-text ${open ? 'open' : long ? 'clamped' : ''}">${linkify(esc(r.text))}</div>` : ''}
      ${long && r.text ? `<button class="linkbtn" data-act="more" data-run="${r.id}" style="margin:-4px 0 8px">${open ? 'Less' : 'More'}</button>` : ''}
      ${r.error ? `<div class="run-error">${esc(r.error)}</div>` : ''}
      ${r.links?.length ? `<div class="run-links">${r.links.map((l) => safeUrl(l.url) ? `<a class="linkchip" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || 'Link')}</a>` : '').join('')}</div>` : ''}
      ${r.copy ? `<div class="run-copy"><pre>${esc(r.copy)}</pre><button class="btn btn-sm btn-primary" data-act="copy" data-run="${r.id}">Copy prompt</button></div>` : ''}
      ${r.denials?.length ? `<div class="run-denials">Blocked: ${r.denials.map(esc).join(' · ')}</div>` : ''}`;
  }
  const foot = `<div class="run-foot">
      ${active ? `<button class="linkbtn" data-act="cancel" data-run="${r.id}">Cancel</button>` : ''}
      <button class="linkbtn" data-act="log" data-run="${r.id}">${logOpen ? 'Hide log' : `Log (${r.logCount || 0})`}</button>
      ${r.sessionId && !active ? `<button class="linkbtn" data-act="resume" data-run="${r.id}">Continue in terminal</button>` : ''}
      <span class="sp"></span>
      ${r.costUsd != null ? `<span>$${r.costUsd.toFixed(2)}</span>` : ''}
    </div>
    ${logOpen ? `<div class="fulllog">${logList(UI.logs.get(r.id) || [])}</div>` : ''}`;
  const hist = others.length ? `<details class="history" ${UI.view.has(key) ? 'open' : ''}><summary>Earlier runs (${others.length})</summary><ul>
      ${others.slice(0, 8).map((o) => `<li><span class="chip ${(STATUS[o.status] || ['plain'])[0]}" style="padding:3px 6px">${(STATUS[o.status] || ['', o.status])[1]}</span>
        <button data-act="view" data-key="${esc(key)}" data-run="${o.id}">${esc(when(o.endedAt || o.createdAt))} · ${esc(o.headline || '')}</button></li>`).join('')}
      ${UI.view.has(key) ? `<li><button data-act="view" data-key="${esc(key)}" data-run="">Back to latest</button></li>` : ''}
    </ul></details>` : '';
  return `<div class="runbox ${esc(r.status)}">${body}${foot}${hist}</div>`;
}

function renderLive(el) {
  const key = el.dataset.live;
  const all = runsFor(key);
  if (!all.length) { if (el.innerHTML) el.innerHTML = ''; UI.sig.delete(key); return; }
  const pick = UI.view.get(key);
  const r = (pick && all.find((x) => x.id === pick)) || all[0];
  const others = all.filter((x) => x.id !== r.id);
  const sig = [r.id, r.status, r.logCount, r.endedAt, UI.expanded.has(r.id), UI.logs.has(r.id) ? (UI.logs.get(r.id) || []).length : -1, others.length, UI.view.get(key) || ''].join('|');
  if (UI.sig.get(key) === sig) return;
  UI.sig.set(key, sig);
  el.innerHTML = runHtml(r, key, others);
}

// ── update pass (every poll) ──────────────────────────────────
function update() {
  renderSystems();
  const due = S.tasks.filter((t) => t.status.state === 'due' || t.status.state === 'overdue').length;
  const running = S.runs.filter((r) => r.status === 'running' || r.status === 'queued').length;
  $('#summary').innerHTML = [due ? `<b>${due}</b> due` : 'nothing due', running ? `<b>${running}</b> running` : ''].filter(Boolean).join(' · ');
  $('#foot-sync').textContent = `synced ${ago(UI.lastSync)}`;
  document.title = running ? `(${running}) Todo` : 'Todo';

  for (const t of S.tasks) {
    const card = $(`[data-card="${t.id}"]`);
    if (!card) continue;
    setChip($('[data-chip]', card), chipFor(t));
    card.classList.toggle('is-due', t.status.state === 'due');
    card.classList.toggle('is-overdue', t.status.state === 'overdue');
    const acts = $('[data-actions]', card);
    if (acts) { const h = actionsHtml(t); if (acts.dataset.sig !== h) { acts.innerHTML = h; acts.dataset.sig = h; } }
  }
  if (!$('[data-pr-body] .pr-bar')) renderPerfBody();
  for (const p of S.people) updatePerson(p.slug);
  for (const el of $$('[data-live]')) renderLive(el);
  // refresh open logs of running runs
  for (const id of UI.logs.keys()) {
    const r = S.runs.find((x) => x.id === id);
    if (r && (r.status === 'running' || r.status === 'queued')) fetchLog(id);
  }
}
setInterval(() => {
  for (const el of $$('.run-elapsed[data-since]')) el.textContent = dur(Date.now() - Number(el.dataset.since));
}, 1000);

async function fetchLog(id) {
  try {
    const r = await api(`/api/runs/${id}`);
    if (!UI.logs.has(id)) return;
    UI.logs.set(id, r.log || []);
    for (const el of $$('[data-live]')) renderLive(el);
  } catch (e) { fail(e); }
}

// ── inputs ────────────────────────────────────────────────────
const saveTimers = new Map();
function saveInput(taskId, key, value) {
  const k = `${taskId}|${key}`;
  clearTimeout(saveTimers.get(k));
  saveTimers.set(k, setTimeout(() => {
    api(`/api/inputs/${taskId}`, { method: 'PUT', body: { key, value } }).catch(fail);
  }, 500));
}

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.field && el.dataset.task) {
    const t = el.dataset.task;
    const form = ((UI.inputs[t] ||= {}).form ||= {});
    form[el.dataset.field] = el.value;
    saveInput(t, 'form', form);
    return;
  }
  if (el.dataset.p && el.dataset.k) {
    const inp = prInput(el.dataset.p);
    if (el.dataset.d) {
      const row = (inp.days[el.dataset.d] ||= {});
      row[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    } else inp[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    saveInput('perf-review', prKey(el.dataset.p), inp);
    updatePerson(el.dataset.p);
  }
});

// Normalize times when a field loses focus, so Joey sees exactly what Claude will get.
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (!(el.dataset.p && el.dataset.d && ['in', 'out', 'meal'].includes(el.dataset.k)) || !el.value.trim()) return;
  const inp = prInput(el.dataset.p);
  const row = inp.days[el.dataset.d] ||= {};
  let out = null;
  if (el.dataset.k === 'meal') out = normMeal(el.value);
  else {
    const ref = el.dataset.k === 'out' ? normClock(row.in || '', 'in')?.mins : null;
    out = normClock(el.value, el.dataset.k, ref);
  }
  if (out && out.text !== el.value) {
    el.value = out.text;
    row[el.dataset.k] = out.text;
    saveInput('perf-review', prKey(el.dataset.p), inp);
  }
  updatePerson(el.dataset.p);
});

// ── actions ───────────────────────────────────────────────────
function cleanPerfInput(p) {
  const inp = prInput(p.slug);
  const days = personDays(p, inp);
  return {
    days: Object.fromEntries(days.map((d) => [d, inp.days[d] || {}])),
    extraDays: inp.extraDays || [], confirmed: !!inp.confirmed, notes: inp.notes || '',
  };
}

async function startRun(taskId, slug) {
  const body = { taskId };
  if (taskId === 'perf-review') {
    const p = S.people.find((x) => x.slug === slug);
    Object.assign(body, { target: slug, week: UI.week, inputs: cleanPerfInput(p) });
  } else body.inputs = (UI.inputs[taskId] || {}).form || {};
  await api('/api/run', { method: 'POST', body });
  UI.view.delete(`${taskId}|${slug || ''}`);
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  try {
    if (act === 'check') { await checkSystems(); return; }
    if (act === 'login') {
      await api(`/api/systems/${b.dataset.sys}/login`, { method: 'POST' });
      toast('A Chrome window is opening on your desktop. Sign in, then close it.');
      return refresh();
    }
    if (act === 'run') {
      b.disabled = true;
      await startRun(b.dataset.task, b.dataset.p);
      return refresh();
    }
    if (act === 'runall') {
      const ready = S.people.filter((p) => {
        const runs = personRuns(p.slug);
        if (runs.some((r) => r.status === 'done' || r.status === 'queued' || r.status === 'running') || personManual(p.slug)) return false;
        return p.group === 'va' || !hourlyReady(p);
      });
      if (!ready.length) return toast('Nobody is ready to run. Hourly agents need their times.');
      for (const p of ready) await startRun('perf-review', p.slug);
      toast(`Started ${ready.map((p) => p.short).join(', ')}`);
      return refresh();
    }
    if (act === 'cancel') { await api(`/api/runs/${b.dataset.run}/cancel`, { method: 'POST' }); return refresh(); }
    if (act === 'done') {
      await api('/api/done', { method: 'POST', body: { taskId: b.dataset.task, target: b.dataset.p || null, week: b.dataset.p ? UI.week : null } });
      return refresh();
    }
    if (act === 'undo') { await api(`/api/done/${b.dataset.id}`, { method: 'DELETE' }); return refresh(); }
    if (act === 'more') {
      const id = b.dataset.run;
      if (UI.expanded.has(id)) UI.expanded.delete(id); else UI.expanded.add(id);
      return update();
    }
    if (act === 'log') {
      const id = b.dataset.run;
      if (UI.logs.has(id)) { UI.logs.delete(id); return update(); }
      UI.logs.set(id, null);
      update();
      return fetchLog(id);
    }
    if (act === 'copy') {
      const r = S.runs.find((x) => x.id === b.dataset.run);
      await navigator.clipboard.writeText(r.copy);
      return toast('Copied. Paste it into Claude for Chrome.');
    }
    if (act === 'resume') {
      const r = S.runs.find((x) => x.id === b.dataset.run);
      await navigator.clipboard.writeText(`cd ${r.cwd || '~'} && claude --resume ${r.sessionId}`);
      return toast('Copied. Paste it into a WSL terminal to pick up this run.');
    }
    if (act === 'view') {
      if (b.dataset.run) UI.view.set(b.dataset.key, b.dataset.run); else UI.view.delete(b.dataset.key);
      return update();
    }
    if (act === 'week') {
      UI.week = addDays(UI.week, 7 * Number(b.dataset.dir));
      renderPerfBody();
      return update();
    }
    if (act === 'addday' || act === 'rmday') {
      const inp = prInput(b.dataset.p);
      const set = new Set(inp.extraDays || []);
      if (act === 'addday') set.add(b.dataset.d); else { set.delete(b.dataset.d); delete inp.days[b.dataset.d]; }
      inp.extraDays = [...set].sort();
      saveInput('perf-review', prKey(b.dataset.p), inp);
      renderPerfBody();
      return update();
    }
  } catch (e) {
    if (act === 'run') b.disabled = false;
    fail(e);
  }
});

boot();
