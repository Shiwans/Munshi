# Hack Day context (Hacktoberfest Hack Day Mumbai x FAIR, 11 Oct 2026)

Venue: Paytm, Andheri East. Hacking 10:30–13:00 and 14:00–15:30, demos + judging 15:30–16:00, results 16:00–16:30.
Submissions close 17:00 IST via OrganizerHQ (project gallery must be public before results).

## Prize tracks (both targeted)
1. **Best Use of Gemma 4** (Google DeepMind). Must use a Gemma 4 model *through the Gemini API*
   (`gemma-4-26b-a4b-it` or `gemma-4-31b-it`). Judges verify: model named in README, integration shown in code/demo.
   Prize varies: MLH+DEV swag bag, mechanical keyboard, or digital gift card.
2. **Best Open-Source AI Project** (DigitalOcean). Open-weight AI central to the project; public GitHub repo with OSS
   license; agent skills must follow the Agent Skill Open Standard (agentskills.io); harness entries need original work.
   Prize: Hacktoberfest 2026 Winner DEV badge + MLH swag bag.

What judges are told to look for: meaningful use of open AI, a clear problem, substantial work done today, source/license/model
easy to verify, a working demo. They ask teams to show the code and explain the AI's role in plain words.
MLH's usual rubric: technicality, originality, practicality, polish, wow.

## Gemma 4 facts
- Gemini API serves only `gemma-4-26b-a4b-it` (MoE, 3.8B active, fast) and `gemma-4-31b-it`. Text + image input, 256K context,
  function calling, structured JSON, system instructions, `thinkingLevel` minimal/high. **No audio on the API** (audio only on
  local E2B/E4B/12B). Strong OCR / document reading. 140+ languages. Apache 2.0 weights.
- Docs: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api · quickstart mlh.link/gemma-quickstart

## Free things
- Gemini API free tier for Gemma 4 (reported 1,500–3,000 req/day). Key: aistudio.google.com/apikey.
- hacktoberfest.com/my/promos: Render $50 (till 15 Nov), Backboard credit, ElevenLabs Creator 3 months, Tinker $10.
- DevRelay MCP (card handed out): `curl -fsSL https://devrelay.com/install.sh | sh` — claims credits, writes and submits the
  project to the MLH event + challenges from Claude Code. Sign in with MLH.
- Stickers: attending = 1 virtual sticker; 3 → physical pack mailed; 17 → Completionist raffle (t-shirt / Arduino Uno Q).
  Participation certificate in My Hacktoberfest.

## Submission checklist
- Public repo github.com/Shiwans/munshi, MIT LICENSE, README names every model and says "via the Gemini API".
- `git ls-files | grep -E '\.env$|^data/'` shows only `data/.gitkeep`.
- Commits spread over the day. Screenshots/gif of the Telegram chat in README.
- Submit to BOTH challenges before 15:30 (deadline 17:00, but demo slot is 15:30).

## Sources
Event: https://events.mlh.com/events/15178-hacktoberfest-hack-day-mumbai-x-fair ·
Challenges: https://www.mlh.com/events/hacktoberfest-hack-day-pune-x-fair/challenges ·
MLH handbook (OSS track): https://hacktoberfest-handbook.mlh.com/fest-planning-guide/open-source-prize-categories ·
Gemma module: https://hacktoberfest-handbook.mlh.com/hack-days-partner-modules/partner-challenge-google-gemma.md ·
Agent Skills spec: https://agentskills.io/specification · DevRelay: https://devrelay.com
