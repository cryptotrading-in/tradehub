import { dispatch } from './src/api/router.js';
import './src/api/routes.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return dispatch(request, env);
    }

    // Client navigation uses history.pushState() for these SPA routes.
    // On a hard refresh, serve the existing app shell instead of treating
    // /rounds, /wallet, or /account as standalone asset paths.
    if (['/rounds', '/rounds/', '/wallet', '/wallet/', '/account', '/account/'].includes(url.pathname)) {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }

    return env.ASSETS.fetch(request);
  }
};
