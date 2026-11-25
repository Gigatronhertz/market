'use strict';
// Vercel entry point (Express preset). Vercel runs this file as a serverless function and serves every request through it.
// Note: functions cannot keep files between requests. Point DB_FILE at a hosted database before using this for real data.
const { createApp } = require('../server/index');

const { app } = createApp();
module.exports = app;
