# Setup checklist (do these first, ~15 minutes)

## Already on this laptop (verified 11 Oct 2026)
- Node 20.20 (`node -v`), npm. Project deps installed (`npm install` done: @google/genai 2.28, grammy 1.46, dotenv).
- `uv` / `uvx` with Python 3.12, `ffmpeg` at /opt/homebrew/bin/ffmpeg.
- LM Studio server ON at http://localhost:1234 with `qwen/qwen3.6-35b-a3b` loaded (20 GB) and
  `text-embedding-nomic-embed-text-v1.5`. Do NOT also load `qwen/qwen3.8-27b` (32 GB RAM, both won't fit).
- Git identity: commit with `-c user.name="Shiwans" -c user.email="shiwans.vaishya@caryaar.com"` or set it in the repo.
- Personal GitHub over SSH works via the alias `github-personal` (`~/.ssh/config`). The `gh` CLI token is EXPIRED → create repos in the browser.

## You (the human) must do
1. **Gemini API key** → https://aistudio.google.com/apikey → paste into `.env` as `GEMINI_API_KEY=`.
   Gemma 4 on the Gemini API is free (reported 1,500–3,000 requests/day). Model id: `gemma-4-26b-a4b-it`.
2. **Telegram bot** → open @BotFather → `/newbot` → name "Munshi" → copy token → `.env` `TELEGRAM_BOT_TOKEN=`.
   Later: `/setcommands` with `start`, `help`, `bhasha`, `export`, `delete`.
3. **GitHub repo** → create public empty repo `munshi` under github.com/Shiwans, then:
   ```bash
   git remote add origin git@github-personal:Shiwans/munshi.git && git push -u origin main
   ```
4. **Real diary photo** → ask family for a photo of today's diary page (and a single chit if possible). Save under `tmp/` (gitignored).
5. Close memory-heavy apps (Codex, extra browser windows) so the 35B model stays resident. Memory was at 16% free.

## Background downloads (start early)
- Whisper model (~1.6 GB), one-time:
  ```bash
  uvx --python 3.12 --from mlx-whisper mlx_whisper --model mlx-community/whisper-large-v3-turbo --output-dir tmp --output-format txt tmp/warm.wav
  ```
  (`tmp/warm.wav` is a 1-second test tone already generated. If the download is slow use `mlx-community/whisper-small-mlx`.)
  Notes: the command is `mlx_whisper` (underscore) via `uvx --from mlx-whisper`. **`--python 3.12` is required**: without it
  uvx picked Python 3.10 and scipy failed to load (dlopen error on this macOS). Use the same flag in `src/ai/whisper.js`.

## Free credits (optional, not needed for the build)
- https://hacktoberfest.com/my/promos (login with MyMLH): Render $50, Backboard API credit, ElevenLabs Creator 3 months, Tinker $10.
- DevRelay MCP for submitting from Claude Code: `curl -fsSL https://devrelay.com/install.sh | sh`, restart agent, sign in with MLH.

## Verify the environment
```bash
npm test                                   # 7 ledger tests pass
curl -s http://localhost:1234/v1/models    # lists qwen + nomic
ffmpeg -version | head -1
```
