---
name: munshi-ledger
description: Keep a small Indian trader's khata (customer ledger) from Hinglish lines like "Sagar hotel 3 jalli 72kg 28 rate udhaar", diary-page photos or voice notes. Records sales, udhaar (credit), payments and expenses only after the trader confirms, and answers baaki, khata, statement and daily hisaab questions with exact integer-paise math. Use for bookkeeping, ledger entries, udhaar tracking, bill entry or Hinglish/Hindi/Marathi/Gujarati accounting.
license: MIT
compatibility: Requires Node 20+, ffmpeg, a Munshi checkout with npm install, and GEMINI_API_KEY in .env (or MUNSHI_PROVIDER=local with LM Studio).
metadata:
  repo: https://github.com/Shiwans/munshi
---

# Munshi ledger

Munshi turns what a trader writes into a checked khata. A model only *reads* the line or photo; all money math is
done in code, in integer paise. Nothing is saved until the trader says "haan".

## When to use
- The user dictates or pastes a sale, payment or expense: `Gupta 10 kg 40 rate nagad`, `Sagar ne 1500 diye`.
- The user asks for a balance, statement or day total: `Sagar ka baaki`, `aaj ka hisaab`.
- The user has a photo or scanner PDF of a handwritten diary page.

## How to run
All commands go through `scripts/munshi.sh` (it runs `node src/cli.js` in the Munshi checkout).
Set `MUNSHI_TRADER=<id>` to keep separate ledgers; default is `cli`.

| Step | Command | Output |
|---|---|---|
| Draft an entry | `scripts/munshi.sh record "Sagar hotel 3 jalli 72kg 28 rate udhaar"` | Numbered card, nothing saved |
| Draft from a photo | `scripts/munshi.sh photo /path/page.jpg` (or `.pdf`) | One card row per diary line |
| Fix a row | `scripts/munshi.sh say "2 rate 30"` · `"3 hatao"` · `"1 Gupta Dairy"` · `"4 3555"` | Updated card |
| Save | `scripts/munshi.sh confirm` | `✅ Likh diya` + new balance |
| Discard | `scripts/munshi.sh cancel` | nothing saved |
| Undo last save | `scripts/munshi.sh undo` then `confirm` | reversing entry, original stays |
| Balance | `scripts/munshi.sh khata "Sagar"` | baaki + recent entries |
| Statement | `scripts/munshi.sh statement "Sagar"` | copy-ready text for the customer |
| Totals | `scripts/munshi.sh hisaab today` (`yesterday`, `week`, `month`) | sales, cash vs udhaar, payments, dues |

## Rules for the agent
1. Always show the trader the card from `record`/`photo` and get an explicit yes before running `confirm`.
2. Never compute or "fix" totals yourself. If the card shows `⚠️ … kaunsa sahi?`, ask the trader which number is right and pass it as `say "<row> <amount>"`.
3. Rows tagged `(naya customer)` create a new customer on confirm; check the spelling with the trader first.
4. Confirmed entries are never edited. Use `undo` + a new `record` for mistakes.
