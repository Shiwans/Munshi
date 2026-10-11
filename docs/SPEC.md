# Munshi — approved spec (Hack Day, 11 Oct 2026)

## Context

Hacktoberfest Hack Day Mumbai x FAIR, 11 Oct 2026. Hacking ends 15:30, demos 15:30–16:00, submissions close 17:00.
Two prize tracks, both targeted:
- **Best Use of Gemma 4** — must call a Gemma 4 model *through the Gemini API* (`gemma-4-26b-a4b-it`), model named in README, integration visible in code.
- **Best Open-Source AI Project** — open-weight AI central, public GitHub repo, OSS license, optional agent skill per agentskills.io spec.

Problem: Dadar sabzi/tomato traders already keep their day's book by typing notes to themselves on WhatsApp and by hand in a paper diary. Munshi lives in that same chat: text, voice note, or a photo of the diary page becomes a structured khata (customers, udhaar, payments, daily hisaab), and the trader can ask questions in Hinglish.

Decisions already made with the user:
- Business-only persona (trader). No personal-expense mode.
- Name: **Munshi**. New public repo `github.com/Shiwans/munshi`, MIT. BillSaaS stays private.
- **Channel: Telegram, final for today.** Zero cost, one-minute bot token, photos and voice notes supported natively, no webhook/tunnel. WhatsApp is the product direction (README "next step"); the core is channel-agnostic so a WhatsApp adapter is one file later. A WhatsApp linked-device (Baileys) attempt happens only if text + photo + voice are all done early, in a strict 30-minute window, and is demoed only if it works. Both channels are free; Telegram is chosen for time certainty.
- Voice: open-source Whisper locally via `mlx-whisper` (user's "Wispr Flow" is a dictation app, not an API). Gemma 4 on the Gemini API has no audio input.
- Gemini API key: user creates it now at aistudio.google.com/apikey → `.env`. Never in chat.
- Real handwritten diary photo will come from the user's family business; different handwriting is handled by a per-trader "diary profile" + confirm/correct loop, not by expecting perfect OCR.

Machine facts: M1 Pro 32 GB, Node 20.20, uv + Python 3.12, ffmpeg present. LM Studio on :1234 serving `qwen/qwen3.6-35b-a3b` (VLM, tool_use) and `text-embedding-nomic-embed-text-v1.5`. Qwen thinking must be disabled by prefilling an assistant turn `<think>\n\n</think>\n\n` (tested). `gh` token expired → create repo in browser, push via `git@github-personal:Shiwans/munshi.git`.

## Location
Project folder: **`/Users/shiwans/Downloads/munshi`** (new, created at the start of execution; session moves there via `change_directory`). Remote: `git@github-personal:Shiwans/munshi.git` (public, MIT).

## Stack and why (incl. "why not Rust")
- **Node 20, plain JavaScript (ESM)** for the bot and core. Latency is model inference (2–6 s per reply); runtime overhead is ~5 ms in Node vs ~1 ms in Rust, invisible to the user. Rust would cost compile cycles, has no official Google GenAI SDK and no mature WhatsApp linked-device library (Baileys is JS-only). Judges score problem, demo and AI role, not language. Speed levers that actually matter: `thinkingLevel: minimal` on Gemma, downscale images to ≤1280 px before upload, keep prompts short, send the confirmation card as soon as the tool call returns.
- **Gemma 4** `gemma-4-26b-a4b-it` via `@google/genai` (Gemini API) — reads text, diary photos; function calling; structured JSON.
- **Qwen3.6-35B-A3B** via LM Studio OpenAI-compatible API — local/offline provider, same tool interface, think-prefill.
- **Whisper large-v3-turbo** (open weights, MIT) via `uvx mlx-whisper` — voice notes; ffmpeg converts ogg/opus → wav 16 kHz mono.
- **nomic-embed-text-v1.5** via LM Studio `/v1/embeddings` — customer-name alias matching.
- **grammy** (Telegram, long polling) and **@whiskeysockets/baileys** + `qrcode-terminal` (WhatsApp linked device).
- **Storage**: one JSON file per trader in `data/` (atomic write). No DB to set up or explain.
- **Tests**: `node:test`. **No paid service anywhere.**

## End result
Trader (in the Munshi Telegram bot chat today; the same flow on WhatsApp later):
1. Types `Sagar hotel 3 jalli 72kg 28 rate udhaar` → card: `1. Sagar Ratna · 3 jalli · 72 kg × ₹28 = ₹2,016 · udhaar` + `haan likhu? (haan / sudharo)` → `haan` → `✅ likh diya. Sagar Ratna ka baaki ab ₹5,216.`
2. Sends a photo of today's diary page → numbered rows with per-row totals and day total → trader fixes one row in words → Munshi re-issues the card, saves, and remembers the alias.
3. Sends a voice note `Sagar ne 1500 diye` → payment card → `haan` → saved.
4. Asks `Sagar ka baaki?` / `aaj ka hisaab` / `kaun kaun baaki hai` → Hinglish answer with numbers (bought, sold, cash vs udhaar, top dues).
Judges: public MIT repo, README with the four model names and the Gemini API call highlighted, 2-minute live demo on the phone, a visible switch to local-only Qwen on the laptop, `skills/munshi-ledger/SKILL.md`.

## Data model (business-agnostic, entry-level, trustworthy)
Principle: **the LLM extracts, code does the math.** All money is integer paise. Balances, totals and hisaab come from `ledger.js` (pure functions, unit-tested), never from model output.

Per trader file `data/<traderId>.json`:
```json
{
  "profile":   { "shopName": "", "language": "hinglish", "diaryProfile": "", "createdAt": "" },
  "customers": [ { "id": "c1", "name": "Sagar Ratna", "aliases": ["sagar", "sagar hotel"] } ],
  "entries":   [ { "id": "e1", "ts": "2026-10-11T09:12:00+05:30", "date": "2026-10-11",
                   "type": "sale", "customerId": "c1", "amountPaise": 201600, "paid": false,
                   "item": "tomato", "qty": 72, "unit": "kg", "ratePaise": 2800, "qtyLabel": "3 jalli",
                   "note": "", "raw": "Sagar hotel 3 jalli 72kg 28 rate udhaar", "source": "text",
                   "reverses": null } ],
  "pending":   null
}
```
- **Entry types** (only three): `sale` (`paid: true` = cash, `false` = udhaar → increases customer balance), `payment` (received from customer → decreases balance), `expense` (trader's own cost, no customer). `purchase` is just an expense with an item. Any trade fits: kirana, cloth, tomatoes.
- **Required**: `type`, `amountPaise`, `date`. Everything else optional. Unknown trade details go to `item`/`note`, never into made-up numeric fields.
- **Amount rules**: if the trader gives qty × rate, code computes the amount and the card shows the working (`72 kg × ₹28 = ₹2,016`). If the trader also states a total that differs, the card asks which one (`72×28 = 2,016, aapne 2,000 bola — kaunsa likhu?`) and nothing is saved until answered. Stated amount alone → stored as is.
- **Immutability**: confirmed entries are never edited or deleted. "galti ho gayi" → a reversing entry (`reverses: "e1"`, negative effect) plus the corrected entry. The khata shows both. Pending (unconfirmed) cards can be changed freely.
- **Derived, never stored**: customer balance = Σ udhaar sales − Σ payments (+ reversals); day hisaab = cash sales, udhaar sales, payments received, expenses, net cash, top dues. Dates in IST.
- **Customers**: created only on confirmation; names resolved through aliases → fuzzy → embeddings; a new name in a card is marked `(naya customer)` so the trader notices before confirming.

## Role of the local model (Qwen) — decided
Gemma 4 is itself open-weight, Whisper and nomic are open-weight, so the OSS track does not depend on Qwen. Qwen3.6-35B-A3B is the **fallback provider** behind the same `provider.js` interface: used automatically when the Gemini call fails or throttles, and shown for ~20 s in the demo (`MUNSHI_PROVIDER=local`) to prove the model is swappable. Built in the last slot, first thing cut. Embeddings (nomic, fast) are always on.

## Architecture (small, testable units)

```
munshi/
  src/
    core/
      ledger.js        # pure: add entries, khata per customer, day hisaab, running balance  (unit-tested)
      store.js         # JSON file per trader: data/<traderId>.json (profile, customers, entries, pending)
      match.js         # customer-name matching: exact/alias → fuzzy → nomic embeddings via LM Studio
      prompts.js       # system prompt, extraction schema, diary-profile prompt, Hinglish reply style
    ai/
      provider.js      # pick provider: gemma (default) | local ; same interface: chat({messages, tools, images})
      gemma.js         # @google/genai, model gemma-4-26b-a4b-it, inlineData images, function calling, thinkingLevel minimal
      local.js         # LM Studio OpenAI-compatible, qwen3.6-35b-a3b, image_url base64, tools, think-prefill
      whisper.js       # spawn `uvx mlx-whisper` (model mlx-community/whisper-large-v3-turbo, language auto) on ogg→wav via ffmpeg
    bot/
      handler.js       # ONE function handleMessage({traderId, text?, imageBuf?, audioBuf?}) → reply text(s). Channel-agnostic.
      telegram.js      # grammy long-polling adapter → handler
      whatsapp.js      # Baileys adapter (QR pair, listens to messages incl. fromMe self-chat) → handler
    cli.js             # `node src/cli.js record|khata|hisaab` for the agent skill + quick tests
  skills/munshi-ledger/SKILL.md (+ scripts/munshi.sh)   # Agent Skill Open Standard
  test/ledger.test.js  (node:test, zero extra deps)
  README.md  LICENSE(MIT)  .env.example  data/.gitkeep
```

Deps (minimal): `@google/genai`, `grammy`, `@whiskeysockets/baileys` + `qrcode-terminal` (added only in the WhatsApp slot), `dotenv`. Python: `uvx mlx-whisper` (no install step).

### Message flow (handler.js)
1. Load trader file (create on first message with a 2-line onboarding reply asking shop name + language).
2. If audio → whisper → text. If image → attach to model call.
3. One model call with **function calling**, tools:
   - `record_entries(entries[])` — entries: `{date, type: sale|payment|expense|purchase, customer?, qty?, unit?, rate?, amount, paid: bool, note}`
   - `get_khata(customer)` · `get_hisaab(date|range)` · `list_customers()` · `update_profile(diaryProfile?, language?)`
   - System prompt includes: trader profile, customer list with aliases, diary profile, today's date (IST), and one previously confirmed diary page (text form) as a few-shot example when available.
4. `record_entries` never writes directly: entries go to `pending`, bot replies a numbered card ("1. Sagar Ratna · 3 jalli · 72kg × ₹28 = ₹2016 · udhaar"). Trader replies `haan`/`ok`/`1` to save, or a correction line ("3 Sagar Ratna nahi, Sagar Hotel") → re-run with correction → new card. Corrections add aliases to the customer.
5. Queries answer from `ledger.js` results, phrased in Hinglish by the model (or a template if provider fails).
6. Provider fallback: if Gemma call throws (network/quota) → retry on `local` and prefix reply with "(offline munshi)". `MUNSHI_PROVIDER=local` forces local for the OSS-track demo moment.

### Diary-photo handling (the personalization story)
- First photo for a trader: model also returns `diary_profile` (column order, abbreviations, units, script) via `update_profile`; stored.
- Every later photo: profile + last confirmed page go in the prompt. Confirm/correct loop as above. Names matched through `match.js` so near-misses resolve to existing customers instead of creating new ones.

### Agent skill
`skills/munshi-ledger/SKILL.md` — frontmatter `name: munshi-ledger`, description with trigger keywords (khata, udhaar, hisaab, ledger, bill entry), `license: MIT`, `compatibility: Requires Node 20+`. Body: when to use, how to run `scripts/munshi.sh record "<hinglish line>"`, `khata <name>`, `hisaab today`. Validate with `uvx --from git+https://github.com/agentskills/agentskills#subdirectory=skills-ref skills-ref validate skills/munshi-ledger` if that works; otherwise manual check against the spec (name = folder name, lowercase-hyphen, description ≤1024).

## Product rules (customer satisfaction first)
1. **Nothing is written without a "haan".** Text → one card → confirm. Photo → every row listed with totals → confirm all, or correct rows by number. Voice → transcript shown ("Suna: …") + card → confirm. No silent writes, ever.
2. **Show the working.** Every card prints the arithmetic (`72 kg × ₹28 = ₹2,016`). Mismatch between stated total and computed total → ask, don't guess.
3. **Reply in the trader's language.** Detect from their messages; supported: Hinglish (default), Hindi (Devanagari), Marathi, Gujarati, English. `/bhasha marathi` (or `/language`) switches. Numbers always `₹` with Indian grouping (₹1,23,456). Short replies, no lectures, at most one emoji (✅ ⚠️).
4. **Never invent a customer silently.** New names are tagged `(naya customer)` in the card; aliases learnt from corrections; `"Sagar aur Sagar Ratna same hai"` merges.
5. **Fast acknowledgement.** On photo/voice, send `dekh raha hu… 👀` / `sun raha hu…` immediately, then the card. Typing indicator on.
6. **Mistakes are cheap.** Pending cards: edit freely. After confirm: `galti` / `undo` → reversing entry, both lines visible in khata. Nothing is ever deleted.
7. **Errors in plain words.** Model down → `Thoda rukiye, dobara bhejiye` and automatic retry on the local model. Unreadable photo → ask for a closer/brighter photo of the specific rows.
8. **Their data is theirs.** `/export` sends CSV; `/delete` wipes the trader's file after a yes/no; data lives on the laptop, not a SaaS.

## Trader-facing options (MVP vs later)
MVP (built today, in order):
- **Add entries**: text line, voice note, diary-page photo (also works for a single chit/bill photo or a screenshot of a WhatsApp note).
- **Confirm / correct**: `haan`, `nahi`, `2 Gupta Dairy`, `3 rate 30`, `sab udhaar`, `galti`/`undo`.
- **Ask**: `<name> ka baaki`, `aaj ka hisaab`, `kal`, `is hafte`, `is mahine`, `kaun kaun baaki hai`, `customers`, `last 5`.
- **Customer statement**: `Sagar ka statement` → copy-ready Hinglish text (period, total, paid, baaki) the trader forwards to the customer. (Template, no model needed; big trust win.)
- **Settings**: `/start` onboarding (shop name, language, what you sell — optional), `/bhasha`, `/help` in their language, `/export`, `/delete`.
Later (README roadmap, not today): WhatsApp adapter, reminders for overdue baaki, multi-user per shop, expense categories, PDF statement, item-wise rate history.

## Image verification flow (mandatory)
1. Photo arrives → immediate ack → image downscaled to ≤1280 px → Gemma 4 with the trader's diary profile + last confirmed page as example → returns rows `{line, customerText, qty?, unit?, rate?, amount?, paidHint, confidence}`.
2. Code computes amounts; rows with `confidence < 0.6` or missing amount are marked `⚠️ check`.
3. Card: numbered rows, matched customer names (`→ Sagar Ratna`), new names `(naya)`, per-row ₹, totals. Footer: `Sab sahi? haan / "<n> <sudhaar>" / "<n> hatao"`.
4. Trader replies; corrections re-render the card (no model call needed for simple edits; model call for free-text corrections). Only `haan` writes. Unconfirmed cards expire after 30 min with a reminder.
5. On first page: store `diaryProfile`; on every confirm: store the confirmed page as the next few-shot example.

## CLAUDE.md for the repo (written in slot 1)
```
# Munshi — Claude working rules
Purpose: Telegram bookkeeper for small Indian traders. Text / voice / diary-photo → khata. Gemma 4 (Gemini API) reads; code does the math.
Stack: Node 20 ESM, @google/genai (gemma-4-26b-a4b-it), grammy, mlx-whisper via uvx, LM Studio (qwen3.6-35b-a3b fallback, nomic-embed), JSON per trader in data/.
Hard rules:
- The LLM never computes money. Amounts in integer paise; ledger.js is the only source of totals/balances; keep it pure and tested (node --test).
- No write without explicit confirmation ("haan"). Confirmed entries are immutable; corrections = reversing entries.
- Reply in the trader's language (Hinglish default; hi/mr/gu/en). ₹ with Indian grouping. Short messages.
- Never create a customer silently; tag "(naya customer)".
- Provider interface: ai/provider.js → gemma.js | local.js; same shape {messages, tools, images}. Don't call SDKs from handler.js.
- Secrets only in .env (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN). Never log them. data/ and .env are gitignored.
Layout: src/core (ledger, store, match, prompts) · src/ai (provider, gemma, local, whisper) · src/bot (handler, telegram) · src/cli.js · skills/munshi-ledger · test/.
Run: npm run dev (bot) · npm test · node src/cli.js record "…" · MUNSHI_PROVIDER=local npm run dev.
Commit often with clear messages (hack-day judges read the log). README must name every model and the Gemini API.
Don't: add a DB, add a web UI, add WhatsApp before README is done, edit confirmed entries, let the model do arithmetic.
```

## Setup checklist (do before coding, ~15 min, in parallel)
Already on the laptop: Node 20.20, uv + Python 3.12, ffmpeg, LM Studio with qwen3.6-35b-a3b + nomic-embed loaded, personal GitHub SSH alias `github-personal`.
To do:
1. **Gemini API key** → aistudio.google.com/apikey (user). Goes in `.env`.
2. **Telegram bot** → BotFather `/newbot` → token (user). Goes in `.env`. Also `/setcommands` later for help/bhasha/export/delete.
3. **GitHub repo** `Shiwans/munshi`, public, empty (user creates in browser; `gh` token is expired).
4. **Whisper model** → `uvx mlx-whisper --model mlx-community/whisper-large-v3-turbo /dev/null` once to pull ~1.6 GB (background, slot 1). Fallback model if slow: `mlx-community/whisper-small-mlx`.
5. **npm packages** → `@google/genai grammy dotenv` (+ `@whiskeysockets/baileys qrcode-terminal` only in the optional WhatsApp window).
6. **Real diary photo** on the phone (user/family). Plus one chit photo if available.
7. Optional: DevRelay MCP (`curl -fsSL https://devrelay.com/install.sh | sh`) for submission at 15:15; otherwise submit in OrganizerHQ by hand.
8. Close memory-heavy apps (Codex, extra browsers) so the 35B stays resident.

## Build order and time boxes (start ≈12:25)

| Slot | Work | Done means |
|---|---|---|
| 12:25–12:45 | Repo, MIT, .env (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN), `npm i`, Telegram echo bot alive on phone. Kick off `uvx mlx-whisper --help` to warm the cache and pull the whisper model in background. Ask family for diary photo. | Phone message → echo reply |
| 12:45–13:15 | `ledger.js` + tests, `store.js`, `gemma.js`, `handler.js` text path with confirm loop, language detection + `/bhasha`, `get_khata`/`get_hisaab`, `/start` onboarding. | "Sagar hotel 3 jalli 72kg 28 rate udhaar" → card → haan → "Sagar ka baaki?" answers, in the trader's language |
| 13:15–13:45 | Photo path: downscale, diary profile, numbered verification card, row corrections, `⚠️ check` rows. Test on the real diary photo; tune prompt. (Eat during runs.) | Real page → numbered rows → corrections stick → only `haan` writes |
| 13:45–14:05 | Voice (below) **plus** customer statement template, `galti`/`undo` reversal, `/export`, `/help`. | Statement text forwardable; undo visible in khata |
| 13:45–14:05 | `whisper.js` voice notes (Telegram ogg → wav via ffmpeg → mlx-whisper) → same handler. | Hinglish voice note → card |
| 14:05–14:25 | `match.js` embeddings (always on) + `local.js` Qwen fallback provider with think-prefill; `MUNSHI_PROVIDER=local` run-through. | Alias matching demo; same text flow works on Qwen |
| 14:25–14:55 | **Optional WhatsApp window (only if everything above is green; hard stop 14:55)**: Baileys adapter, QR pair on a spare number, text/image/audio incl. self-chat. Otherwise use this time for polish and README. | Message in own WhatsApp chat → Munshi reply, or skipped. |
| 14:55–15:15 | README (problem, 2-min demo gif/screens, architecture, **gemma-4-26b-a4b-it via Gemini API**, **Qwen3.6-35B-A3B local**, **Whisper large-v3-turbo**, **nomic-embed**, MIT), `.env.example`, SKILL.md, push. Commits throughout the day, not one blob. | Public repo passes the judge checklist |
| 15:15–15:30 | Rehearse the 2-minute demo twice; submit via DevRelay/OrganizerHQ to BOTH challenges. | Submitted before 15:30 |

Cut order if late: local Qwen provider → embeddings (fall back to fuzzy match) → voice → WhatsApp (never cut: text+photo on Gemma, confirm loop with exact math, README, license).

## Demo script (2 minutes)
1. Trader opens the Munshi Telegram chat on the phone → sends a Hinglish line → Munshi's confirm card → `haan` → saved. (Say out loud: "same bot, WhatsApp adapter is one file; Telegram today for a reliable demo.")
2. Sends the diary page photo → numbered rows → corrects one name → saved; "it learnt the alias."
3. Voice note "Sagar ne 1500 diye" → payment recorded.
4. "Sagar ka baaki?" and "aaj ka hisaab" → Hinglish answers with numbers.
5. Flip `MUNSHI_PROVIDER=local`, repeat step 1 on the laptop's Qwen → "same munshi, zero cloud, your khata never leaves your machine."
6. Show README model names + `skills/munshi-ledger/SKILL.md`.

## Verification
- `node --test` for `ledger.js` (running balance, udhaar vs paid, day totals, payment allocation).
- Manual E2E on the phone for each slot's "done means" column, on both providers.
- `curl` smoke for LM Studio: `/v1/models` lists qwen + nomic before the local demo; keep the 35B loaded, do not load the 27B.
- Before pushing: `git ls-files | grep -E "\.env$|data/"` returns nothing but `.gitkeep`; README names every model and the Gemini API explicitly.

## Risks and mitigations
- Handwriting varies → diary profile + confirm/correct loop + alias learning; demo page is tested beforehand.
- Gemini free-tier quota/latency on venue Wi-Fi → `thinkingLevel: minimal`, small images (resize to ≤1280px via sharp? no: use ffmpeg `-vf scale`), local fallback.
- Baileys pairing/ban → spare number, hard 30-minute stop, Telegram always ready.
- Memory pressure (16% free) → close Codex/other apps before loading; never load both Qwens.
- Time → cut order above; README and license are non-negotiable because judges verify them.
