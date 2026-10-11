import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/core/parse.js';

test('common sale lines parse without a model', () => {
  assert.deepEqual(parseLine('Sagar hotel 3 jalli 72kg 28 rate udhaar'), [
    { type: 'sale', customer: 'Sagar hotel', qtyLabel: '3 jalli', qty: 72, unit: 'kg', rate: 28, paid: false, confidence: 1 },
  ]);
  const g = parseLine('Gupta dairy 10 kg 40 rate nagad')[0];
  assert.deepEqual([g.customer, g.qty, g.rate, g.paid], ['Gupta dairy', 10, 40, true]);
  assert.equal(parseLine('Raju 5 crate 120kg 30 rate udhaar')[0].qtyLabel, '5 crate');
  assert.equal(parseLine('Sagar 56.5 kg x 50')[0].qty, 56.5);
  assert.equal(parseLine('सागर 72 किलो 28 उधार'), null); // Devanagari pay words → model (fine)
});

test('payments parse; pronouns and messy lines go to the model', () => {
  assert.deepEqual(parseLine('Sagar ne 1500 diye'), [{ type: 'payment', customer: 'Sagar', amount: 1500, confidence: 1 }]);
  assert.equal(parseLine('Sagar hotel ne ₹1,500 rupaye jama kiye')[0].amount, 1500);
  assert.equal(parseLine('Sagar paid 1500')[0].customer, 'Sagar');
  assert.equal(parseLine('usne 1500 diye'), null);
  assert.equal(parseLine('Usne 70 kg liya 30 rs se udhar aur fir 500 diya'), null);
  assert.equal(parseLine('aaj ka hisaab'), null);
  assert.equal(parseLine('gaadi bhada 300 diya aur Raju ko 2 crate 40kg 30 rate nagad'), null);
});
