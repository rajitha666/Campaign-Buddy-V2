# Marketing claims ledger

Every statement our sales material makes is backed by something that ships. This file is the proof. It is maintained by the **Marketing writer** (`.claude/agents/marketing-writer.md`) and checked by the **Product Owner**; the owner can edit anything.

## Rules (owner decision 2026-10-25: strict)
1. **No claim without a shipped feature and evidence** (a doc section and, where one exists, a test). Evidence points at files: `docs/product-documentation.md#…`, `campaign-buddy-backend/test/…`, `campaign-buddy-portal/e2e/…`.
2. **No "coming soon" claims.** Roadmap items are not marketed. If a page already says something that isn't true yet, mark it `contradicted` and fix the page.
3. **Numbers** (counts, frequencies, limits) must come from the code, docs or a measurement; cite it or remove the number.
4. When a change alters or removes a feature, look up the claims it touches (`node scripts/agent/claim-impact.mjs <keywords>`), update or retire them in the same pass, and list them in your verdict.
5. Contact details and pricing are supplied by the owner; never invent them.

## Status key
`verified` — evidence recorded and checked on the date shown · `unverified` — listed but not yet checked against the product · `contradicted` — the product does not (or no longer does) what the page says: fix the page · `retired?` — the section no longer exists on the page; confirm and delete the row.

## How this ledger is kept
Rows are **sections** of the marketing pages (the capability brief, the landing page, the store listing), one row per h2/h3 heading, with the line range where it appears. `node scripts/agent/claims-seed.mjs` shows what changed since the last sync and `--write` updates the table **without losing recorded status or evidence** (new headings arrive as `unverified`, vanished ones as `retired?`). Verifying a row means reading that section, listing the individual statements in it that need proof, and filling in *Evidence* and *Last checked* (add sub-claims as extra lines in the Evidence cell: `statement → proof`).

First pass (2026-10-25): all rows seeded from the headings and **unverified** — no claim has been checked yet. Priority order for verification: pricing, anything with numbers, tracking and location, offline behaviour, AI/agent features, security and data-handling statements.

<!-- ledger:start -->
| ID | Topic (section heading) | Where | Status | Evidence (feature · doc · test) | Last checked |
|---|---|---|---|---|---|
| brief:what-it-replaces-and-what-it-adds | What it replaces, and what it adds. | marketing/capability-brief.html:332-372 | unverified |  |  |
| brief:the-two-products | The two products | marketing/capability-brief.html:335-343 | unverified |  |  |
| brief:the-four-people-who-log-in | The four people who log in | marketing/capability-brief.html:344-351 | unverified |  |  |
| brief:what-you-have-on-day-one | What you have on day one | marketing/capability-brief.html:352-372 | unverified |  |  |
| brief:cb-office-the-operations-portal | CB Office: the operations portal. | marketing/capability-brief.html:373-401 | unverified |  |  |
| brief:cb-mobile-the-field-app | CB Mobile: the field app. | marketing/capability-brief.html:402-429 | unverified |  |  |
| brief:who-sees-what-and-why-the-numbers-hold | Who sees what, and why the numbers hold. | marketing/capability-brief.html:430-463 | unverified |  |  |
| brief:load-bearing-behaviour | Load-bearing behaviour | marketing/capability-brief.html:444-463 | unverified |  |  |
| brief:every-shift-produces-structured-dated-geo-tagged-records | Every shift produces structured, dated, geo-tagged records. | marketing/capability-brief.html:464-491 | unverified | NUMBER CLAIM: "GPS roughly every 60 seconds" changes with PR #104 (uploads on movement, 5-min heartbeat when still). Re-verify after #104 merges. |  |
| brief:reporting-outputs | Reporting outputs | marketing/capability-brief.html:474-491 | unverified |  |  |
| brief:which-outlets-didn-t-open | Which outlets didn't open? | marketing/capability-brief.html:492-533 | unverified |  |  |
| brief:the-sales-spike-that-wasn-t | The sales spike that wasn't. | marketing/capability-brief.html:534-574 | unverified |  |  |
| brief:last-week-s-numbers-without-the-email | Last week's numbers, without the email. | marketing/capability-brief.html:575-614 | unverified |  |  |
| brief:what-changes-by-who-s-asking | What changes, by who's asking. | marketing/capability-brief.html:615-653 | unverified |  |  |
| brief:operations-in-one-system | Operations, in one system | marketing/capability-brief.html:619-629 | unverified |  |  |
| brief:their-campaign-in-the-open | Their campaign, in the open | marketing/capability-brief.html:630-640 | unverified |  |  |
| brief:where-campaign-buddy-is-going | Where Campaign Buddy is going | marketing/capability-brief.html:641-653 | unverified | FLAG rule 2: roadmap wording ("Directional"). MCP server + approval client merged (PR #78); unattended AI monitoring is not live (needs secrets, #100). Reword to shipped behaviour or remove. |  |
| brief:ask-your-campaign-anything | Ask your campaign anything. | marketing/capability-brief.html:654-702 | unverified | CHECK: MCP read tools (20) + two-step write tools (8) merged in PR #78; live-API agent run unverified (#100). Verify each statement against campaign-buddy-mcp/README.md and tests. |  |
| brief:let-it-set-things-up-and-keep-watch | Let it set things up, and keep watch. | marketing/capability-brief.html:703-774 | unverified | CHECK/rule 2: "keep watch" implies unattended agents; sync/triage workflows need secrets (#100). Verify what is shipped vs described. |  |
| brief:agents-on-shift | Agents on shift | marketing/capability-brief.html:750-774 | unverified | CHECK/rule 2: same as above; verify "same permissions as CB Office" against MCP auth tests. |  |
| brief:how-it-s-priced | How it's priced. | marketing/capability-brief.html:775-794 | unverified | PRIORITY: pricing is owner-supplied; verify against docs/license-usage-spec.md and the owner. |  |
| brief:run-one-campaign-on-it | Run one campaign on it. | marketing/capability-brief.html:795-827 | unverified |  |  |
| landing:how-it-runs-today | How it runs today | marketing/landing-site/index.html:634-642 | unverified |  |  |
| landing:how-it-runs-on-campaign-buddy | How it runs on Campaign Buddy | marketing/landing-site/index.html:643-657 | unverified |  |  |
| landing:the-field-and-the-office-always-in-sync | The field and the office, always in sync. | marketing/landing-site/index.html:658-759 | unverified |  |  |
| landing:what-the-promoter-carries | What the promoter carries | marketing/landing-site/index.html:665-718 | unverified |  |  |
| landing:what-head-office-runs | What head office runs | marketing/landing-site/index.html:719-759 | unverified |  |  |
| landing:every-stage-of-the-campaign-in-one-place | Every stage of the campaign, in one place. | marketing/landing-site/index.html:760-988 | unverified |  |  |
| landing:build-the-campaign | Build the campaign | marketing/landing-site/index.html:767-808 | unverified |  |  |
| landing:staff-the-outlets | Staff the outlets | marketing/landing-site/index.html:809-843 | unverified |  |  |
| landing:the-promoter-s-day | The promoter's day | marketing/landing-site/index.html:844-877 | unverified |  |  |
| landing:see-the-campaign-as-it-happens | See the campaign as it happens | marketing/landing-site/index.html:878-949 | unverified |  |  |
| landing:turn-the-shift-data-into-the-report | Turn the shift data into the report | marketing/landing-site/index.html:950-988 | unverified |  |  |
| landing:the-things-a-spreadsheet-never-captured | The things a spreadsheet never captured. | marketing/landing-site/index.html:989-1004 | unverified |  |  |
| landing:other-interested-customers | Other interested customers | marketing/landing-site/index.html:993-993 | unverified |  |  |
| landing:your-own-fields | Your own fields | marketing/landing-site/index.html:994-994 | unverified |  |  |
| landing:re-order-flags | Re-order flags | marketing/landing-site/index.html:995-995 | unverified |  |  |
| landing:location-trail | Location trail | marketing/landing-site/index.html:996-1004 | unverified |  |  |
| landing:a-window-into-the-campaign-not-a-weekly-deck | A window into the campaign, not a weekly deck. | marketing/landing-site/index.html:1005-1047 | unverified |  |  |
| landing:keep-the-field-honest-and-keep-promoters-informed | Keep the field honest, and keep promoters informed. | marketing/landing-site/index.html:1048-1065 | unverified |  |  |
| landing:one-open-shift-at-a-time | One open shift at a time | marketing/landing-site/index.html:1052-1052 | unverified |  |  |
| landing:on-time-versus-late | On time versus late | marketing/landing-site/index.html:1053-1053 | unverified |  |  |
| landing:leave-requested-from-the-shift | Leave, requested from the shift | marketing/landing-site/index.html:1054-1054 | unverified |  |  |
| landing:supervisor-routes-and-qa | Supervisor routes and QA | marketing/landing-site/index.html:1055-1055 | unverified |  |  |
| landing:performance-per-promoter | Performance per promoter | marketing/landing-site/index.html:1056-1056 | unverified |  |  |
| landing:location-checks-flag-never-block | Location checks flag, never block | marketing/landing-site/index.html:1057-1065 | unverified |  |  |
| landing:ask-your-campaign-anything-or-let-ai-run-the-rounds | Ask your campaign anything. Or let AI run the rounds. | marketing/landing-site/index.html:1066-1230 | unverified | CHECK: as brief:ask-your-campaign-anything. |  |
| landing:direct | Direct | marketing/landing-site/index.html:1220-1220 | unverified |  |  |
| landing:delegate | Delegate | marketing/landing-site/index.html:1221-1230 | unverified |  |  |
| landing:a-team-member-that-never-misses-the-morning-check | A team member that never misses the morning check. | marketing/landing-site/index.html:1231-1265 | unverified | CHECK/rule 2: implies unattended daily monitoring; not live until agent secrets are set (#100). |  |
| landing:shaped-by-real-activations-not-generic-field-service-softwar | Shaped by real activations, not generic field-service software. | marketing/landing-site/index.html:1266-1280 | unverified |  |  |
| landing:modern-where-it-helps-boring-where-it-counts | Modern where it helps. Boring where it counts. | marketing/landing-site/index.html:1281-1310 | unverified |  |  |
| landing:run-one-live-campaign-on-campaign-buddy | Run one live campaign on Campaign Buddy. | marketing/landing-site/index.html:1311-1519 | unverified |  |  |
| store:1-decisions-to-lock-before-anything-is-submitted | 1. Decisions to lock before anything is submitted | marketing/app-store-listing.md:16-32 | unverified |  |  |
| store:2-shared-app-facts-used-by-both-stores | 2. Shared app facts (used by both stores) | marketing/app-store-listing.md:33-55 | unverified |  |  |
| store:3-full-description-both-stores-plain-text-under-4000-chars | 3. Full description (both stores, plain text, under 4000 chars) | marketing/app-store-listing.md:56-89 | unverified |  |  |
| store:4-apple-app-store-connect-field-by-field | 4. Apple App Store Connect, field by field | marketing/app-store-listing.md:90-155 | unverified |  |  |
| store:4-1-apple-app-privacy-answers | 4.1 Apple App Privacy answers | marketing/app-store-listing.md:114-134 | unverified |  |  |
| store:4-2-apple-review-notes-app-review-information-notes | 4.2 Apple review notes (App Review Information > Notes) | marketing/app-store-listing.md:135-155 | unverified |  |  |
| store:5-google-play-console-field-by-field | 5. Google Play Console, field by field | marketing/app-store-listing.md:156-224 | unverified |  |  |
| store:5-1-google-play-data-safety-form | 5.1 Google Play Data safety form | marketing/app-store-listing.md:181-207 | unverified |  |  |
| store:5-2-iarc-content-rating-questionnaire | 5.2 IARC content rating questionnaire | marketing/app-store-listing.md:208-224 | unverified |  |  |
| store:6-account-setup-before-you-can-submit | 6. Account setup, before you can submit | marketing/app-store-listing.md:225-258 | unverified |  |  |
| store:6-1-apple-developer-program | 6.1 Apple Developer Program | marketing/app-store-listing.md:227-237 | unverified |  |  |
| store:6-2-google-play-console | 6.2 Google Play Console | marketing/app-store-listing.md:238-248 | unverified |  |  |
| store:6-3-what-both-accounts-need-from-you | 6.3 What both accounts need from you | marketing/app-store-listing.md:249-258 | unverified |  |  |
| store:7-known-review-risks-and-how-this-listing-handles-them | 7. Known review risks and how this listing handles them | marketing/app-store-listing.md:259-270 | unverified |  |  |
| store:8-ready-to-paste-summary-block | 8. Ready-to-paste summary block | marketing/app-store-listing.md:271-291 | unverified |  |  |
| store:9-status-of-the-other-pieces | 9. Status of the other pieces | marketing/app-store-listing.md:292-318 | unverified |  |  |
<!-- ledger:end -->
