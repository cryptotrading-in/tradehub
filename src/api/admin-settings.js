import { route } from './router.js';
import { requireSession, hasTrustedOrigin } from './session.js';

async function ensureAdminSettings(env) {
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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS deposit_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    trc20_address TEXT NOT NULL DEFAULT '',
    erc20_address TEXT NOT NULL DEFAULT '',
    minimum_deposit REAL NOT NULL DEFAULT 151,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO deposit_settings (id, updated_at) VALUES (1, ?)`).bind(Math.floor(Date.now() / 1000)).run();
}

async function adminGuard(request, env) {
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const admin = await env.DB.prepare("SELECT id, status FROM admin_accounts WHERE id = ? LIMIT 1").bind(auth.session.user_id).first();
  if (!admin || admin.status !== 'active') return Response.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  return { admin };
}

function cleanWhatsApp(value) {
  return typeof value === 'string' ? value.trim().replace(/[^0-9+]/g, '').slice(0, 20) : '';
}

route('GET', '/api/admin/settings', async ({ request, env }) => {
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureAdminSettings(env);
  const s = await env.DB.prepare('SELECT whatsapp_1, whatsapp_2, whatsapp_3, bonus_enabled, bonus_percent, updated_at FROM admin_settings WHERE id = 1').first();
  const d = await env.DB.prepare('SELECT trc20_address, erc20_address, minimum_deposit FROM deposit_settings WHERE id = 1').first();
  return Response.json({ ok: true, settings: {
    trc20Address: d?.trc20_address || '',
    erc20Address: d?.erc20_address || '',
    minimumDeposit: Number(d?.minimum_deposit || 151),
    whatsapp1: s?.whatsapp_1 || '', whatsapp2: s?.whatsapp_2 || '', whatsapp3: s?.whatsapp_3 || '',
    bonusEnabled: Boolean(s?.bonus_enabled), bonusPercent: Number(s?.bonus_percent || 0), updatedAt: s?.updated_at || null
  }});
});

route('POST', '/api/admin/settings', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const guard = await adminGuard(request, env);
  if (guard instanceof Response) return guard;
  await ensureAdminSettings(env);
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const trc20Address = typeof input?.trc20Address === 'string' ? input.trc20Address.trim() : '';
  const erc20Address = typeof input?.erc20Address === 'string' ? input.erc20Address.trim() : '';
  const minimumDeposit = Number(input?.minimumDeposit);
  if (!Number.isFinite(minimumDeposit) || minimumDeposit <= 0) return Response.json({ ok: false, error: 'Minimum deposit must be greater than zero' }, { status: 400 });
  const w1 = cleanWhatsApp(input?.whatsapp1), w2 = cleanWhatsApp(input?.whatsapp2), w3 = cleanWhatsApp(input?.whatsapp3);
  const bonusEnabled = input?.bonusEnabled === true;
  const bonusPercent = Number(input?.bonusPercent);
  if (!Number.isFinite(bonusPercent) || bonusPercent < 0 || bonusPercent > 100) return Response.json({ ok: false, error: 'Bonus percentage must be between 0 and 100' }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`UPDATE deposit_settings SET trc20_address = ?, erc20_address = ?, minimum_deposit = ?, updated_at = ? WHERE id = 1`).bind(trc20Address, erc20Address, minimumDeposit, now),
    env.DB.prepare(`UPDATE admin_settings SET whatsapp_1 = ?, whatsapp_2 = ?, whatsapp_3 = ?, bonus_enabled = ?, bonus_percent = ?, updated_at = ? WHERE id = 1`).bind(w1, w2, w3, bonusEnabled ? 1 : 0, bonusPercent, now)
  ]);
  return Response.json({ ok: true });
});

route('GET', '/api/support', async ({ env }) => {
  await ensureAdminSettings(env);
  const s = await env.DB.prepare('SELECT whatsapp_1, whatsapp_2, whatsapp_3 FROM admin_settings WHERE id = 1').first();
  return Response.json({ ok: true, whatsapp: [s?.whatsapp_1 || '', s?.whatsapp_2 || '', s?.whatsapp_3 || ''].filter(Boolean) });
});
