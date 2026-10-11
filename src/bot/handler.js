// Channel-agnostic brain. handleMessage({traderId, text?, image?, audio?}) → replies[]
// A reply is a string, or { document: { filename, data: Buffer }, caption }.
// Rules: model output only ever lands in `pending`; only an explicit "haan" writes. Money is paise, math is ledger.js.

import * as store from '../core/store.js';
import * as ledger from '../core/ledger.js';
import { toPaise, fmt, fmtQty } from '../core/money.js';
import { matchCustomer } from '../core/match.js';
import { TOOLS, systemPrompt, correctionPrompt, t, parseLang } from '../core/prompts.js';
import { parseLine } from '../core/parse.js';
import { isRelevant, hasStrongSignal } from '../core/gate.js';
import * as laya from '../ai/laya.js';
import { buildCsv, buildReport } from '../core/report.js';
import * as provider from '../ai/provider.js';
import { transcribe as whisper } from '../ai/whisper.js';

const YES = /^(haan|haa+|ha|han|hanji|haanji|ji|ok+|okay|yes|y|theek|thik|sahi|done|likho|save|✅|👍|1|हाँ|हां|हो|होय|हा|ઠીક|હા)[\s.!]*$/i;
const NO = /^(nahi|nahin|na|no|n|cancel|hatao|chhodo|rehne do|रहने दो|नहीं|नाही|ના|❌)[\s.!]*$/i;
const UNDO = /^(galti|galti ho gayi|undo|galat|गलती|चूक|ભૂલ)[\s.!]*$/i;
const ROW = /^(\d{1,2})[\s.):-]+(.+)$/s;

export function createHandler({ chat = provider.chat, transcribe = null, today = () => store.nowIST().date, parse = parseLine, judge = laya.check } = {}) {
  async function handleMessage({ traderId, text = '', image = null, audio = null }) {
    const data = store.load(traderId);
    const firstTime = !store.exists(traderId);
    let L = t(data.profile.language);
    const replies = [];
    let input = String(text || '').trim();

    if (audio) {
      if (!transcribe) return [L.tryAgain];
      try {
        input = (await transcribe(audio)).trim();
      } catch (err) {
        console.error('[whisper]', err.message);
        return [L.tryAgain];
      }
      if (!input) return [L.notUnderstood];
      replies.push(`${L.heard}: "${input}"`);
    }

    // script → language (only switches when the trader clearly writes in another script)
    const detected = detectLang(input, data.profile.language);
    if (detected !== data.profile.language) {
      data.profile.language = detected;
      L = t(detected);
    }

    const out = await route({ data, input, image, L, firstTime });
    if (out.wiped) store.trash(traderId);
    if (out.restore) {
      const ok = store.restore(traderId);
      return [...replies, ok ? t(store.load(traderId).profile.language).restored : L.nothingToRestore];
    }
    if (out.save !== false) store.save(traderId, data);
    return [...replies, ...out.replies];
  }

  // --- routing ---------------------------------------------------------------
  async function route({ data, input, image, L, firstTime }) {
    const say = (...r) => ({ replies: r });

    if (/^\/start\b/.test(input)) return say(welcome(L));
    if (/^\/help\b/.test(input)) return say(L.help);
    if (/^\/(bhasha|language|lang)\b/.test(input)) {
      const lang = parseLang(input.split(/\s+/)[1]);
      if (!lang) return say(L.langAsk);
      data.profile.language = lang;
      if (!data.profile.shopName && !data.pending) {
        data.pending = { kind: 'onboard', createdAt: store.nowIST().ts };
        return say(t(lang).langSet, t(lang).askShop);
      }
      return say(t(lang).langSet);
    }
    if (/^\/export\b/.test(input)) return say(...exportFiles(data, L));
    if (/^\/wapas\b|^\/restore\b/.test(input)) return { replies: [], restore: true, save: false };
    // slash commands from Telegram's menu — answered by code
    let cmd;
    if ((cmd = input.match(/^\/(baaki|khata|balance)(?:@\w+)?\s*(.*)$/i))) return say(...(cmd[2] ? await khataReply(data, cmd[2], L) : [customersReply(data, L)]));
    if ((cmd = input.match(/^\/(statement|bill)(?:@\w+)?\s*(.*)$/i))) return say(...(cmd[2] ? await statementReply(data, { customer: cmd[2] }, L) : [L.askName]));
    if ((cmd = input.match(/^\/(hisaab|hisab|summary)(?:@\w+)?\s*(.*)$/i))) {
      const p = { kal: 'yesterday', yesterday: 'yesterday', hafta: 'week', week: 'week', mahina: 'month', month: 'month', sab: 'all', all: 'all' }[cmd[2].trim().toLowerCase()] || 'today';
      return say(hisaabReply(data, { period: p }, L));
    }
    if (/^\/(customers|grahak)\b/i.test(input)) return say(customersReply(data, L));
    if ((cmd = input.match(/^\/?(?:undo|galti|cancel)\s+(\d{1,2})$/i))) return askUndo(data, L, Number(cmd[1]));
    if (/^\/(undo|galti)\b/i.test(input)) return askUndo(data, L);
    if (/^\/?(last|pichhli entries|pichhli|recent)(\s*\d+)?$/i.test(input)) return lastList(data, L);
    if ((cmd = input.match(/^\/(?:naam|rename)\s+(.+?)\s*=\s*(.+)$/i))) {
      const c = await findCustomer(data, cmd[1]);
      if (!c) return say(L.noCustomer(cmd[1]));
      const old = c.name;
      c.name = cmd[2].trim();
      store.addAlias(data, c.id, old);
      return say(L.renamed(old, c.name));
    }
    if (/^\/delete\b/.test(input)) {
      data.pending = { kind: 'delete', createdAt: store.nowIST().ts };
      return say(yesNo(L.deleteQ, L));
    }

    // onboarding answer: a shop name has no digits; anything else is real business, so drop the question
    if (data.pending?.kind === 'onboard') {
      data.pending = null;
      if (!image && input && !/\d/.test(input) && !input.startsWith('/') && input.length <= 60) {
        data.profile.shopName = input.replace(/^(mera|meri|my|dukaan|dukan|shop)\s+(ka\s+naam|name|is)?\s*/i, '').trim();
        return say(`${L.profileSaved} ${data.profile.shopName} 🙏`, L.tryExample);
      }
    }

    // answers to a pending card
    if (data.pending && !image) {
      if (YES.test(input)) return confirm(data, L);
      if (NO.test(input)) {
        data.pending = null;
        return say(L.cancelled);
      }
      if (data.pending.kind === 'entries') {
        const m = input.match(ROW);
        if (m && Number(m[1]) >= 1 && Number(m[1]) <= data.pending.rows.length) {
          const handled = await correctRow(data, Number(m[1]) - 1, m[2].trim(), L);
          if (handled) return say(cardReply(data, L));
        }
        if (/^(sab|all|सब|सगळ|બધ)\S*\s+(udhaar|udhar|credit|उधार|ઉધાર)$/i.test(input)) {
          data.pending.rows.forEach((r) => r.type === 'sale' && (r.paid = false));
          return say(cardReply(data, L));
        }
        if (/^(sab|all|सब|सगळ|બધ)\S*\s+(nagad|cash|paid|नकद|रोख|રોકડ)$/i.test(input)) {
          data.pending.rows.forEach((r) => r.type === 'sale' && (r.paid = true));
          return say(cardReply(data, L));
        }
        // free-text correction → model, with the card as context
        if (m || /\b(nahi|galat|sudhar|change|badlo|instead|not)\b/i.test(input)) {
          return modelTurn({ data, input, L, correcting: true });
        }
      }
    }

    if (UNDO.test(input) && !image) return askUndo(data, L);

    if (!image) {
      const quick = await quickQuery(data, input, L);
      if (quick) return say(...quick);
    }
    // the lines traders type most are parsed by code: no model, no hallucination, same card every time
    const parsed = !image && parse(input);
    if (parsed) {
      data.pending = { kind: 'entries', source: 'text', raw: input, via: 'parser', createdAt: store.nowIST().ts, rows: [] };
      for (const e of parsed) data.pending.rows.push(await draftRow(data, e));
      remember(data, input, '(card shown to trader)');
      const res = { replies: [cardReply(data, L)] };
      if (firstTime) res.replies.unshift(welcome(L));
      return res;
    }

    // relevance gate, layer 1 (code, free): only bookkeeping reaches the model
    let blocked = !isRelevant(data, input, { hasMedia: !!image });
    // layer 2 (Laya, local open-weight decision model, ~30 ms): role-change attempts and off-topic text
    if (!blocked && !image && !data.pending) {
      const v = await judge(input);
      if (v) {
        console.log(`[laya] bookkeeping=${v.bookkeeping?.toFixed(2)} injection=${v.injection?.toFixed(2)}`);
        if (v.injection >= 0.8) blocked = true;
        else if (v.bookkeeping !== null && v.bookkeeping < 0.15 && !hasStrongSignal(data, input)) blocked = true;
      }
    }
    if (blocked) {
      const out = [L.offTopic];
      if (firstTime) out.unshift(welcome(L));
      return say(...out);
    }

    const res = await modelTurn({ data, input, image, L });
    if (firstTime && !image) res.replies.unshift(welcome(L));
    return res;
  }

  // --- model -----------------------------------------------------------------
  async function modelTurn({ data, input, image = null, L, correcting = false }) {
    const sys = systemPrompt(data, { today: today(), photo: !!image, lastCustomer: lastCustomerName(data) });
    // short memory so "usne 500 diye" knows who "usne" is; only plain text turns, never cards with numbers to copy
    const messages = (data.history || []).slice(-6).map((h) => ({ role: h.role, text: h.text }));
    if (correcting) messages.push({ role: 'user', text: correctionPrompt(cardText(data, L)) });
    messages.push({ role: 'user', text: input || (image ? 'Is diary page ki saari entries padho.' : '') });

    let res;
    try {
      res = await chat({ system: sys, messages, tools: TOOLS, images: image ? [image] : [] });
    } catch (err) {
      console.error('[model]', err.message?.slice(0, 300));
      return { replies: [L.tryAgain] };
    }
    const prefix = res.fellBack ? `${L.offline}\n` : '';
    const replies = [];
    let recorded = null;

    for (const call of res.toolCalls || []) {
      const a = call.args || {};
      if (call.name === 'record_entries') recorded = (recorded || []).concat(a.entries || []);
      else if (call.name === 'update_profile') {
        // settings change only when the trader clearly asked; the model never flips them on its own
        let changed = false;
        if (a.diaryProfile && image) data.pendingProfile = a.diaryProfile; // saved on confirm
        if (a.shopName && /dukaan|dukan|shop|naam|name|दुकान|नाव|દુકાન/i.test(input)) (data.profile.shopName = a.shopName), (changed = true);
        if (a.language && parseLang(a.language) && /bhasha|language|hindi|marathi|gujarati|english|hinglish|भाषा|ભાષા/i.test(input)) {
          data.profile.language = parseLang(a.language);
          changed = true;
        }
        if (changed) replies.push(t(data.profile.language).profileSaved);
      } else if (call.name === 'get_khata') replies.push(...(await khataReply(data, a.customer, L)));
      else if (call.name === 'statement') replies.push(...(await statementReply(data, a, L)));
      else if (call.name === 'get_hisaab') replies.push(hisaabReply(data, a, L));
      else if (call.name === 'list_customers') replies.push(customersReply(data, L));
      else if (call.name === 'reply') replies.push(/\d/.test(a.text || '') || !a.text ? L.help : a.text); // numbers only ever come from code
    }

    if (recorded) {
      if (!recorded.length) return { replies: [prefix + (image ? L.unreadable : L.notUnderstood)] };
      const source = image ? 'photo' : correcting ? data.pending?.source || 'text' : 'text';
      const raw = correcting ? data.pending?.raw : input;
      data.pending = { kind: 'entries', source, raw, createdAt: store.nowIST().ts, rows: [] };
      for (const e of recorded) data.pending.rows.push(await draftRow(data, e));
      if (image) {
        // the page date is written once at the top: if the model gave it on some rows, it applies to all
        const counts = {};
        for (const r of data.pending.rows) if (r.date !== today()) counts[r.date] = (counts[r.date] || 0) + 1;
        const pageDate = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (pageDate) data.pending.rows.forEach((r) => (r.date = pageDate));
      }
      if (image && data.pendingProfile) {
        data.pending.diaryProfile = data.pendingProfile;
        delete data.pendingProfile;
      }
      replies.unshift(cardReply(data, L));
    }
    delete data.pendingProfile;

    // a free-text answer may never carry numbers: every number the trader sees comes from code
    if (!replies.length) replies.push(res.text && !/\d/.test(res.text) ? res.text : image ? L.unreadable : L.notUnderstood);
    if (prefix) replies[0] = withPrefix(replies[0], prefix);
    if (!image && !correcting && input) remember(data, input, recorded ? '(card shown to trader)' : '(answered from the khata)');
    return { replies };
  }

  // --- drafts & card -----------------------------------------------------------
  async function draftRow(data, e) {
    const type = ['sale', 'payment', 'expense'].includes(e.type) ? e.type : e.type === 'purchase' ? 'expense' : 'sale';
    const row = {
      type,
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : today(),
      customerText: type === 'expense' ? null : (e.customer || '').trim() || null,
      customerId: null,
      isNew: false,
      qty: num(e.qty),
      unit: e.unit || null,
      qtyLabel: e.qtyLabel || null,
      ratePaise: toPaise(num(e.rate)),
      statedPaise: toPaise(num(e.amount)),
      parts: null,
      chosenPaise: null,
      paid: type === 'sale' ? e.paid === true : null,
      item: e.item || null,
      note: e.note || null,
      supplier: type === 'expense' ? (e.supplier || '').trim() || null : null,
      confidence: typeof e.confidence === 'number' ? e.confidence : 1,
    };
    const parts = (Array.isArray(e.parts) ? e.parts : [])
      .map((x) => ({ qty: num(x.qty), ratePaise: toPaise(num(x.rate)) }))
      .filter((x) => x.qty !== null && x.ratePaise !== null);
    if (parts.length > 1) row.parts = parts;
    else if (parts.length === 1 && row.qty === null) Object.assign(row, { qty: parts[0].qty, ratePaise: parts[0].ratePaise });
    if (row.statedPaise === 0) row.statedPaise = null; // models send 0 for "not written"
    // "10 kg at 40": the rate echoed back as the total is not a written total
    if (row.qty !== null && row.qty !== 1 && row.ratePaise !== null && row.statedPaise === row.ratePaise) row.statedPaise = null;
    // the trader's own shop is never a customer ("Shiwans Trader ne 500 diye" → who?)
    if (row.customerText && data.profile.shopName && store.normaliseName(row.customerText) === store.normaliseName(data.profile.shopName)) row.customerText = null;
    // learnt suppliers: their rows are the trader's own purchases/payments, never customer udhaar
    const sup = row.customerText && supplierOf(data, row.customerText);
    if (sup) Object.assign(row, { type: 'expense', supplier: sup, customerText: null, paid: null, note: row.note || (e.type === 'payment' ? 'jama' : null) });
    // "39⟩" with nothing after: a lone quantity echoed back as the amount is not an amount
    if (row.ratePaise === null && !row.parts && row.qty !== null && row.statedPaise === toPaise(row.qty)) row.statedPaise = null;
    await resolveCustomer(data, row);
    return computeRow(row);
  }

  async function resolveCustomer(data, row) {
    row.customerId = null;
    row.isNew = false;
    if (!row.customerText) return row;
    const m = await matchCustomer(data, row.customerText);
    if (m.customer) row.customerId = m.customer.id;
    else row.isNew = true;
    return row;
  }

  async function correctRow(data, i, fix, L) {
    const row = data.pending.rows[i];
    const f = fix.toLowerCase();
    if (/^(hatao|remove|delete|cancel|nikalo|हटाओ|काढा|કાઢો)$/.test(f)) {
      data.pending.rows.splice(i, 1);
      if (!data.pending.rows.length) data.pending = null;
      return true;
    }
    if (/^(udhaar|udhar|credit|baaki|उधार|ઉધાર)$/.test(f)) return (row.paid = false), true;
    if (/^(nagad|cash|paid|upi|नकद|रोख|રોકડ)$/.test(f)) return (row.paid = true), true;
    if (/^(kharcha|kharch|expense|kharid|purchase|खर्चा|खर्च|ખર્ચ)$/.test(f)) {
      const was = row.type;
      if (row.customerText) row.supplier = row.customerText;
      Object.assign(row, { type: 'expense', customerText: null, customerId: null, isNew: false, paid: null });
      if (was === 'payment' && !row.note) row.note = 'jama';
      return computeRow(row), true;
    }
    if (/^(payment|jama|diye|mila)$/.test(f)) return (row.type = 'payment'), (row.paid = null), computeRow(row), true;
    let m;
    if ((m = f.match(/^(?:rate|bhav|bhaav|भाव|रेट|ભાવ)\s*₹?\s*([\d.,]+)$/) || f.match(/^₹?\s*([\d.,]+)\s*(?:rate|bhav|ka rate)$/))) {
      row.ratePaise = toPaise(m[1]);
      row.parts = null;
      row.chosenPaise = null;
      return computeRow(row), true;
    }
    if ((m = f.match(/^(?:qty|wajan|vajan|वजन)?\s*([\d.]+)\s*(kg|kilo|किलो|pcs|nag|dozen|crate|peti)$/))) {
      row.qty = Number(m[1]);
      row.parts = null;
      row.unit = /kilo|किलो/.test(m[2]) ? 'kg' : m[2];
      row.chosenPaise = null;
      return computeRow(row), true;
    }
    if ((m = f.match(/^(?:amount|total|kul|₹)?\s*₹?\s*([\d][\d,]*(?:\.\d+)?)$/))) {
      // trader picks the amount: either answers a conflict or sets the total directly
      row.chosenPaise = toPaise(m[1]);
      return computeRow(row), true;
    }
    if (/^[\p{L}\s.'&-]+$/u.test(fix) && row.type !== 'expense' && fix.split(/\s+/).length <= 4) {
      // a name: "Sagar Ratna" or "Gupta Dairy" — learn the original spelling as an alias on confirm
      const original = row.aliasFrom || row.customerText;
      row.customerText = fix;
      await resolveCustomer(data, row);
      if (original && original.toLowerCase() !== fix.toLowerCase()) row.aliasFrom = original;
      row.confidence = 1;
      return true;
    }
    return false;
  }

  function computeRow(row) {
    if (row.chosenPaise !== null && row.chosenPaise !== undefined) {
      row.amountPaise = row.chosenPaise;
      row.computedPaise = ledger.resolveAmount({ qty: row.qty, ratePaise: row.ratePaise, parts: row.parts, amountPaise: null }).computedPaise;
      row.conflict = false;
    } else {
      const r = ledger.resolveAmount({ qty: row.qty, ratePaise: row.ratePaise, parts: row.parts, amountPaise: row.statedPaise });
      Object.assign(row, { amountPaise: r.amountPaise, computedPaise: r.computedPaise, conflict: r.conflict });
    }
    return row;
  }

  function rowProblems(row) {
    return row.conflict || !Number.isInteger(row.amountPaise) || row.amountPaise <= 0 || (row.type !== 'expense' && !row.customerText);
  }

  function rowLine(data, row, i, L) {
    const parts = [];
    const cust = row.customerId ? store.getCustomer(data, row.customerId).name : row.customerText;
    if (row.type === 'expense') parts.push([L.expenseWord, row.supplier, row.item, row.note].filter(Boolean).join(' · '));
    else {
      let who = cust || L.missingCust;
      if (row.customerId && row.customerText && cust.toLowerCase() !== row.customerText.toLowerCase()) who = `${row.customerText} → ${cust}`;
      if (row.isNew) who += ` ${L.naya}`;
      parts.push(who);
    }
    if (row.type === 'payment') parts.push(L.paymentWord);
    if (row.qtyLabel) parts.push(row.qtyLabel);
    if (row.type === 'sale' && row.item && !row.qtyLabel) parts.push(row.item);
    if (row.computedPaise !== null && row.computedPaise !== undefined) {
      const pieces = row.parts?.length ? row.parts : [{ qty: row.qty, ratePaise: row.ratePaise }];
      const working = `${pieces.map((x) => `${fmtQty(x.qty, pieces.length > 1 ? null : row.unit)} × ${fmt(x.ratePaise)}`).join(' + ')} = ${fmt(row.computedPaise)}`;
      if (row.conflict) parts.push(working);
      else if (row.amountPaise !== row.computedPaise) parts.push(`${working} → ${fmt(row.amountPaise)}`);
      else parts.push(working);
    } else if (row.qty !== null) {
      parts.push(fmtQty(row.qty, row.unit));
      if (Number.isInteger(row.amountPaise)) parts.push(fmt(row.amountPaise));
    } else if (Number.isInteger(row.amountPaise)) parts.push(fmt(row.amountPaise));
    if (row.type === 'sale') parts.push(row.paid ? L.nagad : L.udhaar);
    if (row.date !== today() && !row.dateInHeader) parts.push(row.date.slice(8, 10) + '/' + row.date.slice(5, 7));
    let line = `${i + 1}. ${parts.join(' · ')}`;
    if (row.conflict) line += `\n   ${L.conflict(fmt(row.computedPaise), fmt(row.statedPaise))}`;
    else if (!Number.isInteger(row.amountPaise) || row.amountPaise <= 0) line += ` ${L.missingAmt}`;
    else if (row.confidence < 0.6) line += ` ${L.check}`;
    return line;
  }

  function cardText(data, L) {
    const rows = data.pending.rows;
    if (data.pending.source === 'photo') {
      // on a page where most sales show qty × rate, a sale with a bare number is probably a misread quantity
      const sales = rows.filter((r) => r.type === 'sale');
      const withWorking = sales.filter((r) => r.computedPaise !== null && r.computedPaise !== undefined).length;
      if (withWorking * 2 > sales.length) sales.forEach((r) => (r.computedPaise === null || r.computedPaise === undefined) && r.chosenPaise == null && (r.confidence = Math.min(r.confidence, 0.5)));
      // an amount far above everything else on the page (an extra zero?) gets a second look
      const amounts = rows.map((r) => r.amountPaise).filter((a) => Number.isInteger(a) && a > 0).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      if (amounts.length >= 5) rows.forEach((r) => r.amountPaise > 10 * median && r.chosenPaise == null && (r.confidence = Math.min(r.confidence, 0.5)));
    }
    const dates = new Set(rows.map((r) => r.date));
    const shared = rows.length > 1 && dates.size === 1 && rows[0].date !== today() ? rows[0].date : null;
    rows.forEach((r) => (r.dateInHeader = !!shared));
    const body = rows.map((r, i) => rowLine(data, r, i, L)).join('\n');
    return shared ? `📅 ${shared.slice(8, 10)}/${shared.slice(5, 7)}/${shared.slice(0, 4)}\n${body}` : body;
  }

  function renderCard(data, L) {
    if (!data.pending) return L.cancelled;
    const rows = data.pending.rows;
    const lines = [cardText(data, L)];
    if (rows.length > 1) {
      const tt = ledger.draftTotals(rows);
      const bits = [];
      if (tt.sales) {
        const split = [tt.udhaarSales && `${L.udhaar} ${fmt(tt.udhaarSales)}`, tt.cashSales && `${L.nagad} ${fmt(tt.cashSales)}`].filter(Boolean);
        bits.push(split.length > 1 ? `${fmt(tt.sales)} (${split.join(', ')})` : `${fmt(tt.sales)} ${tt.udhaarSales ? L.udhaar : L.nagad}`);
      }
      if (tt.payments) bits.push(`${L.paymentWord} ${fmt(tt.payments)}`);
      if (tt.expenses) bits.push(`${L.expenseWord} ${fmt(tt.expenses)}`);
      if (bits.length) lines.push(`${L.total}: ${bits.join(' · ')}`);
    }
    lines.push(data.pending.source === 'photo' || rows.length > 1 ? L.photoFooter : L.confirmQ);
    return lines.join('\n');
  }

  // Rich card: plain text (CLI, tests, other channels) + HTML for Telegram + tap buttons.
  function cardReply(data, L, lead = '') {
    const text = (lead ? lead + '\n\n' : '') + renderCard(data, L);
    if (!data.pending) return text;
    const problems = data.pending.rows.some(rowProblems);
    const html = text
      .split('\n')
      .map((line) => {
        const e = esc(line);
        if (/^\d+\. /.test(line)) {
          const [head, ...rest] = e.split(' · ');
          const tail = rest.join(' · ').replace(/([^·]*= ₹[\d,.]+(?: → ₹[\d,.]+)?)/, '<code>$1</code>');
          return `<b>${head}</b>${rest.length ? ' · ' + tail : ''}`;
        }
        if (/^\s+⚠️/.test(line)) return `   <i>${e.trim()}</i>`;
        if (line.startsWith('📅') || line.startsWith(L.total + ':')) return `<b>${e}</b>`;
        if (line === L.confirmQ || line === L.photoFooter) return `<i>${e}</i>`;
        return e;
      })
      .join('\n');
    const buttons = problems ? [[{ label: L.btnNo, data: 'nahi' }]] : [[{ label: L.btnYes, data: 'haan' }, { label: L.btnNo, data: 'nahi' }]];
    return { text, html, buttons };
  }

  // --- confirm / undo / delete -----------------------------------------------
  function confirm(data, L) {
    const p = data.pending;
    if (p.kind === 'delete') {
      const lang = data.profile.language;
      Object.assign(data, store.defaults());
      data.profile.language = lang;
      return { replies: [L.deleted], wiped: true };
    }
    if (p.kind === 'undo') {
      const { ts } = store.nowIST();
      const batch = store.newId('b');
      for (const id of p.entryIds) {
        const e = data.entries.find((x) => x.id === id);
        if (e) data.entries.push({ ...ledger.reversalOf(e, store.newId('e'), ts), batch });
      }
      data.pending = null;
      const balances = balanceLines(data, p.customerIds, L);
      return { replies: [[L.undone, ...balances, L.fixHint].join('\n')] };
    }
    if (p.rows.some(rowProblems)) return { replies: [cardReply(data, L, L.needFix)] };

    const { ts } = store.nowIST();
    const batch = store.newId('b');
    const touched = new Set();
    const saved = [];
    for (const r of p.rows) {
      let customerId = r.customerId;
      if (r.type !== 'expense') {
        if (!customerId) {
          // naya customer: created only now, on the trader's "haan"
          customerId = (store.findCustomerByText(data, r.customerText) || store.addCustomer(data, r.customerText)).id;
        }
        if (r.aliasFrom) store.addAlias(data, customerId, r.aliasFrom);
        const c = store.getCustomer(data, customerId);
        if (r.customerText && r.customerText.toLowerCase() !== c.name.toLowerCase()) store.addAlias(data, customerId, r.customerText);
        touched.add(customerId);
      }
      const entry = {
        id: store.newId('e'),
        ts,
        date: r.date,
        type: r.type,
        customerId: r.type === 'expense' ? null : customerId,
        amountPaise: r.amountPaise,
        paid: r.type === 'sale' ? !!r.paid : null,
        item: r.item,
        qty: r.qty,
        unit: r.unit,
        ratePaise: r.ratePaise,
        parts: r.parts || null,
        qtyLabel: r.qtyLabel,
        note: r.note,
        supplier: r.supplier || null,
        raw: p.raw || null,
        source: p.source,
        reverses: null,
        batch,
      };
      const errors = ledger.validateEntry(entry);
      if (errors.length) return { replies: [cardReply(data, L, L.needFix)] };
      saved.push(entry);
    }
    data.entries.push(...saved);
    data.profile.suppliers = [...new Set([...(data.profile.suppliers || []), ...saved.map((e) => e.supplier).filter(Boolean)])];
    const replies = [];
    if (saved.length > 3) {
      const dates = [...new Set(saved.map((e) => e.date))].sort();
      const hs = hisaabReply(data, { from: dates[0], to: dates.at(-1) }, L);
      replies.push({ text: `${L.saved} (${saved.length})\n${hs.text}`, html: `${esc(L.saved)} (${saved.length})\n${hs.html}` });
    } else replies.push([L.saved, ...balanceLines(data, [...touched], L)].join('\n'));
    if (p.source === 'photo') {
      const firstPage = !data.profile.lastPage;
      data.profile.lastPage = cardText(data, L).slice(0, 1500);
      if (p.diaryProfile && !data.profile.diaryProfile) data.profile.diaryProfile = p.diaryProfile;
      if (firstPage) replies.push(L.remembered);
    }
    data.pending = null;
    return { replies };
  }

  function balanceLines(data, customerIds, L) {
    return customerIds.slice(0, 8).map((id) => L.balanceNow(store.getCustomer(data, id).name, fmt(ledger.customerBalance(data, id))));
  }

  // live = confirmed, not itself a reversal, not already reversed
  function liveEntries(data) {
    const reversed = new Set(data.entries.filter((e) => e.reverses).map((e) => e.reverses));
    return data.entries.filter((e) => !e.reverses && !reversed.has(e.id));
  }

  // /last: numbered list the trader can point at with "galti <n>"
  function lastList(data, L) {
    const items = liveEntries(data).slice(-10).reverse();
    if (!items.length) return { replies: [L.nothingToUndo] };
    data.lastList = items.map((e) => e.id);
    return { replies: [[L.lastTitle, ...items.map((e, i) => `${i + 1}. ${entryLine(data, e, L)}`), L.lastHint].join('\n')] };
  }

  function askUndo(data, L, n = null) {
    const live = liveEntries(data);
    let batch;
    if (n !== null) {
      const id = data.lastList?.[n - 1];
      const e = id && live.find((x) => x.id === id);
      if (!e) return lastList(data, L);
      batch = [e];
    } else {
      const last = live.at(-1);
      if (!last) return { replies: [L.nothingToUndo] };
      batch = live.filter((e) => e.batch === last.batch);
    }
    data.pending = {
      kind: 'undo',
      entryIds: batch.map((e) => e.id),
      customerIds: [...new Set(batch.map((e) => e.customerId).filter(Boolean))],
      createdAt: store.nowIST().ts,
    };
    const lines = batch.map((e, i) => `${i + 1}. ${entryLine(data, e, L)}`);
    return { replies: [yesNo([...lines, L.undoQ].join('\n'), L)] };
  }

  return { handleMessage, _internals: { renderCard, rowLine } };
}

// --- queries (templates; numbers from ledger.js) -------------------------------

function entryLine(data, e, L) {
  const c = e.customerId ? store.getCustomer(data, e.customerId)?.name : null;
  const bits = [e.date.slice(8, 10) + '/' + e.date.slice(5, 7)];
  if (c) bits.push(c);
  if (e.type === 'payment') bits.push(L.paymentWord);
  if (e.type === 'expense') bits.push(L.expenseWord + (e.item ? ` ${e.item}` : ''));
  if (e.qtyLabel) bits.push(e.qtyLabel);
  if (e.qty !== null && e.qty !== undefined && e.ratePaise) bits.push(`${fmtQty(e.qty, e.unit)} × ${fmt(e.ratePaise)}`);
  bits.push(fmt(e.amountPaise));
  if (e.type === 'sale') bits.push(e.paid ? L.nagad : L.udhaar);
  if (e.reverses) bits.push('↩︎ undo');
  return bits.join(' · ');
}

async function findCustomer(data, name) {
  if (!name) return null;
  const m = await matchCustomer(data, name);
  return m.customer;
}

async function khataReply(data, name, L) {
  const c = await findCustomer(data, name);
  if (!c) return [L.noCustomer(name)];
  const k = ledger.khata(data, c.id);
  const head = k.closing > 0 ? L.baaki(c.name, fmt(k.closing)) : L.noBaaki(c.name);
  const recent = k.rows.slice(-5).map((e) => '• ' + entryLine(data, e, L));
  return [[head, ...(recent.length ? [L.lastEntries, ...recent] : [])].join('\n')];
}

async function statementReply(data, { customer, from, to }, L) {
  const c = await findCustomer(data, customer);
  if (!c) return [L.noCustomer(customer)];
  const valid = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : undefined);
  const k = ledger.khata(data, c.id, { from: valid(from), to: valid(to) });
  const first = k.rows[0]?.date || store.nowIST().date;
  const last = k.rows.at(-1)?.date || first;
  const d = (x) => x.slice(8, 10) + '/' + x.slice(5, 7);
  const lines = [L.stmtTitle(c.name, `${d(valid(from) || first)} – ${d(valid(to) || last)}`)];
  if (k.opening) lines.push(`${L.opening}: ${fmt(k.opening)}`);
  for (const e of k.rows) lines.push(`${entryLine(data, e, L)}  ⇒ ${fmt(e.running)}`);
  lines.push(`${L.closing}: ${fmt(k.closing)}`);
  lines.push(`${L.thanks}${data.profile.shopName ? ' — ' + data.profile.shopName : ''}`);
  return [lines.join('\n')];
}

export function periodRange(period, today) {
  const d = new Date(today + 'T00:00:00Z');
  const iso = (x) => x.toISOString().slice(0, 10);
  const minus = (n) => iso(new Date(d.getTime() - n * 86400000));
  switch (period) {
    case 'yesterday': return { from: minus(1), to: minus(1), label: minus(1) };
    case 'week': return { from: minus((d.getUTCDay() + 6) % 7), to: today, label: `${minus((d.getUTCDay() + 6) % 7)} – ${today}` };
    case 'month': return { from: today.slice(0, 8) + '01', to: today, label: today.slice(0, 7) };
    case 'all': return { from: '0000-01-01', to: '9999-12-31', label: 'all' };
    default: return { from: today, to: today, label: today };
  }
}

function hisaabReply(data, { period, from, to }, L) {
  const today = store.nowIST().date;
  const valid = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  const r = valid(from) ? { from, to: valid(to) ? to : from, label: valid(to) && to !== from ? `${from} – ${to}` : from } : periodRange(period, today);
  const h = ledger.hisaab(data, r);
  const rows = []; // [label, amount] pairs, rendered as text and as an aligned table
  if (h.count) {
    rows.push([L.sales, fmt(h.sales)], [`  ${L.nagad}`, fmt(h.cashSales)], [`  ${L.udhaar}`, fmt(h.udhaarSales)], [L.payments, fmt(h.payments)]);
    if (h.expenses) rows.push([L.expenses, fmt(h.expenses)]);
    rows.push([L.cashInHand, fmt(h.cashInHand)]);
  }
  rows.push([L.totalDue, fmt(h.totalDue)]);
  const dues = h.topDues.map((d) => [`• ${store.getCustomer(data, d.customerId)?.name}`, fmt(d.paise)]);
  const title = L.hisaabTitle(r.label);
  const text = [title, ...(h.count ? [] : [L.noEntries]), ...rows.map(([a, b]) => `${a.trim()}: ${b}`), ...(dues.length ? [`${L.topDues}:`, ...dues.map(([a, b]) => `${a}: ${b}`)] : [])].join('\n');
  const w = Math.max(...rows.map(([a, b]) => a.length + b.length)) + 2;
  const table = rows.map(([a, b]) => a + ' '.repeat(Math.max(1, w - a.length - b.length)) + b).join('\n');
  const html = [
    `<b>📒 ${esc(title)}</b>`,
    ...(h.count ? [] : [`<i>${esc(L.noEntries)}</i>`]),
    `<pre>${esc(table)}</pre>`,
    ...(dues.length ? [`<b>${esc(L.topDues)}</b>`, ...dues.map(([a, b]) => `${esc(a)} — <b>${esc(b)}</b>`)] : []),
  ].join('\n');
  return { text, html };
}

function customersReply(data, L) {
  if (!data.customers.length) return L.noCustomers;
  const bal = ledger.allBalances(data);
  const rows = data.customers
    .map((c) => ({ c, b: bal.get(c.id) || 0 }))
    .sort((a, b) => b.b - a.b)
    .map(({ c, b }) => `• ${c.name}: ${fmt(b)}`);
  return [L.customersTitle, ...rows].join('\n');
}

// Common questions answered with zero model calls.
async function quickQuery(data, input, L) {
  const s = input.toLowerCase().replace(/[?？!.]+$/g, '').trim();
  let m;
  if ((m = s.match(/^(.+?)\s+(?:ka|ki|ke|का|की|के|चा|ची|ચા|નું|નો)\s+(baaki|baki|udhaar|khata|बाकी|खाता|બાકી|statement|bill|हिसाब)(?:\s+(?:kitna|kitni|hai|kya))*$/)) && (await findCustomer(data, m[1]))) {
    return /statement|bill|हिसाब/.test(m[2]) ? statementReply(data, { customer: m[1] }, L) : khataReply(data, m[1], L);
  }
  if (/^(aaj|today|आज|આજ)\S*\s*(ka|ki|cha|chi|no|nu|s)?\s*(hisaab|hisab|hishob|हिसाब|हिशोब|હિસાબ|summary|total)$/.test(s) || s === "today's summary")
    return [hisaabReply(data, { period: 'today' }, L)];
  if (/^(kal|yesterday|कल|काल)\S*\s*(ka|cha|chi)?\s*(hisaab|hisab|हिसाब|हिशोब|summary)$/.test(s)) return [hisaabReply(data, { period: 'yesterday' }, L)];
  if (/^(is|iss|this)\s*(hafte|week|हफ्ते)\S*\s*(ka)?\s*(hisaab|hisab|हिसाब|summary)?$/.test(s)) return [hisaabReply(data, { period: 'week' }, L)];
  if (/^(is|iss|this)\s*(mahine|month|महीने)\S*\s*(ka)?\s*(hisaab|hisab|हिसाब|summary)?$/.test(s)) return [hisaabReply(data, { period: 'month' }, L)];
  if (/^(kaun ?kaun|kis kis|who owes|सब का बाकी|kiska baaki)/.test(s)) return [hisaabReply(data, { period: 'today' }, L)];
  if (/^(customers|grahak|ग्राहक|list)$/.test(s)) return [customersReply(data, L)];
  return null;
}

function exportFiles(data, L) {
  const d = store.nowIST().date;
  return [
    { document: { filename: `munshi-khata-${d}.html`, data: Buffer.from(buildReport(data, L, d), 'utf8') }, caption: L.exportCaption },
    { document: { filename: `munshi-khata-${d}.csv`, data: Buffer.from(buildCsv(data, L), 'utf8') }, caption: 'Excel / Sheets' },
  ];
}

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function yesNo(text, L) {
  return { text, buttons: [[{ label: L.btnYes, data: 'haan' }, { label: L.btnNo, data: 'nahi' }]] };
}

function welcome(L) {
  return {
    text: L.welcome,
    buttons: [
      [{ label: 'Hinglish', data: '/bhasha hinglish' }, { label: 'हिंदी', data: '/bhasha hi' }, { label: 'मराठी', data: '/bhasha mr' }],
      [{ label: 'ગુજરાતી', data: '/bhasha gu' }, { label: 'English', data: '/bhasha en' }],
    ],
  };
}

function withPrefix(r, prefix) {
  if (typeof r === 'string') return prefix + r;
  return { ...r, text: prefix + r.text, ...(r.html ? { html: esc(prefix) + r.html } : {}) };
}

function remember(data, userText, botText) {
  data.history = [...(data.history || []), { role: 'user', text: userText.slice(0, 300) }, { role: 'assistant', text: botText.slice(0, 300) }].slice(-6);
}

// the customer the trader most likely means by "usne / uska / he"
function lastCustomerName(data) {
  const fromPending = data.pending?.rows?.findLast?.((r) => r.customerText)?.customerText;
  if (fromPending) return fromPending;
  const e = data.entries.findLast((x) => x.customerId && !x.reverses);
  return e ? store.getCustomer(data, e.customerId)?.name : null;
}

function supplierOf(data, name) {
  const n = store.normaliseName(name);
  return (data.profile.suppliers || []).find((s) => store.normaliseName(s) === n) || null;
}

function detectLang(text, current) {
  if (/[઀-૿]/.test(text)) return 'gu';
  if (/[ऀ-ॿ]/.test(text)) return current === 'mr' || current === 'hi' ? current : 'hi';
  return current;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const defaultHandler = createHandler({ transcribe: whisper });
export const handleMessage = defaultHandler.handleMessage;
