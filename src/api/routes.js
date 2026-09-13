import { route } from './router.js';
import {
  clearSessionCookie,
  getSession,
  hasTrustedOrigin,
  isStateChangingRequest,
  revokeSession
} from './session.js';

route('GET', '/api/health', async ({ env }) => {
  const result = await env.DB.prepare('SELECT 1 AS connected').first();
  const sessionTable = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions' LIMIT 1"
  ).first();

  return Response.json({
    ok: true,
    database: result?.connected === 1,
    sessions: sessionTable?.name === 'sessions'
  });
});

route('GET', '/api/session', async ({ request, env }) => {
  const session = await getSession(request, env);

  if (!session) {
    return Response.json({ ok: true, authenticated: false });
  }

  return Response.json({
    ok: true,
    authenticated: true,
    session: {
      userId: session.user_id,
      role: session.role,
      expiresAt: session.expires_at
    }
  });
});

route('POST', '/api/session/logout', async ({ request, env }) => {
  if (isStateChangingRequest(request) && !hasTrustedOrigin(request)) {
    return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  }

  await revokeSession(request, env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie()
    }
  });
});
