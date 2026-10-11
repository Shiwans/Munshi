# Munshi · मुंशी

**A bookkeeper in your chat.** Small Indian traders already write the day's business by hand in a diary or as
messages to themselves. Munshi lives in that chat: a Hinglish line, a voice note, or a photo of the diary page becomes a
proper khata (customers, udhaar, payments, daily hisaab). The trader checks every entry before anything is saved.

> **Gemma reads. Code counts. The trader confirms.**

Built at Hacktoberfest Hack Day Mumbai, 11 Oct 2026. MIT licensed.

## Models (all open weights)

| Model | Where it runs | Job |
|---|---|---|
| **gemma-4-26b-a4b-it via the Gemini API** | Google, through `@google/genai` | Reads Hinglish text and handwritten diary photos; function calling |
| **Qwen3.6-35B-A3B (local, LM Studio)** | the laptop | Same job, fully offline; automatic fallback when the cloud call fails |
| **Whisper large-v3-turbo (mlx-whisper)** | the laptop | Voice notes → text |
| **nomic-embed-text-v1.5** | the laptop, LM Studio | Last step of customer-name matching |

The Gemma call is in [`src/ai/gemma.js`](src/ai/gemma.js):

```js
const res = await client().models.generateContent({
  model: 'gemma-4-26b-a4b-it',                 // Gemma 4 via the Gemini API
  contents,                                    // text + inlineData diary photo
  config: { systemInstruction: system, tools: [{ functionDeclarations: tools }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, temperature: 0.1 },
});
```

## What it does

```
You:    Sagar hotel 3 jalli 72kg 28 rate udhaar
Munshi: 1. Sagar hotel (naya customer) · 3 jalli · 72 kg × ₹28 = ₹2,016 · udhaar
        haan likhu?                                  [✅ Haan, likho] [❌ Nahi]
You:    ✅
Munshi: ✅ Likh diya. Sagar hotel ka baaki ab ₹2,016.
You:    🎤 "usne pandrah sau diye"
Munshi: Suna: "usne 1500 diye"
        1. Sagar hotel · payment mila · ₹1,500        [✅ Haan, likho] [❌ Nahi]
You:    Sagar ka baaki?          →  Sagar hotel ka baaki: ₹516
You:    aaj ka hisaab            →  bikri, nagad vs udhaar, payments, cash in hand, top dues
You:    📷 diary page            →  numbered card, one row per line, the diary's own sums re-checked
```

- **Text, voice note, or a photo / scanner PDF** of the diary page.
- **Confirm or correct**: tap ✅, or fix by row number: `4 3555`, `2 rate 30`, `13 hatao`, `1 Gupta Dairy`, `18 kharcha`, `sab udhaar`.
- **Ask**: `Sagar ka baaki`, `Sagar ka statement` (copy-ready for the customer), `aaj ka hisaab`, `kal`, `is hafte`, `customers`.
- **Mistakes**: `galti` cancels the last save; `/last` lists recent entries and `galti 3` cancels just that one (a reversing entry: both stay visible), then you type the correct line. `/naam Sagar = Sagar Ratna` renames a customer. Nothing is ever silently edited or deleted.
- **Commands**: `/hisaab [kal|hafta|mahina]`, `/baaki Sagar`, `/statement Sagar`, `/customers`, `/last`, `/undo`, `/naam`, `/export` (visual HTML khata + Excel CSV), `/delete` (soft: `/wapas` brings it back), `/bhasha`, `/help`.
- **Languages**: Hinglish (default), Hindi, Marathi, Gujarati, English.

### Tested on a real diary
Three scanned pages from a Dadar tomato trader (Devanagari names, rows written `qty⟩rate = total`, payments in a middle
column, supplier purchases on the right). Gemma reads each row; `ledger.js` recomputes it:

| Diary says | Code computes | Card |
|---|---|---|
| `80⟩45 = 3600` | 80 × ₹45 = ₹3,600 | ✓, existing customer matched |
| `95⟩50 + 5⟩30 = 4900` | ₹4,750 + ₹150 = ₹4,900 | ✓ multi-part row |
| `59⟩45 + 30⟩30 = 3555` (read as 51) | ₹3,195 | ⚠️ asks which is right: misread caught |
| `30½⟩55 = 1678` | ₹1,677.50 | ✓ rupee rounding accepted |
| `102⟩` | qty only | ⚠️ amount? (never guessed) |

On the second page every returning customer matched the first page's khata; suppliers taught once (`18 kharcha`) are
remembered.

**Measured** with [`eval/run.js`](eval/run.js) against a hand-checked answer key ([`eval/diary-key.json`](eval/diary-key.json);
the page images stay private):

```
TOTAL  55/57 customer rows exact (96%)
       7 misreads caught and flagged ⚠️ before saving
       0 rows wrong and NOT flagged  ← the only ones a trader could save by mistake
       0 rows missed
       74 s for 3 pages
```

## Why it is more than a model wrapper
1. **The model never computes money.** Amounts are integer paise. [`src/core/ledger.js`](src/core/ledger.js) is the only
   source of totals, balances and hisaab: pure functions, unit-tested. A free-text model answer containing digits is discarded.
2. **No write without "haan".** Model output becomes a `pending` card; customers are created only on confirm and new
   names are tagged `(naya customer)`.
3. **Immutable entries.** Corrections are reversing entries (`reverses: <id>`); both stay visible.
4. **Learns each trader.** Aliases from corrections, a supplier list, the diary layout, and the last confirmed page as a
   worked example for the next photo.
5. **Common lines and questions skip the model.** A code parser reads the lines traders type most (`Sagar hotel 3 jalli 72kg 28 rate udhaar`, `Sagar ne 1500 diye`); `haan`, row fixes, baaki, hisaab, statement and every slash command are answered by code in under a second. Gemma only sees what code can't read.
6. **Relevance gate before the model.** [`src/core/gate.js`](src/core/gate.js) lets only bookkeeping through (numbers, ledger words, known names, photos, voice, answers to a card). Off-topic text and "ignore your instructions" attempts get a polite template and never reach a model: no cost, no injection surface.
7. **Swappable reader.** `provider.js` exposes one `chat()`; Gemma and Qwen implement it. If Gemma fails, Qwen answers and
   the reply says `(offline munshi)`.

## Architecture

```
 phone (Telegram) ─► telegram.js ─► handler.js ──► provider.js ─► gemma.js ─► Gemini API (gemma-4-26b-a4b-it)
                        │              │  │                    └► local.js ─► LM Studio (Qwen3.6-35B-A3B)
              voice ─► whisper.js      │  └─► ledger.js (paise math) · match.js (alias → fuzzy → nomic embeddings)
                     (Whisper, local)  └─► store.js ─► data/<traderId>.json  (atomic write, gitignored)
```

```
src/core   ledger.js · money.js · parse.js · gate.js · report.js · store.js · match.js · prompts.js
src/ai     provider.js · gemma.js · local.js · whisper.js · image.js
src/bot    handler.js (channel-agnostic) · telegram.js (adapter)
src/cli.js            same handler from the terminal
skills/munshi-ledger  Agent Skill (agentskills.io spec)
eval/                 diary accuracy check (real pages vs answer key)
test/                 node:test — 35 tests
```

**Storage**: one JSON file per trader, `data/<telegram-user-id>.json`, with `profile`, `customers`, `entries`,
`pending`, `history`. Balances are never stored; they are summed from the entries on every question. Every save also
writes a dated snapshot to `backups/<trader>/<date>.json` (`MUNSHI_BACKUP_DIR` can point at a synced folder or USB
drive). `/delete` moves the khata to `trash/`; `/wapas` restores it. Each trader only ever sees their own file: every
model call is built from that trader's data alone.
Voice audio and the khata never leave the laptop; with `MUNSHI_PROVIDER=local`, message text and photos don't either.

## Run

```bash
npm install
cp .env.example .env        # GEMINI_API_KEY (aistudio.google.com/apikey), TELEGRAM_BOT_TOKEN (@BotFather)
npm test
npm run dev                 # Telegram bot, long polling: no webhook, no tunnel
```

Fully local: start LM Studio with `qwen/qwen3.6-35b-a3b` and `text-embedding-nomic-embed-text-v1.5`, then

```bash
MUNSHI_PROVIDER=local npm run dev
```

Voice needs `ffmpeg` and `uv` (Whisper runs via `uvx --python 3.12 --from mlx-whisper mlx_whisper`, Apple Silicon).

CLI, same brain:

```bash
node src/cli.js record "Sagar hotel 3 jalli 72kg 28 rate udhaar"
node src/cli.js confirm
node src/cli.js photo diary-page.pdf
node src/cli.js hisaab today
```

## Agent skill
[`skills/munshi-ledger/SKILL.md`](skills/munshi-ledger/SKILL.md) lets any skills-compatible agent keep a khata through
`scripts/munshi.sh` with the same confirm-first rules. Validated with `skills-ref validate`.

## 2-minute demo
1. Phone: `Sagar hotel 3 jalli 72kg 28 rate udhaar` → card with the working → tap ✅.
2. Send the diary page (photo or scanner PDF) → numbered rows → fix the ⚠️ row by number (`11 hatao`, `4 3555`) → ✅ → "yaad rakh liya".
3. Voice note "Sagar ne pandrah sau diye" → `Suna: …` → payment card → ✅.
4. `Sagar ka baaki?` and `aaj ka hisaab`.
5. Laptop: `MUNSHI_PROVIDER=local npm run dev`, repeat step 1 → same Munshi, nothing leaves the machine.
6. This README and `skills/munshi-ledger/SKILL.md`.

## Roadmap
- **WhatsApp adapter** next: the handler is channel-agnostic, so it is one more file beside `telegram.js`.
- SQLite storage (one file, no server) once there are many traders; reminders for old udhaar, PDF statement to forward, several users per shop, item-wise rate history.

## License
MIT — see [LICENSE](LICENSE).
