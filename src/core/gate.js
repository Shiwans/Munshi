// Relevance gate: decides, in code and before any model call, whether a message is about the khata.
// Permissive on purpose (a wrongly blocked entry is worse than a polite "only hisaab" reply).
// Off-topic text and prompt-injection attempts never reach the model; nothing can be saved without ✅ anyway.

const LEDGER_WORDS = new RegExp(
  [
    'baaki', 'baki', 'udhaar', 'udhar', 'udhari', 'nagad', 'nakad', 'cash', 'upi', 'paid', 'payment', 'jama', 'diye', 'diya', 'dena', 'lena',
    'mile', 'mila', 'bheje', 'kharcha', 'kharch', 'bhada', 'hamali', 'labour', 'kharid', 'becha', 'bech', 'liya', 'liye', 'diye',
    'rate', 'bhav', 'bhaav', 'kg', 'kilo', 'jalli', 'jaali', 'crate', 'peti', 'bori', 'dabba', 'maal', 'tamatar', 'tomato', 'sabzi',
    'hisaab', 'hisab', 'khata', 'statement', 'bill', 'customer', 'grahak', 'galti', 'undo', 'cancel', 'sahi', 'galat', 'naam',
    'aaj', 'kal', 'hafte', 'mahine', 'total', 'kul', 'kitna', 'kitne', 'kaun', 'kiska', 'usne', 'unhone', 'dukaan', 'dukan', 'shop',
    'sold', 'bought', 'owes', 'balance', 'credit', 'expense', 'summary', 'help', 'madad', 'hello', 'hi', 'namaste', 'ram ram', 'kya',
    'बाकी', 'उधार', 'नकद', 'जमा', 'दिए', 'खर्च', 'भाव', 'किलो', 'हिसाब', 'खाता', 'आज', 'कल', 'रोख', 'हिशोब', 'ઉધાર', 'રોકડ', 'હિસાબ', 'બાકી',
  ].join('|'),
  'i',
);

const INJECTION = /(ignore|forget|disregard)\s+(all\s+|your\s+|the\s+)?(previous|above|prior|earlier)?\s*(instructions|rules|prompt)|system prompt|you are now|act as|jailbreak|developer mode/i;

export function isRelevant(data, text, { hasMedia = false } = {}) {
  if (hasMedia) return true;
  const s = String(text || '').trim();
  if (!s) return false;
  if (INJECTION.test(s)) return false;
  if (data.pending) return true; // answering a card
  if (/\d|[०-९]|[૦-૯]/.test(s)) return true; // numbers are what a khata is made of
  if (LEDGER_WORDS.test(s)) return true;
  const low = s.toLowerCase();
  const names = [...data.customers.flatMap((c) => [c.name, ...c.aliases]), ...(data.profile.suppliers || [])];
  return names.some((n) => n && low.includes(String(n).toLowerCase().split(' ')[0]));
}
