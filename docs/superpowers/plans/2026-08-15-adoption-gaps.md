# HomeSafe — Adoption-gap build plan

**Written 2026-08-14, evening.** Five gaps stood between the hackathon build and something
Boston institutions could pilot. One — the agent knowing Massachusetts law — was built and
shipped the same evening (`policy_guidance` memory, eight sourced rules, live-verified).
This plan sequences the other four. Deadline context: the Devpost submission closes Monday
Aug 18, 4pm CDT; nothing here is required for submission, and none of it should be
attempted before the video is recorded.

## Ordering, and why

1. **Share flow (MOO-616)** — the institutional hook. One counselor serving fifty
   residents is the adoption story; everything else is quality.
2. **311 ingest + fuzzy cascade (MOO-618)** — the freshest signal a resident can act on,
   and the design is already written (spec §6.4).
3. **Scheduled refresh (Lambda)** — matters the day a second person depends on the data.
4. **Follow-through nudges** — the most novel, so the most likely to eat time; last.

---

## 1. Share flow — plan 4, already scoped in MOO-616

The existing issue stands. Build order within it: consent checkboxes on notes → packet
assembly (`evidence_packet` + items, content-hashed) → a read-only packet page for a
signed-in reviewer → revocation. The printable case file shipped today is the packet's
little sibling; the packet is that page plus consent scopes and a recipient.
**Estimate: 1 day.** The withheld-counts machinery already proves the boundary works.

## 2. 311 data — MOO-618, design already in spec §6.4

Two CKAN resources (current + legacy 311). Ingest reuses the streaming/upsert/idempotency
machinery from plan 1. The interesting part is the matcher cascade, verbatim from the spec:
exact address+ZIP (high) → structured components (medium) → coordinate proximity with
stored distance (low) → unmatched, held as nearby context and never attached as strong
evidence. Every 311 event renders the existing scope badge; sometimes the right output is
"I am not confident this record belongs to your building."
**Estimate: 1–1.5 days, mostly cascade tests against messy real rows.**

## 3. Scheduled refresh — one Lambda, one schedule

Nightly EventBridge → Lambda running the four ingests (CKAN URL resolution + idempotent
upserts mean re-runs are safe by construction). Writes need `DATABASE_URL_ADMIN`, so the
Lambda gets its own IAM role and the connection string lives in Secrets Manager — the
admin credential still never touches Amplify. Log the row-count delta per run; a run that
ingests zero new rows for a week is a silently broken pipeline, so that becomes an alert.
**Estimate: half a day.** Until then the honest workaround ships in the README: "data
refreshed manually; last refresh date shown is real."

## 4. Follow-through — memory that acts over time

The smallest honest version, built on what exists: a nightly job (same Lambda) finds cases
where the newest journal entry mentions an unresolved condition, N days have passed, and
no newer agent run exists — and drafts a check-in **task** ("It has been 5 days since you
told your landlord. If nothing changed, the next step is a 311 inspection — here's why
that matters"). Tasks are the right vehicle: they already require the resident's approval,
already render, and the agent never sends anything anywhere. Notifications (email/SMS) are
deliberately out — they need real identity first (see the adoption doc's deal-breakers).
**Estimate: half a day for the draft-task version.**

## Explicitly not in this plan

Real authentication, institutional governance, legal review, multilingual — the
deal-breaker tier from the adoption analysis. Those are decisions and partnerships, not
weekend code, and pretending otherwise would be the roadmap lying.
