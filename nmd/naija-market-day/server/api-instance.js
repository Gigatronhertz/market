'use strict';
// One API instance per server process. Next.js route handlers call it through lib/bridge.
const { createApp } = require('./index');

let instance = null;
function getApi() {
  if (!instance) instance = createApp().app;
  return instance;
}
module.exports = { getApi };
