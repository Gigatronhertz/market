'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

const nowIso = () => new Date().toISOString();

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}
function addDays(isoOrDate, days) {
  const d = new Date(isoOrDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
function randomCode(digits = 6) {
  const n = crypto.randomInt(0, 10 ** digits);
  return String(n).padStart(digits, '0');
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
function checkPassword(pw, hash) {
  return !!hash && bcrypt.compareSync(pw, hash);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 200) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}
function str(v, max = 500) {
  return String(v == null ? '' : v).trim().slice(0, max);
}
function reqStr(v, label, max = 500) {
  const s = str(v, max);
  if (!s) throw new HttpError(400, `${label} is required.`);
  return s;
}
function int(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function money(v) {
  // Accepts "12.50" or 12.5 and returns cents.
  const n = Math.round(parseFloat(String(v).replace(/[^0-9.\-]/g, '')) * 100);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Enter a valid amount.');
  return n;
}
function cents(n) {
  return (Number(n || 0) / 100).toFixed(2);
}
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.get(r))).join(','));
  return [head, ...body].join('\n') + '\n';
}
// Express 4 does not forward promise rejections; this does.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  HttpError,
  nowIso,
  addMinutes,
  addDays,
  todayYmd,
  randomToken,
  randomCode,
  sha256,
  hashPassword,
  checkPassword,
  cleanEmail,
  str,
  reqStr,
  int,
  money,
  cents,
  slugify,
  toCsv,
  wrap,
};
