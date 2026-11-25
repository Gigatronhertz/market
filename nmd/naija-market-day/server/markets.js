'use strict';
// Markets, booths and guest registration (WEB-11 to WEB-16, ADM-06 to ADM-15, ADM-24).

const db = require('./db');
const qr = require('./qr');
const notify = require('./notify');
const { HttpError, nowIso, todayYmd, randomToken, cleanEmail, str, reqStr, int, money, addMinutes } = require('./util');

// Status shown to the public and to admins. "past" is derived from the market date.
function effectiveStatus(m) {
  if (m.status === 'draft') return 'draft';
  if (m.status === 'closed') return 'closed';
  return m.date < todayYmd() ? 'past' : 'published';
}

function marketView(m) {
  if (!m) return null;
  const guests = db.get(
    'SELECT COALESCE(SUM(guests_count), 0) AS n FROM guests WHERE market_id = ? AND source = ?',
    m.id,
    'online'
  ).n;
  const vendors = db.get(
    "SELECT COUNT(*) AS n FROM applications WHERE market_id = ? AND status IN ('under_review','more_info','approved','offered')",
    m.id
  ).n;
  return {
    ...m,
    effective_status: effectiveStatus(m),
    guests_registered: guests,
    guest_spots_left: m.guest_capacity ? Math.max(0, m.guest_capacity - guests) : null,
    vendor_applications: vendors,
    vendor_spots_left: m.vendor_capacity ? Math.max(0, m.vendor_capacity - vendors) : null,
  };
}

// Booth availability for one booth. A hold expires; a held booth counts as free for the vendor holding it.
function boothStatus(b, forApplicationId = null, at = nowIso()) {
  if (b.reserved) return 'reserved';
  if (b.confirmed) return 'confirmed';
  if (b.assigned_application_id) return 'paid';
  const heldByOther = b.held_application_id && b.held_until && b.held_until > at && b.held_application_id !== forApplicationId;
  if (heldByOther) return 'held';
  return 'available';
}

function boothsForMarket(marketId, forApplicationId = null) {
  const at = nowIso();
  return db
    .all('SELECT * FROM booths WHERE market_id = ? ORDER BY tier, CAST(number AS INTEGER), number', marketId)
    .map((b) => {
      const status = boothStatus(b, forApplicationId, at);
      return { ...b, status, available: status === 'available' };
    });
}

function getMarketRow(id) {
  return db.get('SELECT * FROM markets WHERE id = ?', id);
}

function publicMarkets({ city, season, past } = {}) {
  const rows = db.all("SELECT * FROM markets WHERE status != 'draft' ORDER BY date ASC, id ASC");
  return rows
    .map(marketView)
    .filter((m) => (city ? m.city.toLowerCase() === String(city).toLowerCase() : true))
    .filter((m) => (season ? m.season === season : true))
    .filter((m) => (past ? m.effective_status === 'past' : m.effective_status === 'published' || m.effective_status === 'closed'));
}

function publicMarket(id) {
  const m = getMarketRow(int(id));
  if (!m || m.status === 'draft') throw new HttpError(404, 'That market was not found.');
  const view = marketView(m);
  const tiers = {};
  for (const b of boothsForMarket(m.id)) {
    const t = (tiers[b.tier] = tiers[b.tier] || { tier: b.tier, type: b.type, price_cents: b.price_cents, total: 0, available: 0 });
    t.total += 1;
    if (b.status === 'available') t.available += 1;
  }
  return { ...view, booth_tiers: Object.values(tiers), applications_open: applicationsOpen(m) };
}

function applicationsOpen(m) {
  if (!m || m.status !== 'published') return false;
  if (m.date < todayYmd()) return false;
  const today = todayYmd();
  if (m.app_opens_on && today < m.app_opens_on) return false;
  if (m.app_closes_on && today > m.app_closes_on) return false;
  return true;
}

// Guest registration (WEB-14, WEB-15, WEB-16, NOT-01).
function registerGuest(marketId, body) {
  const m = getMarketRow(int(marketId));
  if (!m || m.status === 'draft') throw new HttpError(404, 'That market was not found.');
  if (m.status === 'closed' || m.date < todayYmd()) {
    throw new HttpError(409, 'Guest registration for this market is closed.');
  }
  const email = cleanEmail(body.email);
  const name = reqStr(body.name, 'Name', 120);
  const phone = str(body.phone, 40);
  const guestsCount = Math.min(Math.max(int(body.guests_count, 1), 1), 10);
  const view = marketView(m);
  const existing = db.get('SELECT * FROM guests WHERE market_id = ? AND email = ? COLLATE NOCASE AND source = ?', m.id, email, 'online');
  if (existing) {
    notify.sendTemplate('guest_confirmation', email, guestVars(m, existing));
    return { guest: publicGuest(existing), market: marketView(m), resent: true };
  }
  if (m.guest_capacity && view.guest_spots_left < guestsCount) {
    throw new HttpError(409, 'Guest registration is full for this market.');
  }
  const token = randomToken(16);
  const info = db.run(
    'INSERT INTO guests (market_id, name, email, phone, guests_count, source, qr_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    m.id,
    name,
    email,
    phone,
    guestsCount,
    'online',
    token,
    nowIso()
  );
  const guest = db.get('SELECT * FROM guests WHERE id = ?', info.lastInsertRowid);
  notify.sendTemplate('guest_confirmation', email, guestVars(m, guest));
  return { guest: publicGuest(guest), market: marketView(m) };
}

function guestVars(m, guest) {
  return {
    name: guest.name,
    market_name: m.name,
    city: m.city,
    market_date: m.date,
    venue: m.venue,
    qr_link: notify.appUrl('/app/ticket.html?t=' + guest.qr_token),
  };
}

function publicGuest(g) {
  return { id: g.id, name: g.name, email: g.email, guests_count: g.guests_count, market_id: g.market_id, qr_token: g.qr_token };
}

// Guest ticket (QR image and details), reached from the confirmation email.
function guestTicket(token) {
  const g = db.get('SELECT * FROM guests WHERE qr_token = ?', String(token || ''));
  if (!g) throw new HttpError(404, 'This ticket was not found.');
  const m = getMarketRow(g.market_id);
  return {
    name: g.name,
    guests_count: g.guests_count,
    checked_in: !!g.checked_in,
    market: { id: m.id, name: m.name, city: m.city, date: m.date, venue: m.venue, start_time: m.start_time },
    qr_data_url: qr.dataUrl(qr.guestCode(g.qr_token)),
  };
}

// ----- admin: markets and booths -----
function createMarket(actor, body) {
  const name = reqStr(body.name, 'Market name', 120);
  const city = reqStr(body.city, 'City', 80);
  const date = reqStr(body.date, 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Use the date format YYYY-MM-DD.');
  const now = nowIso();
  const info = db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status,
      guest_capacity, vendor_capacity, app_opens_on, app_closes_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    name,
    city,
    str(body.venue, 200),
    str(body.season, 40),
    date,
    str(body.start_time, 5),
    str(body.end_time, 5),
    str(body.description, 4000),
    str(body.terms, 8000),
    int(body.guest_capacity, 0),
    int(body.vendor_capacity, 0),
    str(body.app_opens_on, 10) || null,
    str(body.app_closes_on, 10) || null,
    now,
    now
  );
  logActivity(actor, 'market.created', name);
  return marketView(getMarketRow(info.lastInsertRowid));
}

const MARKET_FIELDS = ['name', 'city', 'venue', 'season', 'date', 'start_time', 'end_time', 'description', 'terms', 'app_opens_on', 'app_closes_on', 'flyer_url', 'floor_plan_url'];
const MARKET_INTS = ['guest_capacity', 'vendor_capacity'];

function updateMarket(actor, id, body) {
  const m = getMarketRow(int(id));
  if (!m) throw new HttpError(404, 'That market was not found.');
  const sets = [];
  const vals = [];
  for (const f of MARKET_FIELDS) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(body[f] === '' ? null : str(body[f], f === 'description' || f === 'terms' ? 8000 : 300));
    }
  }
  for (const f of MARKET_INTS) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(int(body[f], 0));
    }
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    vals.push(nowIso());
    db.run(`UPDATE markets SET ${sets.join(', ')} WHERE id = ?`, ...vals, m.id);
    logActivity(actor, 'market.updated', m.name);
  }
  return marketView(getMarketRow(m.id));
}

// Publishing opens applications and guest registration (ADM-14).
function setMarketStatus(actor, id, status) {
  const m = getMarketRow(int(id));
  if (!m) throw new HttpError(404, 'That market was not found.');
  if (status === 'published' && (!m.terms || !m.terms.trim())) {
    throw new HttpError(400, 'Add the event terms before publishing (vendors must see them before paying).');
  }
  db.run('UPDATE markets SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), m.id);
  logActivity(actor, 'market.' + status, m.name);
  return marketView(getMarketRow(m.id));
}

// Admin: add booths as a number range (ADM-11). Example: from 1 to 10, tier VIP, type standard.
function addBooths(actor, marketId, body) {
  const m = getMarketRow(int(marketId));
  if (!m) throw new HttpError(404, 'That market was not found.');
  const from = int(body.from, NaN);
  const to = int(body.to, from);
  const tier = reqStr(body.tier, 'Tier', 40);
  const type = body.type === 'food' ? 'food' : 'standard';
  const price = money(body.price);
  const prefix = str(body.prefix, 6);
  if (!Number.isFinite(from) || to < from || to - from > 500) throw new HttpError(400, 'Enter a valid booth number range.');
  let added = 0;
  db.tx(() => {
    for (let n = from; n <= to; n++) {
      const number = prefix + n;
      const exists = db.get('SELECT id FROM booths WHERE market_id = ? AND number = ?', m.id, number);
      if (exists) continue;
      db.run(
        'INSERT INTO booths (market_id, number, tier, type, price_cents) VALUES (?, ?, ?, ?, ?)',
        m.id,
        number,
        tier,
        type,
        price
      );
      added++;
    }
  });
  logActivity(actor, 'booths.added', `${added} booths (${tier}) at ${m.name}`);
  return { added, booths: boothsForMarket(m.id) };
}

function updateBooth(actor, boothId, body) {
  const b = db.get('SELECT * FROM booths WHERE id = ?', int(boothId));
  if (!b) throw new HttpError(404, 'That booth was not found.');
  if (body.price !== undefined) db.run('UPDATE booths SET price_cents = ? WHERE id = ?', money(body.price), b.id);
  if (body.tier !== undefined) db.run('UPDATE booths SET tier = ? WHERE id = ?', reqStr(body.tier, 'Tier', 40), b.id);
  if (body.reserved !== undefined) {
    if (body.reserved && (b.assigned_application_id || b.confirmed)) {
      throw new HttpError(409, 'This booth already has a vendor. Move the vendor first.');
    }
    db.run('UPDATE booths SET reserved = ?, reserved_note = ? WHERE id = ?', body.reserved ? 1 : 0, str(body.note, 200), b.id);
    logActivity(actor, body.reserved ? 'booth.reserved' : 'booth.released', b.number);
  }
  return db.get('SELECT * FROM booths WHERE id = ?', b.id);
}

function setFloorPlan(actor, marketId, dataUrl) {
  const m = getMarketRow(int(marketId));
  if (!m) throw new HttpError(404, 'That market was not found.');
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(dataUrl || '')) {
    throw new HttpError(400, 'Upload a PNG, JPG, WEBP or SVG image of the numbered floor plan.');
  }
  db.run('UPDATE markets SET floor_plan_url = ?, updated_at = ? WHERE id = ?', dataUrl, nowIso(), m.id);
  logActivity(actor, 'market.floor_plan', m.name);
  return { ok: true };
}

// Close: stops new applications and registrations; history stays (ADM-15).
function closeMarket(actor, id) {
  return setMarketStatus(actor, id, 'closed');
}

function logActivity(actor, action, detail) {
  db.run('INSERT INTO activity (actor_id, action, detail, created_at) VALUES (?, ?, ?, ?)', actor ? actor.id : null, action, detail, nowIso());
}

module.exports = {
  effectiveStatus,
  marketView,
  boothStatus,
  boothsForMarket,
  getMarketRow,
  publicMarkets,
  publicMarket,
  applicationsOpen,
  registerGuest,
  guestTicket,
  createMarket,
  updateMarket,
  setMarketStatus,
  addBooths,
  updateBooth,
  setFloorPlan,
  closeMarket,
  logActivity,
};
