// Money helpers. Everything is integer paise. No floats leave this file.

export function toPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const n = typeof rupees === 'number' ? rupees : Number(String(rupees).replace(/[₹,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// qty * ratePaise, rounded to the nearest paisa. qty may be fractional (72.5 kg).
export function mulPaise(qty, ratePaise) {
  if (qty === null || qty === undefined || ratePaise === null || ratePaise === undefined) return null;
  return Math.round(Number(qty) * ratePaise);
}

// ₹1,23,456 or ₹1,23,456.50 — Indian grouping.
export function fmt(paise) {
  if (paise === null || paise === undefined) return '—';
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  let out;
  if (s.length <= 3) out = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = rest + ',' + last3;
  }
  if (p) out += '.' + String(p).padStart(2, '0');
  return (neg ? '-₹' : '₹') + out;
}

export function fmtQty(qty, unit) {
  if (qty === null || qty === undefined) return '';
  const q = Number.isInteger(qty) ? qty : Number(qty).toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${q} ${unit}` : String(q);
}
