export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/d1-test') {
      try {
        const result = await env.DB.prepare('SELECT 1 AS connected').first();
        return Response.json({ ok: true, database: result?.connected === 1 });
      } catch (error) {
        return Response.json(
          { ok: false, error: 'D1 connection failed' },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
