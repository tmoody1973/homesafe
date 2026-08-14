# The evidence timeline reads both the address and its parcel

**2026-08-14** — design sketch, approved by Tarik. Task 13 / MOO-613.

## The drawing

```text
Option A — plan as written        Option B — address OR same parcel  ← chosen
publicTimeline(samId)             publicTimeline(samId)
  find address                      find address + its parcel
  join events by address            join events by address   -> scope: address
  return newest first               join events by parcel    -> scope: parcel
                                    return newest first
```

Read-only. Nothing here writes, so no 🔒 and no `[gate]`.

## What each returns, measured against the live database

At `302 Sumner St`:

| | Option A | Option B |
|---|---|---|
| Violations | 4 | 4 |
| Permits | 1 | 1 |
| RentSmart | **0** | **2** |

Across the whole database:

| | Rows reachable | Heat records | Pest records |
|---|---|---|---|
| Option A | 640,922 | **0** | **0** |
| Option B | 1,062,729 | **4,959** | **28,183** |

## Plain English

A parcel is the plot of land. An address is a door on it. Boston files RentSmart
complaints against the land, not the door. The plan's query asked only "what
happened at this door", so every land-filed record fell through — and land-filed
is where *all* of the heat and pest complaints live. That is the exact gap
MOO-617 was pulled into plan 1 to close, and the plan would have quietly
reopened it. Option B asks both questions and labels every answer, so a
building-level record shows up marked `parcel` instead of being hidden or
dressed up as something that happened inside one apartment.

## Decision layer

```text
Decision: the timeline reads the address path and the parcel path, and every
          item carries the scope badge saying which one found it.
Trade-off: a bigger query, and residents see building-level records they must
          read as building-level — the scope badge carries that weight alone.
Risk: if the badge is ever dropped in the UI, a parcel record reads as if it
      happened in their apartment. That is the lie this project exists to avoid.
```

## Rejected

- **Option A, address only (the plan as written)** — simplest query, but returns zero heat records at every address in Boston, for a demo whose story is "my apartment has no heat".
- **Guess an address for each parcel record** — a parcel holds several addresses; picking one would attach a stranger's complaint to someone's home.

## What actually happened

<!-- Tarik fills this in. -->
