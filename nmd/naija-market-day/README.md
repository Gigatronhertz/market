# Naija Market Day platform

One web app: a public site, a vendor portal, a buyer workspace, an admin workspace and a check-in screen for staff.
The original design mockups stay at the root of this folder. The working app lives under `/app/`.

## Run it

```
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=choose-a-long-one npm start   # http://localhost:3000
npm run seed:demo        # optional: a sample upcoming market, a past market, a blog post
npm test                 # end-to-end backend tests on a fresh database
npm run backup           # copies the database to data/backups and keeps 14 days
```

Admin and staff sign in at `/app/admin-login.html` (not linked from the public site).
Staff land on the check-in screen at `/app/checkin.html`.

## Demo data

An empty database is filled with demo content on startup: four markets (two upcoming, two past), booths and applications at each stage, vendors with businesses, products and subscriptions, guest tickets, news, events, banners, sponsors, resources and a gallery. Set `DEMO_DATA=0` to turn it off. Demo accounts:

| Role | Email | Password |
|---|---|---|
| Vendor (Ngozi, three businesses) | vendor@demo.test | DemoVendor1 |
| Vendor (Chidi, Ankara clothing) | chidi@demo.test | DemoVendor1 |
| Vendor (Amara, beauty) | amara@demo.test | DemoVendor1 |
| Vendor (Kofi, jewellery and woodcraft) | kofi@demo.test | DemoVendor1 |
| Buyer | buyer@demo.test | DemoBuyer1 |
| Buyer | ada@demo.test | DemoBuyer1 |
| Staff (check-in) | staff@demo.test | DemoStaff1 |

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port (default 3000) |
| `APP_URL` | Public address used in every link in emails, e.g. `https://naijamarketday.example` |
| `DB_FILE` | SQLite file (default `data/nmd.sqlite`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account. If `ADMIN_PASSWORD` is not set, a password is generated and printed once. |
| `STRIPE_SECRET_KEY`, `STRIPE_CURRENCY` | Turns on Stripe Checkout. Without it, payments run in simulated mode. |
| `SIMULATE_DECLINE=1` | Makes simulated payments fail (for testing the failed-payment path). |

## What is built

- **Public site** (`app/index.html`): home with the next market, banner slots and sponsors; upcoming and past markets; guest registration with QR tickets; the vendor directory by city and market; the marketplace with listing detail; blog; community events; vendor resources; contact; newsletter prompt and unsubscribe.
- **Vendor application**: start with just an email, save after every step, business details and saved businesses, category questions, booth picker with 15-minute holds, waitlist, event terms, food certificate upload, payment with a clear failure path, and resume from an emailed link.
- **Vendor portal**: dashboard, applications with QR codes, more-info replies, marketplace subscriptions (free period, renew, cancel), listings with photos, buyer messages with payment links, notifications, receipts, businesses and certificates.
- **Buyer workspace**: marketplace, cart grouped by vendor (one vendor at a time, disclaimer before each chat), chats, account settings.
- **Admin**: dashboard with filters and CSV, markets and booths, floor plan upload, applications (approve, more info, decline with automatic refund, manual refund, move booth, notes, attendance changes), unfinished applications and reminders, waitlist offers, guests and walk-ins, reports, payments, directory visibility, marketplace subscriptions, plans and listings, editable messages with previews, bulk email, banners with slot limits, blog, gallery, sponsors, resources, events, inquiries, subscribers, users and staff invitations, activity log and settings.
- **Check-in**: camera scanning where the browser supports it, manual code entry, lookup by name or email, walk-ins, check-in once only, duplicate and wrong-market warnings, vendor check-out.
- **Background jobs** (every 15 minutes): unfinished-application reminders, reminders the day before a market, after-market thank-you emails and no-show recording, subscription renewals, expired waitlist offers, session cleanup.

## Not connected yet (needs decisions or credentials)

- **Email and SMS delivery (GEN-02):** every message is written to the Outbox screen with status "logged". Connect a sending service in `server/notify.js` (`deliver()`).
- **Stripe live mode:** the Checkout path is written but has not been exercised against a real Stripe account. Test it with test keys before going live.
- **Open client questions** are settings you can change without a developer: booth hold time, waitlist payment window, buyer reply time, whether no-shows leave the directory, whether users may submit events, and whether bulk SMS is on. The client's answers to questions 1, 3, 15 and 19 conflict with some requirements. See the notes in the handoff.
- **Hosting (GEN-04) and accounts list (GEN-06):** not set up. The app needs a VPS, a process manager, HTTPS and the daily backup scheduled.

## Notes

- Uploaded images are stored in the database as data URLs. Move them to object storage before the site gets busy.
- Sign-in attempts are rate-limited in memory per email (failed attempts only). Use a shared store if you run more than one server.
