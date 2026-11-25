'use strict';
// Demo content for trying the app locally: one upcoming market with booths, one past market with a gallery,
// a blog post, a sponsor and a banner. Run with: npm run seed:demo. Safe to run once on a fresh database.

const db = require('./db');
const { nowIso, addDays, todayYmd } = require('./util');

function seed() {
  db.init();
  const count = db.get('SELECT COUNT(*) AS n FROM markets').n;
  if (count > 0) return { skipped: true };
  const now = nowIso();
  const upcoming = db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status, guest_capacity, vendor_capacity, app_opens_on, app_closes_on, created_at, updated_at)
     VALUES ('Brampton Summer Market', 'Brampton', 'Civic Square', '2026', ?, '10:00', '18:00', 'Food, fashion, music and small businesses. Free to attend.', 'Booth fees are non-refundable after payment unless we decline your application.', 'published', 500, 40, ?, ?, ?, ?)`,
    addDays(now, 45).slice(0, 10), todayYmd(), addDays(now, 40).slice(0, 10), now, now
  ).lastInsertRowid;
  const past = db.run(
    `INSERT INTO markets (name, city, venue, season, date, start_time, end_time, description, terms, status, created_at, updated_at)
     VALUES ('Calgary Spring Market', 'Calgary', 'Stampede Grounds', '2026', ?, '10:00', '18:00', 'Our first market of the season.', 'Demo terms.', 'published', ?, ?)`,
    addDays(now, -60).slice(0, 10), now, now
  ).lastInsertRowid;
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
  db.run("INSERT INTO blog_posts (title, slug, image_url, category, body, publish_at, status, created_at) VALUES ('Welcome to the 2026 season', 'welcome-2026-season', '', 'News', 'Our markets return this summer with more food, more music and more vendors. Register as a guest or apply to trade.', ?, 'published', ?)", now, now);
  db.run("INSERT INTO gallery (market_id, kind, url, title, created_at) VALUES (?, 'video', 'https://www.youtube.com/', 'Highlights reel (demo link)', ?)", past, now);
  return { markets: 2, booths: db.get('SELECT COUNT(*) AS n FROM booths').n };
}

module.exports = { seed };
