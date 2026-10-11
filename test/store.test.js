import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MUNSHI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'munshi-'));
const store = await import('../src/core/store.js');

test('load returns defaults, save is atomic and round-trips', () => {
  const d = store.load('t1');
  assert.equal(d.profile.language, 'hinglish');
  assert.deepEqual(d.entries, []);
  d.profile.shopName = 'Dadar Tamatar';
  store.save('t1', d);
  assert.equal(store.load('t1').profile.shopName, 'Dadar Tamatar');
  const leftovers = fs.readdirSync(store.DATA_DIR).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('nowIST gives +05:30 timestamp and IST date', () => {
  const { ts, date } = store.nowIST(new Date('2026-10-10T20:00:00Z'));
  assert.equal(date, '2026-10-11');
  assert.equal(ts, '2026-10-11T01:30:00+05:30');
});

test('customers: add, alias, find by exact/alias/normalised', () => {
  const d = store.defaults();
  const c = store.addCustomer(d, 'Sagar Ratna');
  store.addAlias(d, c.id, 'Sagar');
  assert.equal(store.findCustomerByText(d, 'sagar ratna').id, c.id);
  assert.equal(store.findCustomerByText(d, 'SAGAR').id, c.id);
  assert.equal(store.findCustomerByText(d, 'Sagar hotel').id, c.id);
  assert.equal(store.findCustomerByText(d, 'Gupta'), null);
  assert.ok(store.newId('e').startsWith('e_'));
});

test('every save also writes a dated backup snapshot', () => {
  const d = store.load('bk'); d.profile.shopName = 'Backup Test'; store.save('bk', d);
  const f = path.join(store.BACKUP_DIR, 'bk', `${store.nowIST().date}.json`);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).profile.shopName, 'Backup Test');
});
