'use strict';
// Background jobs. Runs every 15 minutes. Every job is safe to run more than once.

const db = require('./db');
const notify = require('./notify');
const markets = require('./markets');
const applications = require('./applications');
const commerce = require('./commerce');
const checkin = require('./checkin');
const { nowIso, todayYmd, addDays } = require('./util');

// Unfinished applications: reminders on the admin's schedule, stopping once the application is paid or the window closes (VEN-16, NOT-04).
function remindUnfinished(today = todayYmd()) {
  const every = db.getSetting('unfinished_reminder_days', 2);
  const max = db.getSetting('max_unfinished_reminders', 5);
  const cutoff = addDays(new Date().toISOString(), -every);
  const rows = db.all(
    `SELECT a.* FROM applications a JOIN markets m ON m.id = a.market_id
     WHERE a.status IN ('draft','waitlisted') AND a.payment_status != 'paid' AND a.reminders_sent < ?
       AND (a.last_reminder_at IS NULL OR a.last_reminder_at < ?)
       AND m.status = 'published' AND m.date >= ?`,
    max, cutoff, today
  );
  let sent = 0;
  for (const app of rows) {
    if (!markets.applicationsOpen(markets.getMarketRow(app.market_id))) continue;
    applications.remindUnfinished(app);
    sent++;
  }
  return sent;
}

// Reminders before the market: guests and approved vendors (NOT-02, NOT-13, VEN-29).
function preMarketReminders(today = todayYmd()) {
  const days = db.getSetting('pre_market_reminder_days', 1);
  const target = addDays(today + 'T00:00:00Z', days).slice(0, 10);
  const due = db.all("SELECT * FROM markets WHERE status = 'published' AND date = ? AND reminders_sent_at IS NULL", target);
  for (const m of due) {
    for (const g of db.all("SELECT name, email, qr_token FROM guests WHERE market_id = ? AND source IN ('online','walkin')", m.id)) {
      notify.sendTemplate('guest_reminder', g.email, { name: g.name, market_name: m.name, city: m.city, market_date: m.date, venue: m.venue, qr_link: notify.appUrl('/app/ticket.html?t=' + g.qr_token) });
    }
    for (const a of db.all(
      "SELECT a.*, b.contact_person, b.name AS business_name FROM applications a LEFT JOIN businesses b ON b.id = a.business_id WHERE a.market_id = ? AND a.status = 'approved'",
      m.id
    )) {
      const bo = db.get('SELECT number FROM booths WHERE id = ?', a.booth_id || 0);
      notify.sendTemplate('vendor_reminder', a.owner_email, { name: a.contact_person || a.business_name, market_name: m.name, market_date: m.date, venue: m.venue, booth_number: bo ? bo.number : '', start_time: m.start_time });
    }
    db.run('UPDATE markets SET reminders_sent_at = ? WHERE id = ?', nowIso(), m.id);
  }
  return due.length;
}

// After a market: no-shows are recorded, then thank-you emails go out (ADM-34, NOT-14, NOT-15).
function processClosedMarkets(today = todayYmd()) {
  const due = db.all("SELECT * FROM markets WHERE status != 'draft' AND closed_processed_at IS NULL AND date < ?", today);
  for (const m of due) {
    checkin.markNoShows(m.id);
    for (const g of db.all("SELECT DISTINCT name, email FROM guests WHERE market_id = ?", m.id)) {
      notify.sendTemplate('guest_thank_you', g.email, { name: g.name, market_name: m.name, directory_link: notify.appUrl('/app/directory.html#/market/' + m.id) });
    }
    for (const a of db.all("SELECT a.owner_email, b.contact_person FROM applications a LEFT JOIN businesses b ON b.id = a.business_id WHERE a.market_id = ? AND a.status = 'approved'", m.id)) {
      notify.sendTemplate('vendor_after_market', a.owner_email, { name: a.contact_person || '', market_name: m.name });
    }
    db.run('UPDATE markets SET closed_processed_at = ?, status = CASE WHEN status = \'published\' THEN \'closed\' ELSE status END WHERE id = ?', nowIso(), m.id);
  }
  return due.length;
}

// A waitlisted vendor who did not pay in time goes back to the waitlist, and the booth is released.
function releaseExpiredOffers() {
  const now = nowIso();
  const expired = db.all(
    "SELECT w.id AS wid, w.application_id, a.booth_id FROM waitlist w JOIN applications a ON a.id = w.application_id WHERE w.status = 'offered' AND a.status = 'offered' AND a.booth_id IS NOT NULL AND EXISTS (SELECT 1 FROM booths b WHERE b.id = a.booth_id AND b.held_until < ?)",
    now
  );
  for (const e of expired) {
    db.tx(() => {
      db.run('UPDATE booths SET held_application_id = NULL, held_until = NULL WHERE id = ? AND held_application_id = ?', e.booth_id, e.application_id);
      db.run("UPDATE applications SET status = 'waitlisted', booth_id = NULL WHERE id = ?", e.application_id);
      db.run("UPDATE waitlist SET status = 'waiting' WHERE id = ?", e.wid);
    });
  }
  return expired.length;
}

function cleanup() {
  db.run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
  db.run('DELETE FROM otp_codes WHERE expires_at < ?', new Date(Date.now() - 86400000).toISOString());
}

async function runAll() {
  const result = {
    unfinished_reminders: remindUnfinished(),
    pre_market_reminders: preMarketReminders(),
    markets_closed: processClosedMarkets(),
    offers_released: releaseExpiredOffers(),
    subscriptions_processed: await commerce.runSubscriptionRenewals(),
  };
  cleanup();
  return result;
}

let timer = null;
function start() {
  if (timer) return;
  const run = () => runAll().catch((err) => console.error('[scheduler]', err));
  setTimeout(run, 5000).unref();
  timer = setInterval(run, 15 * 60 * 1000);
  timer.unref();
}

module.exports = { runAll, start, remindUnfinished, preMarketReminders, processClosedMarkets, releaseExpiredOffers };
