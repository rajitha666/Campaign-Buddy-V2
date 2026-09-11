# Campaign Buddy Mobile, App Store and Play Store listing

Copy and metadata for publishing **CB Mobile** (`campaign-buddy-app`) as a public
listing on the Apple App Store and Google Play, with a demo login for reviewers.

Scope of this document: listing text, store field values, privacy declarations,
review notes, and developer account setup. Screenshots, the app icon and splash,
and the build or submission pipeline are tracked as dependencies at the end, not
covered here.

Style note: no en or em dashes in any customer facing copy, per the house style
used across `marketing/`.

---

## 1. Decisions to lock before anything is submitted

These cannot be changed after the first submission, or are slow to change. Settle
them first.

| # | Decision | Current state | Recommendation |
|---|---|---|---|
| 1 | **Bundle ID / package name** | **Decided: `lk.campaignbuddy.app`**, set in `app.json` for both platforms (was `com.dyuro.*`). | Done. Permanent on both stores once submitted, do not change it again. |
| 2 | **Publisher / seller name** shown on the store | none yet | `Dyro Technologies`. Must match the legal entity on the developer accounts and the D-U-N-S record. |
| 3 | **Support email** | placeholder (noted in project memory) | Needs a real monitored address, e.g. `support@campaignbuddy.lk`. Required by both stores. |
| 4 | **Privacy policy URL** | does not exist | Both stores hard-block submission without one. Publish `https://campaignbuddy.lk/privacy`. Draft is a separate task (see section 9). |
| 5 | **Public demo backend** | backend only runs locally | Store reviewers must reach a live API. Deploy a staging instance seeded with `campaign-buddy-backend/prisma/demo-seed.ts` and point the production build's `EXPO_PUBLIC_API_BASE_URL` at it. |
| 6 | **Primary market + languages** | app is English only, LKR, Asia/Colombo | Primary language English (UK). Primary territory Sri Lanka. Decide whether to list worldwide or restrict to Sri Lanka plus nearby markets. |
| 7 | **Distribution model** | chosen: public listing + demo login | Keep, but see the Apple 4.2 note in section 7. A strong demo account and review notes clear it in almost all cases. |

---

## 2. Shared app facts (used by both stores)

- **App name:** Campaign Buddy
- **Subtitle / tagline:** Field marketing, run on shift
- **What it is:** the field app for in-store product activations. Promoters and
  field supervisors run their shift from it: GPS check-in, per-product stock and
  sales, footfall, reorder flags, and a confirmed daily summary. Everything syncs
  to the Campaign Buddy portal where the agency and its brand sponsors watch the
  campaign live.
- **Who it is for:** staff of field-marketing and activation agencies. Not a
  consumer app. Access is by an account the agency issues; there is no public
  sign-up.
- **Category:** Business (primary). Productivity (secondary, Apple only).
- **Content rating:** Apple 4+, Google/IARC Everyone. No objectionable content.
- **Contains ads:** No.
- **In-app purchases:** No.
- **Copyright:** (c) 2026 Dyro Technologies
- **Marketing URL:** https://campaignbuddy.lk
- **Support URL:** https://campaignbuddy.lk  (add a `/support` page if possible)
- **Support email:** support@campaignbuddy.lk  *(confirm, see decision 3)*

---

## 3. Full description (both stores, plain text, under 4000 chars)

> Paste as-is into Apple "Description" and Google Play "Full description".
> Google renders the line breaks; Apple does too. No markdown, no dashes.

```
Campaign Buddy is the field app for in-store product activations. Promoters and field supervisors use it to run their shift: check in at the outlet, update stock and units sold per product through the day, record footfall, flag reorders, and confirm the day's summary before checkout. Everything they capture lands in the Campaign Buddy portal, where the agency and its brand sponsors follow the same campaign in near real time.

Campaign Buddy is built for activation agencies, not adapted from generic field service software. The workflow, the defaults and the rules come from how in-store campaigns actually run.

ON THE SHIFT
- Check in and out with a GPS fix, checked against the outlet's geofence
- Update opening stock, units sold and "other interested customers" per product, with a live remaining stock figure
- Record footfall: shoppers approached and converted
- Raise a reorder flag the moment stock runs low
- Fill in the campaign's own custom fields, for example weather, competitor promotions, samples given or damaged units
- Confirm the day's sales summary before checking out
- Request time off and see the approval decision back on your phone
- Follow your own performance: sales, attendance, best day, brand contribution

FOR FIELD SUPERVISORS
Everything above, plus a per-campaign quality checklist for outlet visits.

HOW YOUR LOCATION IS USED
Campaign Buddy records your location only between check in and check out, and only while the app is open on screen. It is never used after you check out, and never in the background. A check in outside the outlet radius is not blocked; it is flagged for someone to review.

ACCESS
Campaign Buddy is a tool for people who work on field-marketing campaigns. You sign in with the mobile number and password your agency gives you. There is no public sign-up. If your organisation does not use Campaign Buddy yet, visit campaignbuddy.lk.

Amounts and times are shown in Sri Lankan Rupees and Colombo time.
```

---

## 4. Apple App Store Connect, field by field

| Field | Value | Limit |
|---|---|---|
| App name | `Campaign Buddy` | 30 |
| Subtitle | `Field marketing, run on shift` | 30 |
| Promotional text | `Run the whole shift from your phone: GPS check-in, stock and sales per product, footfall, reorder flags, and a confirmed daily summary your agency and sponsors see live.` | 170 |
| Description | section 3 above | 4000 |
| Keywords | `field marketing,activation,merchandising,promoter,retail execution,in-store,FMCG,check-in,geofence` | 100, no spaces after commas |
| Primary category | Business | |
| Secondary category | Productivity | |
| Support URL | `https://campaignbuddy.lk` | |
| Marketing URL | `https://campaignbuddy.lk` | |
| Privacy Policy URL | `https://campaignbuddy.lk/privacy` | required |
| Copyright | `2026 Dyro Technologies` | |
| Version | `1.0.0` | must match `app.json` |
| What's New | `First release of Campaign Buddy for field teams.` | |
| Age rating | 4+ (answer "None" to every content question) | |
| Sign in with Apple | Not required. The app uses no third party or social login; accounts are issued by the agency for an existing business relationship, so guideline 4.8 does not apply. | |
| Export compliance | Uses only standard encryption (HTTPS). Set `ITSAppUsesNonExemptEncryption` = `false` in `app.json` under `ios.infoPlist` so the question stops appearing per build. | |
| Content rights | Does not contain, show or access third party content. | |
| Pricing | Free | |
| Availability | per decision 6 | |

### 4.1 Apple App Privacy answers

Data types the app collects (declare under App Privacy):

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | Yes | No | App Functionality (attendance verification during a shift) |
| Coarse Location | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality (staff profile) |
| Phone Number | Yes | Yes | No | App Functionality (sign in identifier, staff profile) |
| User ID | Yes | Yes | No | App Functionality |
| Other Data (device battery level) | Yes | Yes | No | App Functionality (included in shift location pings so the portal can show promoter device battery) |

- **Tracking:** None. The app does not track users across apps or websites and
  contains no third party advertising or analytics SDKs.
- **Data not collected:** contacts, photos, health, financial info, browsing
  history, search history, purchases, messages, audio, crash or performance
  analytics (no analytics SDK is bundled).
- Sales, stock and footfall figures entered on shift are the client's business
  records, not personal data about the user, and are not declared as user data.

### 4.2 Apple review notes (App Review Information > Notes)

```
Campaign Buddy is a business to business field-marketing app used by staff of in-store activation agencies. It has no public sign-up by design; accounts are provisioned by the agency.

Demo account (promoter role):
  Mobile number: <demo number>
  Password: <demo password>

The demo account is connected to a live staging server with a sample campaign ("Radiance Q3 Push") already set up, so Home, Products, Sales, Attendance, Performance, Time off and Profile all show data.

Testing check-in: tap Check in on the Attendance screen. The app will ask for location permission. The outlet geofence is a soft check only, so check-in succeeds from any location and is simply marked "location unverified". Location is recorded only between check-in and check-out and only while the app is foregrounded; there is no background location use.

Contact for review questions: <support email>
```

Provide a demo account with the **App Review** attachment fields filled (username +
password), not only in the notes.

---

## 5. Google Play Console, field by field

| Field | Value | Limit |
|---|---|---|
| App name | `Campaign Buddy` | 30 |
| Short description | `The field app for in-store activations: GPS check-in, live stock and sales.` | 80 |
| Full description | section 3 above | 4000 |
| App category | Business | |
| Tags | field service management, retail, productivity (pick from Play's fixed list) | up to 5 |
| Contact email | `support@campaignbuddy.lk` | required, shown publicly |
| Contact website | `https://campaignbuddy.lk` | |
| Contact phone | optional | |
| Privacy Policy URL | `https://campaignbuddy.lk/privacy` | required |
| Default language | English (United Kingdom) or English (United States) | |
| App access | **All functionality is restricted.** Provide demo credentials + instructions (same text as the Apple review notes, section 4.2). | required |
| Ads | No ads | |
| Content rating | complete the IARC questionnaire, see 5.2 | |
| Target audience | 18+ (workforce app). Not designed for or appealing to children. | |
| News app | No | |
| COVID-19 contact tracing / status app | No | |
| Government app | No | |
| Financial features | No | |
| Data safety | see 5.1 | required |
| Store listing contains ads label | No | |

### 5.1 Google Play Data safety form

**Data collected and why** (nothing is "shared" with third parties; all is
"collected" by Dyro Technologies as the operator):

| Category | Data | Collected | Shared | Processing | Optional? | Purpose |
|---|---|---|---|---|---|---|
| Location | Approximate location | Yes | No | not ephemeral | Required | App functionality |
| Location | Precise location | Yes | No | not ephemeral | Required | App functionality |
| Personal info | Name | Yes | No | not ephemeral | Required | App functionality, Account management |
| Personal info | Phone number | Yes | No | not ephemeral | Required | App functionality, Account management |
| Personal info | User IDs | Yes | No | not ephemeral | Required | App functionality, Account management |
| App info and performance | Other (device battery level) | Yes | No | not ephemeral | Required | App functionality |

**Security practices:**
- Data is encrypted in transit: **Yes** (HTTPS/TLS).
- Users can request that data be deleted: **Yes**, via the support email; agency
  admins can also remove a staff account in the portal.
- Committed to Play Families Policy: not applicable (not a families app).
- Independent security review: No.

**Location declaration:** the app requests foreground location only
(`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`). It does **not** request
`ACCESS_BACKGROUND_LOCATION`. Prominent disclosure is shown in-app before the
permission prompt at check-in. Have a short screen recording ready showing the
check-in permission flow; Play review usually asks for it on any location app.

### 5.2 IARC content rating questionnaire

Answer **No** to every question: no violence, no sexual content, no profanity, no
controlled substances, no gambling, no user-to-user communication, no user
generated content shared publicly, no sharing of user location with other users.

Note on the location question: the questionnaire asks whether the app shares the
user's physical location with **other users**. Campaign Buddy shows a promoter's
shift location to their agency and sponsor in the portal, which are supervisory
business roles, not other app users. Answer per Play's definition; if in doubt,
answer Yes and expect a "Everyone" or "PEGI 3 with location" outcome, which is
still fine for a Business app.

Expected result: Everyone / PEGI 3 / rated for all ages.

---

## 6. Account setup, before you can submit

### 6.1 Apple Developer Program

| Item | Detail |
|---|---|
| Cost | USD 99 per year, auto-renewing |
| Enrol as | Organization (not Individual), so the seller shows as "Dyro Technologies" |
| Requires | Legal entity name, D-U-N-S number for the entity, company website, a person with legal signing authority, an Apple ID with two factor auth |
| D-U-N-S | Free from Dun and Bradstreet, allow 5 business days (can be faster). Check Apple's D-U-N-S lookup tool first, the company may already have one |
| Timeline | Enrolment approval 1 to 3 days once D-U-N-S is verified, sometimes longer for a first org |
| Then | Register the App ID (`lk.campaignbuddy.app`) in the Developer portal, create the app record in App Store Connect |

### 6.2 Google Play Console

| Item | Detail |
|---|---|
| Cost | USD 25 one time |
| Register as | Organization |
| Requires | D-U-N-S number, legal entity details, company address, a contact phone and email that will be verified, a payments profile |
| Identity verification | Google verifies org name, address, phone, D-U-N-S. Allow a few days to a couple of weeks |
| Closed testing rule | The 14 day / 12 tester pre-production requirement applies to **personal** accounts created after Nov 2023. Organization accounts are exempt. This is a strong reason to register as an organization |
| Then | Create the app, complete the "App content" section (privacy policy, ads, data safety, content rating, target audience, news, COVID, government), set up the closed or internal testing track |

### 6.3 What both accounts need from you

- Confirmed legal entity name and address for Dyro Technologies
- D-U-N-S number (one number works for both stores)
- A monitored support email
- A published privacy policy URL
- Someone with authority to accept the developer agreements

---

## 7. Known review risks and how this listing handles them

| Risk | Store | Mitigation in this listing |
|---|---|---|
| App requires login, reviewer cannot get in (Apple 2.1 / Play "App access") | both | Demo promoter account on a live staging backend, with review notes, filled into the dedicated demo-account fields |
| "App is for a limited audience, use private distribution" (Apple 4.2 / 3.2) | Apple | App is positioned as a business tool for an industry (activation agencies), not one company. Public marketing site, real category, demo access. If Apple still pushes back, the fallback is Apple Business Manager custom distribution |
| Location permission purpose unclear (Apple 5.1.1 / Play Location policy) | both | Purpose string already in `app.json`; description has a "How your location is used" section; foreground-only, no background permission; prominent in-app disclosure before the prompt; screen recording ready for Play |
| Data safety form does not match observed behaviour | Play | Form in 5.1 matches the code: foreground location + name + phone + user id + battery, nothing shared, encrypted in transit |
| Minimum functionality (Apple 4.2) | Apple | Full shift workflow, not a repackaged website; native location, offline-tolerant reads |

---

## 8. Ready-to-paste summary block

```
Name:            Campaign Buddy
Subtitle:        Field marketing, run on shift
Short desc:      The field app for in-store activations: GPS check-in, live stock and sales.
Promo text:      Run the whole shift from your phone: GPS check-in, stock and sales per product, footfall, reorder flags, and a confirmed daily summary your agency and sponsors see live.
Keywords:        field marketing,activation,merchandising,promoter,retail execution,in-store,FMCG,check-in,geofence
Category:        Business (2ndary: Productivity)
Age rating:      4+ / Everyone
Price:           Free
Copyright:       2026 Dyro Technologies
Marketing URL:   https://campaignbuddy.lk
Support URL:     https://campaignbuddy.lk
Support email:   support@campaignbuddy.lk
Privacy URL:     https://campaignbuddy.lk/privacy
Bundle ID:       lk.campaignbuddy.app
```

---

## 9. Status of the other pieces

Done:

- **Bundle ID / package** set to `lk.campaignbuddy.app` in `app.json`.
- **App icon, Android adaptive icon, splash.** Built and wired into `app.json`
  (`campaign-buddy-app/assets/images/`). Also `ITSAppUsesNonExemptEncryption:
  false` and the `expo-splash-screen` plugin were added. Source + generator in
  `marketing/store/` (see its README).
- **Marketing screenshots.** 7 framed screens per store, at 1290x2796 (Apple
  6.7") and 1080x2160 (Play phone), in `marketing/store/mobile/screenshots/`.
  Apple auto-scales the 6.7" set to the other iPhone sizes, so no separate 6.5"
  set is needed. No tablet set (`supportsTablet: false`).

Still open:

1. **Google Play feature graphic** 1024x500. Not built.
2. **Privacy policy page** at `campaignbuddy.lk/privacy`, consistent with the
   Data safety and App Privacy declarations in sections 4.1 and 5.1.
3. **Staging backend** reachable from the public internet, seeded with
   `demo-seed.ts`, for reviewers and for the production build's API URL.
4. **EAS Build + Submit** setup (`eas.json`, credentials).
5. **Support email + `/support` page** stood up.
6. **D-U-N-S number** obtained for Dyro Technologies.
7. Optional: re-capture the login screen ("Dyuro" to "Dyro") and re-seed demo
   data so product names drop the em dash, if the login screen joins the set.
