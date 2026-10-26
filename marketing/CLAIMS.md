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
| brief:every-shift-produces-structured-dated-geo-tagged-records | Every shift produces structured, dated, geo-tagged records. | marketing/capability-brief.html:464-491 | verified | "GPS position roughly every 60 seconds while checked in and the app is open" → product-documentation.md Tracking Ping (~60 s, foreground only, skipped if moved <10 m, 60 s heartbeat still fires); correct on main, re-check when PR #104 merges ; "attendance, sales, daily stats, sales summary records created automatically" and "custom sales fields", "leave requests with approver" → product-documentation.md data model + mobile check-in/out sections (read with doc-section; not individually test-checked in this pass) ; "Remaining is always opening minus sold, never stored" → product-documentation.md sales record rule | 2026-10-25 |
| brief:reporting-outputs | Reporting outputs | marketing/capability-brief.html:474-491 | unverified |  |  |
| brief:which-outlets-didn-t-open | Which outlets didn't open? | marketing/capability-brief.html:492-533 | unverified |  |  |
| brief:the-sales-spike-that-wasn-t | The sales spike that wasn't. | marketing/capability-brief.html:534-574 | unverified |  |  |
| brief:last-week-s-numbers-without-the-email | Last week's numbers, without the email. | marketing/capability-brief.html:575-614 | unverified |  |  |
| brief:what-changes-by-who-s-asking | What changes, by who's asking. | marketing/capability-brief.html:615-653 | unverified |  |  |
| brief:operations-in-one-system | Operations, in one system | marketing/capability-brief.html:619-629 | unverified |  |  |
| brief:their-campaign-in-the-open | Their campaign, in the open | marketing/capability-brief.html:630-640 | unverified |  |  |
| brief:where-campaign-buddy-is-going | Where Campaign Buddy is going | marketing/capability-brief.html:641-653 | contradicted | "Directional" / "where Campaign Buddy is going" → rule 2 roadmap framing ; "hand daily monitoring to AI agents" → not shipped: README Known gaps lists scheduled briefings and anomaly alerts as roadmap, triage/sync/PO bots not live (#100) ; "ask questions of live campaigns, set up and adjust work" → shipped as MCP server + approval client (campaign-buddy-mcp/README.md Tools, test/server.test.ts, test/agent.test.ts). FIX: retitle, drop "Directional" and the agents clause, describe MCP connection as shipped | 2026-10-25 |
| brief:ask-your-campaign-anything | Ask your campaign anything. | marketing/capability-brief.html:654-702 | contradicted | "connect the AI assistant they already use to live campaigns" → MCP host support, README Quick start, 20 read tools (server.test.ts) ; "ask questions, follow ups" → shipped ; "you see the plan first, nothing changes until you approve" → README two-step writes + human approval, src/confirm.ts, test/agent.test.ts ; "Move Sunday cover" → update_activation exists ; "Delegate: hand daily rounds to AI agents that review, monitor and flag" and "Watch attendance and sales pace every morning" → NOT shipped (README Known gaps: scheduled briefings and anomaly alerts are roadmap) ; chat figures (24 outlets, LKR 1.94M, 312 remarks, 64 mentions) → illustrative sample, labelled as such; "anomaly detection" is only the model reasoning over read tools, no product feature ; "AI native from the ground up" → puffery, unsupported (add-on server over /admin/v1). FIX: remove Delegate card/clause and "Directional"; keep illustrative label; live Claude API run still untested (README) | 2026-10-25 |
| brief:let-it-set-things-up-and-keep-watch | Let it set things up, and keep watch. | marketing/capability-brief.html:703-774 | contradicted | "plan and approve new work" → create_activation/assign tools with two-step approval (README Tools, server.test.ts) ; "Ask Ishara to verify" → create_supervisor_task exists ; "Each weekend morning I will check attendance and sales pace and message you" and "hand monitoring to agents that flag anything unusual" → NOT shipped: no scheduler or messaging in campaign-buddy-mcp; scheduled briefings and anomaly alerts are README roadmap ; "Created the activation and assigned the shifts" (activation + supervisor route) → partially: create_activation + assign_supervisor_route, but promoter shift assignment/availability/leave check not verified. FIX: remove "keep an eye on it" turn and "keep watch/monitoring to agents" lead; retitle | 2026-10-25 |
| brief:agents-on-shift | Agents on shift | marketing/capability-brief.html:750-774 | contradicted | Agent table (Attendance watch daily 8:30, Sales pace hourly, Anomaly watch always on, Weekly brand review Mondays 9am) → none shipped: no scheduled agents in repo; README Known gaps lists scheduled briefings/anomaly alerts as roadmap; prompts daily_briefing/attendance_exceptions are manual prompts only ; "You stay in control: changes shown first" → verified (two-step writes, README Security model) ; "Same permissions as CB Office; sponsors look, admins act" → verified (backend RBAC, 403 for supervisor/sponsor writes, test/server.test.ts READ_ONLY_ROLE) ; "ID and bank info hidden" → verified (src/shape.ts redaction, test/ redaction) ; "Bring your own AI" → MCP hosts supported, but needs a dedicated service user (CB_USERNAME/PASSWORD). FIX: delete the agents table and its runs column; keep the three trust items | 2026-10-25 |
| brief:how-it-s-priced | How it's priced. | marketing/capability-brief.html:775-794 | unverified | "Seat allowances cover promoters, supervisors, admins, sponsors" → license-usage-spec.md#Metering model (4 caps per campaign, tested in backend/test/license.test.ts) ; "tracks seat usage per campaign, weekly and monthly history" → spec#Usage over time + Portal (License Usage page) ; "in-portal alert as a campaign nears its limit" → spec alert states ok/warn/at/over + warn threshold, shown as badges in portal ; "seat counts from the moment an account is assigned; peak for the period" → spec#Metering model + snapshot peak rule ; "going over never blocks an assignment" → spec intro + Out of scope (hard limits) ; "billed per campaign", "no separate charge for software", "pilot terms then rollout", "onboarding and daily support included", "figures quoted per engagement" → NO repo evidence: commercial terms are owner-supplied. MISSING: owner confirmation of these five commercial statements (Needs owner decision); metering half is verified | 2026-10-25 |
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
| landing:ask-your-campaign-anything-or-let-ai-run-the-rounds | Ask your campaign anything. Or let AI run the rounds. | marketing/landing-site/index.html:1066-1230 | contradicted | Same evidence as brief:ask-your-campaign-anything: ask/direct → shipped via MCP (README Tools, tests) ; "Future focused. Shared so you know where a pilot is heading" → rule 2 roadmap wording ; "Delegate" mode and "Agent scheduled: Kandy weekend watch, Sat/Sun 8:30am" demo → not shipped (no scheduler); "Set up, adjust and schedule campaign work" → "schedule" unsupported ; "shifts are on the promoters phones" → unverified ; "Opened Tuesday entries...three entries within 10 minutes" → illustrative, labelled. FIX: remove Delegate mode, Agent scheduled card, "schedule" and vision-note; keep illustrative caption | 2026-10-25 |
| landing:direct | Direct | marketing/landing-site/index.html:1220-1220 | unverified |  |  |
| landing:delegate | Delegate | marketing/landing-site/index.html:1221-1230 | unverified |  |  |
| landing:a-team-member-that-never-misses-the-morning-check | A team member that never misses the morning check. | marketing/landing-site/index.html:1231-1265 | contradicted | "Agents review attendance, watch sales pace, look for anything unusual and write the weekly briefing" and agent panel with schedules (Daily 8:30, Hourly 10am-9pm, Always on, Mondays 9am) → not shipped; no scheduler in repo, README Known gaps = roadmap, bots need secrets (#100) ; "When something needs a person they tell you" → no notification feature (license spec: no off-platform notifications) ; "Same permissions as CB Office", "changes only after you approve", "ID and bank hidden" → verified (README Security model, tests) ; "no new login for your sponsors to manage" → contradicted: MCP uses a dedicated service user with credentials (README Quick start; all HTTP clients share one user). FIX: remove the whole Agents section or reduce to the three trust items without agents/schedules/login claim | 2026-10-25 |
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

## Claim-level rows: Overview redesign (#114), 2026-10-26
Added by the Marketing writer. Pages: `marketing/capability-brief.html` (CB Office module table, "Dashboard" row; sponsor bullet in "The four people who log in"), `marketing/landing-site/index.html` (portal mock in the hero frame; sponsor list in "A window into the campaign"). Tests: `campaign-buddy-backend/test/dashboard.test.ts` (DB), `campaign-buddy-backend/test/dashboardRules.test.ts` (rules), `campaign-buddy-portal/e2e/dashboard.spec.ts` (UI).

| ID | Claim | Shipped behaviour / evidence | Status |
|---|---|---|---|
| overview:needs-attention | Ranked "Needs attention" strip: promoters who should be checked in but are not, check-ins outside geofence, outlets with check-in but no sales update, open previous-day shifts | dashboard.test.ts "flags a promoter whose shift started...", "counts a geofence miss, a stale open shift and an outlet with no sales update"; dashboardRules.test.ts buildAttention (high severity first), shouldBeCheckedIn; e2e "admin Overview: attention strip..." | verified 2026-10-26 |
| overview:stale-location | Stale location flagged | dashboardRules.test.ts isStaleShift (12 minute threshold). The brief/landing copy says "stale location" and gives no number | verified 2026-10-26 |
| overview:reorder-leave | Products flagged for reorder, pending leave appear in the strip | Reorder: dashboard.test.ts "adds campaign progress, ... and a reorder alert". Pending leave: dashboard.test.ts line 87-92 (pending_leave in the attention types) | verified 2026-10-26 |
| overview:headline-tiles | Four headline tiles (sales, active outlets, conversion, customers approached) with change vs yesterday | dashboard.test.ts "sums sales ... compares today with yesterday and last week"; dashboardRules.test.ts pctChange, conversionPct; e2e "at most four headline tiles above the fold" | verified 2026-10-26 |
| overview:last-sales-day | "Last sales day" row (latest earlier day with sales) | dashboard.test.ts "returns the most recent earlier day with sales..." and "has no previous sales day..." | verified 2026-10-26 |
| overview:progress-ranking-demand | Campaign progress (day x of y), best and lagging outlets, unmet demand | dashboard.test.ts "adds campaign progress, outlet ranking, unmet demand..."; dashboardRules.test.ts campaignProgress | verified 2026-10-26 |
| overview:setup-checklist | Setup checklist for new campaigns | dashboard.test.ts "reports an empty setup state for a new campaign" (API only; no UI test of the checklist) | verified (API) 2026-10-26 |
| overview:sponsor-view | Sponsors get the performance view without staff or location data (no attention strip, no map) | dashboard.test.ts "returns no staff-level attention items to a sponsor"; e2e "sponsor Overview shows performance only..." (asserts no staff/location requests) | verified 2026-10-26 |
| overview:one-request | Overview loads from one summary request | e2e "admin Overview: ... from one summary request". Admin map is a separate optional request, so the copy says "loaded in one request" for the figures only | verified 2026-10-26 (wording: see note) |
| overview:retired-live-map-sponsor | RETIRED: "Sponsors get a parallel dashboard with an embedded live map" and "Sponsor dashboard shows ... top products and a live map" | Sponsor Overview has no map (e2e sponsor test). Removed from both pages | retired; claim was contradicted |
| overview:retired-yesterday-week | RETIRED: mock tiles "Sales Yesterday", "Outlets Yesterday", "Sales this week" bar chart | Replaced by new layout; stale-wording.mjs now clean | retired |
| overview:not-shipped | NOT claimed: targets-vs-achieved, AI/agent features on the Overview, push alerts, server caching | Not in shipped code | n/a |
