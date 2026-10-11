// Voice notes → text with open-weight Whisper large-v3-turbo via mlx-whisper (uvx, Apple Silicon). Local, no API.
// Telegram ogg/opus → ffmpeg 16 kHz mono wav → mlx_whisper → txt.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const WHISPER_MODEL = () => process.env.WHISPER_MODEL || 'mlx-community/whisper-large-v3-turbo';

// input: Buffer or file path → transcript string
export async function transcribe(input, { language = process.env.WHISPER_LANGUAGE } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munshi-voice-'));
  try {
    const src = typeof input === 'string' ? input : path.join(dir, 'in.ogg');
    if (typeof input !== 'string') fs.writeFileSync(src, input);
    const wav = path.join(dir, 'voice.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ar', '16000', '-ac', '1', wav]);
    const args = ['--python', '3.12', '--from', 'mlx-whisper', 'mlx_whisper', '--model', WHISPER_MODEL(), '--output-dir', dir, '--output-format', 'txt', '--verbose', 'False'];
    if (language) args.push('--language', language);
    // Hinglish / Indian names: nudge the decoder towards Roman-script trade words
    args.push('--initial-prompt', 'Sagar ne 1500 diye. Gupta 3 jalli 72 kilo 28 rate udhaar. Aaj ka hisaab.');
    args.push(wav);
    await run('uvx', args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
    return fs.readFileSync(path.join(dir, 'voice.txt'), 'utf8').trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
