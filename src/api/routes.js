import { route } from './router.js';
import { clearSessionCookie, createSession, getSession, hasTrustedOrigin, isStateChangingRequest, revokeSession, sessionCookieFor } from './session.js';
import { hashSecret, normalizeEmail, normalizeUsername, validateSignupInput, verifySecret } from './auth.js';
import './rounds.js';
import './deposits.js';
import './admin-auth.js';
import './account-history.js';
import './admin-settings.js';
import './activity-feed.js';
import './referrals.js';
import './admin-referrals.js';

route('GET', '/api/health', async ({ env }) => {
  const result = await env.DB.prepare('SELECT 1 AS connected').first();
  const sessionTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions' LIMIT 1").first();
  const usersTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1").first();
  return Response.json({ ok: true, database: result?.connected === 1, sessions: sessionTable?.name === 'sessions', users: usersTable?.name === 'users' });
});

route('GET', '/api/session', async ({ request, env }) => {
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: true, authenticated: false });
  const user = await env.DB.prepare('SELECT full_name, username FROM users WHERE id = ? LIMIT 1').bind(session.user_id).first();
  return Response.json({ ok: true, authenticated: true, session: { userId: session.user_id, fullName: user?.full_name || null, username: user?.username || null, role: session.role, expiresAt: session.expires_at } });
});

route('GET', '/api/profile', async ({ request, env }) => {
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const user = await env.DB.prepare('SELECT full_name, username, email, phone FROM users WHERE id = \'active\' AND status = \'active\' LIMIT 1').bind(session.user_id).first();
  if (!user) return Response.json({ ok: false, error: 'Account not found' }, { status: 404 });
  return Response.json({ ok: true, profile: { fullName: user.full_name, username: user.username, email: user.email, phone: user.phone } });
});
