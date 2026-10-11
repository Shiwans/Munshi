// Pure ledger math. No I/O, no model. Input: trader file object. Output: numbers.
// Entry: { id, ts, date, type: 'sale'|'payment'|'expense', customerId?, amountPaise, paid?, item?, qty?, unit?,
//          ratePaise?, qtyLabel?, note?, raw?, source?, reverses? }
// A reversing entry has the same type/customer and amountPaise negative; `reverses` names the original id.

import { mulPaise } from './money.js';

export const TYPES = ['sale', 'payment', 'expense'];

// Effect of one entry on a customer's balance (what the customer owes the trader).
export function balanceEffect(e) {
  if (!e.customerId) return 0;
  if (e.type === 'sale') return e.paid ? 0 : e.amountPaise;
  if (e.type === 'payment') return -e.amountPaise;
  return 0;
}

export function customerBalance(data, customerId) {
  return data.entries.filter((e) => e.customerId === customerId).reduce((s, e) => s + balanceEffect(e), 0);
}

export function allBalances(data) {
  const out = new Map();
  for (const e of data.entries) {
    if (!e.customerId) continue;
    out.set(e.customerId, (out.get(e.customerId) || 0) + balanceEffect(e));
  }
  return out;
}

// Customer statement rows with running balance, oldest first.
export function khata(data, customerId, { from, to } = {}) {
  const rows = data.entries
    .filter((e) => e.customerId === customerId && (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => (a.date === b.date ? a.ts.localeCompare(b.ts) : a.date.localeCompare(b.date)));
  // opening balance = effect of everything before `from`
  let bal = from
    ? data.entries.filter((e) => e.customerId === customerId && e.date < from).reduce((s, e) => s + balanceEffect(e), 0)
    : 0;
  const opening = bal;
  const out = rows.map((e) => {
    bal += balanceEffect(e);
    return { ...e, running: bal };
  });
  return { opening, rows: out, closing: bal };
}

// Day / range totals.
export function hisaab(data, { from, to }) {
  const inRange = data.entries.filter((e) => e.date >= from && e.date <= to);
  const sum = (pred) => inRange.filter(pred).reduce((s, e) => s + e.amountPaise, 0);
  const cashSales = sum((e) => e.type === 'sale' && e.paid);
  const udhaarSales = sum((e) => e.type === 'sale' && !e.paid);
  const payments = sum((e) => e.type === 'payment');
  const expenses = sum((e) => e.type === 'expense');
  const balances = allBalances(data);
  const topDues = [...balances.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([customerId, paise]) => ({ customerId, paise }));
  return {
    from,
    to,
    sales: cashSales + udhaarSales,
    cashSales,
    udhaarSales,
    payments,
    expenses,
    cashInHand: cashSales + payments - expenses,
    totalDue: [...balances.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0),
    topDues,
    count: inRange.length,
  };
}

// Resolve the amount of a draft entry from what the trader gave. Returns { amountPaise, computedPaise, conflict }.
// - qty & rate given → computed; if a stated amount also exists and differs → conflict (nothing to save until answered).
// - only stated amount → stated.
export function resolveAmount({ qty, ratePaise, amountPaise }) {
  const computed = mulPaise(qty, ratePaise);
  if (computed !== null && amountPaise !== null && amountPaise !== undefined && computed !== amountPaise) {
    return { amountPaise: null, computedPaise: computed, conflict: true };
  }
  return { amountPaise: computed ?? amountPaise ?? null, computedPaise: computed, conflict: false };
}

// Build the reversing entry for a confirmed entry.
export function reversalOf(e, id, ts) {
  return { ...e, id, ts, amountPaise: -e.amountPaise, reverses: e.id, raw: `undo ${e.id}`, source: 'undo' };
}

export function validateEntry(e) {
  const errors = [];
  if (!TYPES.includes(e.type)) errors.push(`type ${e.type}`);
  if (!Number.isInteger(e.amountPaise) || e.amountPaise === 0) errors.push('amount');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) errors.push('date');
  if ((e.type === 'sale' || e.type === 'payment') && !e.customerId) errors.push('customer');
  return errors;
}
