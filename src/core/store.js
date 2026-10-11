// One JSON file per trader in data/<traderId>.json. Atomic writes (tmp + rename). No database.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = process.env.MUNSHI_DATA_DIR || path.join(ROOT, 'data');
// Second copy: one snapshot per trader per day. Point MUNSHI_BACKUP_DIR at a synced folder or USB drive.
export const BACKUP_DIR = process.env.MUNSHI_BACKUP_DIR || path.join(DATA_DIR, '..', 'backups');

const safeId = (traderId) => String(traderId).replace(/[^a-zA-Z0-9_-]/g, '_');
export const fileFor = (traderId) => path.join(DATA_DIR, `${safeId(traderId)}.json`);

export function nowIST(d = new Date()) {
  // Asia/Kolkata is a fixed +05:30, no DST.
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const iso = ist.toISOString().slice(0, 19);
  return { ts: `${iso}+05:30`, date: iso.slice(0, 10) };
}

export function newId(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

export function defaults() {
  return {
    profile: { shopName: '', language: 'hinglish', diaryProfile: '', lastPage: null, createdAt: nowIST().ts },
    customers: [],
    entries: [],
    pending: null,
  };
}

export function exists(traderId) {
  return fs.existsSync(fileFor(traderId));
}

export function load(traderId) {
  const f = fileFor(traderId);
  if (!fs.existsSync(f)) return defaults();
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const d = defaults();
  return { ...d, ...raw, profile: { ...d.profile, ...(raw.profile || {}) } };
}

export function save(traderId, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const f = fileFor(traderId);
  const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, f);
  backup(traderId, json);
}

function backup(traderId, json) {
  try {
    const dir = path.join(BACKUP_DIR, safeId(traderId));
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${nowIST().date}.json`);
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, f);
  } catch (err) {
    console.error('[backup]', err.message); // a failed backup never blocks the trader
  }
}

export function remove(traderId) {
  const f = fileFor(traderId);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// /delete means delete: the trader's backups go too.
export function removeBackups(traderId) {
  fs.rmSync(path.join(BACKUP_DIR, safeId(traderId)), { recursive: true, force: true });
}

// --- customers -------------------------------------------------------------

const NOISE = /\b(hotel|stores?|store|shop|wale|wala|waale|bhai|seth|ji|sahab|saheb|and|&|co|traders?|enterprises?)\b/g;

export function normaliseName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addCustomer(data, name) {
  const c = { id: newId('c'), name: String(name).trim(), aliases: [], createdAt: nowIST().ts };
  data.customers.push(c);
  return c;
}

export function addAlias(data, customerId, alias) {
  const c = data.customers.find((x) => x.id === customerId);
  if (!c) return null;
  const a = String(alias).trim().toLowerCase();
  if (a && a !== c.name.toLowerCase() && !c.aliases.includes(a)) c.aliases.push(a);
  return c;
}

export function getCustomer(data, id) {
  return data.customers.find((c) => c.id === id) || null;
}

// exact name → alias → normalised name/alias. Returns a customer or null.
export function findCustomerByText(data, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const exact = data.customers.find((c) => c.name.toLowerCase() === t);
  if (exact) return exact;
  const alias = data.customers.find((c) => c.aliases.includes(t));
  if (alias) return alias;
  const n = normaliseName(t);
  if (!n) return null;
  return (
    data.customers.find((c) => normaliseName(c.name) === n || c.aliases.some((a) => normaliseName(a) === n)) || null
  );
}
