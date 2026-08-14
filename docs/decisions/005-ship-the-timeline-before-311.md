# 005 — Ship the timeline before 311, splitting plan 2 in two

**Decision.** Plan 2 is now the deploy plus the three-lane timeline, built on the records
already loaded. The 311 work moves to plan 2b and is treated as upside.

**Why this came up.** MOO-614 bundled two unrelated jobs into one plan: the 311 address
matcher (hard, backend, interesting) and the app shell with its timeline (visible, and the
thing anyone actually looks at). The design spec's own build order disagrees with that
bundling — it puts the three-lane timeline on day 4 and calls it *"first submittable
artifact,"* with 311 on day 5.

What was at stake: a hackathon submission with no working artifact. Bundled, nothing is
demoable until the whole plan lands, and the riskiest, least predictable piece — 311 fuzzy
matching against messy address text — sits in front of the thing that makes the project
legible to a judge.

Two facts made the split easy. First, the database already holds **1,062,729 public records**,
including 4,959 heat records and 28,183 pest records, so a timeline has real content today
without 311. Second, MOO-617 already pulled RentSmart forward, which was a third of MOO-614's
stated scope — the plan was stale before it was written.

**Options.**

1. **Keep MOO-614 whole.** One plan, one epic, fewer moving parts to track. Real cost: nothing
   is submittable until every piece lands, and the unpredictable piece blocks the visible one.
2. **Split: timeline first, 311 second.** A submittable artifact exists early, and 311 becomes
   something we can drop without losing the demo. Real cost: two plans and two Linear epics to
   keep in sync, and a partly-finished match cascade sitting in the codebase for longer.
3. **Drop 311 entirely.** Simplest. Real cost: loses the best story in the project — an agent
   that says *"I am not confident this record belongs to your building."* That declining-to-
   over-claim behaviour is the most credible thing in the demo, and it only exists because
   311 has no shared identifier to lean on.

**What we chose and why.** Option 2 (Tarik's call, from two options I put up). The safety net
comes first and the interesting engineering stays on the list rather than being cut. Option 3
was never really on the table; it just clarifies what plan 2b is *for*.

**What we gave up.** Two plans to keep aligned, and the risk that 311 quietly never happens
once something demoable exists — which would cost the single most persuasive moment in the
pitch. Calling it "upside" is exactly how work gets dropped, so the honest version is: this
protects the submission and puts the best story at risk.

**How we'll know if this was right.** A live URL renders a real Boston address's timeline in
under three seconds, and it exists before any 311 code is written. If 311 later lands too,
the split cost nothing; if it doesn't, we still have a submission.

**What actually happened.**

<!-- Tarik fills this in. -->
