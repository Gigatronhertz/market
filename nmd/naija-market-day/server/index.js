'use strict';
// Naija Market Day server. Serves the existing site (mockups at the root and the working app under /app)
// and the JSON API under /api.

const express = require('express');
const db = require('./db');
const seed = require('./seed');
const scheduler = require('./scheduler');
const { HttpError } = require('./util');

function createApp() {
  db.init();
  seed.seedDefaults();
  const created = seed.ensureAdmin();
  // Demo content on an empty database, unless DEMO_DATA=0. Safe to run every start: it does nothing once markets exist.
  if (process.env.DEMO_DATA !== '0') require('./demo').seed();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '12mb' }));

  // Security headers. The site uses Google Fonts and inline styles, so scripts stay same-origin.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Writes must be JSON. Browsers cannot send JSON cross-site without a CORS preflight, which blocks the form-based CSRF attacks.
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Send JSON.' });
    }
    next();
  });

  app.use('/api', require('./routes/public'));
  app.use('/api', require('./routes/admin'));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    }
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
    console.error('[error]', req.method, req.originalUrl, err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return { app, created };
}

module.exports = { createApp };

if (require.main === module) {
  const { app, created } = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Naija Market Day running on http://localhost:${port}`);
    console.log(`Admin sign-in: /app/admin-login.html`);
    if (created) {
      console.log('--- First admin account created ---');
      console.log(`Email:    ${created.email}`);
      console.log(`Password: ${created.password}`);
      console.log('Sign in and change it. Set ADMIN_EMAIL / ADMIN_PASSWORD to choose your own next time.');
      console.log('-----------------------------------');
    }
    scheduler.start();
  });
}
