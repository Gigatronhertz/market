'use strict';
// Market-day check-in (ADM-27 to ADM-35, CHK-01 to CHK-09, VEN-30, WEB-15).
// Staff only see markets they are assigned to; admins see all of them.

const db = require('./db');
const qr = require('./qr');
const markets = require('./markets');
const { HttpError, nowIso, int, reqStr, str } = require('./util');

function accessibleMarkets(user) {
  const rows = user.roles && String(user.roles).includes('admin')
    ? db.all("SELECT * FROM markets WHERE status != 'draft' ORDER BY date DESC")
    : db.all(
        `SELECT m.* FROM markets m JOIN staff_assignments s ON s.market_id = m.id
         WHERE s.user_id = ? AND m.status != 'draft' ORDER BY m.date DESC`,
        user.id
      );
  return rows.map((m) => ({ id: m.id, name: m.name, city: m.city, date: m.date, venue: m.venue, status: markets.effectiveStatus(m) }));
}

function assertMarketAccess(user, marketId) {
  const m = accessibleMarkets(user).find((x) => x.id === int(marketId));
  if (!m) throw new HttpError(403, 'That market is not assigned to you.');
  return m;
}

function logScan(marketId, code, result, userId) {
  db.run('INSERT INTO scan_log (market_id, code, result, user_id, created_at) VALUES (?, ?, ?, ?, ?)', marketId || null, String(code).slice(0, 80), result, userId || null, nowIso());
}

// Resolve a scanned code to a person on this market. Never changes anything.
function resolve(code, marketId) {
  const parsed = qr.parse(code);
  if (!parsed) return { result: 'unknown', message: 'This code is not a Naija Market Day code.' };
  if (parsed.kind === 'guest') {
    const g = db.get('SELECT * FROM guests WHERE qr_token = ?', parsed.token);
    if (!g) return { result: 'unknown', message: 'This QR code was not found.' };
    if (g.market_id !== marketId) {
      const other = db.get('SELECT name FROM markets WHERE id = ?', g.market_id);
      return { result: 'wrong_market', kind: 'guest', name: g.name, message: `This ticket is for ${other ? other.name : 'another market'}.` };
    }
    return {
      result: g.checked_in ? 'duplicate' : 'ready',
      kind: 'guest', id: g.id, name: g.name, email: g.email, guests_count: g.guests_count,
      checked_in: !!g.checked_in, checked_in_at: g.checked_in_at,
      message: g.checked_in ? 'Already checked in. This QR was used before and was not counted again.' : null,
    };
  }
  const a = db.get(
    `SELECT a.*, b.name AS business_name, bo.number AS booth_number, bo.tier AS booth_tier
     FROM applications a LEFT JOIN businesses b ON b.id = a.business_id LEFT JOIN booths bo ON bo.id = a.booth_id
     WHERE a.qr_token = ?`,
    parsed.token
  );
  if (!a) return { result: 'unknown', message: 'This QR code was not found.' };
  if (a.market_id !== marketId) {
    const other = db.get('SELECT name FROM markets WHERE id = ?', a.market_id);
    return { result: 'wrong_market', kind: 'vendor', name: a.business_name || '', message: `This vendor is registered for ${other ? other.name : 'another market'}.` };
  }
  if (a.status !== 'approved') return { result: 'not_approved', kind: 'vendor', name: a.business_name || '', message: 'This application is not approved for this market.' };
  return {
    result: a.attendance === 'checked_in' ? 'duplicate' : a.attendance === 'checked_out' ? 'duplicate' : 'ready',
    kind: 'vendor', id: a.id, name: a.business_name || '', booth: a.booth_number || '', tier: a.booth_tier || '',
    attendance: a.attendance, checked_in_at: a.checked_in_at, checked_out_at: a.checked_out_at,
    message: a.attendance === 'checked_in' ? 'Already checked in. This QR was used before and was not counted again.' : a.attendance === 'checked_out' ? 'This vendor has already checked out.' : null,
  };
}

function scan(user, marketId, code) {
  const m = assertMarketAccess(user, marketId);
  const info = resolve(String(code || ''), m.id);
  logScan(m.id, code, info.result === 'ready' ? 'scanned' : info.result, user.id);
  return info;
}

// Record attendance once, with the time and the staff member (CHK-04, ADM-30).
function checkIn(user, marketId, code) {
  const m = assertMarketAccess(user, marketId);
  const info = resolve(String(code || ''), m.id);
  if (info.result === 'duplicate') {
    logScan(m.id, code, 'duplicate', user.id);
    return { ...info, recorded: false };
  }
  if (info.result !== 'ready') {
    logScan(m.id, code, info.result, user.id);
    throw new HttpError(409, info.message || 'This code cannot be checked in.');
  }
  const at = nowIso();
  if (info.kind === 'guest') {
    db.run('UPDATE guests SET checked_in = 1, checked_in_at = ?, checked_in_by = ? WHERE id = ? AND checked_in = 0', at, user.id, info.id);
  } else {
    db.run("UPDATE applications SET attendance = 'checked_in', checked_in_at = ?, attendance_changed_by = ?, attendance_changed_at = ? WHERE id = ?", at, user.id, at, info.id);
  }
  logScan(m.id, code, 'checked_in', user.id);
  return { ...resolve(String(code), m.id), recorded: true };
}

function checkOut(user, marketId, code) {
  const m = assertMarketAccess(user, marketId);
  const info = resolve(String(code || ''), m.id);
  if (info.kind !== 'vendor') throw new HttpError(400, 'Check-out is for vendors. Guests do not check out.');
  if (info.result === 'unknown' || info.result === 'wrong_market' || info.result === 'not_approved') throw new HttpError(409, info.message);
  if (info.attendance === 'checked_out') return { ...info, recorded: false };
  if (info.attendance !== 'checked_in') throw new HttpError(409, 'Check the vendor in before checking them out.');
  const at = nowIso();
  db.run("UPDATE applications SET attendance = 'checked_out', checked_out_at = ?, attendance_changed_by = ?, attendance_changed_at = ? WHERE id = ?", at, user.id, at, info.id);
  logScan(m.id, code, 'checked_out', user.id);
  return { ...resolve(String(code), m.id), recorded: true };
}

// Search by name or email when a QR will not scan (ADM-32, CHK-06).
function lookup(user, marketId, q) {
  const m = assertMarketAccess(user, marketId);
  const term = `%${str(q, 100).toLowerCase()}%`;
  if (term === '%%') return [];
  const guests = db.all(
    `SELECT id, name, email, checked_in, checked_in_at, qr_token FROM guests
     WHERE market_id = ? AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ?) ORDER BY name LIMIT 30`,
    m.id, term, term
  ).map((g) => ({ kind: 'guest', id: g.id, name: g.name, email: g.email, checked_in: !!g.checked_in, code: qr.guestCode(g.qr_token) }));
  const vendors = db.all(
    `SELECT a.id, a.owner_email, a.attendance, a.qr_token, b.name AS business_name, bo.number AS booth_number
     FROM applications a LEFT JOIN businesses b ON b.id = a.business_id LEFT JOIN booths bo ON bo.id = a.booth_id
     WHERE a.market_id = ? AND a.status = 'approved' AND (LOWER(b.name) LIKE ? OR LOWER(a.owner_email) LIKE ?) ORDER BY b.name LIMIT 30`,
    m.id, term, term
  ).map((v) => ({ kind: 'vendor', id: v.id, name: v.business_name || '', email: v.owner_email, booth: v.booth_number || '', attendance: v.attendance, code: qr.vendorCode(v.qr_token) }));
  return [...vendors, ...guests];
}

// Walk-in guests are registered on the spot and count as attended (ADM-28, CHK-07).
function walkIn(user, marketId, body) {
  const m = assertMarketAccess(user, marketId);
  const name = reqStr(body.name, 'Name', 120);
  const at = nowIso();
  const token = require('./util').randomToken(16);
  const info = db.run(
    `INSERT INTO guests (market_id, name, email, phone, guests_count, source, qr_token, checked_in, checked_in_at, checked_in_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'walkin', ?, 1, ?, ?, ?)`,
    m.id, name, str(body.email, 200).toLowerCase() || `walkin-${token}@walkin.invalid`, str(body.phone, 40),
    Math.min(Math.max(int(body.guests_count, 1), 1), 10), token, at, user.id, at
  );
  return { id: info.lastInsertRowid, name, checked_in: true };
}

// Admin toggles a vendor's attendance by hand, recording who and when (ADM-35).
function setVendorAttendance(actor, appId, status, reason) {
  const valid = ['not_arrived', 'checked_in', 'checked_out', 'no_show'];
  if (!valid.includes(status)) throw new HttpError(400, 'Choose a valid attendance status.');
  const a = db.get('SELECT * FROM applications WHERE id = ?', int(appId));
  if (!a || a.status !== 'approved') throw new HttpError(404, 'Only approved vendors have an attendance record.');
  const at = nowIso();
  db.run(
    `UPDATE applications SET attendance = ?, attendance_changed_by = ?, attendance_changed_at = ?,
       checked_in_at = CASE WHEN ? = 'checked_in' AND checked_in_at IS NULL THEN ? ELSE checked_in_at END,
       checked_out_at = CASE WHEN ? = 'checked_out' THEN ? ELSE checked_out_at END
     WHERE id = ?`,
    status, actor.id, at, status, at, status, at, a.id
  );
  markets.logActivity(actor, 'attendance.manual', `application ${a.id} set to ${status}${reason ? ': ' + str(reason, 200) : ''}`);
  return { ok: true, attendance: status };
}

// Market close: approved vendors who never checked in are recorded as no-shows (ADM-34).
function markNoShows(marketId) {
  const at = nowIso();
  const res = db.run(
    "UPDATE applications SET attendance = 'no_show', attendance_changed_at = ? WHERE market_id = ? AND status = 'approved' AND attendance = 'not_arrived'",
    at, marketId
  );
  return res.changes;
}

// Guest and vendor list for the admin screens (ADM-27).
function guestList(marketId, q) {
  const term = `%${str(q, 100).toLowerCase()}%`;
  return db.all(
    `SELECT id, name, email, phone, guests_count, source, checked_in, checked_in_at, created_at FROM guests
     WHERE market_id = ? AND (? = '%%' OR LOWER(name) LIKE ? OR LOWER(email) LIKE ?) ORDER BY created_at DESC`,
    int(marketId), term, term, term
  );
}

function staffAssignments(marketId) {
  return db.all(
    `SELECT u.id, u.name, u.email FROM staff_assignments s JOIN users u ON u.id = s.user_id WHERE s.market_id = ? ORDER BY u.name`,
    int(marketId)
  );
}

module.exports = { accessibleMarkets, assertMarketAccess, scan, checkIn, checkOut, lookup, walkIn, setVendorAttendance, markNoShows, guestList, staffAssignments, resolve };
