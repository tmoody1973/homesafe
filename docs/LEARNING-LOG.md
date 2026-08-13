# Learning Log

Dated entries. Each answers three things: what did we expect, what happened, what do we
now believe. Claude drafts the "expected / happened" lines from what actually occurred;
Tarik writes the "what I now believe" lines in his own voice.

---

## August 13, 2026 — Bedrock access was already granted

**What we expected.** That getting Claude models enabled on Bedrock would be the one
dependency with a queue in front of it — a request that needs AWS approval, possibly not
same-day. It was flagged as the first thing to click, before any code, because it was the
only blocker we didn't control.

**What happened.** Checked it directly instead of assuming. Fifteen Anthropic models are
available in `us-east-1`, and a real `converse` call returned text on the first try. No
request, no queue, no wait. The embedding model answered too, and measuring its output
settled a schema decision on the spot: Titan v2 returns 1024 numbers, so the database
column is `VECTOR(1024)`. That number was going to be a guess until we called the API.

**Worth noting for next time:** listing a model and being able to call it are different
things. `list-foundation-models` shows what exists in the region, not what this account is
allowed to invoke. Only the actual call proves anything.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — "Read-only" was doing more persuasive work than it should

**What we expected.** CockroachDB's Managed MCP Server is advertised as "safe by default:
read-only mode, full audit logging." That reads like a security guarantee, and the project
requirements document had drawn the app's AI reaching the database straight through it.

**What happened.** Read-only turns out to mean *nothing can be changed or deleted* — not
*can only look at the right things*. For most applications that distinction doesn't matter.
For this one it's the whole product: HomeSafe's promise is that a renter's notes stay
private until they choose to share. An AI that can compose its own database queries can be
talked into reading a note it shouldn't, and read-only doesn't stop that; it only means the
note survives being read.

The fix wasn't a better prompt. It was two database logins — one that can see public city
records and nothing else, which is the one the AI holds. The private tables aren't
forbidden to it; they're invisible.

**The transferable bit:** when a vendor says "safe," ask *safe against what.* The answer is
usually narrower than the word.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — The requirements doc was a roadmap wearing a spec's clothes

**What we expected.** An 800-line requirements document with 26 numbered requirements and a
submission checklist reads like something you build.

**What happened.** Counted the actual subsystems in it: about seven, each independently
buildable, including a whole photo-upload-and-AI-image-description feature with its own
security surface. Two weeks spread across seven subsystems produces a demo where nothing is
convincing — the failure isn't running out of time, it's arriving on time with seven things
that each almost work.

What made it tractable was a question with a wrong-shaped answer. Asked which *single*
moment in the video had to be undeniable, the answer was three moments. But those three
weren't competing headlines — they were a sequence (real records → visible memory →
controlled handoff), where each one only means anything because the previous one happened.
The sequence handed over the build order for free.

**Also worth keeping:** the moment that *didn't* get picked — the resident leaving and
coming back — turned out to be load-bearing anyway. The memory panel's most convincing line
is *why* it remembered something, and without an earlier session there's no reason to show.
Something can be essential and not be the headline.

**What I now believe.**
*(Tarik to fill in.)*
