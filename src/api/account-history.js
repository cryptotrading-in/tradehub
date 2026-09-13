import { route } from './router.js';
import { getSession } from './session.js';

async function ensureAccountActivity(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_account_activity_user_created ON account_activity(user_id, created_at DESC)').run();
}

export async function logAccountActivity(env, userId, type, title, details = '') {
  await ensureAccountActivity(env);
  await env.DB.prepare('INSERT INTO account_activity (id, user_id, type, title, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, type, title, details, Math.floor(Date.now() / 1000)).run();
}

route('GET', '/api/account-history', async ({ request, env }) => {
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  await ensureAccountActivity(env);
  const url = new URL(request.url);
  const filter = (url.searchParams.get('filter') || 'all').toLowerCase();
  const allowed = ['all', 'deposit', 'withdrawal', 'login', 'security'];
  if (!allowed.includes(filter)) return Response.json({ ok: false, error: 'Invalid history filter' }, { status: 400 });

  const items = [];
  const push = (row) => items.push(row);
  if (filter === 'all' || filter === 'deposit') {
    const rows = await env.DB.prepare(`SELECT id, amount, status, created_at FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`).bind(session.user_id).all();
    for (const r of rows.results || []) push({ id: 'deposit:' + r.id, category: 'deposit', title: 'Deposit ' + r.status, details: Number(r.amount).toFixed(2) + ' USDT', status: r.status, created_at: r.created_at });
  }
  if (filter === 'all' || filter === 'withdrawal') {
    const rows = await env.DB.prepare(`SELECT id, amount, network, status, created_at FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`).bind(session.user_id).all();
    for (const r of rows.results || []) push({ id: 'withdrawal:' + r.id, category: 'withdrawal', title: 'Withdrawal ' + r.status, details: Number(r.amount).toFixed(2) + ' USDT · ' + r.network, status: r.status, created_at: r.created_at });
  }
  if (filter === 'all' || filter === 'login') {
    const rows = await env.DB.prepare(`SELECT token_hash, created_at, expires_at FROM sessions WHERE user_id = ? AND role = 'client' ORDER BY created_at DESC LIMIT 100`).bind(session.user_id).all();
    for (const r of rows.results || []) push({ id: 'login:' + r.token_hash, category: 'login', title: 'Account login', details: 'Client session started', status: 'Completed', created_at: r.created_at });
  }
  if (filter === 'all' || filter === 'security') {
    const rows = await env.DB.prepare(`SELECT id, type, title, details, created_at FROM account_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`).bind(session.user_id).all();
    for (const r of rows.results || []) push({ id: r.id, category: 'security', title: r.title, details: r.details || '', status: 'Completed', created_at: r.created_at });
  }
  items.sort((a, b) => Number(b.created_at) - Number(a.created_at));
  return Response.json({ ok: true, history: items.slice(0, 200) });
});
