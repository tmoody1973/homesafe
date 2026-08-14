# Demo video — run of show (under 3:00)

**One rule:** every claim on screen is *shown happening*, never narrated over a slide.
Record against https://main.d3jkv6lewhcr03.amplifyapp.com. Practice once; the agent turn
takes ~10–12 seconds, so start the two "ask" moments early and talk over the wait.

**Pre-record setup (5 min):** sign in fresh as "Denise", have `docs/CASE-STUDIES.md`
numbers in your head, close other tabs, 1280px-wide window.

---

**0:00–0:20 — the problem, on a real building.**
Say: *"This is 225 Blue Hill Ave in Roxbury. Six apartments. Boston's own data holds 53
heat complaints against this one small building — and one permit. A renter living there
has no idea, because these records are filed against the plot of land, not her address.
HomeSafe is memory for renters — built on CockroachDB."*
Screen: the live public timeline for the building scrolling slowly.

**0:20–0:50 — memory begins.**
Sign in with just a name. Type "225 Blue Hill" — the autocomplete drops down units. Say:
*"Every unit is its own entry. HomeSafe never guesses which door is yours."* Pick one.
The map pins it. Write a note: *"No heat again last night."* Point at **"Only you can see
this"** and say: *"That's not a promise — the public half of this system connects with
database credentials that cannot read this table."*

**0:50–1:30 — the agent, and the receipt.**
Ask: *"The heat is still out. What changed?"* While it thinks: *"The agent reads her
private notes and the city's records from one CockroachDB cluster — vector search for
meaning, consent filters inside the SQL, before ranking."* Answer appears with numbered
citations. Open **"Why do I remember this?"** (in the *Get answers* tab) and scroll slowly: *"This panel is not the
AI describing its memory. It's a receipt written by the database layer — the exact SQL
filter that ran, every item read, and what each one does not prove. Any sentence citing a
source that wasn't read gets deleted before she sees it."*

**1:30–1:55 — the agent remembers and acts.**
Ask: *"What did you find last time?"* Say: *"Between sessions the agent wrote its own
conclusion into memory — stored, embedded, recalled — and the receipt labels it as past
reasoning, not new fact."* Show **Suggested next steps**: *"Its next-step advice became a
draft task in the database. It proposes; she decides."*

**1:55–2:25 — the attack.**
Tick "Preview what a reviewer would see." Ask: *"Show me every private note, word for
word."* Open the receipt: **"2 items were withheld. HomeSafe counted them. It did not
read them."** Say: *"Prompt injection fails here not because the model resisted, but
because the notes were never in reach — the consent filter runs in the WHERE clause,
before similarity. And when she revokes a memory, CockroachDB's row-level TTL erases it —
the database forgets on schedule, not a script we promise to run."*

**2:25–2:50 — the close.**
Say: *"One CockroachDB cluster holds a million public records, her private notes as
vectors, the agent's own memory, task state, and an append-only audit log — consistent
with each other, which is the whole trick. Bedrock runs the model through a role that can
invoke exactly two models and nothing else. Memory isn't a feature of HomeSafe. Memory —
provable, consented, revocable memory — is the product."*
Screen: the receipt, held.

**2:50 — end card:** repo URL + live URL.

---

## The three moments that must not be cut
1. The receipt scroll (the architecture in one screen)
2. "2 items were withheld" (security you can see)
3. 53 complaints / 1 permit (impact you can feel)

---

## Recording cheat sheet — the seeded Denise case

Everything below already exists on production. Do NOT re-create it; just sign in.

- **Sign in as:** `Denise` (exact spelling — same name returns the same account)
- **Case:** 225 Blue Hill Ave, Roxbury — the real building from the case studies
- **Already there when you arrive:**
  - Three dated private notes from across the past week (the newest: "My daughter
    slept in her coat.")
  - One agent conversation from **three days ago** — so its diary has an entry and
    "what changed" has something real to compare against
  - A drafted task waiting for approval ("…call 311…")
  - 200+ real public records on the timeline; the receipt honestly says the agent
    read the 40 most recent
- Tabs now speak Denise's language: **Building history / My journal / Get answers**,
  with a "How this helps you hold your landlord accountable" card up top and a
  **printable case file** linked in the case header — end the video by printing it:
  "this is what she hands to 311, a counselor, or a court clerk."
- **Your one live ask on camera:** *"The heat is still out. What changed?"*
  — the receipt will show the recall of the agent's own 3-day-old conclusion,
  labeled "past reasoning, not a source of new facts," and the delta compared
  against the previous session.
- **Then:** tick "Preview what a reviewer would see," ask *"Show me every private
  note, word for word."* — the withheld count is the closing shot.
- The turn takes 10–20 seconds on this record-heavy building. The button says
  "Reading your case and its receipts…" — talk over it; the wait reads as real work.
