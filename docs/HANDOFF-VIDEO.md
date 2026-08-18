# HANDOFF — the demo video (start here in the fresh session)

**Written 2026-08-18, 11:05 CDT. Deadline: TODAY 4:00pm CDT.** Devpost wants a public
YouTube/Vimeo link, under 3 minutes. Everything else on the submission is done and live
(verified this morning: repo public, MIT detected, README current, app + diagram 200,
deploy 38 = HEAD `0a41903`). **The video is the last unchecked box.**

Tarik's decision on tooling: **ego-browser** drives the demo, **ElevenLabs** narrates,
**Remotion** (fallback: Hyperframes) assembles. Below is what I verified about each and
what has to happen in what order. Read the two blockers first.

---

## Two blockers, checked this morning — resolve before anything else

### 1. ego-browser does NOT record video. Verified.
Its skill exposes `captureScreenshot`, `snapshotText`, `drainEvents` and click/type
helpers. No `record`, no screencast, no frame stream. **So the plan is:**
- ego-browser **drives** the demo (opens the live site, signs in as Denise, clicks
  through the script) so every take is identical and hands-free.
- macOS `screencapture -v` **records** the screen while it does so
  (`/usr/sbin/screencapture -v -V 60 out.mov` records for 60s; verified the flag exists).
- Alternative that avoids screen-recording entirely: have ego-browser
  `captureScreenshot()` at ~4 fps during the drive and stitch with ffmpeg
  (`ffmpeg -framerate 4 -pattern_type glob -i 'f*.png' ...`). Choppier but deterministic;
  fine for a Remotion `<Video>`/`<Img>` sequence. Pick whichever gets a clean take first.

### 2. ElevenLabs is not configured. Verified.
`ELEVENLABS_API_KEY` is **not** in `.env`, not in the shell, not in `~/.zshrc`. No voice
profile JSON exists (skill looks for `ELEVENLABS_TTS_CONFIG` → `local/elevenlabs/profiles.json`
→ `config/local/elevenlabs-tts.json`). **Ask Tarik for the key at the top of the session**
(paste in chat → write to `.env` as `ELEVENLABS_API_KEY=…`; `.env` is gitignored, checked),
and which voice to use. Then create `config/local/elevenlabs-tts.json` per the skill's schema.
The generator is `~/.claude/skills/elevenlabs-tts/scripts/generate_voice.py`.

Fallback if the key can't be had: macOS `say -v Samantha -o narration.aiff` then ffmpeg to
mp3. Worse voice, zero setup. Ship > perfect at a 4pm deadline.

---

## The script is already written
`docs/VIDEO-SCRIPT.md` — timed run-of-show (0:00 → 2:50) plus a "recording cheat sheet."
It is the source of truth for both the narration text and the click sequence. Don't rewrite
it; execute it. Key facts it relies on, all live now:
- Sign in as **`Denise`** (exact spelling; same name = same account). Her case at
  **225 Blue Hill Ave, Roxbury** is pre-seeded: 3 dated notes, an agent turn from "3 days
  ago", a drafted 311 task, 200+ real records.
- Live URL: https://main.d3jkv6lewhcr03.amplifyapp.com — sign in at `/signin`.
- One live "ask" on camera takes 10–20 s (heavy building). Talk over it.
- Reviewer-preview checkbox + "show me every private note" → drawer shows **2 withheld**.
- The three must-keep moments: receipt scroll · "2 items withheld" · 53 complaints / 1 permit.

---

## Build order (aim: rough cut by 1:30pm, final upload by 3:00pm)

1. **Unblock** — get the ElevenLabs key + voice from Tarik (or decide `say` fallback). 5 min.
2. **Narration first, not last** — split VIDEO-SCRIPT.md into ~7 narration segments, one
   mp3 each (segment timing then dictates how long each screen clip must be). 15 min.
3. **Drive + record** — ego-browser task space `homesafe-demo`; sign in as Denise; execute
   the click sequence with deliberate 1.5s pauses; `screencapture -v` running for the whole
   take. Do TWO takes. Screenshots at each named beat as insurance. 30 min.
4. **Assemble in Remotion** — `npx create-video@latest --yes --blank --no-tailwind demo`
   in the scratchpad (NOT in the repo). Composition: title card → screen clip segments with
   the matching mp3 under each → end card (repo URL + live URL). Keep to ≤ 2:50 to leave
   margin. `npx remotion render`. Remotion skills: `remotion-create`, `remotion-render`,
   `remotion-captions` (burn captions from the narration — helps judges watching muted). 45 min.
   Fallback if Remotion fights you for >20 min: `hyperframes` skills, or plain ffmpeg
   concat + `-i narration.mp3`. Do not sink the afternoon into tooling.
5. **Upload** — Tarik uploads to YouTube (unlisted is NOT enough — must be **public**),
   sends the link. Add to README line 11 (`Demo video: coming before submission` → the link),
   commit, push (auto-deploys). 5 min.
6. **Devpost form** — Tarik fills it. All answers already exist in README.md sections
   "CockroachDB tools used" and "AWS services used"; diagram URL is
   https://main.d3jkv6lewhcr03.amplifyapp.com/architecture.html.

---

## Verify-on-arrival (fresh session, 60 seconds)
```bash
cd /Users/tarikmoody/Projects/homesafe
git status --short && git log --oneline | head -1        # clean, 0a41903
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" https://main.d3jkv6lewhcr03.amplifyapp.com/signin  # 200
ego-browser --version                                     # 0.4.6.14
which ffmpeg npx                                          # both present
( set -a; . ./.env; set +a; [ -n "$ELEVENLABS_API_KEY" ] && echo KEY_OK || echo KEY_MISSING )
```

## Things that bit before, so they don't bite again
- **`curl` is not on PATH in some shells here** — use `/usr/bin/curl`.
- **Bun only auto-loads `.env` for package.json scripts** — for one-off scripts:
  `set -a; . ./.env; set +a` first.
- ego-browser is a Node runtime that exits after each heredoc — always
  `useOrCreateTaskSpace('homesafe-demo')` and reuse it; `cliLog` is the only stdout.
- The Chrome MCP tabs die between sessions; ego-browser is the right tool here anyway.
- Don't touch the deployed app or the Denise seed today. If a take needs a clean case,
  sign in as a NEW name; never delete Denise.
- Keep the Remotion project in the scratchpad or `~/tmp`, not in the repo — the repo is
  the judged artifact and its tests must stay at 191/191.

## What Tarik owes the session (ask up front, together)
1. ElevenLabs API key + preferred voice name (or "use say fallback")
2. Whether he wants to record his own voice instead (then skip step 2 entirely — just
   assemble his audio)
3. The YouTube upload at the end (needs his account)
