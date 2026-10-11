// /export files: a readable HTML khata (opens in any phone browser) and an Excel-friendly CSV.
// Every number comes from ledger.js; this file only lays them out.

import * as ledger from './ledger.js';
import { fmt, fmtQty } from './money.js';

const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const nameOf = (data, id) => data.customers.find((c) => c.id === id)?.name || '';

function kind(e, L) {
  if (e.type === 'payment') return L.paymentWord;
  if (e.type === 'expense') return L.expenseWord;
  return e.paid ? L.nagad : L.udhaar;
}

function working(e) {
  if (e.parts?.length) return e.parts.map((p) => `${fmtQty(p.qty)} × ${fmt(p.ratePaise)}`).join(' + ');
  if (e.qty !== null && e.qty !== undefined && e.ratePaise) return `${fmtQty(e.qty, e.unit)} × ${fmt(e.ratePaise)}`;
  return e.qty !== null && e.qty !== undefined ? fmtQty(e.qty, e.unit) : '';
}

export function buildCsv(data, L) {
  const head = ['Date', 'Customer / Supplier', 'Type', 'Packing', 'Qty', 'Unit', 'Rate (₹)', 'Amount (₹)', 'Item / Note', 'Source', 'Entry id', 'Reverses'];
  const cell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rupees = (p) => (p === null || p === undefined ? '' : (p / 100).toFixed(2));
  const rows = [...data.entries].sort((a, b) => a.date.localeCompare(b.date) || a.ts.localeCompare(b.ts));
  const lines = [head.map(cell).join(',')];
  for (const e of rows) {
    lines.push(
      [dmy(e.date), nameOf(data, e.customerId) || e.supplier || '', kind(e, L), e.qtyLabel, e.qty, e.unit, rupees(e.ratePaise), rupees(e.amountPaise),
        [e.item, e.note].filter(Boolean).join(' · '), e.source, e.id, e.reverses]
        .map(cell)
        .join(','),
    );
  }
  // BOM so Excel shows Devanagari / Gujarati names correctly
  return '﻿' + lines.join('\r\n');
}

export function buildReport(data, L, today) {
  const shop = data.profile.shopName || 'Munshi';
  const all = ledger.hisaab(data, { from: '0000-01-01', to: '9999-12-31' });
  const bal = ledger.allBalances(data);
  const customers = data.customers
    .map((c) => ({ c, b: bal.get(c.id) || 0, n: data.entries.filter((e) => e.customerId === c.id).length }))
    .sort((a, b) => b.b - a.b);
  const dates = [...new Set(data.entries.map((e) => e.date))].sort().reverse();

  const days = dates
    .map((d) => {
      const h = ledger.hisaab(data, { from: d, to: d });
      const rows = data.entries
        .filter((e) => e.date === d)
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(
          (e) => `<tr class="${e.type}${e.reverses ? ' rev' : ''}">
          <td>${esc(nameOf(data, e.customerId) || e.supplier || [e.item, e.note].filter(Boolean).join(' · ') || '—')}${e.qtyLabel ? `<small>${esc(e.qtyLabel)}</small>` : ''}</td>
          <td class="w">${esc(working(e))}</td>
          <td><span class="tag ${e.type === 'sale' ? (e.paid ? 'cash' : 'udh') : e.type}">${esc(kind(e, L))}</span>${e.reverses ? ' <span class="tag rev">undo</span>' : ''}</td>
          <td class="amt">${fmt(e.amountPaise)}</td></tr>`,
        )
        .join('');
      return `<section class="day">
        <div class="dayhead"><h3>${dmy(d)}</h3>
          <div class="chips"><span>${esc(L.sales)} <b>${fmt(h.sales)}</b></span><span>${esc(L.payments)} <b>${fmt(h.payments)}</b></span>${h.expenses ? `<span>${esc(L.expenses)} <b>${fmt(h.expenses)}</b></span>` : ''}</div></div>
        <div class="scroll"><table><tbody>${rows}</tbody></table></div></section>`;
    })
    .join('');

  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(shop)} — khata ${dmy(today)}</title>
<style>
:root{--paper:#fbfcfe;--ink:#1d2433;--muted:#5d6779;--rule:#d7e2f3;--bahi:#a4232f;--ok:#1f7a4d;--warn:#b76a00;--chip:#eef3fb;--card:#fff;--blue:#2f6fde}
@media (prefers-color-scheme:dark){:root{--paper:#12161f;--ink:#e6ebf5;--muted:#9aa5ba;--rule:#263043;--bahi:#ef7a83;--ok:#5fcf95;--warn:#f0b04a;--chip:#1b2231;--card:#171d29;--blue:#7aa7ff;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans Devanagari","Noto Sans Gujarati",sans-serif;padding:20px 16px 48px}
.wrap{max-width:860px;margin:0 auto;display:grid;gap:22px}
header{border-left:4px solid var(--bahi);padding-left:14px}h1{margin:0;font-size:1.6rem;color:var(--bahi)}h2{margin:0 0 10px;font-size:1.05rem}h3{margin:0;font-size:1rem}
.muted{color:var(--muted);font-size:.85rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.stat{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:12px}.stat b{display:block;font-size:1.25rem;font-variant-numeric:tabular-nums}.stat span{color:var(--muted);font-size:.8rem}
.stat.due{border-color:var(--bahi)}.stat.due b{color:var(--bahi)}
.card{background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:12px 14px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}td,th{padding:8px 6px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
th{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.amt,.num{text-align:right;white-space:nowrap;font-weight:600}.w{color:var(--muted);font-family:ui-monospace,Menlo,monospace;font-size:.82rem;white-space:nowrap}
small{display:block;color:var(--muted);font-size:.75rem}
.tag{font-size:.72rem;padding:2px 7px;border-radius:999px;background:var(--chip);white-space:nowrap}.tag.udh{color:var(--bahi)}.tag.cash{color:var(--ok)}.tag.payment{color:var(--blue)}.tag.expense{color:var(--warn)}.tag.rev{color:var(--muted)}
tr.rev td{color:var(--muted);text-decoration:line-through}
.day{display:grid;gap:8px}.dayhead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{font-size:.78rem;background:var(--chip);border-radius:8px;padding:3px 8px}
.scroll{overflow-x:auto;background:var(--card);border:1px solid var(--rule);border-radius:12px;padding:2px 10px}
.bar{height:6px;border-radius:3px;background:var(--bahi);opacity:.75}
footer{color:var(--muted);font-size:.8rem}
</style></head><body><div class="wrap">
<header><h1>📒 ${esc(shop)}</h1><div class="muted">Khata · ${dmy(today)} · ${data.entries.length} entries · ${data.customers.length} customers</div></header>
<div class="stats">
  <div class="stat due"><span>${esc(L.totalDue)}</span><b>${fmt(all.totalDue)}</b></div>
  <div class="stat"><span>${esc(L.sales)}</span><b>${fmt(all.sales)}</b></div>
  <div class="stat"><span>${esc(L.udhaar)}</span><b>${fmt(all.udhaarSales)}</b></div>
  <div class="stat"><span>${esc(L.payments)}</span><b>${fmt(all.payments)}</b></div>
  ${all.expenses ? `<div class="stat"><span>${esc(L.expenses)}</span><b>${fmt(all.expenses)}</b></div>` : ''}
</div>
<div class="card"><h2>${esc(L.customersTitle)} · ${esc(L.closing)}</h2>
<table><thead><tr><th>${esc(L.customersTitle)}</th><th></th><th class="num">${esc(L.closing)}</th></tr></thead><tbody>
${customers
  .map(({ c, b, n }) => {
    const max = Math.max(1, ...customers.map((x) => x.b));
    return `<tr><td>${esc(c.name)}<small>${n} entries</small></td><td style="width:35%">${b > 0 ? `<div class="bar" style="width:${Math.max(4, Math.round((100 * b) / max))}%"></div>` : ''}</td><td class="num">${fmt(b)}</td></tr>`;
  })
  .join('')}
</tbody></table></div>
<h2>${esc(L.lastEntries.replace(/:$/, ''))}</h2>
${days || `<p class="muted">${esc(L.noEntries)}</p>`}
<footer>Munshi · amounts computed in code (integer paise), every entry confirmed by the trader · undo entries shown struck through</footer>
</div></body></html>`;
}
