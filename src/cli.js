#!/usr/bin/env node
// CLI for the agent skill and quick tests. Same handler as the bot, trader id from MUNSHI_TRADER (default "cli").
//   node src/cli.js record "Sagar hotel 3 jalli 72kg 28 rate udhaar"   → card (nothing saved)
//   node src/cli.js confirm                                             → "haan"
//   node src/cli.js say "<anything>"                                    → any message, e.g. "2 rate 30", "nahi"
//   node src/cli.js photo tmp/diary.jpg                                 → card from a diary photo
//   node src/cli.js khata "Sagar"  |  hisaab today|yesterday|week|month  |  customers  |  statement "Sagar"

import 'dotenv/config';
import fs from 'node:fs';
import { handleMessage } from './bot/handler.js';
import { loadImage } from './ai/image.js';

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(' ').trim();
const traderId = process.env.MUNSHI_TRADER || 'cli';

const textFor = {
  record: () => arg,
  say: () => arg,
  confirm: () => 'haan',
  cancel: () => 'nahi',
  undo: () => 'galti',
  khata: () => `${arg} ka baaki`,
  statement: () => `${arg} ka statement`,
  hisaab: () => ({ yesterday: 'kal ka hisaab', week: 'is hafte ka hisaab', month: 'is mahine ka hisaab' })[arg] || 'aaj ka hisaab',
  customers: () => 'customers',
  help: () => '/help',
};

async function main() {
  let replies;
  if (cmd === 'photo') {
    if (!arg || !fs.existsSync(arg)) throw new Error(`photo not found: ${arg}`);
    replies = await handleMessage({ traderId, text: rest.slice(1).join(' '), image: await loadImage(rest[0]) });
  } else if (cmd === 'voice') {
    replies = await handleMessage({ traderId, audio: fs.readFileSync(arg) });
  } else if (textFor[cmd]) {
    replies = await handleMessage({ traderId, text: textFor[cmd]() });
  } else {
    console.log('usage: munshi record "<line>" | confirm | cancel | undo | say "<msg>" | photo <file> | voice <file.ogg> | khata <name> | statement <name> | hisaab [today|yesterday|week|month] | customers');
    process.exit(cmd ? 1 : 0);
  }
  for (const r of replies) {
    if (typeof r === 'string') console.log(r);
    else if (r.document) console.log(`[${r.document.filename}] ${r.caption}\n${r.document.data.toString('utf8')}`);
    else console.log(r.text + (r.buttons ? '\n' + r.buttons.flat().map((b) => `[${b.label}]`).join(' ') : ''));
    console.log('');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
