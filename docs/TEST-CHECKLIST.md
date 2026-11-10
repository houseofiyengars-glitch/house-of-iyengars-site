# Acceptance checklist — run on the TEST site before going live

Use a real phone for 1 to 14 (Android and, if you can, an iPhone). Use your own name and number.
Write **Pass / Fail** next to each. Send me a photo of anything that fails.

| # | What to do | Expected result | Result |
|---|---|---|---|
| 1 | Open the site on mobile data (Wi-Fi off) | Site loads, logo, photo and menu with photos show, lock icon in the address bar | |
| 2 | Tap ADD TO CART on two dishes, use + and − | Cart bar at the bottom shows items and total. Dish card shows a quantity control | |
| 3 | Tap VIEW CART | Cart screen, progress bar highlights CART, quantities, prices and total are correct | |
| 4 | Remove an item, press CONTINUE SHOPPING, add it back | Menu returns with cart intact | |
| 5 | PROCEED TO CHECKOUT, leave fields empty, tap CONTINUE TO ORDER SUMMARY | Red messages for name, mobile and address. Cursor goes to the name field | |
| 6 | Try a 9-digit, an 11-digit and a "+91…" mobile number | Each is refused with "exactly 10 digits" | |
| 7 | Enter a full address with pincode | A line appears showing distance from the kitchen | |
| 8 | CONTINUE TO ORDER SUMMARY | Review shows items, total, delivery fee, distance, delivery date, your details. Edit links work | |
| 9 | Use the phone's Back button from Review | You return to Details with everything still filled in | |
| 10 | Go forward again and refresh the page on Review | Same screen, same cart, same details | |
| 11 | CONFIRM ORDER (watch the button) | Button shows "Creating your order…" and cannot be tapped twice | |
| 12 | Read the confirmation screen | Order ID looks like `R17-DDMMYY-HHMMSS` (M if rice and sweets, S if sweets only), date and time are India time, delivery date shown | |
| 13 | Open the Google Sheet | One new row. Prefix, number and time match. **No name, phone or address in the Sheet.** Handoff column says Pending | |
| 14 | Tap CONTINUE TO WHATSAPP | WhatsApp opens with the full message ready (Order ID, items, total, delivery, name, phone, address). You must tap SEND yourself | |
| 15 | Return to the browser | Screen says "Your WhatsApp message is ready… tap SEND". It does NOT claim the message was sent | |
| 16 | Look at the Sheet again | Handoff column now says **Opened** | |
| 17 | Wait 35 minutes without marking it | Handoff changes to **Customer confirmation unavailable** (set automatically) | |
| 18 | Place a second order of the same type | Number goes up by one (R18). Place one of another type: it starts at 17 for that prefix | |
| 19 | Next morning, place an order | Every prefix starts again at 17 with the new date | |
| 20 | Tap CONFIRM ORDER twice quickly | Only one order is created | |
| 21 | Repeat steps 1 to 14 on a laptop | WhatsApp Web opens with the message ready | |
| 22 | In Apps Script, temporarily change `API_SECRET`, place an order, then change it back | Customer sees "Order reference pending" with a PR-XXXXXX reference and the button CONTINUE VIA WHATSAPP — ORDER REFERENCE PENDING. No order ID is shown | |
| 23 | Wait about 10 minutes (secret restored) | The order appears in the Sheet with a proper ID and the PR reference in the PR reference column | |
| 24 | Send 12 requests in a minute (tap CONFIRM and try again quickly, or ask me for a test) | After about 8 in a minute a "too many attempts" message appears | |
| 25 | Check Turnstile: the order only goes through after the quick security check | Works. If you see an error about the security check, tell me | |
| 26 | In the Sheet, try to edit an Order ID cell | Google refuses (the columns are locked). Changing Order status with the dropdown works and a row appears in the **Audit** tab | |
| 27 | Open File → Version history in the Sheet. Open the Drive folder "House of Iyengars Backups" after the first Monday | History exists. A backup copy is there | |
| 28 | Change a price in `public/menu.json` on GitHub and commit | After a minute the new price shows on the site and the order function accepts it | |
| 29 | Netlify → Logs → Functions | No lines marked `config`. Any `suspicious` lines have an explanation | |

**Go live only when every line passes.**
