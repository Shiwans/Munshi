import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerBalance, hisaab, khata, resolveAmount, reversalOf, validateEntry } from '../src/core/ledger.js';
import { fmt, toPaise, mulPaise } from '../src/core/money.js';

const e = (over) => ({ id: over.id || Math.random().toString(36).slice(2), ts: '2026-10-11T09:00:00+05:30', date: '2026-10-11', ...over });

test('money formatting uses Indian grouping and paise', () => {
  assert.equal(fmt(201600), '₹2,016');
  assert.equal(fmt(12345678), '₹1,23,456.78');
  assert.equal(fmt(-50000), '-₹500');
  assert.equal(toPaise('₹1,500'), 150000);
  assert.equal(mulPaise(72, 2800), 201600);
  assert.equal(mulPaise(72.5, 2800), 203000);
});

test('udhaar sale raises balance, cash sale does not, payment lowers it', () => {
  const data = { entries: [
    e({ type: 'sale', customerId: 'c1', amountPaise: 201600, paid: false }),
    e({ type: 'sale', customerId: 'c1', amountPaise: 85000, paid: true }),
    e({ type: 'payment', customerId: 'c1', amountPaise: 150000 }),
  ] };
  assert.equal(customerBalance(data, 'c1'), 51600);
});

test('reversal cancels an entry exactly', () => {
  const orig = e({ id: 'e1', type: 'sale', customerId: 'c1', amountPaise: 201600, paid: false });
  const data = { entries: [orig, reversalOf(orig, 'e2', '2026-10-11T10:00:00+05:30')] };
  assert.equal(customerBalance(data, 'c1'), 0);
  assert.equal(data.entries[1].reverses, 'e1');
});

test('hisaab splits cash, udhaar, payments, expenses and ranks dues', () => {
  const data = { entries: [
    e({ type: 'sale', customerId: 'c1', amountPaise: 201600, paid: false }),
    e({ type: 'sale', customerId: 'c2', amountPaise: 85000, paid: true }),
    e({ type: 'sale', customerId: 'c3', amountPaise: 120000, paid: false }),
    e({ type: 'payment', customerId: 'c1', amountPaise: 150000 }),
    e({ type: 'expense', amountPaise: 30000, item: 'tempo' }),
    e({ type: 'sale', customerId: 'c1', amountPaise: 999, paid: false, date: '2026-10-10' }),
  ] };
  const h = hisaab(data, { from: '2026-10-11', to: '2026-10-11' });
  assert.equal(h.sales, 406600);
  assert.equal(h.cashSales, 85000);
  assert.equal(h.udhaarSales, 321600);
  assert.equal(h.payments, 150000);
  assert.equal(h.expenses, 30000);
  assert.equal(h.cashInHand, 85000 + 150000 - 30000);
  assert.equal(h.count, 5);
  assert.deepEqual(h.topDues.map((d) => d.customerId), ['c3', 'c1']);
  assert.equal(h.totalDue, 120000 + 201600 + 999 - 150000);
});

test('khata gives opening, running and closing balance for a period', () => {
  const data = { entries: [
    e({ type: 'sale', customerId: 'c1', amountPaise: 100000, paid: false, date: '2026-10-01', ts: '1' }),
    e({ type: 'payment', customerId: 'c1', amountPaise: 40000, date: '2026-10-05', ts: '2' }),
    e({ type: 'sale', customerId: 'c1', amountPaise: 20000, paid: false, date: '2026-10-11', ts: '3' }),
  ] };
  const k = khata(data, 'c1', { from: '2026-10-05', to: '2026-10-31' });
  assert.equal(k.opening, 100000);
  assert.deepEqual(k.rows.map((r) => r.running), [60000, 80000]);
  assert.equal(k.closing, 80000);
});

test('resolveAmount computes qty×rate, flags conflicts, falls back to stated amount', () => {
  assert.deepEqual(resolveAmount({ qty: 72, ratePaise: 2800, amountPaise: null }), { amountPaise: 201600, computedPaise: 201600, conflict: false, rounded: false });
  assert.deepEqual(resolveAmount({ qty: 72, ratePaise: 2800, amountPaise: 200000 }), { amountPaise: null, computedPaise: 201600, conflict: true, rounded: false });
  assert.deepEqual(resolveAmount({ qty: 72, ratePaise: 2800, amountPaise: 201600 }).conflict, false);
  assert.deepEqual(resolveAmount({ qty: null, ratePaise: null, amountPaise: 150000 }), { amountPaise: 150000, computedPaise: null, conflict: false, rounded: false });
});

test('validateEntry catches bad type, zero amount, missing customer', () => {
  assert.deepEqual(validateEntry({ type: 'sale', amountPaise: 0, date: '2026-10-11' }), ['amount', 'customer']);
  assert.deepEqual(validateEntry({ type: 'expense', amountPaise: 500, date: '2026-10-11' }), []);
  assert.deepEqual(validateEntry({ type: 'loan', amountPaise: 500, date: 'x' }), ['type loan', 'date']);
});

test('draftTotals splits cash/udhaar and counts missing amounts', async () => {
  const { draftTotals } = await import('../src/core/ledger.js');
  const t = draftTotals([
    { type: 'sale', amountPaise: 201600, paid: false },
    { type: 'sale', amountPaise: 50000, paid: true },
    { type: 'payment', amountPaise: 150000 },
    { type: 'expense', amountPaise: 20000 },
    { type: 'sale', amountPaise: null, paid: false },
  ]);
  assert.deepEqual(t, { sales: 251600, cashSales: 50000, udhaarSales: 201600, payments: 150000, expenses: 20000, missing: 1 });
});

test('multi-part rows are summed by code; diary rounding to the rupee is accepted, real mismatches are not', async () => {
  const { resolveAmount } = await import('../src/core/ledger.js');
  const parts = [{ qty: 23, ratePaise: 3000 }, { qty: 34, ratePaise: 4500 }, { qty: 55, ratePaise: 5500 }];
  assert.equal(resolveAmount({ parts, amountPaise: 524500 }).amountPaise, 524500);
  assert.equal(resolveAmount({ parts, amountPaise: 524500 }).conflict, false);
  const r = resolveAmount({ qty: 30.5, ratePaise: 5500, amountPaise: 167800 });
  assert.deepEqual([r.amountPaise, r.conflict, r.rounded], [167800, false, true]);
  // 51⟩45 + 30⟩30 = 3195, not 3555 → misread digit, must ask
  assert.equal(resolveAmount({ parts: [{ qty: 51, ratePaise: 4500 }, { qty: 30, ratePaise: 3000 }], amountPaise: 355500 }).conflict, true);
});
