'use strict';
// Notifications: template rendering, the outbox, in-app bell items and SMS gating.
//
// Emails and SMS are written to the `outbox` table with status "logged". A sending
// service (SMTP, SendGrid, Twilio...) is not connected yet: connect one by implementing
// deliver() below. Until then the admin Messaging > Outbox screen shows exactly what would be sent.

const db = require('./db');
const { nowIso, HttpError } = require('./util');

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function appUrl(path) {
  return APP_URL + (path.startsWith('/') ? path : '/' + path);
}

function render(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

function firstName(name, email) {
  const n = String(name || '').trim().split(/\s+/)[0];
  return n || String(email || '').split('@')[0] || 'there';
}

function getTemplate(key) {
  return db.get('SELECT * FROM notification_templates WHERE key = ?', key);
}

// Deliver a rendered message. Replace the body of this function when a sender is connected.
function deliver(row) {
  return 'logged';
}

function queue({ channel = 'email', to, subject = '', body, templateKey = null }) {
  if (!to) return null;
  if (channel === 'sms' && !db.getSetting('sms_enabled', false)) {
    throw new HttpError(409, 'SMS is not enabled yet (open question 8). Turn it on in Settings once the client confirms.');
  }
  const info = db.run(
    'INSERT INTO outbox (channel, to_address, subject, body, template_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    channel,
    to,
    subject,
    body,
    templateKey,
    'logged',
    nowIso()
  );
  const row = db.get('SELECT * FROM outbox WHERE id = ?', info.lastInsertRowid);
  const status = deliver(row);
  if (status !== 'logged') db.run('UPDATE outbox SET status = ? WHERE id = ?', status, row.id);
  return row.id;
}

// Send a system template to an address. `vars` fills the {{placeholders}}.
function sendTemplate(key, to, vars = {}, options = {}) {
  const t = getTemplate(key);
  if (!t) throw new Error('Missing notification template: ' + key);
  if (!t.active) return null;
  const full = { first_name: firstName(vars.name, to), link_base: APP_URL, ...vars };
  return queue({
    channel: options.channel || 'email',
    to,
    subject: render(t.subject, full),
    body: render(t.body, full),
    templateKey: key,
  });
}

function userByEmail(email) {
  return db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
}

// Email a person and, if they have an account, also drop an item in their bell.
function notifyEmail(email, key, vars = {}, bell = null) {
  sendTemplate(key, email, vars);
  const user = userByEmail(email);
  if (user && bell) addBell(user.id, bell.title, bell.body || '', bell.link || '');
}

function addBell(userId, title, body = '', link = '') {
  db.run(
    'INSERT INTO notifications (user_id, title, body, link, read, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    userId,
    title,
    body,
    link,
    nowIso()
  );
}

module.exports = { appUrl, render, firstName, sendTemplate, queue, notifyEmail, addBell, userByEmail, getTemplate, APP_URL };
