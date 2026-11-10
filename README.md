# House of Iyengars™ — website, order function and order register

Start with `docs/DEPLOY.md`. Then run `docs/TEST-CHECKLIST.md` on a test site before going live.

| Folder / file | What it is |
|---|---|
| `public/` | The website. `index.html`, `menu.json` (the one place for dishes and prices) and `img/` |
| `netlify/functions/` | The order function, the WhatsApp handoff function and the 10-minute retry job |
| `apps-script/Code.gs` | The Google Apps Script that numbers orders and keeps the Google Sheet register |
| `netlify.toml`, `package.json` | Netlify settings |
| `docs/` | Deployment guide, acceptance checklist, test report |

**Order numbering (final, do not change without approval):** prefix R (rice), S (sweets) or M (both) + number + `-DDMMYY-HHMMSS`.
Each prefix starts at 17 every day and keeps counting. Reset at 12:00 AM Asia/Kolkata. Example: `R17-071126-140812`.

**Customer data:** name, phone and address are checked on the server and put into the WhatsApp message. They are **not stored** in the Sheet, the queue or any database.
