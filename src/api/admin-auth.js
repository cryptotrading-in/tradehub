import { clearSessionCookie, createSession, getSession, hasTrustedOrigin, sessionCookieFor, requireSession } from './session.js';
import { hashSecret, normalizeEmail, normalizeUsername, verifySecret } from './auth.js';

async function ensureAdminTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_accounts (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    recovery_pin_hash TEXT,
    recovery_pin_salt TEXT,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('master', 'staff')),
    permissions_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_accounts_role ON admin_accounts(role)').run();
}

async function masterAccount(env) {
  await ensureAdminTables(env);
  return env.DB.prepare("SELECT id, full_name, username, email, role, permissions_json, status FROM admin_accounts WHERE role = 'master' LIMIT 1").first();
}

function badOrigin(request) {
  return !hasTrustedOrigin(request) ? Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 }) : null;
}

route('GET', '/api/admin/status', async ({ env }) => {
  const master = await masterAccount(env);
  return Response.json({ ok: true, setupRequired: !master });
});

route('POST', '/api/admin/setup', async ({ request, env }) => {
  const originError = badOrigin(request);
  if (originError) return originError;
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const existing = await masterAccount(env);
  if (existing) return Response.json({ ok: false, error: 'Admin setup has already been completed' }, { status: 409 });

  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim() : '';
  const email = typeof input?.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  const confirmPassword = typeof input?.confirmPassword === 'string' ? input.confirmPassword : '';
  const recoveryPin = typeof input?.recoveryPin === 'string' ? input.recoveryPin.trim() : '';
  if (fullName.length < 2 || fullName.length > 100) return Response.json({ ok: false, error: 'Invalid full name' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ ok: false, error: 'Invalid email address' }, { status: 400 });
  if (password.length < 8 || password.length > 128) return Response.json({ ok: false, error: 'Password must be 8-128 characters' }, { status: 400 });
  if (password !== confirmPassword) return Response.json({ ok: false, error: 'Passwords do not match' }, { status: 400 });
  if (!/^\d{4,12}$/.test(recoveryPin)) return Response.json({ ok: false, error: 'Recovery PIN must be 4-12 digits' }, { status: 400 });

  const passwordHash = await hashSecret(password);
  const pinHash = await hashSecret(recoveryPin);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const username = `admin_${id.replace(/-/g, '').slice(0, 10)}`;
  try {
    await env.DB.prepare(`INSERT INTO admin_accounts (id, full_name, username, email, password_hash, password_salt, recovery_pin_hash, recovery_pin_salt, role, permissions_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'master', ?, 'active', ?, ?)`).bind(id, fullName, username, email, passwordHash.hash, passwordHash.salt, pinHash.hash, pinHash.salt, '{"all":true}', now, now).run();
  } catch (error) {
    console.error('Admin setup error', error);
    return Response.json({ ok: false, error: 'Unable to create the master admin account' }, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, setupComplete: true, admin: { id, fullName, username, email, role: 'master' } }), { status: 201, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie('admin') } });
});

route('POST', '/api/admin/signin', async ({ request, env }) => {
  const originError = badOrigin(request);
  if (originError) return originError;
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const identifier = typeof input?.identifier === 'string' ? input.identifier.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!identifier || !password) return Response.json({ ok: false, error: 'Username/email and password are required' }, { status: 400 });
  const setup = await masterAccount(env);
  if (!setup) return Response.json({ ok: false, error: 'Admin setup is required first' }, { status: 409 });
  const account = await env.DB.prepare('SELECT id, full_name, username, email, password_hash, password_salt, role, permissions_json, status FROM admin_accounts WHERE username = ? OR email = ? LIMIT 1').bind(identifier, identifier).first();
  if (!account || account.status !== 'active' || !await verifySecret(password, account.password_hash, account.password_salt)) return Response.json({ ok: false, error: 'Invalid admin credentials' }, { status: 401 });
  const session = await createSession(env, { userId: account.id, role: 'admin' });
  return new Response(JSON.stringify({ ok: true, authenticated: true, admin: { id: account.id, fullName: account.full_name, username: account.username, email: account.email, role: account.role, permissions: JSON.parse(account.permissions_json || '{}') } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookieFor(session.token, 'admin') } });
});

route('POST', '/api/admin/forgot-password', async ({ request, env }) => {
  const originError = badOrigin(request);
  if (originError) return originError;
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const identifier = typeof input?.identifier === 'string' ? input.identifier.trim().toLowerCase() : '';
  const recoveryPin = typeof input?.recoveryPin === 'string' ? input.recoveryPin.trim() : '';
  const newPassword = typeof input?.newPassword === 'string' ? input.newPassword : '';
  const confirmNewPassword = typeof input?.confirmNewPassword === 'string' ? input.confirmNewPassword : '';
  if (!identifier || !/^\d{4,12}$/.test(recoveryPin)) return Response.json({ ok: false, error: 'Admin email/username and a valid Recovery PIN are required' }, { status: 400 });
  if (newPassword.length < 8 || newPassword.length > 128 || newPassword !== confirmNewPassword) return Response.json({ ok: false, error: 'New passwords must match and be 8-128 characters' }, { status: 400 });
  try {
    const account = await env.DB.prepare("SELECT id, recovery_pin_hash, recovery_pin_salt, role, status FROM admin_accounts WHERE (username = ? OR email = ?) AND role = 'master' LIMIT 1").bind(identifier, identifier).first();
    if (!account || account.status !== 'active' || !account.recovery_pin_hash || !account.recovery_pin_salt || !await verifySecret(recoveryPin, account.recovery_pin_hash, account.recovery_pin_salt)) return Response.json({ ok: false, error: 'Invalid recovery details' }, { status: 401 });
    const password = await hashSecret(newPassword);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('UPDATE admin_accounts SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').bind(password.hash, password.salt, now, account.id).run();
    try { await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, account.id).run(); } catch (error) { console.warn('Admin session revoke skipped during password reset', error); }
    return Response.json({ ok: true, passwordReset: true });
  } catch (error) {
    console.error('Admin password reset error', error);
    return Response.json({ ok: false, error: 'Unable to reset admin password' }, { status: 500 });
  }
});

route('POST', '/api/admin/staff', async ({ request, env }) => {
  const originError = badOrigin(request);
  if (originError) return originError;
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const caller = await env.DB.prepare('SELECT role, permissions_json, status FROM admin_accounts WHERE id = ? LIMIT 1').bind(auth.session.user_id).first();
  if (!caller || caller.status !== 'active' || caller.role !== 'master') return Response.json({ ok: false, error: 'Master admin access required' }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim() : '';
  const username = typeof input?.username === 'string' ? normalizeUsername(input.username) : '';
  const email = typeof input?.email === 'string' && input.email.trim() ? normalizeEmail(input.email) : null;
  const password = typeof input?.password === 'string' ? input.password : '';
  if (fullName.length < 2 || fullName.length > 100) return Response.json({ ok: false, error: 'Invalid full name' }, { status: 400 });
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return Response.json({ ok: false, error: 'Username must be 3-30 characters using letters, numbers, or underscore' }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ ok: false, error: 'Invalid email address' }, { status: 400 });
  if (password.length < 8 || password.length > 128) return Response.json({ ok: false, error: 'Password must be 8-128 characters' }, { status: 400 });
  const duplicate = await env.DB.prepare('SELECT id FROM admin_accounts WHERE username = ? OR (email IS NOT NULL AND email = ?) LIMIT 1').bind(username, email).first();
  if (duplicate) return Response.json({ ok: false, error: 'Username or email is already in use' }, { status: 409 });
  const secret = await hashSecret(password);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO admin_accounts (id, full_name, username, email, password_hash, password_salt, role, permissions_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'staff', ?, 'active', ?, ?)`).bind(id, fullName, username, email, secret.hash, secret.salt, JSON.stringify(input?.permissions || {}), now, now).run();
  return Response.json({ ok: true, staff: { id, fullName, username, email, role: 'staff', status: 'active' } }, { status: 201 });
});

route('GET', '/api/admin/staff', async ({ request, env }) => {
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const caller = await env.DB.prepare("SELECT role, status FROM admin_accounts WHERE id = ? LIMIT 1").bind(auth.session.user_id).first();
  if (!caller || caller.status !== 'active' || caller.role !== 'master') return Response.json({ ok: false, error: 'Master admin access required' }, { status: 403 });
  const result = await env.DB.prepare("SELECT id, full_name, username, email, role, permissions_json, status, created_at, updated_at FROM admin_accounts ORDER BY role DESC, created_at ASC").all();
  return Response.json({ ok: true, staff: result.results || [] });
});

route('POST', '/api/admin/logout', async ({ request, env }) => {
  const session = await getSession(request, env, 'admin');
  if (session?.role === 'admin') {
    await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(Math.floor(Date.now() / 1000), session.token_hash).run();
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie('admin') } });
});
