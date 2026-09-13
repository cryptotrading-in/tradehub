import { route } from './router.js';
import { getSession, hasTrustedOrigin, requireSession } from './session.js';

async function ensureDepositTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deposit_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    trc20_address TEXT NOT NULL DEFAULT '',
    erc20_address TEXT NOT NULL DEFAULT '',
    minimum_deposit REAL NOT NULL DEFAULT 151,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO deposit_settings (id, trc20_address, erc20_address, minimum_deposit, updated_at) VALUES (1, '', '', 151, ?)`).bind(Math.floor(Date.now() / 1000)).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    whatsapp_1 TEXT NOT NULL DEFAULT '',
    whatsapp_2 TEXT NOT NULL DEFAULT '',
    whatsapp_3 TEXT NOT NULL DEFAULT '',
    bonus_enabled INTEGER NOT NULL DEFAULT 0,
    bonus_percent REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO admin_settings (id, updated_at) VALUES (1, ?)`).bind(Math.floor(Date.now() / 1000)).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deposit_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    network TEXT NOT NULL CHECK (network IN ('TRC20','ERC20')),
    txid TEXT NOT NULL,
    receipt_data TEXT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
    rejection_reason TEXT,
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wallet_deposit_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    deposit_id TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deposit_id) REFERENCES deposit_requests(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS first_deposit_bonuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    deposit_id TEXT NOT NULL UNIQUE,
    deposit_amount REAL NOT NULL,
    bonus_percent REAL NOT NULL,
    bonus_amount REAL NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deposit_id) REFERENCES deposit_requests(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS wallet_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reference_id TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_created ON deposit_requests(user_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deposit_requests_status_created ON deposit_requests(status, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_wallet_deposit_transactions_user_created ON wallet_deposit_transactions(user_id, created_at DESC)').run();
}

async function adminGuard(request, env) {
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const admin = await env.DB.prepare("SELECT id, role, status FROM admin_accounts WHERE id = ? LIMIT 1").bind(auth.session.user_id).first();
  if (!admin || admin.status !== 'active') return Response.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return { admin };
}

route('GET', '/api/deposit-settings', async ({ env }) => {
  await ensureDepositTables(env);
  const settings = await env.DB.prepare('SELECT trc20_address, erc20_address, minimum_deposit FROM deposit_settings WHERE id = 1').first();
  return Response.json({ ok: true, settings: { trc20Address: settings?.trc20_address || '', erc20Address: settings?.erc20_address || '', minimumDeposit: Number(settings?.minimum_deposit || 151) } });
});

route('GET', '/api/deposits', async ({ request, env }) => {
  await ensureDepositTables(env);
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const result = await env.DB.prepare(`SELECT id, amount, network, txid, status, rejection_reason, created_at, reviewed_at FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(session.user_id).all();
  return Response.json({ ok: true, deposits: result.results || [] });
});

route('POST', '/api/deposits', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  await ensureDepositTables(env);
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const amount = Number(input?.amount);
  const network = typeof input?.network === 'string' ? input.network.toUpperCase() : '';
  const txid = typeof input?.txid === 'string' ? input.txid.trim() : '';
  const receiptData = typeof input?.receiptData === 'string' ? input.receiptData : null;
  const settings = await env.DB.prepare('SELECT trc20_address, erc20_address, minimum_deposit FROM deposit_settings WHERE id = 1').first();
  const minimum = Number(settings?.minimum_deposit || 151);
  if (!Number.isFinite(amount) || amount < minimum) return Response.json({ ok: false, error: `Minimum deposit is ${minimum.toFixed(2)} USDT` }, { status: 400 });
  if (!['TRC20','ERC20'].includes(network)) return Response.json({ ok: false, error: 'Select a valid deposit network' }, { status: 400 });
  if (!txid || txid.length < 8 || txid.length > 200) return Response.json({ ok: false, error: 'Valid transaction ID / hash is required' }, { status: 400 });
  const walletAddress = network === 'TRC20' ? settings?.trc20_address : settings?.erc20_address;
  if (!walletAddress) return Response.json({ ok: false, error: `${network} deposit address is not configured yet` }, { status: 409 });
  if (receiptData && (receiptData.length > 700000 || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(receiptData))) return Response.json({ ok: false, error: 'Receipt image must be JPG, PNG or WebP and under 700 KB' }, { status: 400 });
  const duplicate = await env.DB.prepare('SELECT id FROM deposit_requests WHERE txid = ? LIMIT 1').bind(txid).first();
  if (duplicate) return Response.json({ ok: false, error: 'This transaction ID has already been submitted' }, { status: 409 });
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO deposit_requests (id, user_id, amount, network, txid, receipt_data, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`).bind(id, session.user_id, amount, network, txid, receiptData, now).run();
  return Response.json({ ok: true, deposit: { id, amount, network, txid, status: 'Pending', createdAt: now } }, { status: 201 });
});

route('GET', '/api/admin/deposit-settings', async ({ request, env }) => {
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureDepositTables(env);
  const settings = await env.DB.prepare('SELECT trc20_address, erc20_address, minimum_deposit, updated_at FROM deposit_settings WHERE id = 1').first();
  return Response.json({ ok: true, settings: { trc20Address: settings?.trc20_address || '', erc20Address: settings?.erc20_address || '', minimumDeposit: Number(settings?.minimum_deposit || 151), updatedAt: settings?.updated_at || null } });
});

route('POST', '/api/admin/deposit-settings', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureDepositTables(env);
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const trc20Address = typeof input?.trc20Address === 'string' ? input.trc20Address.trim() : '';
  const erc20Address = typeof input?.erc20Address === 'string' ? input.erc20Address.trim() : '';
  const minimumDeposit = Number(input?.minimumDeposit);
  if (!Number.isFinite(minimumDeposit) || minimumDeposit <= 0) return Response.json({ ok: false, error: 'Minimum deposit must be greater than zero' }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`UPDATE deposit_settings SET trc20_address = ?, erc20_address = ?, minimum_deposit = ?, updated_at = ? WHERE id = 1`).bind(trc20Address, erc20Address, minimumDeposit, now).run();
  return Response.json({ ok: true });
});

route('GET', '/api/admin/deposits', async ({ request, env }) => {
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureDepositTables(env);
  const result = await env.DB.prepare(`SELECT d.id, d.user_id, u.full_name, u.username, u.email, u.phone, d.amount, d.network, d.txid, d.receipt_data, d.status, d.rejection_reason, d.created_at, d.reviewed_at, d.reviewed_by FROM deposit_requests d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 200`).all();
  return Response.json({ ok: true, deposits: result.results || [] });
});

route('POST', '/api/admin/deposits/action', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureDepositTables(env);
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const id = typeof input?.id === 'string' ? input.id : '';
  const action = typeof input?.action === 'string' ? input.action.toLowerCase() : '';
  const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 500) : null;
  if (!id || !['approve','reject'].includes(action)) return Response.json({ ok: false, error: 'Invalid deposit action' }, { status: 400 });
  const deposit = await env.DB.prepare('SELECT id, user_id, amount, status FROM deposit_requests WHERE id = ? LIMIT 1').bind(id).first();
  if (!deposit) return Response.json({ ok: false, error: 'Deposit request not found' }, { status: 404 });
  if (deposit.status !== 'Pending') return Response.json({ ok: false, error: 'Deposit request has already been reviewed' }, { status: 409 });
  const now = Math.floor(Date.now() / 1000);
  if (action === 'reject') {
    const rejected = await env.DB.prepare(`UPDATE deposit_requests SET status = 'Rejected', rejection_reason = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'Pending'`).bind(reason || 'Rejected by admin', now, guard.admin.id, id).run();
    if (!rejected.meta?.changes) return Response.json({ ok: false, error: 'Deposit request was already reviewed' }, { status: 409 });
    return Response.json({ ok: true, status: 'Rejected' });
  }

  const wallet = await env.DB.prepare('SELECT balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(deposit.user_id).first();
  const current = Number(wallet?.balance || 0);
  const bonusSettings = await env.DB.prepare('SELECT bonus_enabled, bonus_percent FROM admin_settings WHERE id = 1').first();
  const priorBonus = await env.DB.prepare('SELECT id FROM first_deposit_bonuses WHERE user_id = ? LIMIT 1').bind(deposit.user_id).first();
  const priorApproved = await env.DB.prepare("SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'Approved' LIMIT 1").bind(deposit.user_id).first();
  const bonusEnabled = Boolean(bonusSettings?.bonus_enabled);
  const bonusPercent = Number(bonusSettings?.bonus_percent || 0);
  const bonusAmount = !priorBonus && !priorApproved && bonusEnabled && bonusPercent > 0 ? Number((Number(deposit.amount) * bonusPercent / 100).toFixed(2)) : 0;
  const credited = Number(deposit.amount) + bonusAmount;
  const next = current + credited;
  const txId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`UPDATE deposit_requests SET status = 'Approved', rejection_reason = NULL, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'Pending'`).bind(now, guard.admin.id, id),
    wallet ? env.DB.prepare('UPDATE wallet_accounts SET balance = ?, updated_at = ? WHERE user_id = ?').bind(next, now, deposit.user_id) : env.DB.prepare('INSERT INTO wallet_accounts (user_id, balance, updated_at) VALUES (?, ?, ?)').bind(deposit.user_id, credited, now),
    env.DB.prepare(`INSERT INTO wallet_deposit_transactions (id, user_id, deposit_id, amount, balance_after, status, created_at) VALUES (?, ?, ?, ?, ?, 'Completed', ?)`).bind(txId, deposit.user_id, deposit.id, Number(deposit.amount), next, now)
  ];
  if (bonusAmount > 0) {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO first_deposit_bonuses (id, user_id, deposit_id, deposit_amount, bonus_percent, bonus_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), deposit.user_id, deposit.id, Number(deposit.amount), bonusPercent, bonusAmount, now));
    statements.push(env.DB.prepare(`INSERT INTO wallet_activity (id, user_id, reference_id, type, amount, balance_after, status, created_at) VALUES (?, ?, ?, 'BONUS', ?, ?, 'Completed', ?)`)
      .bind(crypto.randomUUID(), deposit.user_id, deposit.id, bonusAmount, next, now));
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error('Deposit approval transaction failed', error);
    return Response.json({ ok: false, error: 'Deposit approval could not be completed safely' }, { status: 500 });
  }
  return Response.json({ ok: true, status: 'Approved', credited: Number(deposit.amount), bonus: bonusAmount, balance: next });
});
