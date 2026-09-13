import { route } from './router.js';

route('GET', '/api/health', async ({ env }) => {
  const result = await env.DB.prepare('SELECT 1 AS connected').first();
  return Response.json({
    ok: true,
    database: result?.connected === 1
  });
});
