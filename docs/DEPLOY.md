# Deployment guide

About 90 minutes the first time. Do the steps in order. **Your live site is not touched until Part 6.**

You will create: a GitHub account, a Cloudflare account, a Google Sheet, and a test site on Netlify. All are free. The only possible cost is the Netlify plan (see Part 8).

---
## Part 1 — Google Sheet and script (the order register)

1. Sign in to the Google account that should own the orders. Create a new Google Sheet. Name it **House of Iyengars Orders**.
2. Open **Extensions → Apps Script**. Delete the sample code. Open `apps-script/Code.gs` from this folder, copy everything, paste it in, and click **Save**.
3. Make up a long secret word (at least 32 random letters and numbers). Keep it safe. You will use it twice.
4. In Apps Script click the **gear (Project Settings)**, scroll to **Script properties → Add script property**. Name: `API_SECRET`. Value: your secret word. Save.
5. Choose the function **setup** in the toolbar and click **Run**. Approve the permissions (Google may say the app is unverified. Choose Advanced → Go to project). This creates the Orders and Audit tabs, the status dropdowns, locks the order-data columns, and starts the automatic jobs (audit log, 30-minute handoff check, weekly backup).
6. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click Deploy and copy the **Web app URL**.
   - "Anyone" only means the address can be reached. Every request must carry your secret word, so strangers cannot use it.
7. Open that URL in a browser. You should see `{"ok":true,"service":"House of Iyengars order register","status":"running"}`.
8. **Whenever you change `Code.gs` later:** Deploy → Manage deployments → pencil → Version: New version → Deploy.

## Part 2 — Cloudflare Turnstile (the bot check)

1. Create a free Cloudflare account. Open **Turnstile → Add widget**.
2. Add your site addresses: `houseofiyengars.com`, `www.houseofiyengars.com`, and the test site address you will get in Part 4 (for example `something.netlify.app`).
3. Widget mode: **Managed**. Create it. Copy the **Site key** (public) and the **Secret key** (private).

## Part 3 — GitHub (stores the project)

1. Create a GitHub account (use the business email, turn on 2-step verification).
2. Click **New repository**. Name: `house-of-iyengars-site`. Choose **Private**. Create it.
3. Unzip the project. Open `public/index.html`, find `turnstileSiteKey:""` and put your **Site key** between the quotes. Save.
4. In your new repository click **Add file → Upload files**. Drag in **everything inside the unzipped folder** (the folders `public`, `netlify`, `apps-script`, `docs` and the files `netlify.toml`, `package.json`, `README.md`). Wait until all files are listed, then **Commit changes**.

## Part 4 — A separate test site on Netlify

Do not use your live site for testing.

1. In Netlify click **Add new project → Import an existing project → GitHub**, choose `house-of-iyengars-site`.
2. Build command: leave empty. Publish directory: `public`. (Netlify reads the rest from `netlify.toml`.)
3. Before deploying, open **Environment variables** and add:

| Name | Value |
|---|---|
| `APPS_SCRIPT_URL` | the Web app URL from Part 1 |
| `APPS_SCRIPT_SECRET` | your secret word from Part 1 |
| `TURNSTILE_SECRET` | the Cloudflare **Secret key** |

4. Deploy. Netlify gives you an address like `something.netlify.app`. Add it to the Turnstile widget (Part 2, step 2) if you have not yet.
5. Open the site. Under **Logs → Functions** you should see `order`, `handoff` and `retry-pending`.

## Part 5 — Test everything

Open `docs/TEST-CHECKLIST.md` and go through it on the test site, using a test order from a real phone. **Do not go live until every item passes.** Send me anything that fails, with a photo.

## Part 6 — Go live (keeps your domain, HTTPS and DNS exactly as they are)

Your live site is `ornate-torrone-04bfb4.netlify.app`, and your `www` DNS record points to it. The simplest way is to connect the GitHub repository to **that** site:

1. Open the live site in Netlify → **Site configuration → Build & deploy → Continuous deployment → Link repository**. Choose GitHub and `house-of-iyengars-site`. Build command empty. Publish directory `public`.
2. Open **Environment variables** on the live site and add the same three variables as Part 4.
3. Click **Deploys → Trigger deploy**. Wait for **Published**.
4. Open `https://houseofiyengars.com` on your phone and place one real test order. Check the Orders sheet.

If Netlify does not offer to link a repository to the old site, import the repository as a new site and then, in the new site, add `houseofiyengars.com` and change the GoDaddy `www` CNAME record to the new site's `.netlify.app` address. Ask me and I will guide you.

**Rollback:** Netlify → Deploys → pick an earlier deploy → **Publish deploy**. Takes one click.

## Part 7 — Running it day to day

- **Orders:** open the Google Sheet, tab **Orders**. Change only the **Order status**, **Payment status**, **WhatsApp handoff** and **Notes** columns, using the dropdowns. The other columns are locked.
- **WhatsApp handoff meanings:** *Pending* = order registered, WhatsApp not opened. *Opened* = customer tapped Continue to WhatsApp. *Customer confirmation unavailable* = set automatically 30 minutes after Opened, because the website can never see whether the customer pressed Send. Set *Received on WhatsApp* yourself when their message arrives.
- **Order reference pending (PR-XXXXXX):** if Google was unreachable, the customer was shown a temporary reference and their order waits in a queue. Within about 10 minutes of Google returning, it appears in the Sheet with a proper ID and the PR reference in the **PR reference** column, so you can match it to their WhatsApp message.
- **If a message arrives with "not recorded"** in the reference line: both Google and the queue failed. The order exists only in WhatsApp. Add it by hand in a **Notes** line on a new order if you wish.
- **Changing dishes or prices:** in GitHub open `public/menu.json`, click the pencil, edit, and **Commit**. Netlify deploys in about a minute. The page and the order function both read this one file, so prices cannot disagree. To hide a dish set `"available": false`. To add one, add an entry (see below) and upload its photo to `public/img/`.

```json
{ "id": "m9", "name": "New Dish", "size": "500 g / 750 ml", "price": 250, "group": "rice", "g": 0, "image": "img/m9.webp", "w": 360, "h": 210, "available": true }
```
Use `"group": "sweets", "g": 1` for sweets. Never reuse an `id`.

- **Watch for problems:** Netlify → Logs → Functions. Lines marked `suspicious`, `queued`, `queue_failed`, `script_unreachable` or `config` need attention. A `config` line means a setting is missing or wrong.
- **Backups:** the Sheet keeps version history (File → Version history), and a copy is saved weekly to a Drive folder named **House of Iyengars Backups**. Test a restore once: open a backup copy and check that the orders are there.

## Part 8 — Costs

| Item | Cost |
|---|---|
| Google Sheet, Apps Script, Drive backups | Free |
| Cloudflare Turnstile, GitHub | Free |
| Database | None |
| Netlify Free plan | $0, 300 credits a month, **hard limit** (the site pauses if used up) |
| Netlify Personal plan | $9 a month, 1,000 credits |

A first visit now transfers about 0.3 MB (the page used to be 0.55 MB). Netlify charges 20 credits per GB of traffic and 15 credits per deploy. Rough monthly credits including 4 deploys and the order function:

| Visits a day | Credits | Fits |
|---|---|---|
| 500 | about 170 | Free or Personal |
| 1,500 | about 350 | Personal (Free may run out) |
| 3,000 | about 650 | Personal |

Switch on usage alerts in Netlify. If you choose Free and it runs out, ordering stops until the month ends or you upgrade.

## Known limits (please read)

- **Google decides the numbers.** If Google is unreachable, no order ID can be issued at that moment. The customer sees "Order reference pending" and the order is numbered automatically afterwards.
- **Delivery distance is an estimate.** It comes from OpenStreetMap lookups in the customer's browser and is only a straight-line guess. The final delivery fee is always confirmed on WhatsApp.
- **The website never knows if the customer pressed Send** in WhatsApp. It says so honestly.
- **Netlify Blobs** (the retry queue) is only used to hold unregistered orders. It is never used for numbering.
