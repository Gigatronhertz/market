import { createRequire } from 'node:module';
import path from 'node:path';

// Loaded at runtime (not imported) so the bundler never tries to bundle the server's node:sqlite code.
// The server files are copied into the deployment by outputFileTracingIncludes in next.config.mjs.
export function loadApi() {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  return req(path.join(process.cwd(), 'server', 'api-instance.js')).getApi();
}
