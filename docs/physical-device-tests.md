# Physical-device test list

Things that **can't be proven on web, an emulator or in unit tests** and need a real phone.
Run these on a build that includes the change (offline support needs a native rebuild — see below).
Suggested devices: one low-end Android (the worst case for battery and background limits) and one iPhone.

How to report: tick the box, note the device + OS + app build, and put any failure in a GitHub issue
(use the portal's *Report issue*, or link the PR). Add new items at the bottom with the change they belong to.

Status key: `[ ]` not tested · `[x]` passed · `[!]` failed (link the issue)

---

## 1. Battery-friendly location pings — PR #104 (`fix/location-ping-battery`)

Rules under test: GPS check every 60s while checked in and the app is open; upload only if the rep moved
more than max(40 m, GPS accuracy) or a 5-minute heartbeat is due; checks back off to 2 then 5 minutes
while stationary; resume from background skips the GPS if a ping was captured under 45s ago.
Watch results on the portal: **Tracking → Seller Live Locations** (*Last seen* column) and **Tracking → Promoter** (trail).

- [ ] **Walking:** check in, walk ~10 min outdoors. Trail shows a point roughly every minute and follows the route.
- [ ] **Standing still (outdoors):** stand ~15 min. Pings slow to about one every 5 minutes; Last seen never goes orange.
- [ ] **Standing still (indoors / in a shop):** GPS wander does not draw a fake walking trail.
- [ ] **Move after a long still spell:** after ~10 min still, start walking. Note how long until pings resume (up to ~5 min is expected; report if longer).
- [ ] **Background and resume:** check in, switch to another app for 2+ min, come back. A fresh ping is sent on return, no duplicate rows, and the timer keeps going afterwards (the stationary back-off survives).
- [ ] **Resume within 45s:** background and return within ~30s. No second ping row.
- [ ] **Lock the phone** for a few minutes, unlock. Pings pause while locked, resume on unlock.
- [ ] **Check out:** pings stop immediately and never start again until the next check-in.
- [ ] **No signal:** check in, switch on airplane mode, walk a few minutes, switch off. The buffered pings reach the portal with their real capture times.
- [ ] **Location permission denied/revoked mid-shift:** app does not nag or crash; no pings sent.
- [ ] **Battery:** same 2-hour shift on old vs new build (or compare battery % drop). Expect a clear improvement.
- [ ] **Stale marker (portal):** force-close the app mid-shift; after ~12 min the rep's *Last seen* turns orange.

## 2. Mobile offline support — enhancement #1 (issue #77, merged 2026-09-19)

Needs the **installable app rebuilt**: AsyncStorage, NetInfo, expo-background-task and expo-task-manager are
native modules. Only the web flows were verified end-to-end; these were not.

- [ ] **Background sync:** with items queued offline, leave the app in the background ~15+ min on signal; the queue drains without opening the app.
- [ ] **Offline check-out** (not covered on web): check in, go offline, check out, reconnect. Server records the real tap time.
- [ ] **GPS ping buffering offline** (browser GPS can't test this): pings taken offline upload after check-in syncs.
- [ ] **Cold start with no signal** mid-shift resumes into Home using the cached shift.
- [ ] **Kill the app with unsynced items,** reopen: items are still queued and sync.
- [ ] **Logout warning** appears when changes are unsynced; they are sent at the next sign-in on that phone.
- [ ] **Inactivity sign-out** flushes the queue first.

- [ ] **Product removed while offline (#111):** with the app offline, record a sale for a product; have head office remove that product from the activation; reconnect the same day: the sale syncs. The next day a queued write for that product fails with the "removed by head office" message and the rest of the queue still syncs.

---

## Adding to this list
Any change whose risk is "works on web but might not on a phone" (GPS, background execution, push, camera/photos,
native modules, battery, permissions) should add its device checks here in the same PR.
