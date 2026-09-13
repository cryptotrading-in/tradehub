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
    if (['/', '/index.html', '/rounds', '/rounds/', '/wallet', '/wallet/', '/account', '/account/'].includes(url.pathname)) {
      const indexRequest = new Request(new URL('/index.html', request.url), {
        method: 'GET',
        headers: request.headers,
      });
      const response = await env.ASSETS.fetch(indexRequest);
      if (!response.ok) return response;
      const html = await response.text();
      // Only bridge the existing SPA navigation to the existing Account module.
      // No Account panels or UI are created here.
      const routeBridge = `<script>(function(){var push=history.pushState;history.pushState=function(){var r=push.apply(this,arguments);window.dispatchEvent(new PopStateEvent('popstate'));return r};})();</script>`;
      return new Response(html.replace('</body>', routeBridge + '</body>'), {
        status: response.status,
        headers: response.headers,
      });
    }

    return env.ASSETS.fetch(request);
  }
};
