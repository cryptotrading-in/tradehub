const CLIENT_SESSION_COOKIE = 'tradehub_session';
const ADMIN_SESSION_COOKIE = 'tradehub_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function cookieValue(request, cookieName = CLIENT_SESSION_COOKIE) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieNameForRole(role = 'client') {
  return role === 'admin' ? ADMIN_SESSION_COOKIE : CLIENT_SESSION_COOKIE;
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sessionCookie(token, role = 'client', maxAge = SESSION_TTL_SECONDS) {
  const cookieName = cookieNameForRole(role);
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export async function createSession(env, { userId = null, role = 'client' } = {}) {
  if (!['client', 'admin'].includes(role)) throw new Error('Invalid session role');

  const token = crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(tokenHash, userId, role, now, expiresAt).run();

  return { token, expiresAt };
}

export async function getSession(request, env, role = 'client') {
  const token = cookieValue(request, cookieNameForRole(role));
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    'SELECT token_hash, user_id, role, created_at, expires_at FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1'
  ).bind(tokenHash, now).first();

  if (!session || session.role !== role) return null;
  return session;
}

export async function revokeSession(request, env, role = 'client') {
  const token = cookieValue(request, cookieNameForRole(role));
  if (!token) return;

  const tokenHash = await hashToken(token);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
}

export function clearSessionCookie(role = 'client') {
  return sessionCookie('', role, 0);
}

export function sessionCookieFor(token, role = 'client', maxAge = SESSION_TTL_SECONDS) {
  return sessionCookie(token, role, maxAge);
}

export function isStateChangingRequest(request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
}

export function hasTrustedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function requireSession(request, env, role = null) {
  const session = await getSession(request, env, role || 'client');
  if (!session) {
    return { ok: false, response: Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  if (role && session.role !== role) {
    return { ok: false, response: Response.json({ ok: false, error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, session };
}
