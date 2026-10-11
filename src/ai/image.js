// Downscale photos to ≤1280 px with ffmpeg before sending to the model (faster, cheaper, same legibility).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Scanner apps (Adobe Scan, CamScanner) send PDFs that wrap one full-resolution JPEG per page.
export function pdfPages(buf) {
  const pages = [];
  let i = 0;
  for (;;) {
    const s = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i);
    if (s < 0) break;
    const end = buf.indexOf('endstream', s);
    const e = buf.lastIndexOf(Buffer.from([0xff, 0xd9]), end < 0 ? buf.length : end);
    if (e <= s) break;
    if (e - s > 20000) pages.push(buf.subarray(s, e + 2));
    i = e + 2;
  }
  return pages;
}

export const isPdf = (buf) => buf.subarray(0, 5).toString() === '%PDF-';

// input: file path or Buffer (jpg/png/heic/pdf) → { mimeType: 'image/jpeg', base64 } (first page of a PDF)
export async function loadImage(input) {
  const buf = typeof input === 'string' ? fs.readFileSync(input) : input;
  if (isPdf(buf)) {
    const pages = pdfPages(buf);
    if (!pages.length) throw new Error('pdf without embedded page images');
    input = pages[0];
  }
  return downscale(input);
}

async function downscale(input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munshi-img-'));
  const src = typeof input === 'string' ? input : path.join(dir, 'in.jpg');
  if (typeof input !== 'string') fs.writeFileSync(src, input);
  const out = path.join(dir, 'out.jpg');
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', "scale='min(1280,iw)':-2", '-q:v', '4', out]);
    return { mimeType: 'image/jpeg', base64: fs.readFileSync(out).toString('base64') };
  } catch {
    return { mimeType: 'image/jpeg', base64: fs.readFileSync(src).toString('base64') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
