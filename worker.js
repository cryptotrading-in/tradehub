import { dispatch } from './src/api/router.js';
import './src/api/routes.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return dispatch(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
