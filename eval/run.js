#!/usr/bin/env node
// Diary accuracy check: run real pages through the same photo path the bot uses and score the card against a
// hand-checked answer key. The number that matters most is "wrong and NOT flagged": those are the only rows a
// trader could save by mistake. Usage: node eval/run.js [eval/diary-key.json]   (images stay local, not in git)

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MUNSHI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'munshi-eval-'));
process.env.MUNSHI_BACKUP_DIR = path.join(process.env.MUNSHI_DATA_DIR, 'backups');
const store = await import('../src/core/store.js');
const { createHandler } = await import('../src/bot/handler.js');
const { loadImage } = await import('../src/ai/image.js');
const { providerName } = await import('../src/ai/provider.js');

const key = JSON.parse(fs.readFileSync(process.argv[2] || 'eval/diary-key.json', 'utf8'));
const { handleMessage } = createHandler({ parse: () => null });

const flagged = (r) =>
  r.conflict || !Number.isInteger(r.amountPaise) || r.amountPaise <= 0 || (r.type !== 'expense' && !r.customerText) || r.confidence < 0.6;

const total = { truth: 0, exact: 0, caught: 0, wrongUnflagged: 0, missed: 0, qtyOnlyFlagged: 0, qtyOnly: 0, ms: 0 };
console.log(`provider: ${providerName()}\n`);

for (const [i, page] of key.pages.entries()) {
  if (!fs.existsSync(page.file)) {
    console.log(`page ${i + 1}: ${page.file} not found, skipped`);
    continue;
  }
  const trader = `eval-${i}`;
  const t0 = Date.now();
  await handleMessage({ traderId: trader, image: await loadImage(page.file) });
  const ms = Date.now() - t0;
  const rows = (store.load(trader).pending?.rows || []).filter((r) => r.type !== 'expense');

  const truth = page.rows.map(([type, rupees]) => ({ type, paise: rupees * 100, used: false }));
  let exact = 0, caught = 0, wrongUnflagged = 0, qtyOnlyFlagged = 0;
  // pass 1: exact, unflagged rows claim their truth row first; pass 2: everything else
  const rest = [];
  for (const r of rows) {
    const t = !flagged(r) && truth.find((x) => !x.used && x.type === r.type && x.paise === r.amountPaise);
    if (t) (t.used = true), exact++;
    else rest.push(r);
  }
  for (const r of rest) {
    const t = truth.find((x) => !x.used && x.type === r.type && (x.paise === r.amountPaise || x.paise === r.statedPaise));
    if (flagged(r)) {
      if (t) t.used = true;
      if (!t && !Number.isInteger(r.statedPaise) && r.computedPaise == null) qtyOnlyFlagged++;
      else caught++;
      continue;
    }
    wrongUnflagged++;
    if (process.env.VERBOSE) console.log(`   wrong, unflagged: ${r.type} ${r.customerText} qty=${r.qty} rate=${r.ratePaise} stated=${r.statedPaise} amount=${r.amountPaise}`);
  }
  if (process.env.VERBOSE) for (const x of truth.filter((x) => !x.used)) console.log(`   missed: ${x.type} ₹${x.paise / 100}`);
  const missed = truth.filter((x) => !x.used).length;
  const line = `page ${i + 1} (${page.date}): ${exact}/${truth.length} exact · ${caught} misreads flagged ⚠️ · ${wrongUnflagged} wrong & unflagged · ${missed} missed · qty-only rows flagged ${Math.min(qtyOnlyFlagged, page.qtyOnly || 0)}/${page.qtyOnly || 0} · ${(ms / 1000).toFixed(1)} s`;
  console.log(line);
  Object.assign(total, {
    truth: total.truth + truth.length, exact: total.exact + exact, caught: total.caught + caught,
    wrongUnflagged: total.wrongUnflagged + wrongUnflagged, missed: total.missed + missed,
    qtyOnlyFlagged: total.qtyOnlyFlagged + Math.min(qtyOnlyFlagged, page.qtyOnly || 0), qtyOnly: total.qtyOnly + (page.qtyOnly || 0), ms: total.ms + ms,
  });
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) : '0');
console.log(`
TOTAL  ${total.exact}/${total.truth} customer rows exact (${pct(total.exact, total.truth)}%)
       ${total.caught} misreads caught and flagged ⚠️ before saving
       ${total.wrongUnflagged} rows wrong and NOT flagged  ← the only ones a trader could save by mistake
       ${total.missed} rows missed (not on the card; the trader sees the gap)
       ${total.qtyOnlyFlagged}/${total.qtyOnly} quantity-only rows flagged instead of guessed
       ${(total.ms / 1000).toFixed(0)} s for ${key.pages.length} pages`);
fs.rmSync(process.env.MUNSHI_DATA_DIR, { recursive: true, force: true });
