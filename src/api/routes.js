import { route } from './router.js';
import { clearSessionCookie, createSession, getSession, hasTrustedOrigin, isStateChangingRequest, revokeSession, sessionCookieFor } from './session.js';
import { hashSecret, normalizeEmail, normalizeUsername, validateSignupInput, verifySecret } from './auth.js';

route('GET', '/api/health', async ({ env }) => {
  const result = await env.DB.prepare('SELECT 1 AS connected').first();
  const sessionTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions' LIMIT 1").first();
  const usersTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1").first();
  return Response.json({ ok: true, database: result?.connected === 1, sessions: sessionTable?.name === 'sessions', users: usersTable?.name === 'users' });
});

route('GET', '/api/session', async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session) return Response.json({ ok: true, authenticated: false });
  return Response.json({ ok: true, authenticated: true, session: { userId: session.user_id, role: session.role, expiresAt: session.expires_at } });
});

route('POST', '/api/auth/signup', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const validationError = validateSignupInput(input || {});
  if (validationError) return Response.json({ ok: false, error: validationError }, { status: 400 });
  const fullName = input.fullName.trim();
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim();
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare('SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1').bind(username, email).first();
  if (existing) return Response.json({ ok: false, error: existing.username === username ? 'Username is already in use' : 'Email is already registered' }, { status: 409 });
  const password = await hashSecret(input.password);
  const recoveryPin = await hashSecret(input.recoveryPin);
  const userId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id, full_name, username, email, phone, password_hash, password_salt, recovery_pin_hash, recovery_pin_salt, terms_accepted_at, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`).bind(userId, fullName, username, email, phone, password.hash, password.salt, recoveryPin.hash, recoveryPin.salt, now, now, now).run();
  const session = await createSession(env, { userId, role: 'client' });
  return new Response(JSON.stringify({ ok: true, authenticated: true, user: { id: userId, fullName, username, email, phone } }), { status: 201, headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(session.token, 60 * 60 * 24 * 7) } });
});

route('POST', '/api/auth/signin', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const identifier = typeof input?.identifier === 'string' ? input.identifier.trim() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!identifier || !password) return Response.json({ ok: false, error: 'Username/email and password are required' }, { status: 400 });
  const normalized = identifier.toLowerCase();
  const user = await env.DB.prepare('SELECT id, full_name, username, email, phone, password_hash, password_salt, status FROM users WHERE username = ? OR email = ? LIMIT 1').bind(normalized, normalized).first();
  if (!user || user.status !== 'active') return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  if (!await verifySecret(password, user.password_hash, user.password_salt)) return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  const session = await createSession(env, { userId: user.id, role: 'client' });
  return new Response(JSON.stringify({ ok: true, authenticated: true, user: { id: user.id, fullName: user.full_name, username: user.username, email: user.email, phone: user.phone } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(session.token, 60 * 60 * 24 * 7) } });
});

route('POST', '/api/session/logout', async ({ request, env }) => {
  if (isStateChangingRequest(request) && !hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  await revokeSession(request, env);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() } });
});
