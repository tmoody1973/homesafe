# 007 — The app credential ships to Amplify after all

**Decision.** The deployed site now carries `app_rw` — the database login that can read and
write residents' private notes — alongside the read-only login it already had. This reverses
a rule plan 3 stated in bold: *"`DATABASE_URL_APP` must never be written there."*

**Why this came up.** Tarik chose to deploy the full app — sign-in, note-writing, the agent —
rather than record the demo against a laptop. A case page that can save a resident's note
must hold the credential that writes notes. There is no way around that; the only question is
what stands between the internet and it.

**Why the old rule existed, and what changed.** The rule was written when the public tier had
*no use* for the write credential — an unused credential on an internet-facing box is pure
downside, so plan 3 kept it off and even proved the boundary held with a live probe. What
changed is that the credential is no longer unused: the app now has doors (sign-in, forms),
and doors need keys. The rule's real principle — *nothing holds a privilege it has no use
for* — is intact. The application of it moved.

**Options.**

1. **Keep the rule; record the demo locally.** Zero new exposure. Real cost: the submission's
   URL shows a read-only shell, and the actual product — notes, memory, the agent, the
   receipt — exists only on one laptop.
2. **Ship `app_rw` behind sign-in, with the boundary re-drawn one layer up.** The site works
   for anyone. Real cost: the write credential now lives on a public host, and every guard
   around it is now load-bearing.
3. **A separate private deployment** (second Amplify app, IP-restricted). Purest, and plan 4
   may still land here. Real cost: a second app, second pipeline, second set of env vars to
   keep aligned, days before a deadline.

**What we chose and why.** Option 2 — Tarik's call. The guards that make it defensible, each
checkable:

- **Sessions are signed.** The cookie naming who you are is HMAC-signed with a server-only
  secret; edited cookies fail verification and read as signed-out.
- **Ownership is checked in SQL, per request.** Knowing a case's URL gets a stranger the same
  404 as a case that does not exist. The demo-grade part of sign-in (no passwords) weakens
  who you can *claim to be tomorrow*, not what you can *reach today* — a fresh sign-in is a
  fresh empty account, not a door into anyone else's.
- **The AI's credentials never touch the bundle.** Bedrock access comes from an IAM role
  attached to the server compute (`homesafe-amplify-compute`) that can invoke exactly two
  models and nothing else — no keys in environment variables, no keys in the build.
- **`app_rw` itself stays clipped.** It cannot rewrite the audit log and cannot touch public
  evidence — those grants were never widened.

**What we gave up.** The cleanest sentence in the pitch. "The public tier cannot read private
data" was absolute; it is now "the public tier reads private data only for its owner, and
here is each guard." True, checkable, and one clause longer — and every clause is something
that must now not regress. The negative test that proved the old boundary
(`DATABASE_URL_APP: ABSENT` on the live server) is retired, deliberately, by this decision.

**How we'll know if this was right.** A stranger with a real case URL gets 404 — check it on
the live site. A tampered cookie signs you out rather than in. The compute role refuses any
AWS call beyond the two models. And plan 4's consent gate lands on this same tier without
another architecture change — that was the bet.

**What actually happened.**
