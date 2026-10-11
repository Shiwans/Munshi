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

// Resolve the amount of a draft entry from what the trader gave. Returns { amountPaise, computedPaise, conflict, rounded }.
// - qty & rate given (or several parts: 31⟩50 + 20⟩30) → computed; a stated amount that differs → conflict (ask, never guess).
// - Diaries round to the rupee (30½ × ₹55 = 1677.50 written as 1678): a whole-rupee stated amount within ₹1 is accepted.
// - only stated amount → stated.
export function computeParts(parts) {
  if (!parts || !parts.length) return null;
  let sum = 0;
  for (const p of parts) {
    const v = mulPaise(p.qty, p.ratePaise);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

export function resolveAmount({ qty, ratePaise, amountPaise, parts }) {
  const computed = parts && parts.length ? computeParts(parts) : mulPaise(qty, ratePaise);
  const stated = amountPaise === undefined ? null : amountPaise;
  if (computed !== null && stated !== null && computed !== stated) {
    if (stated % 100 === 0 && Math.abs(computed - stated) < 100) {
      return { amountPaise: stated, computedPaise: computed, conflict: false, rounded: true };
    }
    return { amountPaise: null, computedPaise: computed, conflict: true, rounded: false };
  }
  return { amountPaise: computed ?? stated ?? null, computedPaise: computed, conflict: false, rounded: false };
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

// Totals for an unconfirmed card. Rows: { type, amountPaise|null, paid }. Rows without an amount are skipped and counted.
export function draftTotals(rows) {
  const t = { sales: 0, cashSales: 0, udhaarSales: 0, payments: 0, expenses: 0, missing: 0 };
  for (const r of rows) {
    if (!Number.isInteger(r.amountPaise)) { t.missing++; continue; }
    if (r.type === 'sale') { t.sales += r.amountPaise; r.paid ? (t.cashSales += r.amountPaise) : (t.udhaarSales += r.amountPaise); }
    else if (r.type === 'payment') t.payments += r.amountPaise;
    else if (r.type === 'expense') t.expenses += r.amountPaise;
  }
  return t;
}
