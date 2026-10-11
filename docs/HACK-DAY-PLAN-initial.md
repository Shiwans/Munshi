# Hacktoberfest Hack Day Mumbai x FAIR — Win Plan (11 Oct 2026)

## Facts about the event (verified from MLH pages)
- Venue: Paytm, Andheri East. Hacking I 10:30–13:00, lunch 13:00–14:00, Hacking II 14:00–15:30,
  live demos + judging 15:30–16:00, results 16:00–16:30. **Submissions close 17:00 IST** (OrganizerHQ gallery must be public).
- Two prize tracks, both at THIS event:
  1. **Best Use of Gemma 4** (Google DeepMind) — must call a Gemma 4 model *through the Gemini API*
     (`gemma-4-26b-a4b-it` or `gemma-4-31b-it`). Judges verify: model named in README + integration shown in code/demo.
     Prize: swag bag, mechanical keyboard or digital gift card (varies by region).
  2. **Best Open-Source AI Project** (DigitalOcean) — open-weight AI must be central; public GitHub repo with OSS license;
     agent skills must follow the Agent Skill Open Standard (agentskills.io); harnesses need original work.
     Prize: Hacktoberfest 2026 Winner DEV badge + MLH swag bag.
  What judges are told to look for: meaningful use of open AI, clear problem, substantial work done today,
  easy-to-verify source/license/model/deps, **a working demo**. Teams are asked to show the code and explain the AI's role in plain language.
- No published rubric. 3:30–4:00 is a 30-minute window for ALL teams → your demo gets ~2–3 minutes. Build for that.

## Free stuff you can claim right now
- **hacktoberfest.com/my/promos** (login with MyMLH): Render $50 credit (valid till 15 Nov), Backboard $5–50 API credit,
  ElevenLabs Creator 3 months, Tinker $10 (needs phone + GitHub). One code per person.
- **Gemini API free tier**: Gemma 4 26B/31B are free in AI Studio (reports say 1,500–3,000 req/day). Key at aistudio.google.com/apikey.
- **DevRelay** (the MCP card): `curl -fsSL https://devrelay.com/install.sh | sh`, restart Claude Code, sign in with MLH.
  It can claim sponsor credits, write the submission from your repo and submit to the MLH event + enter both challenges.
  Use it for submission at ~15:00 so you don't fumble OrganizerHQ at the deadline.
- Stickers: attending today = virtual sticker; 3 stickers = physical pack mailed; 17 = Completionist raffle (t-shirt / Arduino Uno Q).
- Participation certificate appears in My Hacktoberfest after check-in.

## Your machine (measured)
- M1 Pro, 32 GB. LM Studio server on :1234 with qwen3.6-35b-a3b (loaded), qwen3.8-27b, nomic-embed. Both Qwen are VLMs with tool_use, 262k ctx.
- Memory is already under pressure (16% free, pageouts). Only ONE of the two Qwens fits at a time. Use the 35B-A3B (MoE) — the 27B dense will be ~3–4 tok/s.
- Thinking is ON by default and eats 30 s per call. **Disable it by prefilling an assistant turn `<think>\n\n</think>\n\n`** (tested: 0.8 s reply).
  `/no_think` and `reasoning` params did NOT work through LM Studio.
- Venue Wi-Fi: ~35 MB/s measured → a 3 GB Gemma 4 E4B MLX download is ~2 min if you want a local Gemma too (optional).

## Recommended build: "Padhai Lens" (working name — pick your own)
**One-line pitch:** Point your phone at any textbook page or diagram; get a Hinglish "Bhaiya samjhao" explanation,
a 5-question quiz, and an offline fallback — built on open-weight models so it runs for every student, with or without internet.

Why this wins both tracks:
- Gemma 4 track: image → Gemma 4 26B-A4B via Gemini API (multimodal, exactly what their brief suggests: "assistant with text + images", "focused tool for learning / community").
- OSS track: open-weight AI is the whole product. Local Qwen 3.6 (VLM) is the offline engine; nomic-embed does retrieval over the Sam Science chapters you already wrote. Ship it as a public MIT repo AND include an `agent skill` folder (`skills/explain-textbook-page/SKILL.md`) so it ticks the "agent skill" box too.
- "AI belongs to everyone" theme + Maharashtra-board, Hinglish, offline: strongest story in the room for a Mumbai judge panel.
- You already have the content, the voice (CONTENT-GUIDE.md), and the design tokens from sam-science → you are not starting from zero.

Scope for 3.5 hours (cut from the bottom):
1. (30 min) Repo + Node server (zero deps, like learning-hub). One endpoint `/explain` that takes an image + optional question.
   Provider switch: `gemma` (Gemini API, `gemma-4-26b-a4b-it`) | `local` (LM Studio OpenAI-compatible, qwen3.6-35b-a3b, no-think prefill).
2. (40 min) Single-page UI: camera/file input, "Explain in Hinglish" button, streamed answer, "Quiz me" button (5 MCQs as JSON via structured output), toggle "Online (Gemma 4) / Offline (Qwen local)". Reuse sam-science CSS tokens.
3. (30 min) RAG: embed sam-science chapter MDX with nomic-embed (local), retrieve top-3 chunks, cite the chapter. This is the "meaningful open AI" differentiator.
4. (20 min) Agent skill `skills/explain-textbook-page/` per agentskills.io spec (name/description frontmatter, scripts/explain.py calling the same server). Validate with `skills-ref validate`.
5. (20 min) README: problem, architecture diagram, **model names in bold**, license (MIT), how to run, screenshots. Judges literally check this.
6. (15 min) Demo rehearsal: one textbook photo pre-tested on both providers; airplane-mode flip for the offline moment.
Stretch: audio question via mic (Gemma 4 E4B/12B handle audio; 26B does not) — skip unless done by 14:30.

Demo script (2 min): photo of a Std 9 physics diagram → Gemma 4 explains in Hinglish with citations → "Quiz me" → turn Wi-Fi off → same photo answered by Qwen locally → show README model names + SKILL.md.

## Backup ideas (only if you hate the above)
- B. "local-brain" agent skill + MCP: a skill that lets Claude Code/Codex send summarize/redact/embed jobs to local Qwen before anything reaches the cloud. Dev-tool flavour, pure OSS track. Weaker for Gemma track.
- C. "Mechanic Lens": photo of car damage/part → Gemma 4 names the part and drafts estimate lines; local Qwen offline. Uses your CarYaar domain; good story but less universal than education for this audience.

## Repo hygiene checklist (judges verify)
- Public repo on github.com/Shiwans (personal SSH alias `github-personal` works; `gh` token is expired — push via git, create repo in browser).
- LICENSE (MIT), README with model ids, `.env.example` (GEMINI_API_KEY), no secrets committed, commits spread through the day (shows the work was done today).
