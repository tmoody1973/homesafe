# 006 — The agent runs on Claude Sonnet 4.5

**Decision.** HomeSafe's agent calls `us.anthropic.claude-sonnet-4-5-20250929-v1:0` on
Bedrock. Sonnet 5 was chosen first and then reversed the same afternoon, once the price of
getting it was actually known rather than assumed.

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

1. **Sonnet 4.5.** Already proven with a live call, latency already measured, zero re-work.
   Real cost: it is a 2025 model being shown to hackathon judges in August 2026. A judge who
   notices reads it as a project that stopped paying attention — and they would be describing
   something true about how the id got there.
2. **Sonnet 5.** Current generation, and fast, which matters because the 12-second budget for
   one agent turn has to cover the model writing several hundred words. Real cost, once it was
   measured rather than guessed: this AWS account has no Marketplace agreement for it, and
   creating one means signing a paid agreement as **account root** — the exact credential
   MOO-599 exists to delete.
3. **Opus 5.** The strongest reasoning available, which suits an agent whose failure mode is
   over-claiming. Real cost: Opus is the slowest of the three, and the measured turn already
   sits at the 12-second budget with generation, not retrieval, as the bottleneck.

**What we chose and why.** Option 1 — Tarik's call, and it reversed his own earlier call for
Sonnet 5 once the root-credential cost surfaced. Reversing a decision on new evidence is the
system working. Two things made it easy. First, the guardrail that stops the agent
over-claiming is not the model: it is the validator, which checks every citation against a
receipt of what was actually read and deletes any claim citing a source that was not. That
works the same behind any model. Second, the measured turn on Sonnet 4.5 already meets the
budget, so there was no performance argument left either.

The reasoning is worth keeping because the fix is genuinely small — two CLI commands from an
identity with `aws-marketplace:Subscribe` — and it can be taken any time the root question is
settled. It is a decision deferred, not a door closed.

**What we gave up.** A 2025 model in a 2026 submission, which is a real presentation cost and
should be said out loud rather than hidden: HomeSafe runs on Sonnet 4.5 because switching cost
more than it was worth this week. We also gave up whatever Sonnet 5 would have done better on
the reasoning the validator does not cover — tone, restraint, knowing when to say nothing.
That is not measurable here and we are not pretending it is zero.

**How we'll know if this was right.** Three checkable things. The measured turn stays under 12
seconds. The validator's strip rate stays low, meaning the model is not routinely citing
sources it did not read — one run in five stripped a claim, and that claim was a genuinely
mangled id, which is the catch working. And no reviewer of the submission raises the model
choice; if one does, this document is the answer.

**Verified 2026-08-14, with a control rather than a single denial.**

```
anthropic.claude-sonnet-5            agreementAvailability: NOT_AVAILABLE
anthropic.claude-sonnet-4-5-...      agreementAvailability: AVAILABLE
```

Both report `authorizationStatus: AUTHORIZED`, `entitlementAvailability: AVAILABLE`,
`regionAvailability: AVAILABLE`. So the Anthropic use-case form is done and the region is
right; exactly one thing is missing, and it is missing for exactly one model.

This also explains the confusing part. The first Sonnet 5 call succeeded and every later one
failed, which read like a flaky service. AWS's own documentation says the opposite: the first
invocation starts a Marketplace subscription in the background, calls may succeed for up to
fifteen minutes while it settles, and once it fails every subsequent call returns
`AccessDeniedException`. A success that arrived before a failure was evidence of the failure,
not against it.

**What actually happened.**
