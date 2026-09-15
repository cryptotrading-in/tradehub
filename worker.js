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
      return withClientUi(await env.ASSETS.fetch(indexRequest), url.pathname);
    }

    const response = await env.ASSETS.fetch(request);
    if (['/withdrawal-ui.js', '/account-ui.js', '/activity-feed.js', '/home-ui.js', '/referral-ui.js', '/rounds-final-ui.js', '/rounds-live-fix.js'].includes(url.pathname)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return withClientUi(response, url.pathname);
    return response;
  }
};

async function withClientUi(response, pathname = '/') {
  const html = await response.text();
  const scripts = [];
  const isHome = pathname === '/' || pathname === '/index.html';
  const isRounds = pathname === '/rounds' || pathname === '/rounds/';
  const isAccount = pathname === '/account' || pathname === '/account/';
  const isReferral = pathname === '/referral' || pathname === '/referral/';

  if (isHome) {
    scripts.push('<script src="/home-ui.js?v=home-v1" defer></script>');
    scripts.push('<script src="/activity-feed.js?v=feed-v4" defer></script>');
  }
  if (isRounds) {
    scripts.push('<script src="/rounds-final-ui.js?v=rounds-final-v2" defer></script>');
    scripts.push('<script src="/rounds-live-fix.js?v=rounds-live-v1" defer></script>');
  }
  if (isAccount) scripts.push('<script src="/account-ui.js?v=account-v1" defer></script>');
  if (isReferral) scripts.push('<script src="/referral-ui.js?v=referral-v1" defer></script>');

  if (!scripts.length) return new Response(html, response);
  const updated = html.replace('</body>', scripts.join('') + '</body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.delete('content-length');
  return new Response(updated, {status: response.status, statusText: response.statusText, headers});
}