import { createRequire } from 'node:module';
import path from 'node:path';

// The API is loaded at request time, not at build time. Its database uses Node's built-in SQLite,
// which the build step does not need to see. Vercel still ships the server folder (next.config.mjs).
export function loadApi() {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  return req(path.join(process.cwd(), 'server', 'api-instance.js')).getApi();
}
