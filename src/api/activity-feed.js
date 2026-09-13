import { route } from './router.js';

async function ensureActivityTables(env) {
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
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_wallet_activity_feed ON wallet_activity(created_at DESC)').run();
}

function maskName(name, username, id) {
  const raw = String(name || username || 'User').trim();
  if (!raw) return 'User';
  const parts = raw.split(/\s+/).filter(Boolean);
  const base = parts[0] || 'User';
  if (base.length <= 2) return base[0] + '*';
  return base.slice(0, Math.min(2, base.length - 1)) + '*'.repeat(Math.min(3, Math.max(1, base.length - 2)));
}

route('GET', '/api/activity-feed', async ({ env }) => {
  await ensureActivityTables(env);
  const items = [];
  const add = (id, userId, name, type, amount, createdAt, details = '') => {
    items.push({ id, userId, name: maskName(name), type, amount: Number(amount || 0), created_at: Number(createdAt || 0), details });
  };

  const deposits = await env.DB.prepare(`SELECT d.id, d.user_id, d.amount, d.created_at, u.full_name, u.username
    FROM deposit_requests d JOIN users u ON u.id = d.user_id
    WHERE d.status = 'Approved' ORDER BY d.created_at DESC LIMIT 40`).all();
  for (const r of deposits.results || []) add('deposit:' + r.id, r.user_id, r.full_name, 'deposit', r.amount, r.created_at, 'USDT');

  const withdrawals = await env.DB.prepare(`SELECT w.id, w.user_id, w.amount, w.created_at, w.status, u.full_name, u.username
    FROM withdrawal_requests w JOIN users u ON u.id = w.user_id
    WHERE w.status IN ('Approved','Processing','Completed') ORDER BY w.created_at DESC LIMIT 40`).all();
  for (const r of withdrawals.results || []) add('withdrawal:' + r.id, r.user_id, r.full_name, 'withdrawal', r.amount, r.created_at, 'USDT');

  const bonuses = await env.DB.prepare(`SELECT a.id, a.user_id, a.amount, a.created_at, a.type, u.full_name, u.username
    FROM wallet_activity a JOIN users u ON u.id = a.user_id
    WHERE UPPER(a.type) LIKE '%BONUS%' AND a.status = 'Completed'
    ORDER BY a.created_at DESC LIMIT 40`).all();
  for (const r of bonuses.results || []) {
    const type = /REFER/i.test(String(r.type)) ? 'referral_bonus' : 'bonus';
    add('bonus:' + r.id, r.user_id, r.full_name, type, r.amount, r.created_at, 'USDT');
  }

  const logins = await env.DB.prepare(`SELECT s.token_hash, s.user_id, s.created_at, u.full_name, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.role = 'client' ORDER BY s.created_at DESC LIMIT 40`).all();
  for (const r of logins.results || []) add('login:' + r.token_hash, r.user_id, r.full_name, 'login', 0, r.created_at, '');

  items.sort((a, b) => b.created_at - a.created_at);
  return Response.json({ ok: true, activities: items.slice(0, 80) });
});
