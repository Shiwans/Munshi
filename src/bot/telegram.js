// Telegram adapter (grammy, long polling). Converts updates → handleMessage → replies. No logic lives here.

import 'dotenv/config';
import { Bot, InputFile } from 'grammy';
import { handleMessage } from './handler.js';
import { loadImage } from '../ai/image.js';
import { load } from '../core/store.js';
import { t } from '../core/prompts.js';
import { providerName } from '../ai/provider.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN missing in .env');
  process.exit(1);
}
const bot = new Bot(token);

// one message at a time per trader, so two quick messages never race on the same file
const queues = new Map();
function serial(id, fn) {
  const prev = queues.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(id, next.catch(() => {}));
  return next;
}

async function download(ctx) {
  const file = await ctx.getFile();
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`telegram file ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function send(ctx, replies) {
  for (const r of replies) {
    if (!r) continue;
    if (typeof r === 'string') await ctx.reply(r);
    else if (r.document) await ctx.replyWithDocument(new InputFile(r.document.data, r.document.filename), { caption: r.caption });
  }
}

function run(ctx, build) {
  const traderId = String(ctx.from.id);
  return serial(traderId, async () => {
    const started = Date.now();
    try {
      await ctx.replyWithChatAction('typing');
      const msg = await build(traderId);
      const replies = await handleMessage({ traderId, ...msg });
      await send(ctx, replies);
    } catch (err) {
      console.error('[telegram]', err.message);
      await ctx.reply(t(load(traderId).profile.language).tryAgain).catch(() => {});
    }
    console.log(`[${traderId}] ${ctx.message.text ? 'text' : ctx.message.photo ? 'photo' : 'voice'} ${Date.now() - started} ms`);
  });
}

bot.on('message:text', (ctx) => run(ctx, async () => ({ text: ctx.message.text })));

bot.on(['message:photo', 'message:document'], (ctx) => {
  const doc = ctx.message.document;
  if (doc && !/^image\/|^application\/pdf$/.test(doc.mime_type || '')) return;
  return run(ctx, async (traderId) => {
    await ctx.reply(t(load(traderId).profile.language).ackPhoto);
    return { text: ctx.message.caption || '', image: await loadImage(await download(ctx)) };
  });
});

bot.on(['message:voice', 'message:audio'], (ctx) =>
  run(ctx, async (traderId) => {
    await ctx.reply(t(load(traderId).profile.language).ackVoice);
    return { audio: await download(ctx) };
  }),
);

bot.catch((err) => console.error('[grammy]', err.message));

await bot.api.setMyCommands([
  { command: 'help', description: 'Kaise use kare' },
  { command: 'bhasha', description: 'Bhasha badlo: hinglish / hindi / marathi / gujarati / english' },
  { command: 'export', description: 'Pura khata CSV mein' },
  { command: 'delete', description: 'Mera data mita do' },
]).catch(() => {});

bot.start({
  drop_pending_updates: true,
  onStart: (me) => console.log(`Munshi on Telegram as @${me.username} · provider: ${providerName()}`),
});
