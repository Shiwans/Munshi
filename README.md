# Munshi

A bookkeeper in your chat. Small Indian traders already note the day's business as messages to themselves and in a
paper diary. Munshi lives in that chat: a Hinglish line, a voice note, or a photo of the diary page becomes a khata
(customers, udhaar, payments, daily hisaab), verified by you before anything is written.

**Status: under construction (Hack Day, 11 Oct 2026).** See `docs/BUILD-PLAN.md` for the build order and
`docs/SPEC.md` for the full design.

## Models (all open-weight)
- **gemma-4-26b-a4b-it via the Gemini API** — reads text and diary photos, extracts entries (function calling).
- **Whisper large-v3-turbo** (mlx-whisper, local) — voice notes.
- **nomic-embed-text-v1.5** (LM Studio, local) — customer-name matching.
- **Qwen3.6-35B-A3B** (LM Studio, local) — fallback provider; the same bot runs fully on the laptop.

The model only extracts. All money math is plain code in `src/core/ledger.js`, in integer paise, unit-tested.

## Run
```bash
cp .env.example .env   # add GEMINI_API_KEY and TELEGRAM_BOT_TOKEN
npm install
npm test
npm run dev
```

License: MIT.
