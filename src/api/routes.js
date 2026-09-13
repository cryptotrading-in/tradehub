import { route } from './router.js';
import { clearSessionCookie, createSession, getSession, hasTrustedOrigin, isStateChangingRequest, revokeSession, sessionCookieFor } from './session.js';
import { hashSecret, normalizeEmail, normalizeUsername, validateSignupInput, verifySecret } from './auth.js';
import './rounds.js';
import './admin-auth.js';

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
  return new Response(JSON.stringify({ ok: true, authenticated: true, user: { id: userId, fullName, username, email, phone } }), { status: 201, headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(session.token, 'client', 60 * 60 * 24 * 7) } });
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
  return new Response(JSON.stringify({ ok: true, authenticated: true, user: { id: user.id, fullName: user.full_name, username: user.username, email: user.email, phone: user.phone } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(session.token, 'client') } });
});

route('POST', '/api/auth/forgot-password', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const identifier = typeof input?.identifier === 'string' ? input.identifier.trim() : '';
  const recoveryPin = typeof input?.recoveryPin === 'string' ? input.recoveryPin.trim() : '';
  const newPassword = typeof input?.newPassword === 'string' ? input.newPassword : '';
  const confirmNewPassword = typeof input?.confirmNewPassword === 'string' ? input.confirmNewPassword : '';
  if (!identifier || !/^\d{4,12}$/.test(recoveryPin)) return Response.json({ ok: false, error: 'Username/email and a valid Recovery PIN are required' }, { status: 400 });
  if (newPassword.length < 8 || newPassword.length > 128) return Response.json({ ok: false, error: 'New password must be 8-128 characters' }, { status: 400 });
  if (newPassword !== confirmNewPassword) return Response.json({ ok: false, error: 'Passwords do not match' }, { status: 400 });
  const normalized = identifier.toLowerCase();
  const user = await env.DB.prepare('SELECT id, recovery_pin_hash, recovery_pin_salt, recovery_pin_failed_attempts, recovery_pin_locked_until, status FROM users WHERE username = ? OR email = ? LIMIT 1').bind(normalized, normalized).first();
  if (!user || user.status !== 'active') return Response.json({ ok: false, error: 'Invalid recovery details' }, { status: 401 });
  const now = Math.floor(Date.now() / 1000);
  if (user.recovery_pin_locked_until && user.recovery_pin_locked_until > now) return Response.json({ ok: false, error: 'Recovery is temporarily locked. Please try again later.' }, { status: 429 });
  const validPin = await verifySecret(recoveryPin, user.recovery_pin_hash, user.recovery_pin_salt);
  if (!validPin) {
    const attempts = (user.recovery_pin_failed_attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? now + 15 * 60 : null;
    await env.DB.prepare('UPDATE users SET recovery_pin_failed_attempts = ?, recovery_pin_locked_until = ?, updated_at = ? WHERE id = ?').bind(attempts, lockedUntil, now, user.id).run();
    return Response.json({ ok: false, error: 'Invalid recovery details' }, { status: 401 });
  }
  const password = await hashSecret(newPassword);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, recovery_pin_failed_attempts = 0, recovery_pin_locked_until = NULL, updated_at = ? WHERE id = ?').bind(password.hash, password.salt, now, user.id).run();
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, user.id).run();
  return Response.json({ ok: true, passwordReset: true });
});

route('POST', '/api/session/logout', async ({ request, env }) => {
  if (isStateChangingRequest(request) && !hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  await revokeSession(request, env, 'client');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie('client') } });
});
