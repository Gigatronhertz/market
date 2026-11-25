'use strict';
// Directory (WEB-17 to WEB-21, ADM-38 to ADM-40), Marketplace (WEB-22 to WEB-25, VEN-32 to VEN-35,
// ADM-41 to ADM-44), vendor businesses (VEN-36 to VEN-40), buyer cart and chats (BUY-01 to BUY-12,
// VEN-41 to VEN-43), vendor notifications and receipts (VEN-44, VEN-45).

const db = require('./db');
const auth = require('./auth');
const notify = require('./notify');
const payments = require('./payments');
const markets = require('./markets');
const { HttpError, nowIso, addDays, todayYmd, int, str, reqStr, money, cents, sha256, randomToken } = require('./util');

// ======================= DIRECTORY =======================

function directoryCities() {
  return db
    .all("SELECT DISTINCT city FROM markets WHERE status != 'draft' ORDER BY city")
    .map((r) => r.city);
}

// Markets in a city (published, closed or past). Past markets stay available (WEB-17).
function directoryMarkets(city) {
  return db
    .all("SELECT * FROM markets WHERE status != 'draft' AND (? = '' OR LOWER(city) = LOWER(?)) ORDER BY date DESC", str(city, 80), str(city, 80))
    .map((m) => ({ id: m.id, name: m.name, city: m.city, date: m.date, venue: m.venue, status: markets.effectiveStatus(m), vendors: directoryCount(m.id) }));
}

function directoryCount(marketId) {
  return db.get(
    `SELECT COUNT(*) AS n FROM applications a WHERE a.market_id = ? AND a.status = 'approved' AND a.hidden_from_directory = 0 ${noShowFilter()}`,
    marketId
  ).n;
}

function noShowFilter() {
  return db.getSetting('hide_no_shows_from_directory', false) ? "AND a.attendance != 'no_show'" : '';
}

// Vendors listed for one market: each market has its own list, built from approved applications (WEB-21, ADM-38).
function directoryVendors(marketId, { q = '', category = '' } = {}) {
  const term = `%${str(q, 100).toLowerCase()}%`;
  return db
    .all(
      `SELECT b.id AS business_id, b.name, b.category, bo.number AS booth_number, bo.tier AS booth_tier, a.id AS application_id
       FROM applications a
       JOIN businesses b ON b.id = a.business_id
       LEFT JOIN booths bo ON bo.id = a.booth_id
       WHERE a.market_id = ? AND a.status = 'approved' AND a.hidden_from_directory = 0 ${noShowFilter()}
         AND (LOWER(b.name) LIKE ?) AND (? = '' OR b.category = ?)
       ORDER BY b.name`,
      int(marketId), term, str(category, 40), str(category, 40)
    )
    .map((r) => ({ ...r, category_label: categoryLabel(r.category) }));
}

function categoryLabel(key) {
  const map = { sponsors: 'Sponsors', corporate: 'Corporate vendors', premium: 'Premium vendors', general: 'General vendors' };
  return map[key] || key || '';
}

// Public vendor profile (WEB-19). Only businesses with an approved, visible application appear.
function vendorProfile(businessId) {
  const b = db.get('SELECT * FROM businesses WHERE id = ?', int(businessId));
  if (!b) throw new HttpError(404, 'That vendor was not found.');
  const listed = db.get(
    `SELECT COUNT(*) AS n FROM applications WHERE business_id = ? AND status = 'approved' AND hidden_from_directory = 0 ${noShowFilter()}`,
    b.id
  ).n;
  if (!listed) throw new HttpError(404, 'That vendor is not listed in a directory.');
  return {
    id: b.id,
    name: b.name,
    category: categoryLabel(b.category),
    description: b.description,
    phone: b.phone,
    email: b.email,
    website: b.website,
    socials: JSON.parse(b.socials || '{}'),
    logo_url: b.logo_url,
    markets: db.all(
      `SELECT m.id, m.name, m.city, m.date FROM applications a JOIN markets m ON m.id = a.market_id
       WHERE a.business_id = ? AND a.status = 'approved' AND a.hidden_from_directory = 0 ORDER BY m.date DESC`,
      b.id
    ),
  };
}

// Admin: edit or hide an entry in a market directory (ADM-39).
function setDirectoryHidden(actor, applicationId, hidden) {
  const a = db.get('SELECT * FROM applications WHERE id = ?', int(applicationId));
  if (!a) throw new HttpError(404, 'That application was not found.');
  db.run('UPDATE applications SET hidden_from_directory = ?, updated_at = ? WHERE id = ?', hidden ? 1 : 0, nowIso(), a.id);
  markets.logActivity(actor, hidden ? 'directory.hidden' : 'directory.shown', `application ${a.id}`);
  return { ok: true, hidden: !!hidden };
}

// ======================= MARKETPLACE =======================

// A business can sell while its subscription is in its free period, active, or cancelled but not yet ended (VEN-34).
function subscriptionActive(businessId) {
  const s = db.get(
    "SELECT * FROM subscriptions WHERE business_id = ? AND status IN ('trial','active','cancelled') ORDER BY id DESC LIMIT 1",
    businessId
  );
  return !!s && s.renews_at > nowIso() ? s : null;
}

function listingsPublic({ q = '', category = '', business_id = null } = {}) {
  const term = `%${str(q, 100).toLowerCase()}%`;
  const rows = db.all(
    `SELECT l.*, b.name AS vendor_name FROM listings l JOIN businesses b ON b.id = l.business_id
     WHERE l.hidden = 0 AND (LOWER(l.name) LIKE ?) AND (? = '' OR l.category = ?) AND (? IS NULL OR l.business_id = ?)
     ORDER BY l.updated_at DESC LIMIT 200`,
    term, str(category, 40), str(category, 40), business_id ? int(business_id) : null, business_id ? int(business_id) : null
  );
  return rows.filter((l) => subscriptionActive(l.business_id)).map(listingCard);
}

function listingCard(l) {
  const photos = JSON.parse(l.photos || '[]');
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    price_cents: l.price_cents,
    sale_price_cents: l.sale_price_cents,
    photo: photos[0] || null,
    vendor_name: l.vendor_name,
    business_id: l.business_id,
  };
}

function listingDetail(id, { countView = true } = {}) {
  const l = db.get(
    'SELECT l.*, b.name AS vendor_name FROM listings l JOIN businesses b ON b.id = l.business_id WHERE l.id = ?',
    int(id)
  );
  if (!l || l.hidden || !subscriptionActive(l.business_id)) throw new HttpError(404, 'That listing is not available.');
  if (countView) db.run('UPDATE listings SET views = views + 1 WHERE id = ?', l.id);
  return {
    ...listingCard(l),
    description: l.description,
    photos: JSON.parse(l.photos || '[]'),
    original_price_cents: l.sale_price_cents ? l.price_cents : null,
    saving_cents: l.sale_price_cents ? l.price_cents - l.sale_price_cents : null,
    current_price_cents: l.sale_price_cents || l.price_cents,
  };
}

function plans() {
  return db.all('SELECT * FROM plans ORDER BY price_cents');
}

// Vendor subscribes one business. The first subscription per business starts the free period (WEB-VEN-33).
async function subscribe(user, businessId, planCode) {
  const biz = ownedBusiness(user, businessId);
  if (subscriptionActive(biz.id)) throw new HttpError(409, 'This business already has an active Marketplace subscription.');
  const plan = db.get('SELECT * FROM plans WHERE code = ?', String(planCode || ''));
  if (!plan) throw new HttpError(400, 'Choose a plan.');
  const previous = db.get('SELECT id FROM subscriptions WHERE business_id = ?', biz.id);
  const hasTrial = !previous && plan.free_days > 0;
  const at = nowIso();
  if (hasTrial) {
    db.run("INSERT INTO subscriptions (business_id, plan_code, status, started_at, renews_at, created_at) VALUES (?, ?, 'trial', ?, ?, ?)",
      biz.id, plan.code, at, addDays(at, plan.free_days), at);
    notify.addBell(user.id, 'Marketplace is on', `${biz.name}: free period of ${plan.free_days} days`, '/app/vendor.html#/marketplace');
    notify.sendTemplate('subscription_update', user.email, { name: user.name, message: `Your free starting period of ${plan.free_days} days has begun. It ends on ${addDays(at, plan.free_days).slice(0, 10)}.` });
    return { status: 'trial', renews_at: addDays(at, plan.free_days) };
  }
  const result = await payments.startCharge({
    kind: 'subscription', ref: biz.id, description: `Marketplace ${plan.name}: ${biz.name}`,
    amount_cents: plan.price_cents, successPath: '/app/vendor.html#/marketplace', cancelPath: '/app/vendor.html#/marketplace',
  });
  if (result.status === 'failed') throw new HttpError(402, 'The payment did not go through. Try again.');
  if (result.status === 'pending') return { redirect: result.checkout_url, status: 'pending' };
  activateSubscription(biz, plan, result.provider, result.ref, user);
  return { status: 'active', renews_at: addDays(at, plan.period_days) };
}

function activateSubscription(biz, plan, provider, ref, user) {
  const at = nowIso();
  db.run("INSERT INTO subscriptions (business_id, plan_code, status, started_at, renews_at, created_at) VALUES (?, ?, 'active', ?, ?, ?)",
    biz.id, plan.code, at, addDays(at, plan.period_days), at);
  db.run("INSERT INTO payments (subscription_id, kind, amount_cents, status, provider, provider_ref, triggered_by, note, created_at) VALUES (NULL, 'subscription', ?, 'succeeded', ?, ?, ?, ?, ?)",
    plan.price_cents, provider, ref, user ? user.id : null, `${biz.name}: ${plan.name}`, at);
  if (user) notify.addBell(user.id, 'Marketplace subscription started', `${biz.name}, ${plan.name}`, '/app/vendor.html#/marketplace');
}

async function cancelSubscription(user, businessId) {
  const biz = ownedBusiness(user, businessId);
  const s = subscriptionActive(biz.id);
  if (!s) throw new HttpError(409, 'There is no active subscription to cancel.');
  db.run("UPDATE subscriptions SET status = 'cancelled', cancel_at_period_end = 1 WHERE id = ?", s.id);
  notify.sendTemplate('subscription_update', user.email, { name: user.name, message: `Your Marketplace subscription for ${biz.name} is cancelled. Listings stay online until ${s.renews_at.slice(0, 10)}, then go offline.` });
  return { ok: true, listings_offline_on: s.renews_at.slice(0, 10) };
}

// Scheduled job: renew paid subscriptions, lapse the ones that end (VEN-34, NOT-16).
async function runSubscriptionRenewals() {
  const now = nowIso();
  const due = db.all("SELECT s.*, b.name AS biz_name, b.owner_user_id, b.owner_email FROM subscriptions s JOIN businesses b ON b.id = s.business_id WHERE s.status IN ('trial','active','cancelled') AND s.renews_at <= ?", now);
  for (const s of due) {
    if (s.status === 'trial' || s.status === 'active') {
      const plan = db.get('SELECT * FROM plans WHERE code = ?', s.plan_code);
      if (!s.cancel_at_period_end && plan) {
        const result = await payments.startCharge({ kind: 'subscription', ref: s.business_id, description: `Marketplace renewal: ${s.biz_name}`, amount_cents: plan.price_cents, successPath: '/app/vendor.html#/marketplace', cancelPath: '/app/vendor.html#/marketplace' });
        if (result.status === 'succeeded') {
          db.run("UPDATE subscriptions SET status='active', renews_at=?, started_at=? WHERE id=?", addDays(now, plan.period_days), now, s.id);
          db.run("INSERT INTO payments (kind, amount_cents, status, provider, provider_ref, note, created_at) VALUES ('subscription', ?, 'succeeded', ?, ?, ?, ?)", plan.price_cents, result.provider, result.ref, `Renewal: ${s.biz_name}`, now);
          continue;
        }
        // Stripe needs the vendor to confirm renewal in the portal; tell them and lapse for now.
      }
    }
    db.run("UPDATE subscriptions SET status='lapsed' WHERE id = ?", s.id);
    if (s.owner_user_id) notify.addBell(s.owner_user_id, 'Marketplace listings are offline', s.biz_name, '/app/vendor.html#/marketplace');
    notify.sendTemplate('subscription_update', s.owner_email, { name: '', message: `Your Marketplace subscription for ${s.biz_name} has lapsed. New chats are paused and listings are offline until you renew.` });
  }
  return due.length;
}

// ======================= VENDOR: BUSINESSES =======================

function ownedBusiness(user, businessId) {
  const b = db.get('SELECT * FROM businesses WHERE id = ?', int(businessId));
  if (!b || (b.owner_user_id !== user.id && b.owner_email.toLowerCase() !== user.email.toLowerCase())) {
    throw new HttpError(404, 'That business is not on your account.');
  }
  return b;
}

function myBusinesses(user) {
  return db
    .all('SELECT * FROM businesses WHERE owner_user_id = ? OR owner_email = ? COLLATE NOCASE ORDER BY name', user.id, user.email)
    .map(businessView);
}

function businessView(b) {
  return {
    id: b.id, name: b.name, category: b.category, contact_person: b.contact_person, phone: b.phone, email: b.email,
    city: b.city, description: b.description, website: b.website, socials: JSON.parse(b.socials || '{}'), logo_url: b.logo_url,
    subscription: subscriptionSummary(b.id),
  };
}

function subscriptionSummary(businessId) {
  const s = db.get('SELECT * FROM subscriptions WHERE business_id = ? ORDER BY id DESC LIMIT 1', businessId);
  const active = subscriptionActive(businessId);
  return s ? { status: active ? s.status : 'lapsed', plan_code: s.plan_code, renews_at: s.renews_at, cancel_at_period_end: !!s.cancel_at_period_end, active: !!active } : { status: 'none', active: false };
}

function saveBusiness(user, businessId, body) {
  const existing = businessId ? ownedBusiness(user, businessId) : null;
  const fields = {
    name: reqStr(body.name, 'Business name', 120),
    category: str(body.category, 40),
    contact_person: str(body.contact_person, 120),
    phone: str(body.phone, 40),
    email: str(body.email, 200) || user.email,
    city: str(body.city, 80),
    description: str(body.description, 2000),
    website: str(body.website, 200),
    socials: JSON.stringify(sanitizeSocials(body.socials)),
    logo_url: body.logo_url && /^data:image\/(png|jpeg|webp);base64,/.test(body.logo_url) ? body.logo_url : null,
  };
  const now = nowIso();
  if (existing) {
    db.run(
      `UPDATE businesses SET name=?, category=?, contact_person=?, phone=?, email=?, city=?, description=?, website=?, socials=?,
       logo_url=COALESCE(?, logo_url), updated_at=? WHERE id=?`,
      fields.name, fields.category, fields.contact_person, fields.phone, fields.email, fields.city, fields.description,
      fields.website, fields.socials, fields.logo_url, now, existing.id
    );
    return businessView(db.get('SELECT * FROM businesses WHERE id = ?', existing.id));
  }
  const info = db.run(
    `INSERT INTO businesses (owner_email, owner_user_id, name, category, contact_person, phone, email, city, description, website, socials, logo_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.email, user.id, fields.name, fields.category, fields.contact_person, fields.phone, fields.email, fields.city,
    fields.description, fields.website, fields.socials, fields.logo_url, now, now
  );
  return businessView(db.get('SELECT * FROM businesses WHERE id = ?', info.lastInsertRowid));
}

function sanitizeSocials(s) {
  const out = {};
  for (const k of ['instagram', 'facebook', 'tiktok', 'x', 'youtube']) {
    if (s && s[k]) out[k] = str(s[k], 120);
  }
  return out;
}

function deleteBusiness(user, businessId) {
  const b = ownedBusiness(user, businessId);
  const used = db.get('SELECT COUNT(*) AS n FROM applications WHERE business_id = ?', b.id).n;
  if (used) throw new HttpError(409, 'This business has applications, so it cannot be removed. Edit it instead.');
  db.run('DELETE FROM businesses WHERE id = ?', b.id);
  return { ok: true };
}

// ======================= VENDOR: DASHBOARD, BELL, RECEIPTS =======================

function vendorApplications(user, businessId = null) {
  const rows = db.all(
    `SELECT a.*, b.name AS business_name, m.name AS market_name, m.city, m.date AS market_date, bo.number AS booth_number, bo.tier AS booth_tier
     FROM applications a
     LEFT JOIN businesses b ON b.id = a.business_id
     JOIN markets m ON m.id = a.market_id
     LEFT JOIN booths bo ON bo.id = a.booth_id
     WHERE (a.owner_user_id = ? OR a.owner_email = ? COLLATE NOCASE) AND (? IS NULL OR a.business_id = ?)
     ORDER BY m.date ASC, a.id DESC`,
    user.id, user.email, businessId ? int(businessId) : null, businessId ? int(businessId) : null
  );
  return rows.map((r) => ({
    id: r.id,
    market_id: r.market_id,
    market_name: r.market_name,
    city: r.city,
    market_date: r.market_date,
    business: r.business_name || '',
    business_id: r.business_id,
    status: r.status,
    payment_status: r.payment_status,
    booth: r.booth_number || '',
    tier: r.booth_tier || '',
    step: r.step,
    qr_data_url: null,
    has_qr: !!r.qr_token && r.status === 'approved',
    more_info_note: r.more_info_note,
    waitlisted: r.status === 'waitlisted' || r.status === 'offered',
    hold_until: null,
    attendance: r.status === 'approved' ? r.attendance : null,
  }));
}

function vendorDashboard(user, businessId = null) {
  const apps = vendorApplications(user, businessId);
  const today = todayYmd();
  const next = apps.filter((a) => a.status === 'approved' && a.market_date >= today)[0] || null;
  const subs = businessId ? [subscriptionSummary(int(businessId))] : myBusinesses(user).map((b) => b.subscription);
  const unread = db.get(
    `SELECT COUNT(*) AS n FROM chat_messages cm JOIN chats c ON c.id = cm.chat_id
     WHERE cm.sender_role = 'buyer' AND cm.created_at > COALESCE(c.vendor_last_read_at, '') AND (? IS NULL OR c.business_id = ?)
       AND c.business_id IN (SELECT id FROM businesses WHERE owner_user_id = ? OR owner_email = ? COLLATE NOCASE)`,
    businessId ? int(businessId) : null, businessId ? int(businessId) : null, user.id, user.email
  ).n;
  const counts = {};
  for (const a of apps) counts[a.status] = (counts[a.status] || 0) + 1;
  return {
    application_counts: counts,
    applications_total: apps.length,
    next_market: next ? { id: next.market_id, name: next.market_name, date: next.market_date, city: next.city, booth: next.booth, application_id: next.id } : null,
    booth_number: next ? next.booth : null,
    subscription: subs[0] || { status: 'none', active: false },
    subscriptions: subs,
    unread_messages: unread,
    unread_notifications: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', user.id).n,
  };
}

function bell(user) {
  const items = db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', user.id);
  return { unread: items.filter((i) => !i.read).length, items };
}
function markBellRead(user) {
  db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', user.id);
  return { ok: true };
}

// Booth fee receipts and refunds (VEN-45).
function receipts(user) {
  return db.all(
    `SELECT p.id, p.kind, p.amount_cents, p.status, p.created_at, p.note, m.name AS market_name, bo.number AS booth
     FROM payments p
     JOIN applications a ON a.id = p.application_id
     JOIN markets m ON m.id = a.market_id
     LEFT JOIN booths bo ON bo.id = a.booth_id
     WHERE (a.owner_user_id = ? OR a.owner_email = ? COLLATE NOCASE) AND p.kind IN ('booth_fee','refund')
     ORDER BY p.id DESC`,
    user.id, user.email
  );
}

// ======================= BUYER: CART, CHATS, ACCOUNT =======================

function cartView(user) {
  const rows = db.all(
    `SELECT c.id AS item_id, c.qty, l.id AS listing_id, l.name, l.price_cents, l.sale_price_cents, l.photos, l.business_id, b.name AS vendor_name
     FROM cart_items c JOIN listings l ON l.id = c.listing_id JOIN businesses b ON b.id = l.business_id
     WHERE c.buyer_id = ? AND l.hidden = 0 ORDER BY c.id`,
    user.id
  ).filter((r) => subscriptionActive(r.business_id));
  const groups = {};
  for (const r of rows) {
    const g = (groups[r.business_id] = groups[r.business_id] || { business_id: r.business_id, vendor_name: r.vendor_name, items: [], subtotal_cents: 0 });
    const unit = r.sale_price_cents || r.price_cents;
    g.items.push({ item_id: r.item_id, listing_id: r.listing_id, name: r.name, qty: r.qty, unit_cents: unit, line_cents: unit * r.qty, photo: JSON.parse(r.photos || '[]')[0] || null });
    g.subtotal_cents += unit * r.qty;
  }
  return { groups: Object.values(groups), disclaimer: db.getSetting('disclaimer_text', '') };
}

function cartAdd(user, listingId, qty = 1) {
  const l = db.get('SELECT * FROM listings WHERE id = ?', int(listingId));
  if (!l || l.hidden || !subscriptionActive(l.business_id)) throw new HttpError(404, 'That listing is not available.');
  const q = Math.min(Math.max(int(qty, 1), 1), 99);
  db.run(
    `INSERT INTO cart_items (buyer_id, listing_id, qty, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(buyer_id, listing_id) DO UPDATE SET qty = MIN(qty + excluded.qty, 99)`,
    user.id, l.id, q, nowIso()
  );
  return cartView(user);
}

function cartUpdate(user, itemId, qty) {
  const item = db.get('SELECT * FROM cart_items WHERE id = ? AND buyer_id = ?', int(itemId), user.id);
  if (!item) throw new HttpError(404, 'That item is not in your cart.');
  const q = int(qty, 0);
  if (q <= 0) db.run('DELETE FROM cart_items WHERE id = ?', item.id);
  else db.run('UPDATE cart_items SET qty = ? WHERE id = ?', Math.min(q, 99), item.id);
  return cartView(user);
}

// One store at a time (BUY-05). Proceeding opens a chat with that vendor and removes only that vendor's items from the cart.
function proceedWithVendor(user, businessId, acknowledged) {
  if (!acknowledged) throw new HttpError(400, 'Read and accept the liability disclaimer before you proceed.');
  const biz = db.get('SELECT * FROM businesses WHERE id = ?', int(businessId));
  if (!biz) throw new HttpError(404, 'That vendor was not found.');
  const items = db.all(
    `SELECT c.id AS item_id, c.qty, l.name, l.price_cents, l.sale_price_cents FROM cart_items c JOIN listings l ON l.id = c.listing_id
     WHERE c.buyer_id = ? AND l.business_id = ?`,
    user.id, biz.id
  );
  if (!items.length) throw new HttpError(400, 'There are no items from this vendor in your cart.');
  if (!subscriptionActive(biz.id)) throw new HttpError(409, 'This vendor is not taking new messages right now.');
  const reply = db.getSetting('buyer_reply_hours', 24);
  const at = nowIso();
  let chat = db.get('SELECT * FROM chats WHERE buyer_id = ? AND business_id = ?', user.id, biz.id);
  let chatId;
  db.tx(() => {
    if (!chat) {
      const info = db.run('INSERT INTO chats (buyer_id, business_id, created_at, last_message_at, buyer_last_read_at) VALUES (?, ?, ?, ?, ?)', user.id, biz.id, at, at, at);
      chatId = info.lastInsertRowid;
    } else {
      chatId = chat.id;
    }
    const lines = items.map((i) => {
      const unit = i.sale_price_cents || i.price_cents;
      return `• ${i.name} × ${i.qty} @ ${cents(unit)}`;
    });
    const total = items.reduce((s, i) => s + (i.sale_price_cents || i.price_cents) * i.qty, 0);
    const body = `I'm interested in these items:\n${lines.join('\n')}\nSubtotal: ${cents(total)}`;
    db.run("INSERT INTO chat_messages (chat_id, sender_role, sender_id, body, created_at) VALUES (?, 'buyer', ?, ?, ?)", chatId, user.id, body, at);
    db.run('UPDATE chats SET last_message_at = ?, buyer_last_read_at = ? WHERE id = ?', at, at, chatId);
    db.run(`DELETE FROM cart_items WHERE buyer_id = ? AND listing_id IN (SELECT id FROM listings WHERE business_id = ?)`, user.id, biz.id);
  });
  const listingLines = items.map((i) => `${i.name} x${i.qty}`).join(', ');
  if (biz.owner_user_id) notify.addBell(biz.owner_user_id, 'New buyer request', listingLines, '/app/vendor.html#/messages/' + chatId);
  notify.sendTemplate('buyer_chat_started', biz.email || biz.owner_email, { name: biz.contact_person, message: listingLines, link: notify.appUrl('/app/vendor.html#/messages/' + chatId) });
  return { chat_id: Number(chatId), expected_reply_hours: reply };
}

function chatSummary(c, role) {
  const last = db.get('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1', c.id);
  const unread = role === 'buyer'
    ? db.get("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ? AND sender_role = 'vendor' AND created_at > COALESCE(?, '')", c.id, c.buyer_last_read_at).n
    : db.get("SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ? AND sender_role = 'buyer' AND created_at > COALESCE(?, '')", c.id, c.vendor_last_read_at).n;
  return {
    id: c.id,
    business_id: c.business_id,
    business_name: c.business_name,
    buyer_name: c.buyer_name,
    last_message: last ? last.body.slice(0, 140) : '',
    last_at: c.last_message_at,
    status: last && last.sender_role === 'vendor' ? 'Vendor replied' : 'Sent',
    unread,
  };
}

function buyerChats(user) {
  return db
    .all(
      `SELECT c.*, b.name AS business_name, u.name AS buyer_name FROM chats c
       JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.buyer_id
       WHERE c.buyer_id = ? ORDER BY c.last_message_at DESC`,
      user.id
    )
    .map((c) => chatSummary(c, 'buyer'));
}

function vendorChats(user, businessId = null) {
  return db
    .all(
      `SELECT c.*, b.name AS business_name, u.name AS buyer_name FROM chats c
       JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.buyer_id
       WHERE (b.owner_user_id = ? OR b.owner_email = ? COLLATE NOCASE) AND (? IS NULL OR c.business_id = ?)
       ORDER BY c.last_message_at DESC`,
      user.id, user.email, businessId ? int(businessId) : null, businessId ? int(businessId) : null
    )
    .map((c) => chatSummary(c, 'vendor'));
}

function chatDetail(user, chatId, role) {
  const c = db.get(
    `SELECT c.*, b.name AS business_name, b.owner_user_id AS biz_owner, b.owner_email AS biz_email, u.name AS buyer_name FROM chats c
     JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.buyer_id WHERE c.id = ?`,
    int(chatId)
  );
  if (!c) throw new HttpError(404, 'That chat was not found.');
  const isBuyer = c.buyer_id === user.id;
  const isVendor = c.biz_owner === user.id || (c.biz_email || '').toLowerCase() === user.email.toLowerCase();
  if (role === 'buyer' ? !isBuyer : !isVendor) throw new HttpError(403, 'That chat is not yours.');
  const at = nowIso();
  db.run(role === 'buyer' ? 'UPDATE chats SET buyer_last_read_at = ? WHERE id = ?' : 'UPDATE chats SET vendor_last_read_at = ? WHERE id = ?', at, c.id);
  const messages = db.all('SELECT id, sender_role, body, payment_link, created_at FROM chat_messages WHERE chat_id = ? ORDER BY id', c.id);
  return {
    id: c.id,
    business_id: c.business_id,
    business_name: c.business_name,
    buyer_name: c.buyer_name,
    expected_reply_hours: db.getSetting('buyer_reply_hours', 24),
    subscription_active: !!subscriptionActive(c.business_id),
    messages,
    disclaimer: db.getSetting('disclaimer_text', ''),
  };
}

function postMessage(user, chatId, role, body, paymentLink = null) {
  const c = db.get(
    `SELECT c.*, b.owner_user_id AS biz_owner, b.owner_email AS biz_email, b.name AS business_name FROM chats c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?`,
    int(chatId)
  );
  if (!c) throw new HttpError(404, 'That chat was not found.');
  const text = reqStr(body, 'Message', 2000);
  const at = nowIso();
  if (role === 'buyer') {
    if (c.buyer_id !== user.id) throw new HttpError(403, 'That chat is not yours.');
    db.run("INSERT INTO chat_messages (chat_id, sender_role, sender_id, body, created_at) VALUES (?, 'buyer', ?, ?, ?)", c.id, user.id, text, at);
    db.run('UPDATE chats SET last_message_at = ?, buyer_last_read_at = ? WHERE id = ?', at, at, c.id);
    const bizEmail = c.biz_email;
    if (bizEmail) notify.sendTemplate('buyer_chat_started', bizEmail, { name: '', message: text, link: notify.appUrl('/app/vendor.html#/messages/' + c.id) });
    return { ok: true };
  }
  const isVendor = c.biz_owner === user.id || (c.biz_email || '').toLowerCase() === user.email.toLowerCase();
  if (!isVendor) throw new HttpError(403, 'That chat is not yours.');
  if (!subscriptionActive(c.business_id)) throw new HttpError(409, 'Messages need an active Marketplace subscription.');
  let link = null;
  if (paymentLink) {
    if (!/^https:\/\/[^\s]+$/.test(String(paymentLink))) throw new HttpError(400, 'The payment link must start with https://');
    link = String(paymentLink).slice(0, 500);
  }
  db.run("INSERT INTO chat_messages (chat_id, sender_role, sender_id, body, payment_link, created_at) VALUES (?, 'vendor', ?, ?, ?, ?)", c.id, user.id, text, link, at);
  db.run('UPDATE chats SET last_message_at = ?, vendor_last_read_at = ? WHERE id = ?', at, at, c.id);
  const buyer = db.get('SELECT * FROM users WHERE id = ?', c.buyer_id);
  if (buyer) {
    notify.notifyEmail(buyer.email, 'vendor_replied', { name: buyer.name, business_name: c.business_name, link: notify.appUrl('/app/buyer.html#/messages/' + c.id) }, {
      title: `${c.business_name} replied`, body: text.slice(0, 80), link: '/app/buyer.html#/messages/' + c.id,
    });
  }
  return { ok: true };
}

function buyerAccount(user) {
  const u = db.get('SELECT * FROM users WHERE id = ?', user.id);
  return { name: u.name, email: u.email, newsletter_choice: !!u.newsletter_choice, marketing_consent: !!u.marketing_consent };
}

function updateBuyerAccount(user, body) {
  const u = db.get('SELECT * FROM users WHERE id = ?', user.id);
  const name = body.name !== undefined ? str(body.name, 120) : u.name;
  let email = u.email;
  if (body.email !== undefined && body.email !== u.email) {
    email = require('./util').cleanEmail(body.email);
    if (db.get('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?', email, u.id)) throw new HttpError(409, 'That email is already used by another account.');
  }
  let hash = u.password_hash;
  if (body.password) {
    auth.assertPasswordPolicy(body.password);
    if (!auth.checkPassword(String(body.current_password || ''), u.password_hash)) throw new HttpError(403, 'Enter your current password to change it.');
    hash = require('./util').hashPassword(body.password);
  }
  const newsletter = body.newsletter_choice !== undefined ? (body.newsletter_choice ? 1 : 0) : u.newsletter_choice;
  db.run('UPDATE users SET name=?, email=?, password_hash=?, newsletter_choice=? WHERE id=?', name, email, hash, newsletter, u.id);
  return buyerAccount({ id: u.id });
}

module.exports = {
  directoryCities, directoryMarkets, directoryVendors, vendorProfile, setDirectoryHidden,
  subscriptionActive, subscriptionSummary, listingsPublic, listingDetail, plans, subscribe, cancelSubscription, runSubscriptionRenewals, activateSubscription,
  ownedBusiness, myBusinesses, saveBusiness, deleteBusiness, businessView,
  vendorApplications, vendorDashboard, bell, markBellRead, receipts,
  cartView, cartAdd, cartUpdate, proceedWithVendor, buyerChats, vendorChats, chatDetail, postMessage,
  buyerAccount, updateBuyerAccount,
  categoryLabel,
};
