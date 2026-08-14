# Case studies — real Boston buildings, in HomeSafe

**Honesty rule, stated first:** every record count, address, and date below is real — pulled
from the 1,062,729 City of Boston records in HomeSafe's database on 2026-08-14, and
checkable at the live app or on data.boston.gov. The *residents* are fictional composites,
and are labeled as such. HomeSafe is a tool about the difference between evidence and
assertion; its marketing doesn't get to blur what its product won't.

---

## Case study 1 — the building the city already knows about

**225 Blue Hill Ave, Roxbury** · parcel `1200921000` · 6 residential units
*(Resident "Denise" is fictional. Every number is real.)*

Denise has had no heat three times this winter. She thinks it's just her. It isn't:

| What the public record holds for this small building | Count |
|---|---|
| Heat / hot-water complaints, all years | **53** |
| — in 2025 alone | 21 |
| — in 2026, by June | 9 |
| Pest complaints | 25 |
| Utility complaints in 2026 | 15 |
| **Building permits in 2025, against all of the above** | **1** |

Six units. Fifty-three heat complaints. One permit.

**Without HomeSafe:** Denise thinks she's alone, writes nothing down, and gives up after
the second unanswered text to the landlord.

**With HomeSafe:** she types her address, and the *Public record* tab shows her building's
history — each record labeled with how it was matched and what it does not prove. She
starts keeping dated notes. When she asks *"is it just my apartment?"*, the agent answers
from records and her notes, cites every claim, and where that one 2025 permit appears, the
answer is forced to carry: *"a permit records authorized work — it does not establish that
a resident concern was repaired."* The receipt shows her exactly what was read. The agent
drafts her next step — call 311, document each outage — as a task she can approve.

**Why this matters beyond Denise:** heat complaints in Boston are filed against the *plot
of land*, not the apartment. A resident searching most tools by street address finds
**zero** of these 53 records. HomeSafe reads both paths on purpose and labels the
difference. That design decision is the difference between "no records found" and the
truth.

---

## Case study 2 — five units, seventy-four complaints

**39 Hemenway St, Fenway** · parcel `0401765000` · 5 units
*(Resident "Priya," a student, is fictional. Numbers real.)*

A five-unit building near the colleges with **74 heat/hot-water complaints** on record.
Students cycle through yearly; each new tenant starts from zero knowledge. The building's
memory outlives every lease — but only if someone can read it. HomeSafe makes a decade of
complaints legible in one screen, with provenance, before Priya signs.

---

## Case study 3 — the tower where scale hides everything

**795 Albany St corridor** · parcel `0801720000` · 659 addresses on one parcel

**79 heat complaints and 54 pest complaints** — which sounds bad until you notice it's
spread over 659 units, which is why per-building intuition fails at scale in both
directions. HomeSafe's match-confidence labels do the honest work here: a parcel-level
record on a 659-unit parcel is shown as exactly that — *"this property, likely match"* —
never inflated into a claim about one specific door. Declining to over-claim at scale is a
feature; most tools round it up.

---

## What the three studies prove together

1. **The data is real and the need is real.** These aren't demo rows; they're buildings
   people live in this week — the newest heat complaint above is from June 2026.
2. **Memory is the product.** The building's history (public memory) + the resident's
   notes (private memory) + the agent's own past conclusions (working memory) + the
   receipts (audit memory) — all one CockroachDB cluster, all consistent, all provable.
3. **The caveat engine earns its keep on real data.** 53 complaints vs 1 permit is
   exactly the situation where "a permit is not proof of repair" stops being pedantry and
   starts being the whole point.
