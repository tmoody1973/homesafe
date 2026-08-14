# The timeline UI shape — server-rendered, read-only, three lanes

**2026-08-14** — schematic design gate, approved by Tarik. MOO-614.

## The drawing

```text
web/app/
├── page.tsx              search box → redirects to /address/[samId]
├── address/[samId]/
│   └── page.tsx          the three-lane timeline   ƒ force-dynamic
└── components/
    ├── ThreeLanes.tsx    tabs: public / notes / analysis
    ├── EvidenceCard.tsx  one record + its caveat
    ├── ScopeBadge.tsx    address · parcel · unknown
    └── MatchDrawer.tsx   "why is this record here?"

reads, unchanged, from the code plan 1 already tested:
  ../src/evidence/query    publicTimeline(samAddressId)
  ../src/address/resolve   resolveAddress(text)
```

```text
Page render — every node reads, nothing writes
  await searchParams              <- a Promise in Next 16, not an object
  resolveAddress(text)
    1 candidate  -> show timeline
    many         -> show candidates, stop        [gate: resident chooses]
  publicTimeline(samId)
    by address  -> scope: address
    by parcel   -> scope: parcel
  render lanes
    public    real records
    notes     empty — plan 3
    analysis  empty — plan 3
```

**No 🔒 anywhere on that tree, and that is the point.** The page connects as `evidence_ro`,
which holds SELECT on three tables and no write permission at all. Not "we chose not to
write" — cannot.

## Plain English

You type an address, the server looks it up, and if it finds exactly one match it asks the
database for that address's records and draws them. If it finds five — which is normal, since
Boston's address register is unit-level — it shows you the five and stops, the same refusal
the command-line tool already makes. The database work happens on the server, so the password
never reaches your browser.

## Proven by running it, not assumed

| Question | Answer |
|---|---|
| Can `web/` use the query code from `src/`? | Yes — compiles and runs |
| What if `force-dynamic` is omitted? | Next runs the query **at build time** and the build dies |
| Is `searchParams` still a plain object? | No — a Promise in Next 16 |

A throwaway probe page was built, run against the real database, and deleted. Only the `pg`
dependency stayed.

## Decision layer

```text
Decision: the browser gets HTML, never a database connection. Pages are
          server-rendered per request as evidence_ro.
Trade-off: every view costs a round trip to us-east-2, so there is no offline
          or instant-back behaviour. Measured: ~100ms of a 3s budget.
Risk: if DATABASE_URL_EVIDENCE on Amplify is ever set to the admin login by
      mistake, a read-only page silently gains write access. Mitigated by a
      startup check that refuses to boot as anything but evidence_ro.
```

## Rejected

- **One flat lane now, three later** — less scaffolding, but the three-lane split *is* the
  demo's structure (public record / resident notes / HomeSafe analysis) and it would be rebuilt
  in plan 3 anyway.
- **Duplicating the query code inside `web/`** — two copies of the thing whose correctness the
  whole project rests on.

## What actually happened

<!-- Tarik fills this in. -->
