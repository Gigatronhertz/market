'use strict';
// Daily database backup (GEN-05). Writes a consistent copy with VACUUM INTO, then keeps the last 14 days.
// Usage: node scripts/backup.js [backup-dir]. Schedule it daily with cron or your host's scheduler.
// Restore: stop the server, copy a backup over DB_FILE, start the server again.

const fs = require('fs');
const path = require('path');
const db = require('../server/db');

const dir = process.argv[2] || process.env.BACKUP_DIR || path.join(path.dirname(db.DB_FILE), 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 14);

fs.mkdirSync(dir, { recursive: true });
db.init();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(dir, `nmd-${stamp}.sqlite`);
db.conn().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

const cutoff = Date.now() - KEEP_DAYS * 86400000;
for (const f of fs.readdirSync(dir)) {
  const full = path.join(dir, f);
  if (f.startsWith('nmd-') && f.endsWith('.sqlite') && fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
}
console.log('backup written:', target);
