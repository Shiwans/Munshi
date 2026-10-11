import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, addCustomer, addAlias } from '../src/core/store.js';
import { matchSync, matchCustomer, levenshtein } from '../src/core/match.js';

const data = defaults();
const sagar = addCustomer(data, 'Sagar Ratna');
addAlias(data, sagar.id, 'sagar hotel');
const gupta = addCustomer(data, 'Gupta Dairy');

test('levenshtein basics', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('gupta', 'gupta'), 0);
});

test('exact, alias, normalised, fuzzy, first-word', () => {
  assert.equal(matchSync(data, 'Sagar Ratna').customer.id, sagar.id);
  assert.equal(matchSync(data, 'sagar hotel').customer.id, sagar.id);
  assert.equal(matchSync(data, 'Guptaa Dairy').customer.id, gupta.id);
  assert.equal(matchSync(data, 'Gupta').customer.id, gupta.id);
  assert.equal(matchSync(data, 'Sagar').customer.id, sagar.id);
});

test('unknown name is new, never created', async () => {
  const r = await matchCustomer(data, 'Ramesh Bhaji', { useEmbeddings: false });
  assert.equal(r.isNew, true);
  assert.equal(r.customer, null);
  assert.equal(data.customers.length, 2);
});
