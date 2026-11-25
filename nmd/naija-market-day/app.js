'use strict';
// Entry point for Vercel's Express preset. Exports the Express app; Vercel runs it as a serverless function.
// Locally, `npm start` still runs server/index.js directly.
const { createApp } = require('./server/index');

const { app } = createApp();
module.exports = app;
