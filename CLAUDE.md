# Clean Code Standards

All code produced in this project must follow these clean code principles. These are non-negotiable defaults — not suggestions.

## Naming

- Every variable, function, and class name must clearly communicate its purpose. No single-letter names, no abbreviations unless universally understood (e.g., `id`, `url`).
- Use `numberOfUsers` not `n`. Use `calculateShippingCost` not `calc`.

## Functions

- Each function does ONE thing (Single Responsibility Principle). If you can describe what a function does using "and," split it.
- Keep functions under 20 lines. If longer, extract helper functions.
- Prefer small, composable functions over large monolithic ones.

## Comments

- Code should be self-explanatory. Comments explain WHY, never WHAT or HOW.
- Bad: `// Loop through users` — Good: `// Retry failed users from the last sync batch`
- Delete comments that restate the code. Outdated comments are worse than no comments.

## Formatting & Consistency

- Use consistent indentation (2 or 4 spaces — pick one, never mix).
- Group related logic with blank lines. Separate concerns visually.
- Use Prettier/ESLint or equivalent formatter. Every file should look like the same person wrote it.

## No Hardcoded Values

- Extract magic numbers and strings into named constants or config.
- Bad: `if (users >= 100)` — Good: `if (users >= MAX_USERS)`

## Project Structure

- Organize by concern: `components/`, `services/`, `utils/`, `tests/`.
- Keep test files outside `src/` in a mirrored structure.
- Never dump everything in one directory.

## Error Handling

- Fail fast. Throw meaningful errors with clear messages.
- Use try/catch blocks. Never silently swallow errors.
- Log like you're documenting a crime scene: precise, relevant, minimal.

## Testing

- Write unit tests for every function with logic.
- Tests should be as clean as production code.
- Test edge cases, not just the happy path.

## Dependency Injection

- Pass dependencies as arguments rather than hardcoding them.
- This makes code testable and swappable.

## The Boy Scout Rule

- Leave every file cleaner than you found it.
- When touching existing code: rename unclear variables, extract messy functions, remove dead code.

## Open/Closed Principle

- Design for extension, not modification. Use polymorphism and composition.
- Adding a new feature should not require rewriting existing working code.

## Code Smells to Fix on Sight

- Duplicated logic → extract into a shared function
- God objects doing everything → split responsibilities
- Long parameter lists → use an options/config object
- Nested conditionals 3+ levels deep → extract or invert early returns

---

# Plain English — what the database and cloud pieces actually are

**Claude: keep this current.** When a new database, CockroachDB, or AWS concept enters this
project, add it here in plain English before or alongside the code that uses it. No jargon
defined with more jargon. Use this project's real examples. If a term appears in a commit
message or a decision doc, it belongs here.

## Databases, generally

**Table** — a spreadsheet. Named columns, one row per thing. `public_event` holds one row
per Boston public record.

**Row / record** — one line in that spreadsheet. One violation, one permit.

**Schema** — the shape of the tables: what columns exist, what type each holds, what's
required. Confusingly, "schema" *also* means a namespace that groups tables (ours is called
`public`, which has nothing to do with our public-vs-private data split — it's just
Postgres's default name and an unfortunate collision).

**Migration** — a numbered file of database changes, applied in order and recorded so it
never runs twice. `001_public_evidence.sql` creates our first three tables. Migrations are
how the database's shape stays reproducible instead of being whatever someone typed once.

**Index** — a lookup shortcut. Without one, finding all records at an address means reading
every row; with one, the database jumps straight there. Costs a little space and write speed,
saves enormous read time.

**Transaction** — a group of changes that either all happen or none do. Each migration runs
in one, so a file that fails halfway leaves the database untouched rather than half-changed.

**NOT NULL** — a column that cannot be left empty. `public_event.caveat` is NOT NULL, so a
public record physically cannot be stored without a sentence saying what it doesn't prove.
The rule enforces itself instead of relying on someone remembering.

**CHECK constraint** — a rule about allowed values. `event_category` only accepts our seven
categories; a typo is rejected at write time rather than discovered in the UI later.

**Foreign key** — a column pointing at another table's row, which the database keeps honest.
`public_event.address_entity_id` points to an address; the database won't let it point at an
address that doesn't exist.

**Cascade** — "when the parent goes, the children go." Deleting a case automatically deletes
its notes and memory, so a deleted case can't leave orphaned private data behind.

**Upsert** — "insert, or update if it's already there." Ours keys on
`(source_system, source_record_id)`, which is why re-running an ingest doesn't duplicate
anything.

**Idempotent** — running it twice gives the same result as running it once. Our ingests are
idempotent, so a crashed job is just re-run.

**Connection pool** — a small set of reusable open connections instead of opening a new one
per query. Opening a database connection is slow; reusing five is fast.

**Streaming** — reading a file a piece at a time instead of all at once. The permits CSV is
about 237 MB; loading it into memory would fail, so we pull rows through one at a time.

## Permissions — the part this project is really about

**Login (also "SQL user" / "role")** — an identity that connects to the database. We have
`app_rw` for case data, `evidence_ro` for public records.

**GRANT / REVOKE** — giving and taking away permission. `GRANT SELECT ON public_event TO
evidence_ro` means that login may read that table.

**SELECT / INSERT / UPDATE / DELETE** — read / add / change / remove. Granted separately,
which is how our audit log becomes append-only: `app_rw` gets SELECT and INSERT and
deliberately *not* UPDATE or DELETE. Nobody can rewrite history, including us.

**Superuser (`admin`)** — an identity that ignores permissions entirely. You cannot restrict
one; GRANT and REVOKE simply don't apply. Three logins on our cluster are admin: `root`,
`tarik`, and `managed-mcp`.

**Why "read-only" is not "private"** — the distinction this whole project turns on.
Read-only means *nothing can be changed or deleted.* It does **not** mean *can only look at
the right things.* It means: can look at anything, can break nothing. So a read-only AI that
can write its own queries can still be talked into reading a note it shouldn't — it just
can't delete it afterward. Which was never the worry.

**Our fix** — don't ask the AI to look only at the right rows; make the wrong rows invisible.
`evidence_ro` has permission on three tables and *no permission at all* on private notes. The
answer to an attack becomes "that table doesn't exist for you," not "please don't."

**The PUBLIC role trap** — CockroachDB gives every login some permissions by default, through
a built-in group called `PUBLIC`. Restricting a login without first revoking those defaults
silently accomplishes nothing. `REVOKE ALL ON SCHEMA public FROM public` comes first.

## Vectors and semantic memory

**Embedding** — a piece of text turned into a long list of numbers that encodes its meaning.
"Heat cutting out overnight" and "no heat in my apartment" produce similar number lists even
though they share almost no words.

**Vector** — that list of numbers. Ours are 1024 numbers long, because that's what Amazon's
Titan model returns — we measured it by calling the model rather than trusting a doc.

**Vector index** — a shortcut for "find the most similar meanings fast," the same way a normal
index speeds up "find this exact value."

**Semantic search** — searching by meaning instead of keywords. It's how the agent finds a
resident's earlier note about cold when they later say "the heat is still out."

**The rule that matters here** — filter by whose case it is *before* searching by similarity,
in the SQL itself. Search first and filter after, and for a moment you're holding another
resident's private note.

## CockroachDB specifically

**CockroachDB** — a database that speaks Postgres, so Postgres knowledge transfers directly.
Built to stay up across regions and failures.

**Cluster** — one running database installation. Ours is `drying-gerbil`, in AWS `us-east-2`.

**BASIC / serverless** — the free tier. Scales on demand, no server to manage.

**`ccloud`** — CockroachDB's command-line tool for the account side of things: create
clusters, create logins, manage permissions.

**Cloud role vs SQL role — two different permission systems, easy to confuse.** A *cloud*
role (like `CLUSTER_DEVELOPER`) controls what you can do to the cluster from outside: view it,
create logins, connect at all. A *SQL* role controls what you can do to tables once you're
inside. We hit this directly: `CLUSTER_DEVELOPER` allows zero SQL, while `CLUSTER_OPERATOR`
allows full read *and* write. There is nothing in between.

**MCP (Model Context Protocol)** — a standard letting an AI talk to an outside system.
CockroachDB hosts one: paste a config snippet and an AI can query your database.

**Why we only use MCP while building** — it connects as `managed-mcp`, which is an admin, so
it can't be restricted. Its responses also cap at 10 KB, which would silently cut off a
timeline mid-answer. Fine for me inspecting a schema; wrong for serving a resident. Full
reasoning in `docs/decisions/003-mcp-build-time-only.md`.

## AWS

**Region** — which datacentre. Bedrock for us is `us-east-1`; the database is in `us-east-2`.
Different regions add a few milliseconds, which is irrelevant against a 12-second budget.

**Bedrock** — AWS's service for renting AI models by the call, Claude among them. No servers,
no model hosting.

**Inference profile** — a routing alias in front of a model, spreading calls across regions.
It's why the model id that works is `us.anthropic.claude-sonnet-4-5-…` with a `us.` prefix,
and why an IAM policy allowing only foundation models would still be denied.

**Titan** — Amazon's own embedding model. We use `titan-embed-text-v2:0`, the source of the
1024 numbers.

**Amplify Hosting** — AWS's way of running a Next.js site. Roughly what Vercel does, on AWS.

**Lambda** — runs a function on demand with no server. Our ingestion job will live here.

**S3** — file storage. Raw source snapshots.

**IAM** — AWS's permission system.

**IAM user vs root** — `root` is the account owner and can do anything, permanently. An IAM
user is a scoped identity you can restrict and revoke. Same principle as `evidence_ro` versus
`admin`, one layer up.

**Policy** — the JSON document listing what an identity may do. Ours allows exactly: call
Bedrock models, read and write our S3 bucket. Nothing else.

**ARN** — Amazon's unique name for a thing, used in policies to say *which* bucket or model
rather than "any."

## Boston's data

**SAM ID (`SAM_ADDRESS_ID`)** — Boston's official number for a street address. `302 Sumner St`
is `132380`. It's the hub: violations and permits both carry it, so records join to addresses
through a real identifier instead of by comparing address text.

**Parcel ID** — the number for a piece of land, which may hold several addresses. Coarser than
a SAM ID, and the reason a record can be true of a *parcel* without being true of one
apartment.

**Address scope** — how precisely a record attaches: unit, address, building, parcel, nearby,
unknown. Shown in the UI on purpose, because a parcel-level record presented as
apartment-level is a lie by omission.

**Match confidence** — how sure we are the record belongs to that address. `high` for a shared
identifier, down to `ambiguous` when several addresses match equally well.

**CKAN** — the software behind data.boston.gov. Its API tells us today's download link, because
Boston renames files on refresh (the current one is literally `tmpwkewfc3d.csv`). Hard-coding
that name produces a pipeline that breaks silently next week.

**Why a permit never proves a repair** — a permit records that work was *authorized*. Not that
it happened, not that it worked, not that it fixed the resident's problem. A permit filed after
a heat complaint looks like a fix and isn't. Every permit in our database carries that sentence
as a required field.

<!-- HEROUI-REACT-AGENTS-MD-START -->
[HeroUI React v3 Docs Index]|root: ./.heroui-docs/react|STOP. What you remember about HeroUI React v3 is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: heroui agents-md --react --output CLAUDE.md|components/(buttons):{button-group.mdx,button.mdx,close-button.mdx,toggle-button-group.mdx,toggle-button.mdx}|components/(collections):{dropdown.mdx,list-box.mdx,tag-group.mdx}|components/(colors):{color-area.mdx,color-field.mdx,color-picker.mdx,color-slider.mdx,color-swatch-picker.mdx,color-swatch.mdx}|components/(controls):{slider.mdx,switch.mdx}|components/(data-display):{badge.mdx,chip.mdx,table.mdx}|components/(date-and-time):{calendar.mdx,date-field.mdx,date-picker.mdx,date-range-picker.mdx,range-calendar.mdx,time-field.mdx}|components/(feedback):{alert.mdx,meter.mdx,progress-bar.mdx,progress-circle.mdx,skeleton.mdx,spinner.mdx}|components/(forms):{checkbox-group.mdx,checkbox.mdx,description.mdx,error-message.mdx,field-error.mdx,fieldset.mdx,form.mdx,input-group.mdx,input-otp.mdx,input.mdx,label.mdx,number-field.mdx,radio-group.mdx,search-field.mdx,text-area.mdx,text-field.mdx}|components/(layout):{card.mdx,separator.mdx,surface.mdx,toolbar.mdx}|components/(media):{avatar.mdx}|components/(navigation):{accordion.mdx,breadcrumbs.mdx,disclosure-group.mdx,disclosure.mdx,link.mdx,pagination.mdx,tabs.mdx}|components/(overlays):{alert-dialog.mdx,drawer.mdx,modal.mdx,popover.mdx,toast.mdx,tooltip.mdx}|components/(pickers):{autocomplete.mdx,combo-box.mdx,select.mdx}|components/(typography):{kbd.mdx,typography.mdx}|components/(utilities):{scroll-shadow.mdx}|getting-started/(handbook):{animation.mdx,colors.mdx,composition.mdx,dark-mode.mdx,styling.mdx,theming.mdx}|getting-started/(overview):{cli.mdx,design-principles.mdx,frameworks.mdx,quick-start.mdx}|getting-started/(ui-for-agents):{agent-skills.mdx,agents-md.mdx,llms-txt.mdx,mcp-server.mdx}|releases:{v3-0-0-alpha-32.mdx,v3-0-0-alpha-33.mdx,v3-0-0-alpha-34.mdx,v3-0-0-alpha-35.mdx,v3-0-0-beta-1.mdx,v3-0-0-beta-2.mdx,v3-0-0-beta-3.mdx,v3-0-0-beta-4.mdx,v3-0-0-beta-6.mdx,v3-0-0-beta-7.mdx,v3-0-0-beta-8.mdx,v3-0-0-rc-1.mdx,v3-0-0.mdx,v3-0-2.mdx,v3-0-3.mdx,v3-0-4.mdx,v3-0-5.mdx,v3-1-0.mdx,v3-2-0.mdx,v3-2-1.mdx,v3-2-2.mdx,v3-2-3.mdx,v3-2-4.mdx}|demos/cn/accordion:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,disabled.tsx,faq.tsx,multiple.tsx,render-function.tsx,surface.tsx,without-separator.tsx}|demos/cn/alert-dialog:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-icon.tsx,custom-portal.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,sizes.tsx,statuses.tsx}|demos/cn/alert:{basic.tsx,custom-styles.tsx}|demos/cn/autocomplete:{allows-empty-collection.tsx,asynchronous-filtering.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default.tsx,disabled.tsx,email-recipients.tsx,full-width.tsx,location-search.tsx,multiple-select.tsx,on-surface.tsx,required.tsx,tag-group-selection.tsx,user-selection-multiple.tsx,user-selection.tsx,variants.tsx,virtualization.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/cn/avatar:{basic.tsx,colors.tsx,custom-image-component.tsx,custom-styles.tsx,fallback.tsx,group.tsx,sizes.tsx,variants.tsx}|demos/cn/badge:{basic.tsx,colors.tsx,custom-styles.tsx,dot.tsx,placements.tsx,sizes.tsx,variants.tsx,with-content.tsx}|demos/cn/breadcrumbs:{basic.tsx,custom-separator.tsx,custom-styles.tsx,disabled.tsx,level-2.tsx,level-3.tsx,render-function.tsx}|demos/cn/button-group:{basic.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,orientation.tsx,sizes.tsx,variants.tsx,with-icons.tsx,without-separator.tsx}|demos/cn/button:{basic.tsx,custom-styles.tsx,custom-variants.tsx,disabled.tsx,full-width.tsx,icon-only.tsx,loading-state.tsx,loading.tsx,release-outline-variant.tsx,render-function.tsx,ripple-effect.tsx,sizes.tsx,social.tsx,variants.tsx,with-icons.tsx}|demos/cn/calendar:{basic.tsx,booking-calendar.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,day-view.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,min-max-dates.tsx,multiple-months.tsx,multiple-selection.tsx,read-only.tsx,unavailable-dates.tsx,week-view.tsx,weeks-in-month.tsx,with-indicators.tsx,year-picker.tsx}|demos/cn/card:{custom-styles.tsx,default.tsx,horizontal.tsx,variants.tsx,with-avatar.tsx,with-form.tsx,with-images.tsx}|demos/cn/checkbox-group:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,features-and-addons.tsx,indeterminate.tsx,on-surface.tsx,render-function.tsx,validation.tsx,with-custom-indicator.tsx}|demos/cn/checkbox:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,external-label.tsx,form.tsx,full-rounded.tsx,indeterminate.tsx,invalid.tsx,render-function.tsx,render-props.tsx,variants.tsx,with-description.tsx}|demos/cn/chip:{basic.tsx,custom-styles.tsx,release-vibrant-palette.tsx,statuses.tsx,variants.tsx,with-icon.tsx}|demos/cn/close-button:{custom-styles.tsx,default.tsx,interactive.tsx,variants.tsx,with-custom-icon.tsx}|demos/cn/color-area:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,space-and-channels.tsx,with-dots.tsx}|demos/cn/color-field:{basic.tsx,channel-editing.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx}|demos/cn/color-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,with-fields.tsx,with-sliders.tsx,with-swatches.tsx}|demos/cn/color-slider:{alpha-channel.tsx,basic.tsx,channels.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,rgb-channels.tsx,vertical.tsx}|demos/cn/color-swatch-picker:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,default-value.tsx,disabled.tsx,render-function.tsx,sizes.tsx,stack-layout.tsx,variants.tsx}|demos/cn/color-swatch:{accessibility.tsx,basic.tsx,custom-styles.tsx,render-function.tsx,shapes.tsx,sizes.tsx,transparency.tsx}|demos/cn/combo-box:{allows-custom-value.tsx,asynchronous-loading.tsx,controlled-input-value.tsx,controlled.tsx,custom-filtering.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default-selected-key.tsx,default.tsx,disabled.tsx,full-width.tsx,menu-trigger.tsx,multiple-selection.tsx,on-surface.tsx,render-function.tsx,required.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/cn/date-field:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,granularity.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/cn/date-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,render-function.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/cn/date-range-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,release-input-container.tsx,render-function.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/cn/description:{basic.tsx,custom-styles.tsx}|demos/cn/disclosure-group:{basic.tsx,controlled.tsx,custom-styles.tsx}|demos/cn/disclosure:{basic.tsx,custom-styles.tsx,render-function.tsx}|demos/cn/drawer:{backdrop-variants.tsx,basic.tsx,controlled.tsx,custom-styles.tsx,navigation.tsx,non-dismissable.tsx,placements.tsx,scrollable-content.tsx,with-form.tsx}|demos/cn/dropdown:{controlled-open-state.tsx,controlled.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,long-press-trigger.tsx,single-with-custom-indicator.tsx,with-custom-submenu-indicator.tsx,with-descriptions.tsx,with-disabled-items.tsx,with-icons.tsx,with-keyboard-shortcuts.tsx,with-multiple-selection.tsx,with-section-level-selection.tsx,with-sections.tsx,with-single-selection.tsx,with-submenus.tsx}|demos/cn/error-message:{basic.tsx,custom-styles.tsx}|demos/cn/field-error:{basic.tsx,custom-styles.tsx}|demos/cn/fieldset:{basic.tsx,custom-styles.tsx,on-surface.tsx}|demos/cn/form:{basic.tsx,custom-styles.tsx,render-function.tsx}|demos/cn/input-group:{custom-styles.tsx,default.tsx,disabled.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,password-with-toggle.tsx,required.tsx,variants.tsx,with-badge-suffix.tsx,with-copy-suffix.tsx,with-icon-prefix-and-copy-suffix.tsx,with-icon-prefix-and-text-suffix.tsx,with-keyboard-shortcut.tsx,with-loading-suffix.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-text-prefix.tsx,with-text-suffix.tsx,with-textarea.tsx}|demos/cn/input-otp:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,four-digits.tsx,on-complete.tsx,on-surface.tsx,variants.tsx,with-pattern.tsx,with-validation.tsx}|demos/cn/input:{basic.tsx,controlled.tsx,custom-styles.tsx,full-width.tsx,on-surface.tsx,types.tsx,variants.tsx}|demos/cn/kbd:{basic.tsx,custom-styles.tsx,inline.tsx,instructional.tsx,navigation.tsx,special.tsx,variants.tsx}|demos/cn/label:{basic.tsx,custom-styles.tsx}|demos/cn/link:{basic.tsx,custom-icon.tsx,custom-styles.tsx,icon-placement.tsx,render-function.tsx,underline-and-offset.tsx,underline-offset.tsx,underline-variants.tsx}|demos/cn/list-box:{controlled.tsx,custom-check-icon.tsx,custom-styles.tsx,default.tsx,multi-select.tsx,release-scrollbar-modes.tsx,render-function.tsx,virtualization.tsx,with-disabled-items.tsx,with-sections.tsx}|demos/cn/meter:{basic.tsx,colors.tsx,custom-styles.tsx,custom-value.tsx,sizes.tsx,without-label.tsx}|demos/cn/modal:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-portal.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,scroll-comparison.tsx,sizes.tsx,with-form.tsx}|demos/cn/number-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,render-function.tsx,required.tsx,validation.tsx,variants.tsx,with-chevrons.tsx,with-description.tsx,with-format-options.tsx,with-step.tsx,with-validation.tsx}|demos/cn/pagination:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,simple-prev-next.tsx,sizes.tsx,with-ellipsis.tsx,with-summary.tsx}|demos/cn/popover:{basic.tsx,custom-styles.tsx,interactive.tsx,placement.tsx,render-function.tsx,with-arrow.tsx}|demos/cn/progress-bar:{basic.tsx,colors.tsx,custom-styles.tsx,custom-value.tsx,indeterminate.tsx,sizes.tsx,without-label.tsx}|demos/cn/progress-circle:{basic.tsx,colors.tsx,custom-styles.tsx,custom-svg.tsx,indeterminate.tsx,sizes.tsx,with-label.tsx}|demos/cn/radio-group:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,delivery-and-payment.tsx,disabled.tsx,horizontal.tsx,on-surface.tsx,render-function.tsx,uncontrolled.tsx,validation.tsx,variants.tsx}|demos/cn/range-calendar:{allows-non-contiguous-ranges.tsx,anchor-unavailable-dates.tsx,basic.tsx,booking-calendar.tsx,controlled.tsx,custom-styles.tsx,day-view.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,invalid.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,unavailable-dates.tsx,week-view.tsx,weeks-in-month.tsx,with-indicators.tsx,year-picker.tsx}|demos/cn/scroll-shadow:{custom-styles.tsx,default.tsx,hide-scroll-bar.tsx,orientation.tsx,size.tsx,visibility-change.tsx,with-card.tsx}|demos/cn/search-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,render-function.tsx,required.tsx,validation.tsx,variants.tsx,with-description.tsx,with-keyboard-shortcut.tsx,with-validation.tsx}|demos/cn/select:{asynchronous-loading.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default.tsx,disabled.tsx,full-width.tsx,multiple-select.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/cn/separator:{basic.tsx,custom-styles.tsx,render-function.tsx,variants.tsx,vertical.tsx,with-content.tsx,with-surface.tsx}|demos/cn/skeleton:{animation-types.tsx,basic.tsx,card.tsx,custom-styles.tsx,grid.tsx,list.tsx,single-shimmer.tsx,text-content.tsx,user-profile.tsx}|demos/cn/slider:{custom-styles.tsx,default.tsx,disabled.tsx,range.tsx,render-function.tsx,vertical.tsx}|demos/cn/spinner:{basic.tsx,colors.tsx,custom-styles.tsx,sizes.tsx,speed.tsx}|demos/cn/surface:{basic.tsx,custom-styles.tsx,variants.tsx,with-form-components.tsx}|demos/cn/switch:{basic.tsx,controlled.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,group-horizontal.tsx,group.tsx,label-position.tsx,render-function.tsx,render-props.tsx,sizes.tsx,with-description.tsx,with-icons.tsx,without-label.tsx}|demos/cn/table:{async-loading.tsx,basic.tsx,column-resizing.tsx,custom-cells.tsx,custom-styles.tsx,empty-state.tsx,expandable-rows.tsx,pagination.tsx,secondary-variant.tsx,selection.tsx,sorting.tsx,tanstack-table.tsx,virtualization.tsx}|demos/cn/tabs:{basic.tsx,custom-styles.tsx,disabled.tsx,overflow.tsx,render-function.tsx,secondary-vertical.tsx,secondary.tsx,vertical.tsx,with-separator.tsx}|demos/cn/tag-group:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,selection-modes.tsx,sizes.tsx,variants.tsx,with-error-message.tsx,with-list-data.tsx,with-prefix.tsx,with-remove-button.tsx}|demos/cn/textarea:{basic.tsx,controlled.tsx,custom-styles.tsx,full-width.tsx,on-surface.tsx,rows.tsx,variants.tsx}|demos/cn/textfield:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,input-types.tsx,on-surface.tsx,render-function.tsx,required.tsx,textarea.tsx,validation.tsx,with-description.tsx,with-error.tsx}|demos/cn/time-field:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/cn/toast:{callbacks.tsx,custom-indicator.tsx,custom-queue.tsx,custom-styles.tsx,custom-toast.tsx,default.tsx,placements.tsx,promise.tsx,simple.tsx,variants.tsx}|demos/cn/toggle-button-group:{attached.tsx,basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,orientation.tsx,selection-mode.tsx,sizes.tsx,without-separator.tsx}|demos/cn/toggle-button:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,icon-only.tsx,sizes.tsx,variants.tsx}|demos/cn/toolbar:{attached.tsx,basic.tsx,custom-styles.tsx,vertical.tsx,with-button-group.tsx}|demos/cn/tooltip:{basic.tsx,custom-styles.tsx,custom-trigger.tsx,placement.tsx,render-function.tsx,with-arrow.tsx}|demos/cn/typography:{custom-styles.tsx,default.tsx,primitives.tsx,prose.tsx,render-props.tsx,typography-scale.tsx}|demos/en/accordion:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,disabled.tsx,faq.tsx,multiple.tsx,render-function.tsx,surface.tsx,without-separator.tsx}|demos/en/alert-dialog:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-icon.tsx,custom-portal.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,sizes.tsx,statuses.tsx}|demos/en/alert:{basic.tsx,custom-styles.tsx}|demos/en/autocomplete:{allows-empty-collection.tsx,asynchronous-filtering.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default.tsx,disabled.tsx,email-recipients.tsx,full-width.tsx,location-search.tsx,multiple-select.tsx,on-surface.tsx,required.tsx,tag-group-selection.tsx,user-selection-multiple.tsx,user-selection.tsx,variants.tsx,virtualization.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/en/avatar:{basic.tsx,colors.tsx,custom-image-component.tsx,custom-styles.tsx,fallback.tsx,group.tsx,sizes.tsx,variants.tsx}|demos/en/badge:{basic.tsx,colors.tsx,custom-styles.tsx,dot.tsx,placements.tsx,sizes.tsx,variants.tsx,with-content.tsx}|demos/en/breadcrumbs:{basic.tsx,custom-separator.tsx,custom-styles.tsx,disabled.tsx,level-2.tsx,level-3.tsx,render-function.tsx}|demos/en/button-group:{basic.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,orientation.tsx,sizes.tsx,variants.tsx,with-icons.tsx,without-separator.tsx}|demos/en/button:{basic.tsx,custom-styles.tsx,custom-variants.tsx,disabled.tsx,full-width.tsx,icon-only.tsx,loading-state.tsx,loading.tsx,release-outline-variant.tsx,render-function.tsx,ripple-effect.tsx,sizes.tsx,social.tsx,variants.tsx,with-icons.tsx}|demos/en/calendar:{basic.tsx,booking-calendar.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,day-view.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,min-max-dates.tsx,multiple-months.tsx,multiple-selection.tsx,read-only.tsx,unavailable-dates.tsx,week-view.tsx,weeks-in-month.tsx,with-indicators.tsx,year-picker.tsx}|demos/en/card:{custom-styles.tsx,default.tsx,horizontal.tsx,variants.tsx,with-avatar.tsx,with-form.tsx,with-images.tsx}|demos/en/checkbox-group:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,features-and-addons.tsx,indeterminate.tsx,on-surface.tsx,render-function.tsx,validation.tsx,with-custom-indicator.tsx}|demos/en/checkbox:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,external-label.tsx,form.tsx,full-rounded.tsx,indeterminate.tsx,invalid.tsx,render-function.tsx,render-props.tsx,variants.tsx,with-description.tsx}|demos/en/chip:{basic.tsx,custom-styles.tsx,release-vibrant-palette.tsx,statuses.tsx,variants.tsx,with-icon.tsx}|demos/en/close-button:{custom-styles.tsx,default.tsx,interactive.tsx,with-custom-icon.tsx}|demos/en/color-area:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,space-and-channels.tsx,with-dots.tsx}|demos/en/color-field:{basic.tsx,channel-editing.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx}|demos/en/color-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,with-fields.tsx,with-sliders.tsx,with-swatches.tsx}|demos/en/color-slider:{alpha-channel.tsx,basic.tsx,channels.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,rgb-channels.tsx,vertical.tsx}|demos/en/color-swatch-picker:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,default-value.tsx,disabled.tsx,render-function.tsx,sizes.tsx,stack-layout.tsx,variants.tsx}|demos/en/color-swatch:{accessibility.tsx,basic.tsx,custom-styles.tsx,render-function.tsx,shapes.tsx,sizes.tsx,transparency.tsx}|demos/en/combo-box:{allows-custom-value.tsx,asynchronous-loading.tsx,controlled-input-value.tsx,controlled.tsx,custom-filtering.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default-selected-key.tsx,default.tsx,disabled.tsx,full-width.tsx,menu-trigger.tsx,multiple-selection.tsx,on-surface.tsx,render-function.tsx,required.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/en/date-field:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,granularity.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/en/date-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,render-function.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/en/date-range-picker:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,release-input-container.tsx,render-function.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/en/description:{basic.tsx,custom-styles.tsx}|demos/en/disclosure-group:{basic.tsx,controlled.tsx,custom-styles.tsx}|demos/en/disclosure:{basic.tsx,custom-styles.tsx,render-function.tsx}|demos/en/drawer:{backdrop-variants.tsx,basic.tsx,controlled.tsx,custom-styles.tsx,navigation.tsx,non-dismissable.tsx,placements.tsx,scrollable-content.tsx,with-form.tsx}|demos/en/dropdown:{controlled-open-state.tsx,controlled.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,long-press-trigger.tsx,single-with-custom-indicator.tsx,with-custom-submenu-indicator.tsx,with-descriptions.tsx,with-disabled-items.tsx,with-icons.tsx,with-keyboard-shortcuts.tsx,with-multiple-selection.tsx,with-section-level-selection.tsx,with-sections.tsx,with-single-selection.tsx,with-submenus.tsx}|demos/en/error-message:{basic.tsx,custom-styles.tsx}|demos/en/field-error:{basic.tsx,custom-styles.tsx}|demos/en/fieldset:{basic.tsx,custom-styles.tsx,on-surface.tsx}|demos/en/form:{basic.tsx,custom-styles.tsx,render-function.tsx}|demos/en/input-group:{custom-styles.tsx,default.tsx,disabled.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,password-with-toggle.tsx,required.tsx,variants.tsx,with-badge-suffix.tsx,with-copy-suffix.tsx,with-icon-prefix-and-copy-suffix.tsx,with-icon-prefix-and-text-suffix.tsx,with-keyboard-shortcut.tsx,with-loading-suffix.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-text-prefix.tsx,with-text-suffix.tsx,with-textarea.tsx}|demos/en/input-otp:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,four-digits.tsx,on-complete.tsx,on-surface.tsx,variants.tsx,with-pattern.tsx,with-validation.tsx}|demos/en/input:{basic.tsx,controlled.tsx,custom-styles.tsx,full-width.tsx,on-surface.tsx,types.tsx,variants.tsx}|demos/en/kbd:{basic.tsx,custom-styles.tsx,inline.tsx,instructional.tsx,navigation.tsx,special.tsx,variants.tsx}|demos/en/label:{basic.tsx,custom-styles.tsx}|demos/en/link:{basic.tsx,custom-icon.tsx,custom-styles.tsx,icon-placement.tsx,render-function.tsx,underline-and-offset.tsx}|demos/en/list-box:{controlled.tsx,custom-check-icon.tsx,custom-styles.tsx,default.tsx,multi-select.tsx,release-scrollbar-modes.tsx,render-function.tsx,virtualization.tsx,with-disabled-items.tsx,with-sections.tsx}|demos/en/meter:{basic.tsx,colors.tsx,custom-styles.tsx,custom-value.tsx,sizes.tsx,without-label.tsx}|demos/en/modal:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-portal.tsx,custom-styles.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,scroll-comparison.tsx,sizes.tsx,with-form.tsx}|demos/en/number-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,render-function.tsx,required.tsx,validation.tsx,variants.tsx,with-chevrons.tsx,with-description.tsx,with-format-options.tsx,with-step.tsx,with-validation.tsx}|demos/en/pagination:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,simple-prev-next.tsx,sizes.tsx,with-ellipsis.tsx,with-summary.tsx}|demos/en/popover:{basic.tsx,custom-styles.tsx,interactive.tsx,placement.tsx,render-function.tsx,with-arrow.tsx}|demos/en/progress-bar:{basic.tsx,colors.tsx,custom-styles.tsx,custom-value.tsx,indeterminate.tsx,sizes.tsx,without-label.tsx}|demos/en/progress-circle:{basic.tsx,colors.tsx,custom-styles.tsx,custom-svg.tsx,indeterminate.tsx,sizes.tsx,with-label.tsx}|demos/en/radio-group:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,delivery-and-payment.tsx,disabled.tsx,horizontal.tsx,on-surface.tsx,render-function.tsx,uncontrolled.tsx,validation.tsx,variants.tsx}|demos/en/range-calendar:{allows-non-contiguous-ranges.tsx,anchor-unavailable-dates.tsx,basic.tsx,booking-calendar.tsx,controlled.tsx,custom-styles.tsx,day-view.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,invalid.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,unavailable-dates.tsx,week-view.tsx,weeks-in-month.tsx,with-indicators.tsx,year-picker.tsx}|demos/en/scroll-shadow:{custom-styles.tsx,default.tsx,hide-scroll-bar.tsx,orientation.tsx,size.tsx,visibility-change.tsx,with-card.tsx}|demos/en/search-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,render-function.tsx,required.tsx,validation.tsx,variants.tsx,with-description.tsx,with-keyboard-shortcut.tsx,with-validation.tsx}|demos/en/select:{asynchronous-loading.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-styles.tsx,custom-value.tsx,default.tsx,disabled.tsx,full-width.tsx,multiple-select.tsx,on-surface.tsx,render-function.tsx,required.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/en/separator:{basic.tsx,custom-styles.tsx,render-function.tsx,variants.tsx,vertical.tsx,with-content.tsx,with-surface.tsx}|demos/en/skeleton:{animation-types.tsx,basic.tsx,custom-styles.tsx,grid.tsx,list.tsx,single-shimmer.tsx,text-content.tsx,user-profile.tsx}|demos/en/slider:{custom-styles.tsx,default.tsx,disabled.tsx,range.tsx,render-function.tsx,vertical.tsx}|demos/en/spinner:{basic.tsx,colors.tsx,custom-styles.tsx,sizes.tsx,speed.tsx}|demos/en/surface:{basic.tsx,custom-styles.tsx,variants.tsx,with-form-components.tsx}|demos/en/switch:{basic.tsx,controlled.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,group-horizontal.tsx,group.tsx,label-position.tsx,render-function.tsx,render-props.tsx,sizes.tsx,with-description.tsx,with-icons.tsx,without-label.tsx}|demos/en/table:{async-loading.tsx,basic.tsx,column-resizing.tsx,custom-cells.tsx,custom-styles.tsx,empty-state.tsx,expandable-rows.tsx,pagination.tsx,secondary-variant.tsx,selection.tsx,sorting.tsx,tanstack-table.tsx,virtualization.tsx}|demos/en/tabs:{basic.tsx,custom-styles.tsx,disabled.tsx,overflow.tsx,render-function.tsx,secondary-vertical.tsx,secondary.tsx,vertical.tsx,with-separator.tsx}|demos/en/tag-group:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,render-function.tsx,selection-modes.tsx,sizes.tsx,variants.tsx,with-error-message.tsx,with-list-data.tsx,with-prefix.tsx,with-remove-button.tsx}|demos/en/textarea:{basic.tsx,controlled.tsx,custom-styles.tsx,full-width.tsx,on-surface.tsx,rows.tsx,variants.tsx}|demos/en/textfield:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,input-types.tsx,on-surface.tsx,render-function.tsx,required.tsx,textarea.tsx,validation.tsx,with-description.tsx,with-error.tsx}|demos/en/time-field:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,render-function.tsx,required.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/en/toast:{callbacks.tsx,custom-indicator.tsx,custom-queue.tsx,custom-styles.tsx,custom-toast.tsx,default.tsx,placements.tsx,promise.tsx,simple.tsx,variants.tsx}|demos/en/toggle-button-group:{attached.tsx,basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,full-width.tsx,orientation.tsx,selection-mode.tsx,sizes.tsx,without-separator.tsx}|demos/en/toggle-button:{basic.tsx,controlled.tsx,custom-styles.tsx,disabled.tsx,icon-only.tsx,sizes.tsx,variants.tsx}|demos/en/toolbar:{attached.tsx,basic.tsx,custom-styles.tsx,vertical.tsx,with-button-group.tsx}|demos/en/tooltip:{basic.tsx,custom-styles.tsx,custom-trigger.tsx,placement.tsx,render-function.tsx,with-arrow.tsx}|demos/en/typography:{custom-styles.tsx,default.tsx,primitives.tsx,prose.tsx,render-props.tsx,typography-scale.tsx}
<!-- HEROUI-REACT-AGENTS-MD-END -->
