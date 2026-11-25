'use strict';
// Database: SQLite via Node's built-in node:sqlite (no native build step).
// All money is stored in cents. All timestamps are ISO-8601 strings in UTC.

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// On Vercel the deployed folder is read-only; only /tmp can be written to. Locally the file lives in data/.
const ON_VERCEL = !!process.env.VERCEL;
const DATA_DIR = process.env.DATA_DIR || (ON_VERCEL ? '/tmp' : path.join(__dirname, '..', 'data'));
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'nmd.sqlite');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  roles TEXT NOT NULL DEFAULT 'buyer',            -- comma list: buyer,vendor,admin,staff
  status TEXT NOT NULL DEFAULT 'active',          -- active | invited | suspended | removed
  password_hash TEXT,
  setup_token_hash TEXT,
  setup_expires_at TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  newsletter_choice INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_sign_in_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_assignments (
  user_id INTEGER NOT NULL,
  market_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, market_id)
);
CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,                              -- YYYY-MM-DD
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  flyer_url TEXT,
  floor_plan_url TEXT,
  terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',            -- draft | published | closed
  guest_capacity INTEGER NOT NULL DEFAULT 0,
  vendor_capacity INTEGER NOT NULL DEFAULT 0,
  app_opens_on TEXT,
  app_closes_on TEXT,
  closed_processed_at TEXT,
  reminders_sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  tier TEXT NOT NULL,                              -- e.g. VIP, Deluxe, Standard
  type TEXT NOT NULL DEFAULT 'standard',          -- standard | food
  price_cents INTEGER NOT NULL,
  reserved INTEGER NOT NULL DEFAULT 0,
  reserved_note TEXT NOT NULL DEFAULT '',
  assigned_application_id INTEGER,                -- set when paid
  confirmed INTEGER NOT NULL DEFAULT 0,           -- set when approved
  held_application_id INTEGER,
  held_until TEXT,
  UNIQUE (market_id, number)
);
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  owner_user_id INTEGER,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',                 -- public contact email on the directory profile
  city TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  socials TEXT NOT NULL DEFAULT '{}',
  logo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                              -- food_certificate, other
  filename TEXT NOT NULL,
  data_url TEXT NOT NULL,
  expires_on TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  business_id INTEGER,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  owner_user_id INTEGER,
  category TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',
  step TEXT NOT NULL DEFAULT 'details',           -- details | category | booth | terms | payment | done
  booth_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',           -- draft | waitlisted | offered | under_review | more_info | approved | declined
  more_info_note TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | paid | refunded | failed
  amount_cents INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TEXT,
  submitted_at TEXT,
  date_started TEXT NOT NULL,
  last_saved_at TEXT NOT NULL,
  reminders_sent INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  resume_token_hash TEXT NOT NULL,
  qr_token TEXT,
  attendance TEXT NOT NULL DEFAULT 'not_arrived', -- not_arrived | checked_in | checked_out | no_show
  checked_in_at TEXT,
  checked_out_at TEXT,
  attendance_changed_by INTEGER,
  attendance_changed_at TEXT,
  hidden_from_directory INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER,
  subscription_id INTEGER,
  kind TEXT NOT NULL,                              -- booth_fee | refund | subscription
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,                            -- succeeded | failed | refunded
  provider TEXT NOT NULL,
  provider_ref TEXT,
  triggered_by INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  application_id INTEGER NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',          -- waiting | offered | taken | removed
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  guests_count INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'online',          -- online | walkin
  qr_token TEXT NOT NULL UNIQUE,
  checked_in INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT,
  checked_in_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER,
  code TEXT NOT NULL,
  result TEXT NOT NULL,                            -- checked_in | duplicate | unknown | wrong_market | checked_out
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                       -- monthly | annual
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  period_days INTEGER NOT NULL,
  free_days INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL,                            -- trial | active | cancelled | lapsed
  started_at TEXT NOT NULL,
  renews_at TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  sale_price_cents INTEGER,
  photos TEXT NOT NULL DEFAULT '[]',
  hidden INTEGER NOT NULL DEFAULT 0,
  hidden_reason TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (buyer_id, listing_id)
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  buyer_last_read_at TEXT,
  vendor_last_read_at TEXT
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL,                       -- buyer | vendor | system
  sender_id INTEGER,
  body TEXT NOT NULL,
  payment_link TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL DEFAULT 'email',           -- email | sms
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL DEFAULT 'logged',           -- logged (not delivered until a sender is connected)
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,                        -- system event key, e.g. guest_confirmation
  name TEXT NOT NULL,
  audience TEXT NOT NULL,                          -- guests | vendors | subscribers | system
  trigger_type TEXT NOT NULL DEFAULT 'action',     -- action | before_market | after_market | manual
  offset_days INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  advertiser TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT 'home',           -- home | blog
  frequency_seconds INTEGER NOT NULL DEFAULT 6,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  image_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  publish_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',            -- draft | published
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | approved | rejected
  submitted_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                              -- photo | flyer | video
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,                           -- faq | insurance | training | health
  city TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',             -- new | handled
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  token TEXT NOT NULL UNIQUE,
  consent_at TEXT NOT NULL,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_market ON applications(market_id, status);
CREATE INDEX IF NOT EXISTS idx_apps_owner ON applications(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_guests_market ON guests(market_id);
CREATE INDEX IF NOT EXISTS idx_booths_market ON booths(market_id);
CREATE INDEX IF NOT EXISTS idx_chats_buyer ON chats(buyer_id);
CREATE INDEX IF NOT EXISTS idx_chats_business ON chats(business_id);
CREATE INDEX IF NOT EXISTS idx_listings_business ON listings(business_id);
`;

function init() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

// Small helpers so the rest of the code reads cleanly.
function conn() {
  return db || init();
}
function all(sql, ...params) {
  return conn().prepare(sql).all(...params);
}
function get(sql, ...params) {
  return conn().prepare(sql).get(...params);
}
function run(sql, ...params) {
  return conn().prepare(sql).run(...params);
}
function tx(fn) {
  const d = conn();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}
function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value)
  );
}

// Used by tests to start from an empty database.
function resetForTests(file) {
  if (db) db.close();
  db = null;
  process.env.DB_FILE = file;
  delete require.cache[__filename];
  return init();
}

module.exports = { init, conn, all, get, run, tx, getSetting, setSetting, resetForTests, DB_FILE };
