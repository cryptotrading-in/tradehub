import { route } from './router.js';
import { getSession, hasTrustedOrigin } from './session.js';
import { hashSecret, verifySecret } from './auth.js';

async function ensureWithdrawalTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS withdrawal_security (
    user_id TEXT PRIMARY KEY,
    withdrawal_address TEXT NOT NULL DEFAULT '',
    pin_hash TEXT,
    pin_salt TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    network TEXT NOT NULL CHECK (network = 'TRC20'),
    withdrawal_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Processing','Completed','Rejected')),
    rejection_reason TEXT,
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    completed_at INTEGER,
    reviewed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_created ON withdrawal_requests(user_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_created ON withdrawal_requests(status, created_at DESC)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wallet_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reference_id TEXT,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','BONUS')),
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_wallet_activity_user_created ON wallet_activity(user_id, created_at DESC)').run();
}

async function clientSession(request, env) {
  return await getSession(request, env, 'client');
}

route('GET', '/api/withdrawal-security', async ({ request, env }) => {
  await ensureWithdrawalTables(env);
  const session = await clientSession(request, env);
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const row = await env.DB.prepare('SELECT withdrawal_address, pin_hash FROM withdrawal_security WHERE user_id = ? LIMIT 1').bind(session.user_id).first();
  return Response.json({ ok: true, withdrawalAddress: row?.withdrawal_address || '', pinSet: Boolean(row?.pin_hash) });
});

route('POST', '/api/withdrawal-security', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  await ensureWithdrawalTables(env);
  const session = await clientSession(request, env);
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  let input; try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const address = typeof input?.withdrawalAddress === 'string' ? input.withdrawalAddress.trim() : '';
  const pin = typeof input?.pin === 'string' ? input.pin.trim() : '';
  const currentPin = typeof input?.currentPin === 'string' ? input.currentPin.trim() : '';
  if (!address || address.length < 20 || address.length > 200) return Response.json({ ok: false, error: 'Valid TRC20 withdrawal address is required' }, { status: 400 });
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return Response.json({ ok: false, error: 'Enter a valid TRC20 address' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return Response.json({ ok: false, error: 'Withdrawal PIN must be exactly 4 digits' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT pin_hash, pin_salt FROM withdrawal_security WHERE user_id = ? LIMIT 1').bind(session.user_id).first();
  if (existing?.pin_hash) {
    if (!/^\d{4}$/.test(currentPin) || !(await verifySecret(currentPin, existing.pin_hash, existing.pin_salt))) return Response.json({ ok: false, error: 'Current withdrawal PIN is incorrect' }, { status: 403 });
  }
  const secret = await hashSecret(pin);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`INSERT INTO withdrawal_security (user_id, withdrawal_address, pin_hash, pin_salt, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET withdrawal_address = excluded.withdrawal_address, pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt, updated_at = excluded.updated_at`).bind(session.user_id, address, secret.hash, secret.salt, now).run();
  return Response.json({ ok: true, withdrawalAddress: address, pinSet: true });
});

route('GET', '/api/withdrawals', async ({ request, env }) => {
  await ensureWithdrawalTables(env);
  const session = await clientSession(request, env);
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const rows = await env.DB.prepare(`SELECT id, amount, network, withdrawal_address, status, rejection_reason, created_at, reviewed_at, completed_at FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(session.user_id).all();
  return Response.json({ ok: true, withdrawals: rows.results || [] });
});

route('POST', '/api/withdrawals', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  await ensureWithdrawalTables(env);
  const session = await clientSession(request, env);
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  let input; try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const amount = Number(input?.amount);
  const pin = typeof input?.pin === 'string' ? input.pin.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0) return Response.json({ ok: false, error: 'Enter a valid withdrawal amount' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return Response.json({ ok: false, error: 'Withdrawal PIN must be exactly 4 digits' }, { status: 400 });
  const security = await env.DB.prepare('SELECT withdrawal_address, pin_hash, pin_salt FROM withdrawal_security WHERE user_id = ? LIMIT 1').bind(session.user_id).first();
  if (!security?.withdrawal_address || !security.pin_hash) return Response.json({ ok: false, error: 'Set your TRC20 withdrawal address and PIN in Account → Security first' }, { status: 400 });
  if (!(await verifySecret(pin, security.pin_hash, security.pin_salt))) return Response.json({ ok: false, error: 'Withdrawal PIN is incorrect' }, { status: 403 });
  const deposits = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS total_deposited, MIN(created_at) AS oldest_deposit, MAX(created_at) AS latest_deposit FROM deposit_requests WHERE user_id = ? AND status = 'Approved'`).bind(session.user_id).first();
  const totalDeposited = Number(deposits?.total_deposited || 0);
  if (totalDeposited <= 0) return Response.json({ ok: false, error: 'A withdrawal requires at least one approved deposit' }, { status: 403 });
  const now = Math.floor(Date.now() / 1000);
  const waitingSeconds = 20 * 24 * 60 * 60;
  const pendingDeposit = await env.DB.prepare(`SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'Approved' AND created_at > ? LIMIT 1`).bind(session.user_id, now - waitingSeconds).first();
  if (pendingDeposit) return Response.json({ ok: false, error: 'Withdrawal becomes available 20 days after the latest approved deposit' }, { status: 403 });
  if (amount < totalDeposited) return Response.json({ ok: false, error: `Minimum withdrawal is ${totalDeposited.toFixed(2)} USDT` }, { status: 403 });
  const wallet = await env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(session.user_id).first();
  const balance = Number(wallet?.balance || 0);
  const reserved = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS reserved FROM withdrawal_requests WHERE user_id = ? AND status IN ('Pending','Approved','Processing')`).bind(session.user_id).first();
  const reservedAmount = Number(reserved?.reserved || 0);
  const available = balance - reservedAmount;
  if (amount > available) return Response.json({ ok: false, error: 'Insufficient available balance' }, { status: 403 });
  const id = crypto.randomUUID();
  await env.DB.prepare('UPDATE wallet_accounts SET balance = ?, updated_at = ? WHERE user_id = ? AND balance >= ?').bind(balance - amount, now, session.user_id, amount).run();
  const after = await env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(session.user_id).first();
  if (Number(after?.balance ?? -1) !== balance - amount) return Response.json({ ok: false, error: 'Withdrawal could not be reserved' }, { status: 409 });
  await env.DB.prepare(`INSERT INTO withdrawal_requests (id, user_id, amount, network, withdrawal_address, status, created_at) VALUES (?, ?, ?, 'TRC20', ?, 'Pending', ?)`).bind(id, session.user_id, amount, security.withdrawal_address, now).run();
  return Response.json({ ok: true, withdrawal: { id, amount, network: 'TRC20', status: 'Pending', createdAt: now } }, { status: 201 });
});

async function adminGuard(request, env) {
  const auth = await (await import('./session.js')).requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const admin = await env.DB.prepare("SELECT id, role, status FROM admin_accounts WHERE id = ? LIMIT 1").bind(auth.session.user_id).first();
  if (!admin || admin.status !== 'active') return Response.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return { admin };
}

route('GET', '/api/admin/withdrawals', async ({ request, env }) => {
  const guard = await adminGuard(request, env); if (guard instanceof Response) return guard;
  await ensureWithdrawalTables(env);
  const rows = await env.DB.prepare(`SELECT w.id, w.user_id, u.full_name, u.username, u.email, u.phone, w.amount, w.network, w.withdrawal_address, w.status, w.rejection_reason, w.created_at, w.reviewed_at, w.completed_at FROM withdrawal_requests w JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 200`).all();
  return Response.json({ ok: true, withdrawals: rows.results || [] });
});

route('POST', '/api/admin/withdrawals/action', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const guard = await adminGuard(request, env); if (guard instanceof Response) return guard;
  await ensureWithdrawalTables(env);
  let input; try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const id = typeof input?.id === 'string' ? input.id : '';
  const action = typeof input?.action === 'string' ? input.action.toLowerCase() : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 500) : null;
  if (!id || !['approve','reject','processing','complete'].includes(action)) return Response.json({ ok: false, error: 'Invalid withdrawal action' }, { status: 400 });
  const row = await env.DB.prepare('SELECT * FROM withdrawal_requests WHERE id = ? LIMIT 1').bind(id).first();
  if (!row) return Response.json({ ok: false, error: 'Withdrawal request not found' }, { status: 404 });
  const now = Math.floor(Date.now() / 1000);
  if (action === 'reject') {
    if (!['Pending','Approved','Processing'].includes(row.status)) return Response.json({ ok: false, error: 'Withdrawal cannot be rejected now' }, { status: 409 });
    const wallet = await env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(row.user_id).first();
    const balance = Number(wallet?.balance || 0);
    await env.DB.batch([
      env.DB.prepare("UPDATE withdrawal_requests SET status = 'Rejected', rejection_reason = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status IN ('Pending','Approved','Processing')").bind(reason || 'Rejected by admin', now, guard.admin.id, id),
      env.DB.prepare('UPDATE wallet_accounts SET balance = ?, updated_at = ? WHERE user_id = ?').bind(balance + Number(row.amount), now, row.user_id)
    ]);
    return Response.json({ ok: true, status: 'Rejected' });
  }
  if (action === 'approve') {
    if (row.status !== 'Pending') return Response.json({ ok: false, error: 'Only pending withdrawals can be approved' }, { status: 409 });
    await env.DB.prepare("UPDATE withdrawal_requests SET status = 'Approved', reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'Pending'").bind(now, guard.admin.id, id).run();
    return Response.json({ ok: true, status: 'Approved' });
  }
  if (action === 'processing') {
    if (row.status !== 'Approved') return Response.json({ ok: false, error: 'Only approved withdrawals can enter processing' }, { status: 409 });
    await env.DB.prepare("UPDATE withdrawal_requests SET status = 'Processing', reviewed_at = COALESCE(reviewed_at, ?), reviewed_by = COALESCE(reviewed_by, ?) WHERE id = ? AND status = 'Approved'").bind(now, guard.admin.id, id).run();
    return Response.json({ ok: true, status: 'Processing' });
  }
  if (row.status !== 'Processing') return Response.json({ ok: false, error: 'Only processing withdrawals can be completed' }, { status: 409 });
  await env.DB.prepare("UPDATE withdrawal_requests SET status = 'Completed', completed_at = ? WHERE id = ? AND status = 'Processing'").bind(now, id).run();
  await env.DB.prepare(`INSERT INTO wallet_activity (id, user_id, reference_id, type, amount, balance_after, status, created_at) VALUES (?, ?, ?, 'WITHDRAWAL', ?, (SELECT balance FROM wallet_accounts WHERE user_id = ?), 'Completed', ?)`).bind(crypto.randomUUID(), row.user_id, id, -Number(row.amount), row.user_id, now).run();
  return Response.json({ ok: true, status: 'Completed' });
});
