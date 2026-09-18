# Client change requests — Sep 2026

Feedback from client review, organized into workstreams. Filed as GitHub issues
#55–#67 (Sep 2026).

## A. Attendance (Staff > Attendance) — #57, #60

- Columns: Promoter, Outlet, Name, check-in / check-out times, **Status**
- Status logic: **On time / Late**, compared against the **shift start time set
  on the campaign or activation**
- Strip **seconds** from all displayed times (screens + exports)

## B. Overall Performance (Staff > Profiles > Current Activation) — #55

- Replace the current unclear "50%" figure with an explicit calculation
- **New: Activation Type on each activation**, picked by admin at creation:
  - `weekend` → performance = sales ÷ **8** (working weekend days / month)
  - `monthly` → performance = sales ÷ **25** (working days / month)
- Targets prorated by activation type; day counters exclude non-working days
  (related: #53)
- Performance view also incorporates **attendance**

## C. App — check-in / sales — #56, #58

- **Geo-fence check-in**: only allow check-in within **100m** of the outlet's
  lat/long; validated **server-side** (not just client); clear error in app when
  blocked. Check-out not geofenced in v1; no admin override in v1.
- **Update Sales simplified**: promoter picks only the **outlet** — promoter,
  activation and date auto-derived from the assignment

## D. Reports (portal) — #59, #61

| Report | Changes |
|---|---|
| Sales Overview | Remove the "Update Sales" entry point |
| SKU-wise | Columns: product, amount, outlet, date, start qty, sold, remaining |
| Sales Update Status | View all activations: outlet, promoter, status (completed / pending / absent) |
| Outlet-wise | Remove duration + date range. Columns: outlet, footfall, approach, conversion, tester, total sales, target, achievement % |
| Brand-wise | **New report**: outlet, brand, product count, total |

- **Tester**: promote from custom field to a **standard optional field**
  (campaign toggles it on/off) — #61
- All dropdowns sorted alphabetically portal-wide — #67

## E. Tracking (portal — Promoter Tracking) — #62

- Promoter filter: add **"All"** option / make it clearable
- Clicking a row in the table **highlights that promoter on the map**

## F. Designation label ("Beauty Advisor") — #64

- Configurable **designation label per campaign** instead of hardcoded
  "Promoter" (e.g. "Beauty Advisor" for a client campaign)
- Reflects everywhere user-facing: portal nav/columns, app screens, exports,
  training guides
- Internal role value stays `promoter`; default label stays "Promoter"

## G. Client role (expand Sponsor — read-only) — #65

- Same read-only sponsor role, expanded to a full client surface (their campaign
  only, enforced server-side):
  - SKU-wise + Brand-wise reports (same as Sales Overview tab)
  - Promoter **and** Supervisor tracking maps
  - Staff attendance (promoters) + supervisor attendance
  - **Same dashboard as internal users but no campaign selector** — locked to
    their campaign (sales today, active outlets today, sales yesterday)
- No write actions anywhere

## H. Google Maps — #66

- Spike: evaluate Google Maps integration for tracking / outlet maps
  (approach + cost estimate)

## I. Bugs — #63

- Assigned outlet visits **not showing to the supervisor on the app**
  (investigate list endpoint vs client-side filter)

## Suggested build order

1. #63 (blocks supervisor field work)
2. #56, #58 (app check-in / sales flow)
3. #60, #57 (attendance status end-to-end)
4. #55 (activation type + performance calc)
5. #61, #59, #62, #67 (reports + tracking)
6. #64, #65 (designation + client role)
7. #66 (maps spike)
