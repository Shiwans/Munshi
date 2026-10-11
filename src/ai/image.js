// Downscale photos to ≤1280 px with ffmpeg before sending to the model (faster, cheaper, same legibility).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// input: file path or Buffer → { mimeType: 'image/jpeg', base64 }
export async function loadImage(input) {
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
