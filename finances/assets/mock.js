/* ═══════════════════════════════════════════════════════════
   mock.js — DEMO data only. Deleted the moment the Era pull lands.
   Shape here IS the contract the Era import must produce.
   ═══════════════════════════════════════════════════════════ */
import { d } from './data.js?v=67b4cd6369';

const HIST_START = '2026-06-01';   // detector needs history; display still floors at Sept 15
const TODAY = '2026-09-22';

let seed = 20260922;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const jitter = (n, pct) => Math.round(n * (1 + (rnd() - 0.5) * 2 * pct) * 100) / 100;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const RECUR = [
  { m: 'Harrison St Apartments', amt: 4200,   day: 1,      cat: 'housing',   acct: 'varo-debit' },
  { m: 'Varo Believe',           amt: 200,    day: 3,      cat: 'bills',     acct: 'varo-debit' },
  { m: 'PG&E',                   amt: 118.40, day: 8,      cat: 'bills',     acct: 'varo-debit', v: 0.18 },
  { m: 'Comcast Xfinity',        amt: 89.99,  day: 12,     cat: 'bills',     acct: 'varo-debit' },
  { m: 'Verizon Wireless',       amt: 94.22,  day: 18,     cat: 'bills',     acct: 'varo-debit' },
  { m: 'Netflix',                amt: 22.99,  day: 14,     cat: 'subs',      acct: 'varo-believe' },
  { m: 'Spotify USA',            amt: 11.99,  day: 6,      cat: 'subs',      acct: 'varo-believe' },
  { m: 'Anthropic',              amt: 20.00,  day: 22,     cat: 'subs',      acct: 'varo-believe' },
  { m: 'Planet Fitness',         amt: 24.99,  day: 17,     cat: 'health',    acct: 'varo-debit' },
  { m: 'State Farm Insurance',   amt: 142.00, day: 25,     cat: 'bills',     acct: 'varo-debit' },
  { m: 'Mallard Storage',        amt: 360.00, day: 5,      cat: 'housing',   acct: 'varo-debit' },
];

const VARIABLE = [
  { m: 'Safeway',            cat: 'food',      lo: 28,  hi: 130, per: 6,  acct: 'varo-debit' },
  { m: 'Trader Joes',        cat: 'food',      lo: 22,  hi: 78,  per: 9,  acct: 'varo-debit' },
  { m: 'Philz Coffee',       cat: 'food',      lo: 5,   hi: 14,  per: 3,  acct: 'varo-believe' },
  { m: 'Doordash',           cat: 'food',      lo: 18,  hi: 52,  per: 5,  acct: 'varo-believe' },
  { m: 'Chipotle',           cat: 'food',      lo: 12,  hi: 26,  per: 8,  acct: 'varo-believe' },
  { m: 'Uber',               cat: 'transport', lo: 9,   hi: 38,  per: 5,  acct: 'varo-debit' },
  { m: 'Clipper Bart',       cat: 'transport', lo: 10,  hi: 30,  per: 11, acct: 'varo-debit' },
  { m: 'Shell Oil',          cat: 'transport', lo: 38,  hi: 72,  per: 16, acct: 'varo-debit' },
  { m: 'Amazon',             cat: 'shopping',  lo: 14,  hi: 145, per: 5,  acct: 'varo-believe' },
  { m: 'Target',             cat: 'shopping',  lo: 25,  hi: 96,  per: 14, acct: 'varo-debit' },
  { m: 'Walgreens',          cat: 'health',    lo: 9,   hi: 44,  per: 13, acct: 'varo-debit' },
  { m: 'ATM Withdrawal',     cat: 'cash',      lo: 40,  hi: 200, per: 12, acct: 'varo-debit' },
];

export function buildMockVault() {
  const txns = [];
  let n = 0;
  const add = (date, merchant, amount, cat, acct) => {
    if (date > TODAY || date < HIST_START) return;
    txns.push({
      id: `m${++n}`, date, account: acct,
      merchant, description: merchant.toUpperCase() + ' ' + (1000 + Math.floor(rnd() * 8999)),
      amount: Math.round(amount * 100) / 100, category: cat, pending: false,
    });
  };

  // income — semi-monthly, 15th and last day, flat amount
  let cur = '2026-06-01';
  while (cur <= TODAY) {
    const mo = cur.slice(0, 7);
    const last = new Date(Date.UTC(+mo.slice(0, 4), +mo.slice(5, 7), 0)).getUTCDate();
    add(`${mo}-15`, 'Whim Payroll', 3180.44, 'other', 'varo-debit');
    add(`${mo}-${last}`, 'Whim Payroll', 3180.44, 'other', 'varo-debit');
    cur = d.addMonths(cur, 1);
  }

  // recurring bills
  for (const r of RECUR) {
    let c = '2026-06-01';
    while (c <= TODAY) {
      const mo = c.slice(0, 7);
      add(`${mo}-${String(r.day).padStart(2, '0')}`, r.m, -(r.v ? jitter(r.amt, r.v) : r.amt), r.cat, r.acct);
      c = d.addMonths(c, 1);
    }
  }

  // variable spend
  for (const v of VARIABLE) {
    let c = HIST_START;
    while (c <= TODAY) {
      c = d.addDays(c, Math.max(1, Math.round(v.per * (0.55 + rnd() * 0.9))));
      if (c > TODAY) break;
      add(c, v.m, -(Math.round((v.lo + rnd() * (v.hi - v.lo)) * 100) / 100), v.cat, v.acct);
    }
  }

  // ── historical gaming/crypto-rail charges (auto-hidden, pre-cutoff) ──
  const RAILS = [
    ['Modo Gold Coins', 'Purchase authorized Modo Gold Coins Https://Modo. AZ', -250, 'varo-debit'],
    ['BREEZE*Stake*02e6', 'Visa POS Transaction BREEZE*Stake*02e6 Miami FLUS', -500, 'varo-debit'],
    ['Meld Phantom', 'Money Transfer authorized Meld Phantom 20318 800-9099664 NV', -500, 'varo-debit'],
    ['Polymarket', 'Visa POS Transaction Polymarket Boca Raton FLUS', -300, 'varo-debit'],
    ['Banxa', 'Visa POS Transaction BanxaBANXA', -400, 'varo-debit'],
    ['Crypto.com', 'Crypto.com Top Up', -350, 'varo-debit'],
    ['Foris USA DAX', 'ACH Transfer From Foris USA DAX CF CARD TO BA', 620, 'varo-debit'],
    ['Swapped', 'Money Transfer authorized Swapped* WWW.Swapped.C MA', -275, 'varo-debit'],
  ];
  for (let i = 0; i < 26; i++) {
    const r = RAILS[i % RAILS.length];
    const day = d.addDays(HIST_START, Math.floor(rnd() * 100));
    if (day >= '2026-09-22') continue;          // cutoff — after this they stay visible
    add(day, r[0], r[2] * (0.6 + rnd() * 0.9), 'other', r[3]);
  }
  // one AFTER the cutoff, to prove future ones are NOT hidden
  add('2026-09-22', 'Polymarket', -120, 'other', 'varo-debit');

  // ── reimbursements: the dinner-and-Venmo case ──
  add('2026-09-16', 'Nopa', -218.40, 'food', 'varo-debit');
  add('2026-09-17', 'Venmo from Trevor Arnold', 54.60, 'other', 'varo-debit');
  add('2026-09-17', 'Venmo from Evan McDonald', 54.60, 'other', 'varo-debit');
  add('2026-09-20', 'Zuni Cafe', -164.00, 'food', 'varo-debit');
  add('2026-09-21', 'Venmo from Ben Rist', 82.00, 'other', 'varo-debit');

  txns.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  // a realistic spread of category confidence — Era/Plaid don't guess everything well
  for (const t of txns) {
    if (['Amazon', 'ATM Withdrawal'].includes(t.merchant)) { t.category = 'other'; t.catConfidence = 'none'; }
    else if (['Doordash'].includes(t.merchant)) t.catConfidence = 'low';
    else t.catConfidence = 'high';
  }

  return {
    demo: true,
    asOf: TODAY,
    since: '2026-09-15',
    source: 'mock',
    accounts: [
      { id: 'varo-debit',   name: 'Varo Debit',   kind: 'depository', subtype: 'checking',
        balance: 2841.66, spendable: true },
      { id: 'varo-believe', name: 'Varo Believe', kind: 'credit',     subtype: 'secured',
        balance: 412.08,  spendable: true,
        note: 'Pre-funded secured card — balance shown is available to spend, not owed.' },
    ],
    income: { label: 'Whim Payroll', amount: 3180.44, cadence: 'semimonthly', perMonth: 6360.88 },
    transactions: txns,
  };
}
