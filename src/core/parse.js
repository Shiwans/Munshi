// Deterministic parser for the lines traders type most. If it matches, no model is called:
// zero hallucination, instant, same answer every time. Anything it can't read goes to the model.
// Output has the same shape as the model's record_entries rows (rupees as written; handler converts to paise).

const NAME = String.raw`(?<name>\p{L}[\p{L}\p{M}\s.'&-]{0,40}?)`;
const NUM = String.raw`\d+(?:\.\d+)?`;
const PACK = String.raw`jalli|jaali|jali|crate|crates|peti|box|bori|bag|bags|dabba|carat|karat|cret`;
const PAY_WORD = String.raw`udhaar|udhar|udhari|credit|baaki|baki|khata|nagad|nakad|cash|paid|upi|gpay|phonepe`;

const SALE = new RegExp(
  String.raw`^${NAME}\s+(?:(?<pk>${NUM})\s*(?<pku>${PACK})\s+)?(?<qty>${NUM})\s*(?<unit>kg|kgs|kilo|किलो)\.?\s*` +
    String.raw`(?:x|×|\*|@|at)?\s*(?:rate\s+)?(?<rate>${NUM})\s*(?:rs|₹|rupaye|rupees|rupiya)?\s*` +
    String.raw`(?:rate|ka\s+rate|bhav|bhaav|ke\s+bhav\s+se|ke\s+rate\s+se|se)?\s*(?<pay>${PAY_WORD})?\s*$`,
  'iu',
);

const PAYMENT = new RegExp(
  String.raw`^${NAME}\s+(?:ne|se)\s+₹?\s*(?<amt>\d[\d,]*(?:\.\d+)?)\s*(?:rs|₹|rupaye|rupees|rupiya|rupay)?\s*` +
    String.raw`(?:diye|diya|de\s+diye|de\s+diya|jama\s+kiye|jama\s+kiya|jama|bheje|bheja|mile|mila|aaye|aaya|paid)\s*$`,
  'iu',
);
const PAYMENT_EN = new RegExp(String.raw`^${NAME}\s+(?:paid|gave|jama)\s+₹?\s*(?<amt>\d[\d,]*(?:\.\d+)?)\s*(?:rs|rupees)?\s*$`, 'iu');

// pronouns and time words need context ("usne 500 diye") → leave those to the model
const NOT_A_NAME = /^(usne|unhone|isne|inhone|maine|mai|main|hum|humne|aaj|kal|he|she|they|i|we|bhada|gaadi|kharcha|labour|hamali)$/i;

export function parseLine(text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s || s.length > 120 || s.includes('\n')) return null;
  let m;
  if ((m = s.match(SALE))) {
    const name = m.groups.name.trim();
    if (!okName(name)) return null;
    const pay = (m.groups.pay || '').toLowerCase();
    return [
      {
        type: 'sale',
        customer: name,
        ...(m.groups.pk ? { qtyLabel: `${m.groups.pk} ${m.groups.pku.toLowerCase()}` } : {}),
        qty: Number(m.groups.qty),
        unit: 'kg',
        rate: Number(m.groups.rate),
        paid: /nagad|nakad|cash|paid|upi|gpay|phonepe/.test(pay),
        confidence: 1,
      },
    ];
  }
  if ((m = s.match(PAYMENT) || s.match(PAYMENT_EN))) {
    const name = m.groups.name.trim();
    if (!okName(name)) return null;
    return [{ type: 'payment', customer: name, amount: Number(m.groups.amt.replace(/,/g, '')), confidence: 1 }];
  }
  return null;
}

function okName(name) {
  const words = name.split(' ');
  return words.length <= 4 && !NOT_A_NAME.test(words[0]) && !/\d/.test(name);
}
