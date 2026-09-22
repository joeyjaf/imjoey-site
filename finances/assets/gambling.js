/* ═══════════════════════════════════════════════════════════
   gambling.js — vendor matcher carried over from the Jan–Aug 2026
   gaming/crypto-rail P&L (559 txns, 10 vendor groups).

   Historical matches are hidden automatically. Anything dated on or after
   HIDE_BEFORE stays visible — the point is to clear the past, not to keep
   hiding things going forward.
   ═══════════════════════════════════════════════════════════ */

export const HIDE_BEFORE = '2026-09-22';

/* The confirmed vendor universe. Each entry is matched case-insensitively
   against merchant + description. */
export const VENDOR_GROUPS = [
  { group: 'Modo (Gold Coins / Social Vid)', patterns: ['MODO', 'GOLD COINS', 'SOCIAL VID'] },
  { group: 'Crypto.com / Foris DAX',         patterns: ['CRYPTO.COM', 'CRYPTO*', 'FORIS'] },
  { group: 'Meld / Phantom',                 patterns: ['MELD PHANTOM', 'MELD*', 'MELD '] },
  { group: 'Banxa',                          patterns: ['BANXA'] },
  { group: 'Swapped',                        patterns: ['SWAPPED'] },
  { group: 'Stake via BREEZE',               patterns: ['BREEZE'] },
  { group: 'Polymarket',                     patterns: ['POLYMARKET'] },
  { group: 'Kalshi',                         patterns: ['KALSHI'] },
  { group: 'Coinbase',                       patterns: ['COINBASE'] },
  { group: 'Caesars',                        patterns: ['CAESARS'] },
];

/* Confirmed NOT related — these were flagged on frequency/round-amount grounds
   during the P&L build and cleared one by one. The guard runs FIRST so a
   "Venmo to Ben" or an ATM pull can never be swept up by a vendor pattern. */
const NEVER = [
  'VENMO', 'ZELLE', 'APPLE CASH', 'APPLECASH',
  'ATM WITHDRAWAL', 'ATM DEPOSIT', 'CASH DEPOSIT',
  'TRANSFER TO VISA', 'TRANSFER FROM VISA', 'CARD LOAD',
];

export function gamblingGroup(txn) {
  const hay = `${txn.merchant || ''} ${txn.description || ''}`.toUpperCase();
  for (const n of NEVER) if (hay.includes(n)) return null;
  for (const v of VENDOR_GROUPS) {
    for (const p of v.patterns) if (hay.includes(p)) return v.group;
  }
  return null;
}

/* A transaction is auto-hidden only if it matches AND predates the cutoff. */
export function autoHidden(txn, hideBefore = HIDE_BEFORE) {
  if (txn.date >= hideBefore) return null;
  return gamblingGroup(txn);
}

export function annotate(txns, hideBefore = HIDE_BEFORE) {
  let hidden = 0, future = 0;
  const groups = {};
  const out = txns.map(t => {
    const g = gamblingGroup(t);
    if (!g) return t;
    const auto = t.date < hideBefore;
    if (auto) { hidden++; groups[g] = (groups[g] || 0) + 1; } else { future++; }
    return { ...t, gamblingGroup: g, autoHidden: auto };
  });
  return { txns: out, hidden, future, groups };
}
