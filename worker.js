import { dispatch } from './src/api/router.js';
import './src/api/routes.js';
import './src/api/withdrawals.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return dispatch(request, env);
    }

    if (['/rounds', '/rounds/', '/wallet', '/wallet/', '/account', '/account/', '/referral', '/referral/'].includes(url.pathname)) {
      const indexRequest = new Request(new URL('/index.html', request.url), {
        method: 'GET',
        headers: request.headers,
      });
      return withClientUi(await env.ASSETS.fetch(indexRequest));
    }

    const response = await env.ASSETS.fetch(request);
    if (['/withdrawal-ui.js', '/client-route-loader.js', '/account-ui.js', '/activity-feed.js', '/home-ui.js', '/referral-ui.js', '/rounds-final-ui.js', '/rounds-live-fix.js'].includes(url.pathname)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return withClientUi(response);
    return response;
  }
};

async function withClientUi(response) {
  const html = await response.text();
  if (html.includes('/client-route-loader.js')) return new Response(html, response);
  const updated = html.replace('</body>', '<script src="/client-route-loader.js?v=route-v2" defer></script></body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.delete('content-length');
  return new Response(updated, {status: response.status, statusText: response.statusText, headers});
}
