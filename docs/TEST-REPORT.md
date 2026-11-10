# Test report — what was actually tested

Tested on 8 Nov 2026 in the build environment. It has **no Postgres, no real Google, no real Netlify and no real WhatsApp**, so the tests use faithful simulations. Results below are real; the limits are stated plainly.

## Passed

| Suite | Checks | What it covered |
|---|---|---|
| Order function and Google script logic | **81 / 81**, repeated with the server set to four different timezones (UTC, Los Angeles, Tokyo, Kolkata) | Validation (phone, address, name, quantities, unknown/unavailable products), price-tampering rejection, Turnstile pass/fail/missing, foreign-origin rejection, R/S/M prefixes, start at 17, 60 orders per prefix past 35, IST midnight reset (23:59:59 vs 00:00:00), year rollover, delivery-date rule, delivery-fee rules, 150 simultaneous orders all unique and contiguous, lock discipline, lost counter, idempotent retries, Google down → pending queue → automatic registration with PR link, no duplicates on repeat, response lost then retry, queue and Google both down, WhatsApp handoff Pending → Opened (and wrong request id, unknown order, other statuses refused), 30-minute sweep, audit log, setup, protection, backups, no customer data in the Sheet or queue |
| Guided journey, end to end | **122 / 122** on Android (Pixel 7 profile), iPhone (iPhone 14 profile) and desktop | Full order on mobile, progress bar on every step, exact button labels and guidance sentences, cart add/increase/decrease/remove/empty state, validation messages and focus, delivery fee rules (in zone, beyond 4 km, unknown, above ₹1,500), GPS location, Back/Forward and on-page back keeping all entries, refresh and return keeping progress, 2-hour expiry, old saved details removed, loading state, triple-tap duplicate protection, price-change notice, Google down (pending screen and wording), everything down (honest fallback, "not recorded"), network failure and retry with the same request id, rate-limit message with countdown, Turnstile pass/wait/reject, WhatsApp link format (wa.me on phones, WhatsApp Web on desktop) with correct message, menu load failure and retry, preserved features (heading, hero photo, shloka, heritage text, charges, contact bar, social links, coming soon), no sideways scrolling at 320, 360, 412, 768 and 1280 px on every step, no JavaScript errors |

## Not tested (cannot be tested outside your real accounts)

- The real Google Apps Script: lock behaviour under genuine simultaneous requests, real protected ranges and dropdowns, triggers, Drive backup, and the redirect Google adds to web-app calls.
- The real Netlify: build and deploy, Netlify Blobs (retry queue), the 10-minute scheduled job, and Netlify's rate-limit setting.
- Cloudflare Turnstile with real keys.
- A real WhatsApp send on iPhone and Android, and real Safari (the iPhone tests use Chrome with an iPhone profile).
- OpenStreetMap address lookups (simulated).
- Netlify credit usage and cost (estimated).

`docs/TEST-CHECKLIST.md` covers each of these. Nothing in this list should be considered complete until the checklist passes on your test site.

## Found and fixed during testing

- A style for dish photos was accidentally applied to the screen headings, leaving a blank gap. Found by looking at the screens, fixed, re-tested.
- Several mistakes in my own test scripts were corrected (they were not site faults).
