'use strict';
// Check-in staff and admin API. Staff see only their assigned markets (CHK-01); admin-only areas
// are guarded by requireRole('admin') (ADM-64).

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const markets = require('../markets');
const apps = require('../applications');
const checkin = require('../checkin');
const admin = require('../admin');
const commerce = require('../commerce');
const scheduler = require('../scheduler');
const { wrap, HttpError, int, str, reqStr, toCsv } = require('../util');

const router = express.Router();
router.use(auth.loadUser);

const staffOnly = [auth.requireRole('staff', 'admin')];
const adminOnly = [auth.requireRole('admin')];

function csv(res, name, body) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(body);
}

// ======================= CHECK-IN STAFF (CHK-01 to CHK-09) =======================

router.get('/staff/markets', ...staffOnly, wrap(async (req, res) => res.json(checkin.accessibleMarkets(req.user))));
router.post('/staff/scan', ...staffOnly, wrap(async (req, res) => res.json(checkin.scan(req.user, (req.body || {}).market_id, (req.body || {}).code))));
router.post('/staff/checkin', ...staffOnly, wrap(async (req, res) => res.json(checkin.checkIn(req.user, (req.body || {}).market_id, (req.body || {}).code))));
router.post('/staff/checkout', ...staffOnly, wrap(async (req, res) => res.json(checkin.checkOut(req.user, (req.body || {}).market_id, (req.body || {}).code))));
router.get('/staff/lookup', ...staffOnly, wrap(async (req, res) => res.json(checkin.lookup(req.user, req.query.market_id, req.query.q))));
router.post('/staff/walkin', ...staffOnly, wrap(async (req, res) => res.status(201).json(checkin.walkIn(req.user, (req.body || {}).market_id, req.body || {}))));

// ======================= ADMIN: DASHBOARD (ADM-01 to ADM-05) =======================

router.get('/admin/dashboard', ...adminOnly, wrap(async (req, res) => res.json(admin.dashboard(req.query))));
router.get('/admin/dashboard.csv', ...adminOnly, wrap(async (req, res) => csv(res, 'dashboard.csv', admin.dashboardCsv(req.query))));

// ======================= ADMIN: MARKETS (ADM-06 to ADM-15) =======================

router.get('/admin/markets', ...adminOnly, wrap(async (_req, res) => res.json(db.all('SELECT * FROM markets ORDER BY date DESC').map(markets.marketView))));
router.post('/admin/markets', ...adminOnly, wrap(async (req, res) => res.status(201).json(markets.createMarket(req.user, req.body || {}))));
router.get('/admin/markets/:id', ...adminOnly, wrap(async (req, res) => {
  const m = markets.getMarketRow(int(req.params.id));
  if (!m) throw new HttpError(404, 'That market was not found.');
  res.json({ ...markets.marketView(m), booths: markets.boothsForMarket(m.id) });
}));
router.put('/admin/markets/:id', ...adminOnly, wrap(async (req, res) => res.json(markets.updateMarket(req.user, req.params.id, req.body || {}))));
router.post('/admin/markets/:id/publish', ...adminOnly, wrap(async (req, res) => res.json(markets.setMarketStatus(req.user, req.params.id, 'published'))));
router.post('/admin/markets/:id/unpublish', ...adminOnly, wrap(async (req, res) => res.json(markets.setMarketStatus(req.user, req.params.id, 'draft'))));
router.post('/admin/markets/:id/close', ...adminOnly, wrap(async (req, res) => res.json(markets.closeMarket(req.user, req.params.id))));
router.post('/admin/markets/:id/floor-plan', ...adminOnly, wrap(async (req, res) => res.json(markets.setFloorPlan(req.user, req.params.id, (req.body || {}).data_url))));
router.post('/admin/markets/:id/booths', ...adminOnly, wrap(async (req, res) => res.status(201).json(markets.addBooths(req.user, req.params.id, req.body || {}))));
router.put('/admin/booths/:id', ...adminOnly, wrap(async (req, res) => res.json(markets.updateBooth(req.user, req.params.id, req.body || {}))));
router.get('/admin/markets/:id/report', ...adminOnly, wrap(async (req, res) => res.json(admin.marketReport(req.params.id))));
router.get('/admin/markets/:id/report.csv', ...adminOnly, wrap(async (req, res) => csv(res, 'market-report.csv', admin.marketReportCsv(req.params.id))));
router.get('/admin/markets/:id/staff', ...adminOnly, wrap(async (req, res) => res.json(checkin.staffAssignments(req.params.id))));
router.get('/admin/markets/:id/guests', ...adminOnly, wrap(async (req, res) => res.json(checkin.guestList(req.params.id, req.query.q))));
router.get('/admin/markets/:id/guests.csv', ...adminOnly, wrap(async (req, res) => {
  const rows = checkin.guestList(req.params.id, '');
  csv(res, 'guests.csv', toCsv(rows, [
    { label: 'Name', get: (r) => r.name }, { label: 'Email', get: (r) => r.email }, { label: 'Source', get: (r) => r.source },
    { label: 'Guests', get: (r) => r.guests_count }, { label: 'Checked in', get: (r) => (r.checked_in ? 'yes' : 'no') },
  ]));
}));
router.post('/admin/markets/:id/walkin', ...adminOnly, wrap(async (req, res) => res.status(201).json(checkin.walkIn(req.user, req.params.id, req.body || {}))));
router.post('/admin/markets/:id/send-directory', ...adminOnly, wrap(async (req, res) => res.json(admin.sendDirectoryToGuests(req.user, req.params.id))));
router.put('/admin/users/:id/markets', ...adminOnly, wrap(async (req, res) => res.json(admin.setStaffMarkets(req.user, req.params.id, (req.body || {}).market_ids))));

// Attendance for approved vendors on a market (ADM-30, ADM-33, ADM-34, ADM-35)
router.get('/admin/markets/:id/attendance', ...adminOnly, wrap(async (req, res) => {
  res.json(apps.listApplications({ market_id: req.params.id, status: 'approved' }));
}));
router.post('/admin/applications/:id/attendance', ...adminOnly, wrap(async (req, res) => res.json(checkin.setVendorAttendance(req.user, req.params.id, (req.body || {}).status, (req.body || {}).reason))));

// ======================= ADMIN: APPLICATIONS (ADM-16 to ADM-26) =======================

router.get('/admin/applications', ...adminOnly, wrap(async (req, res) => res.json(apps.listApplications(req.query))));
router.get('/admin/applications/unfinished', ...adminOnly, wrap(async (req, res) => res.json(apps.unfinishedApplications(req.query.market_id))));
router.post('/admin/applications/unfinished/remind', ...adminOnly, wrap(async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map((i) => int(i)) : null;
  const rows = apps.unfinishedApplications((req.body || {}).market_id);
  let sent = 0;
  for (const r of rows) {
    if (ids && !ids.includes(r.id)) continue;
    apps.remindUnfinished(db.get('SELECT * FROM applications WHERE id = ?', r.id), req.user);
    sent++;
  }
  res.json({ sent });
}));
router.get('/admin/applications/:id', ...adminOnly, wrap(async (req, res) => res.json(apps.appDetail(req.params.id))));
router.post('/admin/applications/:id/approve', ...adminOnly, wrap(async (req, res) => res.json(apps.approve(req.user, req.params.id))));
router.post('/admin/applications/:id/more-info', ...adminOnly, wrap(async (req, res) => res.json(apps.requestMoreInfo(req.user, req.params.id, (req.body || {}).note))));
router.post('/admin/applications/:id/decline', ...adminOnly, wrap(async (req, res) => res.json(await apps.decline(req.user, req.params.id))));
router.post('/admin/applications/:id/move', ...adminOnly, wrap(async (req, res) => res.json(apps.moveBooth(req.user, req.params.id, (req.body || {}).booth_id))));
router.post('/admin/applications/:id/notes', ...adminOnly, wrap(async (req, res) => res.json(apps.addNote(req.user, req.params.id, (req.body || {}).body))));
router.post('/admin/applications/:id/directory', ...adminOnly, wrap(async (req, res) => res.json(commerce.setDirectoryHidden(req.user, req.params.id, !!(req.body || {}).hidden))));
router.post('/admin/applications/:id/refund', ...adminOnly, wrap(async (req, res) => res.json(await apps.refundPayment(req.user, req.params.id, (req.body || {}).note))));

router.get('/admin/waitlist', ...adminOnly, wrap(async (req, res) => {
  const where = req.query.market_id ? 'AND w.market_id = ?' : '';
  const params = req.query.market_id ? [int(req.query.market_id)] : [];
  res.json(db.all(
    `SELECT w.id, w.tier, w.status, w.created_at, w.market_id, m.name AS market_name, a.id AS application_id, a.owner_email, b.name AS business_name
     FROM waitlist w JOIN applications a ON a.id = w.application_id JOIN markets m ON m.id = w.market_id
     LEFT JOIN businesses b ON b.id = a.business_id
     WHERE w.status IN ('waiting','offered') ${where} ORDER BY w.created_at`,
    ...params
  ));
}));
router.post('/admin/waitlist/:id/offer', ...adminOnly, wrap(async (req, res) => res.json(apps.offerWaitlist(req.user, req.params.id, (req.body || {}).booth_id))));

router.get('/admin/booths', ...adminOnly, wrap(async (req, res) => res.json(markets.boothsForMarket(int(req.query.market_id)))));
router.post('/admin/booths/:id/reserve', ...adminOnly, wrap(async (req, res) => res.json(markets.updateBooth(req.user, req.params.id, { reserved: !!(req.body || {}).reserved, note: (req.body || {}).note }))));

router.get('/admin/payments', ...adminOnly, wrap(async (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.market_id) { where += ' AND a.market_id = ?'; params.push(int(req.query.market_id)); }
  res.json(db.all(
    `SELECT p.id, p.kind, p.amount_cents, p.status, p.provider, p.provider_ref, p.note, p.created_at,
       a.id AS application_id, b.name AS business, m.name AS market_name, bo.number AS booth
     FROM payments p LEFT JOIN applications a ON a.id = p.application_id LEFT JOIN businesses b ON b.id = a.business_id
     LEFT JOIN markets m ON m.id = a.market_id LEFT JOIN booths bo ON bo.id = a.booth_id
     WHERE ${where} AND p.kind IN ('booth_fee','refund') ORDER BY p.id DESC LIMIT 500`,
    ...params
  ));
}));

// ======================= ADMIN: DIRECTORY AND MARKETPLACE (ADM-38 to ADM-44) =======================

router.get('/admin/directory', ...adminOnly, wrap(async (req, res) => {
  const rows = apps.listApplications({ market_id: req.query.market_id, status: 'approved' });
  res.json(rows);
}));
router.get('/admin/subscriptions', ...adminOnly, wrap(async (_req, res) => res.json(admin.adminSubscriptions())));
router.put('/admin/plans/:code', ...adminOnly, wrap(async (req, res) => res.json(admin.updatePlan(req.user, req.params.code, req.body || {}))));
router.get('/admin/listings', ...adminOnly, wrap(async (_req, res) => res.json(admin.listingsAdmin())));
router.post('/admin/listings/:id/hide', ...adminOnly, wrap(async (req, res) => res.json(admin.hideListing(req.user, req.params.id, !!(req.body || {}).hidden, (req.body || {}).reason))));

// ======================= ADMIN: MESSAGING (ADM-45 to ADM-49) =======================

router.get('/admin/messaging/templates', ...adminOnly, wrap(async (_req, res) => res.json(admin.templates())));
router.put('/admin/messaging/templates/:key', ...adminOnly, wrap(async (req, res) => res.json(admin.updateTemplate(req.user, req.params.key, req.body || {}))));
router.get('/admin/messaging/templates/:key/preview', ...adminOnly, wrap(async (req, res) => res.json(admin.previewTemplate(req.params.key, req.query.market_id))));
router.post('/admin/messaging/bulk/preview', ...adminOnly, wrap(async (req, res) => res.json(admin.bulkPreview(req.body || {}))));
router.post('/admin/messaging/bulk/send', ...adminOnly, wrap(async (req, res) => res.json(admin.bulkSend(req.user, req.body || {}))));
router.get('/admin/outbox', ...adminOnly, wrap(async (req, res) => res.json(admin.outbox(req.query.limit))));
// Send a template to the signed-in admin, so the team can see exactly what vendors receive.
router.post('/admin/messaging/test', ...adminOnly, wrap(async (req, res) => {
  const key = String((req.body || {}).key || '');
  const t = db.get('SELECT key FROM notification_templates WHERE key = ?', key);
  if (!t) throw new HttpError(404, 'That message was not found.');
  const preview = admin.previewTemplate(key, null);
  require('../notify').queue({ to: req.user.email, subject: '[Test] ' + preview.subject, body: preview.body, templateKey: key });
  res.json({ ok: true, to: req.user.email });
}));
// Reply to a support inquiry by email and mark it handled.
router.post('/admin/inquiries/:id/reply', ...adminOnly, wrap(async (req, res) => {
  const inq = db.get('SELECT * FROM inquiries WHERE id = ?', int(req.params.id));
  if (!inq) throw new HttpError(404, 'That inquiry was not found.');
  const body = reqStr((req.body || {}).body, 'Reply', 4000);
  require('../notify').queue({ to: inq.email, subject: 'Re: ' + inq.topic, body });
  db.run("UPDATE inquiries SET status = 'handled' WHERE id = ?", inq.id);
  markets.logActivity(req.user, 'inquiry.replied', String(inq.id));
  res.json({ ok: true });
}));

// ======================= ADMIN: BANNER ADS (ADM-50 to ADM-52) =======================

router.get('/admin/banners', ...adminOnly, wrap(async (_req, res) => res.json(admin.banners())));
router.post('/admin/banners', ...adminOnly, wrap(async (req, res) => res.status(201).json(admin.saveBanner(req.user, null, req.body || {}))));
router.put('/admin/banners/:id', ...adminOnly, wrap(async (req, res) => res.json(admin.saveBanner(req.user, req.params.id, req.body || {}))));

// ======================= ADMIN: SITE CONTENT (ADM-53 to ADM-59) =======================

router.get('/admin/content/:table', ...adminOnly, wrap(async (req, res) => res.json(admin.contentList(req.params.table))));
router.post('/admin/content/:table', ...adminOnly, wrap(async (req, res) => res.status(201).json(admin.contentSave(req.user, req.params.table, null, req.body || {}))));
router.put('/admin/content/:table/:id', ...adminOnly, wrap(async (req, res) => res.json(admin.contentSave(req.user, req.params.table, req.params.id, req.body || {}))));
router.delete('/admin/content/:table/:id', ...adminOnly, wrap(async (req, res) => res.json(admin.contentDelete(req.user, req.params.table, req.params.id))));
router.get('/admin/events', ...adminOnly, wrap(async (req, res) => res.json(admin.communityEvents(req.query.status))));
router.post('/admin/events', ...adminOnly, wrap(async (req, res) => res.status(201).json(admin.saveEvent(req.body || {}, 'approved', req.user.id))));
router.post('/admin/events/:id/decide', ...adminOnly, wrap(async (req, res) => res.json(admin.decideEvent(req.user, req.params.id, (req.body || {}).decision))));
router.get('/admin/inquiries', ...adminOnly, wrap(async (req, res) => res.json(admin.inquiries(req.query.status))));
router.post('/admin/inquiries/:id/handle', ...adminOnly, wrap(async (req, res) => res.json(admin.handleInquiry(req.user, req.params.id))));
router.get('/admin/subscribers', ...adminOnly, wrap(async (_req, res) => res.json(admin.subscribers())));
router.get('/admin/subscribers.csv', ...adminOnly, wrap(async (_req, res) => {
  csv(res, 'subscribers.csv', toCsv(admin.subscribers().filter((s) => !s.unsubscribed_at), [
    { label: 'Email', get: (r) => r.email }, { label: 'Consent date', get: (r) => r.consent_at },
  ]));
}));
router.delete('/admin/subscribers/:id', ...adminOnly, wrap(async (req, res) => res.json(admin.removeSubscriber(req.user, req.params.id))));

// ======================= ADMIN: USERS (ADM-61 to ADM-66) =======================

router.get('/admin/users', ...adminOnly, wrap(async (req, res) => res.json(admin.users(req.query))));
router.get('/admin/users/:id', ...adminOnly, wrap(async (req, res) => res.json(admin.userProfile(req.params.id))));
router.post('/admin/users/invite', ...adminOnly, wrap(async (req, res) => res.status(201).json(admin.inviteStaff(req.user, req.body || {}))));
router.post('/admin/users/:id/:action', ...adminOnly, wrap(async (req, res) => res.json(await admin.userAction(req.user, req.params.id, req.params.action))));
router.get('/admin/activity', ...adminOnly, wrap(async (req, res) => res.json(admin.activityLog(req.query))));

// ======================= ADMIN: SETTINGS (ADM-67) =======================

router.get('/admin/settings', ...adminOnly, wrap(async (_req, res) => res.json(admin.settings())));
router.put('/admin/settings', ...adminOnly, wrap(async (req, res) => res.json(admin.updateSettings(req.user, req.body || {}))));
router.post('/admin/scheduler/run', ...adminOnly, wrap(async (_req, res) => res.json(await scheduler.runAll())));

module.exports = router;
