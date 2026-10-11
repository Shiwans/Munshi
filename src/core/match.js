// Customer-name matching: exact → alias → normalised → Levenshtein ≤ 2 → nomic embeddings (LM Studio).
// Returns { customer, confidence, isNew, via }. Never creates a customer.

import { findCustomerByText, normaliseName } from './store.js';

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function namesOf(c) {
  return [c.name, ...c.aliases];
}

export function matchSync(data, text) {
  const t = String(text || '').trim();
  if (!t) return { customer: null, confidence: 0, isNew: false, via: 'empty' };
  const direct = findCustomerByText(data, t);
  if (direct) return { customer: direct, confidence: 1, isNew: false, via: 'name' };

  const n = normaliseName(t);
  let best = null;
  for (const c of data.customers) {
    for (const name of namesOf(c)) {
      const m = normaliseName(name);
      if (!m || !n) continue;
      // short names (≤4 chars) only tolerate 1 edit, otherwise "Raju" ≈ "Ravi"
      const limit = Math.min(n.length, m.length) <= 4 ? 1 : 2;
      const d = levenshtein(n, m);
      if (d <= limit && (!best || d < best.d)) best = { c, d };
      // first-word match: "sagar" vs "sagar ratna"
      if (!best && n.split(' ')[0] === m.split(' ')[0] && n.split(' ')[0].length >= 4 && (n.split(' ').length === 1 || m.split(' ').length === 1)) {
        best = { c, d: 2 };
      }
    }
  }
  if (best) return { customer: best.c, confidence: best.d === 0 ? 0.95 : 0.85 - best.d * 0.05, isNew: false, via: 'fuzzy' };
  return { customer: null, confidence: 0, isNew: true, via: 'none' };
}

// --- embeddings (optional; silently skipped when LM Studio is down) ----------

const embedCache = new Map();

async function embed(texts) {
  const url = (process.env.LMSTUDIO_URL || 'http://localhost:1234/v1') + '/embeddings';
  const model = process.env.EMBED_MODEL || 'text-embedding-nomic-embed-text-v1.5';
  const missing = texts.filter((t) => !embedCache.has(t));
  if (missing.length) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: missing }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}`);
    const j = await res.json();
    j.data.forEach((d, i) => embedCache.set(missing[i], d.embedding));
  }
  return texts.map((t) => embedCache.get(t));
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function matchCustomer(data, text, { useEmbeddings = process.env.MUNSHI_EMBED !== 'off' } = {}) {
  const r = matchSync(data, text);
  if (!r.isNew || !useEmbeddings || !data.customers.length) return r;
  try {
    const candidates = data.customers.flatMap((c) => namesOf(c).map((name) => ({ c, name })));
    const [q, ...vecs] = await embed([`search_query: ${text}`, ...candidates.map((x) => `search_document: ${x.name}`)]);
    let best = null;
    vecs.forEach((v, i) => {
      const s = cosine(q, v);
      if (!best || s > best.s) best = { s, c: candidates[i].c };
    });
    if (best && best.s >= 0.85) return { customer: best.c, confidence: best.s, isNew: false, via: 'embedding' };
  } catch {
    // LM Studio not running → fuzzy result stands
  }
  return r;
}
