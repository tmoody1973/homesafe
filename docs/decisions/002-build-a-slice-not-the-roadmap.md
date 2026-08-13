# 002 — Treat the requirements doc as a roadmap, and build one slice of it

**Date:** August 13, 2026
**Status:** Decided

## Decision

The HomeSafe requirements document describes about seven separate products. We are
building one narrow path straight through the middle of it, and treating everything else
as later. The path we're building: **real city records on a timeline → a panel showing
why the agent remembered something → a consent gate that produces a shareable packet.**

## Why this came up

The requirements doc is 800 lines, 21 sections, 26 numbered requirements, and a
12-item submission checklist. It also has a version 1.1 addendum adding photo uploads
with AI-generated image descriptions — which is a second product with its own security
surface (virus scanning, stripping location data out of photos, time-limited access
links, validating what the image model is allowed to say).

Built as written, that's seven independently-buildable pieces: data loading for six
government datasets, the case/consent/audit core, semantic memory, the AI agent and its
tools, the resident web app, the reviewer console, and the whole photo path.

What was at stake: judges watch a video under three minutes long. Spreading two weeks
across seven half-finished subsystems produces a demo where nothing is convincing. The
failure mode isn't running out of time — it's arriving on time with seven things that
each *almost* work.

## Options

**A. Follow the document.** Build toward all 26 requirements and cut whatever doesn't
fit at the end. *Cost:* the cuts land in the final days, when they're panicked rather
than chosen, and they hit whatever happens to be least finished rather than what matters
least.

**B. Build one slice, deepen if time allows.** Pick the narrative the video needs, build
that end to end first, then add. *Cost:* some genuinely good features in the doc — the
photo evidence path especially — may never get built, even with two weeks available.

**C. Build the impressive-sounding parts.** Photo uploads and AI image description are
the flashiest features on paper. *Cost:* they're also the ones the doc's own priority
list puts last, and they don't demonstrate persistent memory at all — which is the one
thing this hackathon is actually about.

## What we chose and why

Option B. Joint call — Claude flagged that the doc was a roadmap rather than a
buildable spec; Tarik picked which three moments the demo has to land.

Two things settled it. First, the requirements doc already contains its own priority list
(section 14.2) naming five things to protect if time runs short, and its addendum puts
the photo path last. We're not overriding the document's judgment; we're following the
part of it people skip.

Second, and more useful: when asked which single moment in the video has to be
undeniable, Tarik picked three rather than one — the timeline, the memory panel, and the
consent gate. On inspection those aren't three competing headlines. They're a sequence:
*real records* → *visible memory* → *controlled handoff*. Each one only makes sense
because the one before it happened. That sequence is the slice, and it hands us the build
order for free: data first, memory second, consent third.

The moment Tarik *didn't* pick is worth recording. The cross-session return — resident
leaves, comes back, asks "what changed?" — isn't the punchline, but it can't be dropped,
because the memory panel's most convincing line is *why* it remembered something. With no
earlier session, there's no reason to show. So it stays in the build as setup.

## What we gave up

The photo upload path, AI-assisted image descriptions, and granular per-image sharing —
nine numbered requirements — are now explicitly "only if the core is done and hard."
Also parked: multilingual output, the aggregate program view for city staff, maps, and
scheduled live data refresh. Any of these could have been the thing a judge remembered.
We're betting they wouldn't have been.

We also accept that a reviewer reading the requirements doc alongside our submission
will see unbuilt requirements. The README has to name that honestly rather than hope
nobody checks.

## How we'll know if this was right

- **By roughly day four, the demo is submittable.** Not polished — submittable. If we
  hit day four with nothing recordable, the slice was still too wide and needs cutting
  again.
- **The three-minute video shows all three moments** without rushing any of them. If any
  one gets under ~40 seconds, we picked too many moments.
- **Every claim in the video points at a real record.** The doc sets this at 100% and
  it's the one target worth keeping literally.

## What actually happened

*(To be filled in by Tarik.)*
