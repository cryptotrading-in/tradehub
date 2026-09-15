import { dispatch } from './src/api/router.js';
import './src/api/routes.js';
import './src/api/withdrawals.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return dispatch(request, env);
    if (['/rounds','/rounds/','/wallet','/wallet/','/account','/account/','/referral','/referral/'].includes(url.pathname)) {
      const indexRequest = new Request(new URL('/index.html', request.url), {method:'GET',headers:request.headers});
      return withActivityFeed(await env.ASSETS.fetch(indexRequest), env, url.pathname);
    }
    const response = await env.ASSETS.fetch(request);
    if (['/withdrawal-ui.js','/account-ui.js','/activity-feed.js','/home-title-fix.js','/referral-ui.js','/home-rules.js','/home-cleanup.js','/rounds-final-ui.js','/rounds-live-fix.js','/rounds-state-sync.js','/rounds-lifecycle-fix.js'].includes(url.pathname)) {
      const headers = new Headers(response.headers); headers.set('Cache-Control','no-store, no-cache, must-revalidate');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    if (url.pathname==='/'||url.pathname==='/index.html') return withActivityFeed(response,env,url.pathname);
    return response;
  }
};
async function withActivityFeed(response,env,pathname='/'){
  const html=await response.text(),scripts=[],isHome=pathname==='/'||pathname==='/index.html',isRounds=pathname==='/rounds'||pathname==='/rounds/';
  if(isHome&&!html.includes('/activity-feed.js'))scripts.push('<script src="/activity-feed.js?v=feed-v3" defer></script>');
  if(isHome&&!html.includes('/home-rules.js'))scripts.push('<script src="/home-rules.js?v=rules-v1" defer></script>');
  if(isHome&&!html.includes('/home-cleanup.js'))scripts.push('<script src="/home-cleanup.js?v=clean-v1" defer></script>');
  if(isRounds&&!html.includes('/rounds-final-ui.js'))scripts.push('<script src="/rounds-final-ui.js?v=rounds-final-v2" defer></script>');
  if(isRounds&&!html.includes('/rounds-live-fix.js'))scripts.push('<script src="/rounds-live-fix.js?v=rounds-live-v1" defer></script>');
  if(isRounds&&!html.includes('/rounds-state-sync.js'))scripts.push('<script src="/rounds-state-sync.js?v=rounds-sync-v1" defer></script>');
  if(isRounds&&!html.includes('/rounds-lifecycle-fix.js'))scripts.push('<script src="/rounds-lifecycle-fix.js?v=rounds-lifecycle-v1" defer></script>');
  if(!html.includes('/home-title-fix.js'))scripts.push('<script src="/home-title-fix.js" defer></script>');
  if(pathname==='/referral'||pathname==='/referral/')scripts.push('<script src="/referral-ui.js" defer></script>');
  if(!scripts.length)return new Response(html,response);
  const updated=html.replace('</body>',scripts.join('')+'</body>'),headers=new Headers(response.headers);headers.set('Cache-Control','no-store, no-cache, must-revalidate');headers.delete('content-length');
  return new Response(updated,{status:response.status,statusText:response.statusText,headers});
}
