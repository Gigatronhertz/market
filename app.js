'use strict';
// Top-level entry for Vercel. The app lives in nmd/naija-market-day.
// Vercel's Express preset looks for an express import in the entry file itself, so it is listed here.
const express = require('express');
const app = require('./nmd/naija-market-day/app.js');
module.exports = app;
module.exports.express = express;
