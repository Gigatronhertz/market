'use strict';
// Authentication: passwords for buyers, admins and staff; passwords or one-time codes for vendors
// (VEN-02, VEN-04); server-side sessions in an httpOnly cookie; role checks per workspace.

const db = require('./db');
const { HttpError, nowIso, addMinutes, addDays, randomToken, randomCode, sha256, hashPassword, checkPassword, cleanEmail } = require('./util');
const notify = require('./notify');

const COOKIE = 'nmd_session';
const SESSION_DAYS = 14;
const SECURE = (process.env.APP_URL || '').startsWith('https://');

// In-memory attempt limiter (per key, sliding window). Replace with Redis when running on several servers.
// `limit` counts every call (used for sending codes and reset emails). `guard` and `recordFailure` count only
// failed sign-ins, so a correct password never locks anyone out.
const hits = new Map();
function recent(key, windowMinutes) {
  const now = Date.now();
  return (hits.get(key) || []).filter((t) => now - t < windowMinutes * 60000);
}
function limit(key, max, windowMinutes) {
  const list = recent(key, windowMinutes);
  if (list.length >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  list.push(Date.now());
  hits.set(key, list);
}
function guard(key, max, windowMinutes) {
  if (recent(key, windowMinutes).length >= max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
function recordFailure(key, windowMinutes) {
  hits.set(key, [...recent(key, windowMinutes), Date.now()]);
}
function clearAttempts(key) {
  hits.delete(key);
}

function rolesOf(user) {
  return String(user.roles || '').split(',').map((r) => r.trim()).filter(Boolean);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    roles: rolesOf(user),
    status: user.status,
    marketing_consent: !!user.marketing_consent,
    newsletter_choice: !!user.newsletter_choice,
  };
}

function assertCanSignIn(user) {
  if (user.status === 'suspended') throw new HttpError(403, 'This account is suspended. Contact the Naija Market Day team.');
  if (user.status === 'removed') throw new HttpError(403, 'This account is no longer active.');
  if (user.status === 'invited') throw new HttpError(403, 'Set your password first. Check your email for the link.');
}

function createSession(userId) {
  const token = randomToken(32);
  db.run(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    sha256(token),
    userId,
    nowIso(),
    addDays(nowIso(), SESSION_DAYS)
  );
  db.run('UPDATE users SET last_sign_in_at = ? WHERE id = ?', nowIso(), userId);
  return token;
}

function setSessionCookie(res, token) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Attaches req.user when a valid session cookie is present. Never rejects by itself.
function loadUser(req, _res, next) {
  const token = readCookie(req, COOKIE);
  req.user = null;
  if (token) {
    const row = db.get(
      `SELECT u.*, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(token),
      nowIso()
    );
    if (row && row.status === 'active') req.user = row;
  }
  next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    const have = rolesOf(req.user);
    if (!roles.some((r) => have.includes(r))) return next(new HttpError(403, 'You do not have access to this area.'));
    next();
  };
}

function signOut(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  clearSessionCookie(res);
}

// ----- passwords -----
function assertPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
  if (pw.length > 200) throw new HttpError(400, 'That password is too long.');
}

function loginWithPassword(email, password, expectRole) {
  const e = cleanEmail(email);
  const key = 'login:' + e;
  guard(key, 10, 15);
  const user = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', e);
  if (!user || !checkPassword(String(password || ''), user.password_hash)) {
    recordFailure(key, 15);
    throw new HttpError(401, 'Email or password is not right.');
  }
  clearAttempts(key);
  assertCanSignIn(user);
  if (expectRole && !rolesOf(user).includes(expectRole)) {
    throw new HttpError(403, expectRole === 'vendor'
      ? 'This email does not have a vendor account yet. Apply as a vendor to create one.'
      : 'This account cannot sign in here.');
  }
  return user;
}

// Buyer account creation (BUY-01, BUY-02). Vendors do not create accounts here (WEB-04).
function signUpBuyer({ name, email, password, marketing_consent }) {
  const e = cleanEmail(email);
  assertPasswordPolicy(password);
  const existing = db.get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', e);
  if (existing) {
    if (!rolesOf(existing).includes('buyer')) {
      // An existing vendor signs in to the buyer side with the same account and gains the buyer role.
      if (!checkPassword(password, existing.password_hash)) {
        throw new HttpError(409, 'An account already exists for this email. Sign in instead.');
      }
      db.run("UPDATE users SET roles = roles || ',buyer' WHERE id = ?", existing.id);
      return db.get('SELECT * FROM users WHERE id = ?', existing.id);
    }
    throw new HttpError(409, 'An account already exists for this email. Sign in instead.');
  }
  const now = nowIso();
  const info = db.run(
    `INSERT INTO users (email, name, roles, status, password_hash, marketing_consent, consent_at, newsletter_choice, created_at)
     VALUES (?, ?, 'buyer', 'active', ?, ?, ?, ?, ?)`,
    e,
    String(name || '').trim().slice(0, 120),
    hashPassword(password),
    marketing_consent ? 1 : 0,
    marketing_consent ? now : null,
    marketing_consent ? 1 : 0,
    now
  );
  return db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
}

// ----- one-time codes for vendors (VEN-04) -----
function requestOtp(email) {
  const e = cleanEmail(email);
  limit('otp:' + e, 5, 15);
  const user = db.get("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND roles LIKE '%vendor%'", e);
  // Always answer the same way so the form does not reveal which emails have accounts.
  if (!user || user.status !== 'active') return { sent: true };
  const last = db.get('SELECT created_at FROM otp_codes WHERE email = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1', e);
  if (last && Date.now() - new Date(last.created_at).getTime() < 60000) {
    throw new HttpError(429, 'A code was sent a moment ago. Wait a minute before asking for another.');
  }
  const code = randomCode(6);
  const ttl = db.getSetting('otp_ttl_minutes', 10);
  db.run(
    'INSERT INTO otp_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
    e,
    sha256(code),
    addMinutes(nowIso(), ttl),
    nowIso()
  );
  notify.sendTemplate('vendor_otp', e, { name: user.name, code, minutes: ttl });
  return { sent: true };
}

function verifyOtp(email, code) {
  const e = cleanEmail(email);
  const user = db.get("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND roles LIKE '%vendor%'", e);
  const row = db.get(
    'SELECT * FROM otp_codes WHERE email = ? COLLATE NOCASE AND used_at IS NULL ORDER BY id DESC LIMIT 1',
    e
  );
  const invalid = () => new HttpError(401, 'That code is not right, has expired or was already used. Ask for a new one.');
  if (!user || !row || row.expires_at < nowIso()) throw invalid();
  const max = db.getSetting('otp_max_attempts', 5);
  if (row.attempts >= max) throw invalid();
  db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
  if (row.code_hash !== sha256(String(code || '').trim())) {
    if (row.attempts + 1 >= max) db.run('UPDATE otp_codes SET used_at = ? WHERE id = ?', nowIso(), row.id);
    throw invalid();
  }
  assertCanSignIn(user);
  db.run('UPDATE otp_codes SET used_at = ? WHERE id = ?', nowIso(), row.id);
  return user;
}

// ----- set-password links: vendor welcome (NOT-03), staff invites (ADM-63), password reset -----
function issueSetupToken(userId, hours) {
  const token = randomToken(24);
  db.run(
    'UPDATE users SET setup_token_hash = ?, setup_expires_at = ? WHERE id = ?',
    sha256(token),
    new Date(Date.now() + hours * 3600000).toISOString(),
    userId
  );
  return token;
}

function setPasswordWithToken(token, password) {
  assertPasswordPolicy(password);
  const user = db.get(
    'SELECT * FROM users WHERE setup_token_hash = ? AND setup_expires_at > ?',
    sha256(String(token || '')),
    nowIso()
  );
  if (!user) throw new HttpError(400, 'This link has expired or was already used. Ask for a new one.');
  if (user.status === 'removed') throw new HttpError(400, 'This account is no longer active.');
  db.run(
    "UPDATE users SET password_hash = ?, status = 'active', setup_token_hash = NULL, setup_expires_at = NULL WHERE id = ?",
    hashPassword(password),
    user.id
  );
  return db.get('SELECT * FROM users WHERE id = ?', user.id);
}

module.exports = {
  COOKIE,
  limit,
  guard,
  recordFailure,
  rolesOf,
  publicUser,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  loadUser,
  requireRole,
  signOut,
  loginWithPassword,
  signUpBuyer,
  assertPasswordPolicy,
  requestOtp,
  verifyOtp,
  issueSetupToken,
  setPasswordWithToken,
  assertCanSignIn,
};
