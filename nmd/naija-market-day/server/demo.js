'use strict';
// Demo content so the site has something to look at: two markets, vendors with products and an active marketplace
// subscription, a buyer account, news and community events. Runs automatically on an empty database (see
// DEMO_DATA in server/index.js) and with `npm run seed:demo`. Demo accounts are listed in the README.

const db = require('./db');
const { nowIso, addDays, todayYmd, hashPassword } = require('./util');

const VENDOR = { email: 'vendor@demo.test', password: 'DemoVendor1', name: 'Ngozi Okafor' };
const BUYER = { email: 'buyer@demo.test', password: 'DemoBuyer1', name: 'Tunde Bello' };

function user(u, roles) {
  const now = nowIso();
  const info = db.run(
    `INSERT INTO users (email, name, roles, status, password_hash, marketing_consent, newsletter_choice, created_at)
     VALUES (?, ?, ?, 'active', ?, 1, 1, ?)`,
    u.email, u.name, roles, hashPassword(u.password), now
  );
  return info.lastInsertRowid;
}

function business(ownerEmail, ownerId, b) {
  const now = nowIso();
  const info = db.run(
    `INSERT INTO businesses (owner_email, owner_user_id, name, category, contact_person, phone, email, city, description, website, socials, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, '', '{}', ?, ?)`,
    ownerEmail, ownerId, b.name, b.category, b.contact, b.email, b.city, b.description, now, now
  );
  return info.lastInsertRowid;
}

function listing(businessId, l) {
  const now = nowIso();
  db.run(
    `INSERT INTO listings (business_id, name, description, category, price_cents, sale_price_cents, photos, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    businessId, l.name, l.description, l.category, l.price, l.sale || null, JSON.stringify([l.photo]), now, now
  );
}

function subscribe(businessId) {
  const now = nowIso();
  db.run(
    "INSERT INTO subscriptions (business_id, plan_code, status, started_at, renews_at, created_at) VALUES (?, 'monthly', 'active', ?, ?, ?)",
    businessId, now, addDays(now, 30), now
  );
}

function seed() {
  db.init();
  const count = db.get('SELECT COUNT(*) AS n FROM markets').n;
  if (count > 0) return { skipped: true };
  const now = nowIso();

  const upcoming = db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status, guest_capacity, vendor_capacity, app_opens_on, app_closes_on, flyer_url, created_at, updated_at)
     VALUES ('Brampton Summer Market', 'Brampton', 'Civic Square', '2027', ?, '10:00', '18:00', 'Food, fashion, music and small businesses. Free to attend.', 'Booth fees are non-refundable after payment unless we decline your application.', 'published', 500, 40, ?, ?, 'https://images.unsplash.com/photo-1777065851469-71aef898a26f?w=1200&q=80&auto=format&fit=crop', ?, ?)`,
    addDays(now, 45).slice(0, 10), todayYmd(), addDays(now, 40).slice(0, 10), now, now
  ).lastInsertRowid;
  db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status, created_at, updated_at)
     VALUES ('Calgary Spring Market', 'Calgary', 'Stampede Grounds', '2026', ?, '10:00', '18:00', 'Our first market of the season.', 'Demo terms.', 'published', ?, ?)`,
    addDays(now, -60).slice(0, 10), now, now
  );

  const tiers = [
    { from: 1, to: 10, tier: 'VIP', type: 'standard', price: 30000 },
    { from: 11, to: 20, tier: 'Standard', type: 'standard', price: 12000 },
    { from: 21, to: 25, tier: 'Food', type: 'food', price: 15000 },
  ];
  for (const t of tiers) {
    for (let n = t.from; n <= t.to; n++) {
      db.run('INSERT INTO booths (market_id, number, tier, type, price_cents) VALUES (?, ?, ?, ?, ?)', upcoming, String(n), t.tier, t.type, t.price);
    }
  }

  // Accounts: the vendor owns three businesses, the buyer shops the marketplace.
  const vendorId = user(VENDOR, 'vendor,buyer');
  user(BUYER, 'buyer');

  const kitchen = business(VENDOR.email, vendorId, {
    name: "Mama Ngozi's Kitchen", category: 'Food', contact: VENDOR.name, email: VENDOR.email, city: 'Brampton',
    description: 'Home cooking from our kitchen to your table: jollof, egusi, puff-puff and small-chops trays for events.',
  });
  const adire = business(VENDOR.email, vendorId, {
    name: 'Adire by Ifeoma', category: 'Fashion', contact: VENDOR.name, email: VENDOR.email, city: 'Calgary',
    description: 'Hand-dyed adire cloth and ready-to-wear pieces made in small batches.',
  });
  const beats = business(VENDOR.email, vendorId, {
    name: 'Lagos Beats Records', category: 'Music', contact: VENDOR.name, email: VENDOR.email, city: 'Brampton',
    description: 'Afrobeats, highlife and amapiano vinyl and CDs from independent artists.',
  });
  [kitchen, adire, beats].forEach(subscribe);

  listing(kitchen, { name: 'Jollof rice tray (serves 10)', description: 'Smoky party jollof with fried plantain. Order 48 hours ahead.', category: 'Food', price: 6500, photo: '/illus/stall.svg' });
  listing(kitchen, { name: 'Puff-puff box', description: 'Fresh, golden, dusted with sugar. 24 pieces.', category: 'Food', price: 1200, sale: 999, photo: '/illus/stall.svg' });
  listing(kitchen, { name: 'Small chops platter', description: 'Samosas, spring rolls, peppered wings. Serves 8.', category: 'Food', price: 4800, photo: '/illus/stall.svg' });
  listing(adire, { name: 'Indigo adire shirt', description: 'Cotton, hand-dyed indigo with a traditional motif. Unisex.', category: 'Fashion', price: 5500, photo: '/illus/drum.svg' });
  listing(adire, { name: 'Adire head wrap', description: 'Two-metre wrap, hand-stamped on cotton.', category: 'Fashion', price: 2800, sale: 2200, photo: '/illus/drum.svg' });
  listing(beats, { name: 'Highlife classics (vinyl)', description: 'Twelve-inch reissue of 1970s highlife favourites.', category: 'Music', price: 3200, photo: '/illus/drum.svg' });

  db.run(
    "INSERT INTO blog_posts (title, slug, image_url, category, body, publish_at, status, created_at) VALUES ('Welcome to the 2027 season', 'welcome-2027-season', '', 'News', 'Our markets return this summer with more vendors, more food and a new home at Civic Square. Booth applications are open now.', ?, 'published', ?)",
    addDays(now, -5).slice(0, 10), now
  );
  db.run(
    "INSERT INTO blog_posts (title, slug, image_url, category, body, publish_at, status, created_at) VALUES ('Meet the vendors: Mama Ngozi''s Kitchen', 'meet-mama-ngozis-kitchen', '', 'Vendors', 'Ngozi started cooking for her neighbours and now feeds a market crowd every summer. Her jollof is the reason people line up early.', ?, 'published', ?)",
    addDays(now, -12).slice(0, 10), now
  );
  db.run(
    "INSERT INTO community_events (title, event_date, place, description, link, status, created_at) VALUES ('Youth business workshop', ?, 'Brampton library', 'Free workshop on pricing, branding and selling at markets.', '', 'approved', ?)",
    addDays(now, 20).slice(0, 10), now
  );
  db.run(
    "INSERT INTO community_events (title, event_date, place, description, link, status, created_at) VALUES ('Afrobeats night', ?, 'Civic Square stage', 'Live sets from local artists after the market closes.', '', 'approved', ?)",
    addDays(now, 45).slice(0, 10), now
  );
  return { markets: 2, booths: db.get('SELECT COUNT(*) AS n FROM booths').n, vendors: 1, businesses: 3, listings: 6 };
}

module.exports = { seed, VENDOR, BUYER };
