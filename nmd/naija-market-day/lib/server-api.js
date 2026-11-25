import { inject } from 'light-my-request';
import { loadApi } from './load-api';

// Server-side reads for pages that render on the server. Same API, no network hop.
export async function serverGet(path) {
  const res = await inject(loadApi(), { method: 'GET', url: '/api' + path });
  if (res.statusCode >= 400) return null;
  return JSON.parse(res.payload);
}
