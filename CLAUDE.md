# Munshi — working rules for Claude (and humans)

Purpose: a Telegram bookkeeper for small Indian traders. A text line, a voice note, or a photo
of the handwritten diary page becomes a khata (customers, udhaar, payments, daily hisaab).
**Gemma 4 (via the Gemini API) reads; code does the math.**

## Stack
- Node 20, ESM, plain JavaScript. No build step.
- `@google/genai` → `gemma-4-26b-a4b-it` through the Gemini API (text + images, function calling).
- `grammy` → Telegram long polling. No webhook, no tunnel.
- `mlx-whisper` via `uvx` → voice notes (open-weight Whisper large-v3-turbo). ffmpeg converts ogg → wav.
- LM Studio (`http://localhost:1234/v1`) → `qwen/qwen3.6-35b-a3b` as the fallback/local provider and
  `text-embedding-nomic-embed-text-v1.5` for customer-name matching.
- Storage: one JSON file per trader in `data/<traderId>.json`, atomic writes. No database.
- Tests: `node --test test/`.

## Hard rules
1. **The LLM never computes money.** Amounts are integer paise. `src/core/ledger.js` is the only source of
   totals, balances and hisaab. Keep it pure and tested.
2. **No write without an explicit "haan".** Model output goes to `pending`; only a confirmation saves it.
   Photos always produce a numbered verification card first.
3. **Confirmed entries are immutable.** Corrections = reversing entry (`reverses: <id>`) + new entry.
4. **Reply in the trader's language** (hinglish default; hi, mr, gu, en). `₹` with Indian grouping. Short
   replies, at most one emoji.
5. **Never create a customer silently.** New names are tagged `(naya customer)` on the card.
6. **Provider interface only.** `src/ai/provider.js` exposes `chat({system, messages, tools, images})`;
   `gemma.js` and `local.js` implement it. `handler.js` never imports an SDK.
7. **Secrets only in `.env`.** Never log them. `data/` and `.env` are gitignored.

## Layout
```
src/core   ledger.js (pure math) · store.js (JSON per trader) · match.js (aliases → fuzzy → embeddings) · prompts.js
src/ai     provider.js · gemma.js · local.js · whisper.js
src/bot    handler.js (channel-agnostic) · telegram.js (adapter)
src/cli.js        CLI used by the agent skill and for quick tests
skills/munshi-ledger   Agent Skill (agentskills.io spec)
test/      node:test
```

## Run
```
npm run dev                         # Telegram bot
npm test
node src/cli.js record "Sagar hotel 3 jalli 72kg 28 rate udhaar"
MUNSHI_PROVIDER=local npm run dev   # same bot on the laptop's Qwen
```

## Don't
- Add a DB, a web UI, or WhatsApp before the README is done.
- Edit or delete confirmed entries. Let the model do arithmetic. Guess when totals disagree — ask.
- Commit `.env` or anything under `data/`.

Commit small and often with clear messages; hack-day judges read the log.
