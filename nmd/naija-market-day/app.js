'use strict';
// Entry point for Vercel's Express preset. Exports the Express app; Vercel runs it as a serverless function.
// Vercel's Express check looks for an express import in the entry file itself, so it is listed here.
const express = require('express');
const { createApp } = require('./server/index');

const { app } = createApp();
module.exports = app;
module.exports.express = express;
