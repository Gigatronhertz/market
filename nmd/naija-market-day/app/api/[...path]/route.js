import { inject } from 'light-my-request';
import { loadApi } from '@/lib/load-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Every /api/* request goes to the Express API, unchanged, and the response comes back as a Web Response.
async function handle(request, context) {
  const { path = [] } = await context.params;
  const url = '/api/' + path.map(encodeURIComponent).join('/') + new URL(request.url).search;
  const headers = {};
  // Forward the request headers, minus the ones that describe the original connection or cache state.
  const DROP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'if-none-match', 'if-modified-since']);
  request.headers.forEach((value, key) => { if (!DROP.has(key)) headers[key] = value; });
  const payload = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  const result = await inject(loadApi(), { method: request.method, url, headers, payload });

  const out = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
    else out.set(key, String(value));
  }
  return new Response(result.rawPayload, { status: result.statusCode, headers: out });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
