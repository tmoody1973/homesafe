# 006 — The agent runs on Claude Sonnet 5

**Decision.** HomeSafe's agent calls `us.anthropic.claude-sonnet-5` on Bedrock. The day-one
model, `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, is retired from the code path.

**Why this came up.** On day one the project made one live Bedrock call, it worked, and the
model id in that call quietly became the project's model. Nobody chose it — it was the first
string that answered. Plan 3 builds the agent, so this was the last honest moment to decide it
out loud rather than inherit it.

What was at stake, in both directions. A model id that entered the codebase by accident is a
technical decision with no owner, and those are the ones that surprise you later. On the other
side, the agent's whole job is careful reasoning about what a record does and does not prove;
a model chosen for convenience is a strange foundation for that.

An "inference profile", by the way, is a routing alias sitting in front of a model — it is why
the working id starts with `us.` rather than naming the model directly.

**Options.**

1. **Stay on Sonnet 4.5.** Already proven with a live call, latency already measured, zero
   re-work. Real cost: it is a 2025 model being shown to hackathon judges in August 2026. A
   judge who notices reads it as a project that stopped paying attention — and they would be
   describing something true about how the id got there.
2. **Move to Sonnet 5.** Current generation, and fast, which matters because the 12-second
   budget for one agent turn has to cover several tool calls, each with a database round trip
   from Bedrock in Virginia to CockroachDB in Ohio. Real cost: a fresh live verification, and
   the day-one latency figure no longer applies to anything.
3. **Move to Opus 5.** The strongest reasoning available, which suits an agent whose failure
   mode is over-claiming. Real cost: Opus is the slowest of the three, and the 12-second budget
   was already flagged in plan 3 as the softest estimate in the plan.

**What we chose and why.** Option 2 — Tarik's call, from two options put to him, with Opus
named in the same breath. Sonnet 5 removes the "dated" objection without spending the speed
budget, and the thing protecting against over-claiming in this system is not model strength
anyway. It is the validator: the model's citations are checked against a receipt of what was
actually read, and any claim citing a source that was not read is stripped before rendering.
That guardrail works the same whichever model sits behind it.

Both ids were confirmed to exist by listing Bedrock's inference profiles, rather than assumed.

**What we gave up.** The day-one latency measurement, which is now worthless — the real turn
has to be measured again against the real tool loop, and plan 3 already says the honest fix for
an over-budget turn is fewer tool calls, not a faster model. We also gave up Opus 5's reasoning
on a task where reasoning quality genuinely matters, and we are leaning on the validator to
cover that gap. If the validator turns out to strip claims frequently, that is a signal we
chose speed over judgement and should revisit.

**How we'll know if this was right.** Three checkable things. A real agent turn — several tool
calls, real database round trips — finishes under 12 seconds. The validator's strip rate stays
low, meaning the model is not routinely citing sources it did not read. And no reviewer of the
submission remarks on the model choice, in either direction.

Verified 2026-08-14: a live `Converse` call to `us.anthropic.claude-sonnet-5` returned in
**1,723 ms** for a trivial prompt. That is a floor, not a budget — the real turn is measured in
plan 3 Task 7.

**What actually happened.**
