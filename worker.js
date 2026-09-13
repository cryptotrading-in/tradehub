import { dispatch } from './src/api/router.js';
import './src/api/routes.js';
import './src/api/withdrawals.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return dispatch(request, env);
    }

    // These are client-side SPA routes. On a hard refresh, always serve the
    // existing index shell with a fresh GET request. Do not reuse the incoming
    // Request object/body when creating the asset request; that can throw in the
    // Worker runtime on refresh.
    if (['/rounds', '/rounds/', '/wallet', '/wallet/', '/account', '/account/', '/referral', '/referral/'].includes(url.pathname)) {
      const indexRequest = new Request(new URL('/index.html', request.url), {
        method: 'GET',
        headers: request.headers,
      });
      return withActivityFeed(await env.ASSETS.fetch(indexRequest), env, url.pathname);
    }

    const response = await env.ASSETS.fetch(request);
    if (['/withdrawal-ui.js', '/account-ui.js', '/activity-feed.js', '/home-title-fix.js', '/referral-ui.js'].includes(url.pathname)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return withActivityFeed(response, env, url.pathname);
    return response;
  }
};

async function withActivityFeed(response, env, pathname = '/') {
  const html = await response.text();
  const scripts = [];
  if (!html.includes('/activity-feed.js')) scripts.push('<script src="/activity-feed.js" defer></script>');
  if (!html.includes('/home-title-fix.js')) scripts.push('<script src="/home-title-fix.js" defer></script>');
  if (pathname === '/referral' || pathname === '/referral/') scripts.push('<script src="/referral-ui.js" defer></script>');
  if (!scripts.length) return new Response(html, response);
  const updated = html.replace('</body>', scripts.join('') + '</body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.delete('content-length');
  return new Response(updated, {status: response.status, statusText: response.statusText, headers});
}
