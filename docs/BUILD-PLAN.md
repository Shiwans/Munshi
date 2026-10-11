# Build plan — step by step for a fresh session

Read `CLAUDE.md` and `docs/SPEC.md` first. This file is the order of work, what "done" means for each step,
and the exact API details already verified on this machine so nothing has to be rediscovered.

## Status
- [x] Scaffold: `package.json`, `.gitignore`, `.env.example`, `.env` (empty keys), `CLAUDE.md`, `LICENSE` (MIT).
- [x] `src/core/money.js` — paise helpers, Indian ₹ formatting.
- [x] `src/core/ledger.js` — balances, khata, hisaab, resolveAmount (conflict detection), reversals, validation.
- [x] `test/ledger.test.js` — 7 tests, all pass (`npm test`).
- [ ] Everything below.

## Step 1 — store.js (10 min)
`src/core/store.js`: `load(traderId)` → object with defaults `{profile:{shopName:'',language:'hinglish',diaryProfile:'',lastPage:null,createdAt}, customers:[], entries:[], pending:null}`;
`save(traderId, data)` atomic (write `tmp` then rename); `newId(prefix)`; `nowIST()` returning `{ts, date}` in Asia/Kolkata.
Customers: `{id, name, aliases:[], createdAt}`. Add `addCustomer`, `addAlias`, `findCustomerByText` (exact / alias / normalised).

## Step 2 — match.js (10 min, embeddings can come later)
Order: exact name → alias → normalised (lowercase, strip "hotel", "stores", punctuation) → Levenshtein ≤ 2 →
embeddings via LM Studio `POST http://localhost:1234/v1/embeddings {"model":"text-embedding-nomic-embed-text-v1.5","input":[...]}`
cosine ≥ 0.85. Return `{customer, confidence, isNew}`. Never create a customer here.

## Step 3 — provider interface + gemma.js (20 min)
`src/ai/provider.js`: `chat({system, messages, tools, images})` → `{text, toolCalls:[{name,args}]}`; picks `gemma` or `local`
from `MUNSHI_PROVIDER`; on error from gemma, retries once on local and sets `fellBack: true`.

`src/ai/gemma.js` with `@google/genai` (v2.28 — field names verified in `node_modules/@google/genai/dist/genai.d.ts`):
```js
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const res = await ai.models.generateContent({
  model: process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it',
  contents: [{ role: 'user', parts: [
    ...images.map(({ mimeType, base64 }) => ({ inlineData: { mimeType, data: base64 } })),
    { text: userText },
  ]}],
  config: {
    systemInstruction: system,
    tools: [{ functionDeclarations: tools }],        // tools = [{name, description, parameters:{type:'object',...}}]
    thinkingConfig: { thinkingLevel: 'minimal' },     // enum ThinkingLevel; 'minimal' disables thinking → fast
    temperature: 0.1,
  },
});
const toolCalls = (res.functionCalls || []).map(fc => ({ name: fc.name, args: fc.args }));
const text = res.text;
```
If you need plain JSON instead of tools: `config.responseMimeType = 'application/json'` + `config.responseJsonSchema = {...}`.
Downscale photos before sending: `ffmpeg -i in.jpg -vf "scale='min(1280,iw)':-2" -q:v 4 out.jpg`.

## Step 4 — prompts.js + handler.js text path (30 min)
Tools (function declarations):
- `record_entries({ entries: [{ date, type: 'sale'|'payment'|'expense', customer?, qty?, unit?, qtyLabel?, rate?, amount?, paid?, item?, note?, confidence? }] })`
  — amounts/rates in RUPEES as numbers (model-facing); handler converts with `toPaise`.
- `get_khata({ customer, from?, to? })`, `get_hisaab({ from, to })`, `list_customers()`, `update_profile({ diaryProfile?, language?, shopName? })`, `statement({ customer, from?, to? })`.
System prompt (short): who the trader is (shopName, language), today's IST date, customer list with aliases (names only),
diaryProfile, last confirmed page text, the 3 entry types, "never compute totals, just extract what is written",
"paid=false when udhaar/baaki/credit, true when cash/nagad/paid", "reply language = trader's".

Handler flow (channel-agnostic, `handleMessage({traderId, text, image, audio}) → [replies]`):
1. `/start` `/help` `/bhasha` `/export` `/delete` handled without the model.
2. If `pending` exists and text is a confirmation (`haan|ha|ok|yes|theek|sahi|✅|1`) → validate, resolve customers (create new ones now, add aliases), save entries, clear pending, reply "✅ Likh diya" + new balance.
   If text is `nahi|cancel|hatao` → clear pending. If it matches `^(\d+)\s+(.+)` → row correction (handled by code when it's a name/rate/amount; else send to model with the pending card as context).
3. Otherwise call the provider. For `record_entries` → build pending card (numbers via `resolveAmount`; conflicts and new customers flagged) → reply card + "haan likhu?". For query tools → run `ledger.js` → render reply (template; optionally let the model phrase it).
4. `galti|undo` → reversal of the last confirmed batch.
Card format: `1. Sagar Ratna · 3 jalli · 72 kg × ₹28 = ₹2,016 · udhaar` / `(naya customer)` / `⚠️ check` / footer.

## Step 5 — telegram.js (10 min)
grammy long polling: `bot.on('message:text')`, `message:photo` (take largest size, `getFile`, download via `https://api.telegram.org/file/bot<token>/<path>`), `message:voice` (ogg). Send `ctx.replyWithChatAction('typing')`, immediate ack for photo/voice, then replies. `traderId = String(ctx.from.id)`.

## Step 6 — photo path (30 min)
Same tool call with the image attached and the diary prompt addendum (rows top-to-bottom, keep original spelling in `customer`, `confidence` 0–1, leave unknown numbers null). First page → `update_profile.diaryProfile`. On confirm, store the confirmed rows as `profile.lastPage` (text) for the next prompt. Test on the real diary photo in `tmp/` via `node src/cli.js photo tmp/diary.jpg` before touching the bot.

## Step 7 — voice (20 min)
`src/ai/whisper.js`: `ffmpeg -y -i in.ogg -ar 16000 -ac 1 out.wav` then
`uvx --python 3.12 --from mlx-whisper mlx_whisper --model $WHISPER_MODEL --output-dir <tmp> --output-format txt out.wav` → read `out.txt`.
(`--python 3.12` is mandatory on this Mac; 3.10 breaks scipy.)
Reply `Suna: "<transcript>"` then run the text path. Hinglish works with language auto-detect; pass `--language hi` if it drifts.

## Step 8 — local.js (15 min, fallback provider)
LM Studio OpenAI-compatible `POST http://localhost:1234/v1/chat/completions`, model `qwen/qwen3.6-35b-a3b`, `tools` in OpenAI format,
images as `{type:'image_url', image_url:{url:'data:image/jpeg;base64,...'}}`.
**Disable thinking by prefilling** an assistant message `{role:'assistant', content:'<think>\n\n</think>\n\n'}` as the last message
(verified: `/no_think` and `reasoning` params do NOT work; prefill does → ~1 s replies). Expect ~10 tok/s.

## Step 9 — statement, undo, export, help (20 min)
Statement template (Hinglish): period, opening, each row, closing, "Dhanyavaad". `/export` → CSV of entries sent as a document. `/help` per language.

## Step 10 — agent skill + README + push (20 min)
`skills/munshi-ledger/SKILL.md` frontmatter: `name: munshi-ledger`, `description:` (what + when: khata, udhaar, hisaab, ledger entry, Hinglish bookkeeping), `license: MIT`, `compatibility: Requires Node 20+ and a Munshi checkout`. Body: how to run `scripts/munshi.sh record "…"`, `khata <name>`, `hisaab today`. Folder name must equal `name`.
README must contain, verbatim and bold: **gemma-4-26b-a4b-it via the Gemini API**, **Qwen3.6-35B-A3B (local, LM Studio)**, **Whisper large-v3-turbo (mlx-whisper)**, **nomic-embed-text-v1.5**, MIT, architecture, 2-minute demo, roadmap (WhatsApp adapter next).

## Time boxes (if building on hack day)
12:45 text path · 13:15 photo · 13:45 voice + statement/undo · 14:05 match + local · 14:25 optional WhatsApp (Baileys, hard stop 14:55) · 14:55 README/skill/push · 15:15 rehearse + submit to BOTH challenges in OrganizerHQ/DevRelay.
Cut order: local provider → embeddings → voice → WhatsApp. Never cut: text + photo on Gemma, confirm loop, exact math, README, license.

## Demo script (2 min)
1. Phone: `Sagar hotel 3 jalli 72kg 28 rate udhaar` → card → `haan`.
2. Diary photo → numbered rows → correct one row → `haan` → "yaad rakh liya".
3. Voice `Sagar ne 1500 diye` → payment.
4. `Sagar ka baaki?`, `aaj ka hisaab`.
5. Laptop: `MUNSHI_PROVIDER=local npm run dev`, repeat 1 → "same munshi, zero cloud".
6. README model names + `skills/munshi-ledger/SKILL.md`.
