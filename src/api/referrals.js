import { route } from './router.js';
import { getSession, hasTrustedOrigin } from './session.js';

async function ensureReferralTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_profiles (user_id TEXT PRIMARY KEY, referral_code TEXT NOT NULL UNIQUE, referred_by_user_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_profiles_code ON referral_profiles(referral_code)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referral_profiles_referrer ON referral_profiles(referred_by_user_id)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_records (id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, referred_user_id TEXT NOT NULL UNIQUE, referral_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Qualified','Rewarded','Disqualified','Cancelled')), qualifying_deposit_id TEXT, qualifying_amount REAL NOT NULL DEFAULT 0, reward_amount REAL NOT NULL DEFAULT 0, qualified_at INTEGER, rewarded_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referral_records_referrer_created ON referral_records(referrer_id, created_at DESC)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled INTEGER NOT NULL DEFAULT 1, reward_percent REAL NOT NULL DEFAULT 10, minimum_qualifying_deposit REAL NOT NULL DEFAULT 50, maximum_reward REAL NOT NULL DEFAULT 5, updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO referral_settings (id, enabled, reward_percent, minimum_qualifying_deposit, maximum_reward, updated_at) VALUES (1, 1, 10, 50, 5, ?)`).bind(Math.floor(Date.now() / 1000)).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_rewards (id TEXT PRIMARY KEY, referral_record_id TEXT NOT NULL UNIQUE, referrer_id TEXT NOT NULL, referred_user_id TEXT NOT NULL, deposit_id TEXT NOT NULL UNIQUE, amount REAL NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (referral_record_id) REFERENCES referral_records(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_created ON referral_rewards(referrer_id, created_at DESC)`).run();
}
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
export async function getOrCreateProfile(env, userId) {
  await ensureReferralTables(env);
  let row = await env.DB.prepare('SELECT user_id, referral_code, referred_by_user_id FROM referral_profiles WHERE user_id = ? LIMIT 1').bind(userId).first();
  if (row) return row;
  for (let i = 0; i < 8; i += 1) {
    const code = makeCode();
    try {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare('INSERT INTO referral_profiles (user_id, referral_code, referred_by_user_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)').bind(userId, code, now, now).run();
      return { user_id: userId, referral_code: code, referred_by_user_id: null };
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('unique')) throw error;
    }
  }
  throw new Error('Unable to generate referral code');
}
export async function processReferralQualification(env, referredUserId, depositId, amount, now = Math.floor(Date.now() / 1000)) {
  await ensureReferralTables(env);
  const relation = await env.DB.prepare(`SELECT rp.referred_by_user_id AS referrer_id, rr.id AS record_id, rr.status FROM referral_profiles rp LEFT JOIN referral_records rr ON rr.referred_user_id = rp.user_id WHERE rp.user_id = ? LIMIT 1`).bind(referredUserId).first();
  if (!relation?.referrer_id || relation.status !== 'Pending') return { qualified: false, reward: 0 };
  const settings = await env.DB.prepare('SELECT enabled, reward_percent, minimum_qualifying_deposit, maximum_reward FROM referral_settings WHERE id = 1 LIMIT 1').first();
  if (!settings?.enabled) return { qualified: false, reward: 0 };
  const minDeposit = Number(settings.minimum_qualifying_deposit || 50);
  if (Number(amount) < minDeposit) return { qualified: false, reward: 0 };
  const rewardPercent = Number(settings.reward_percent || 10);
  let reward = Number((Number(amount) * rewardPercent / 100).toFixed(2));
  const maxReward = Number(settings.maximum_reward || 5);
  if (maxReward > 0) reward = Math.min(reward, maxReward);
  if (reward <= 0) return { qualified: false, reward: 0 };
  const recordId = relation.record_id || crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)').bind(relation.referrer_id, now).run();
    const activityId = crypto.randomUUID();
    const rewardId = crypto.randomUUID();
    const updated = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO referral_rewards (id, referral_record_id, referrer_id, referred_user_id, deposit_id, amount, created_at) SELECT ?, id, referrer_id, referred_user_id, ?, ?, ? FROM referral_records WHERE id = ? AND status = 'Pending'`).bind(rewardId, depositId, reward, now, recordId),
      env.DB.prepare(`UPDATE wallet_accounts SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND changes() = 1`).bind(reward, now, relation.referrer_id),
      env.DB.prepare(`INSERT INTO wallet_activity (id, user_id, reference_id, type, amount, balance_after, status, created_at) SELECT ?, user_id, ?, 'REFERRAL_BONUS', ?, balance, 'Completed', ? FROM wallet_accounts WHERE user_id = ? AND changes() = 1`).bind(activityId, recordId, reward, now, relation.referrer_id),
      env.DB.prepare(`UPDATE referral_records SET status='Rewarded', qualifying_deposit_id=?, qualifying_amount=?, reward_amount=?, qualified_at=?, rewarded_at=?, updated_at=? WHERE id=? AND status='Pending' AND changes() = 1`).bind(depositId, Number(amount), reward, now, now, now, recordId)
    ]);
    if (!updated?.[3]?.meta?.changes) return { qualified: false, reward: 0 };
    return { qualified: true, reward };
  } catch (error) {
    console.error('Referral reward failed', error);
    return { qualified: false, reward: 0 };
  }
}
route('GET', '/api/referral/validate', async ({ request, env }) => {
  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() || '';
  if (!code) return Response.json({ ok: false, valid: false, error: 'Referral code is required' }, { status: 400 });
  await ensureReferralTables(env);
  const row = await env.DB.prepare('SELECT user_id FROM referral_profiles WHERE referral_code = ? LIMIT 1').bind(code).first();
  return Response.json({ ok: true, valid: !!row });
});
route('GET', '/api/referral/profile', async ({ request, env }) => {
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const profile = await getOrCreateProfile(env, session.user_id);
  const records = await env.DB.prepare(`SELECT status, qualifying_amount, reward_amount, created_at, qualified_at, rewarded_at FROM referral_records WHERE referrer_id = ? ORDER BY created_at DESC LIMIT 100`).bind(session.user_id).all();
  const stats = (records.results || []).reduce((a, r) => { a.total += 1; if (r.status === 'Pending') a.pending += 1; if (r.status === 'Qualified' || r.status === 'Rewarded') a.qualified += 1; if (r.status === 'Rewarded') a.rewards += Number(r.reward_amount || 0); return a; }, { total: 0, pending: 0, qualified: 0, rewards: 0 });
  return Response.json({ ok: true, referral: { code: profile.referral_code, link: new URL('/signup/?ref=' + encodeURIComponent(profile.referral_code), request.url).toString(), referredBy: profile.referred_by_user_id || null, stats, records: records.results || [] } });
});
route('POST', '/api/referral/register', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const session = await getSession(request, env, 'client');
  if (!session) return Response.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  let input = {};
  try { input = await request.json(); } catch {}
  const entered = typeof input?.referralCode === 'string' ? input.referralCode.trim().toUpperCase() : '';
  const own = await getOrCreateProfile(env, session.user_id);
  if (!entered) return Response.json({ ok: true, referral: { code: own.referral_code, linked: false } });
  if (entered === own.referral_code) return Response.json({ ok: false, error: 'You cannot use your own referral code' }, { status: 400 });
  const referrer = await env.DB.prepare('SELECT user_id FROM referral_profiles WHERE referral_code = ? LIMIT 1').bind(entered).first();
  if (!referrer) return Response.json({ ok: false, error: 'Invalid referral code' }, { status: 400 });
  if (own.referred_by_user_id) return Response.json({ ok: true, referral: { code: own.referral_code, linked: true } });
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE referral_profiles SET referred_by_user_id = ?, updated_at = ? WHERE user_id = ? AND referred_by_user_id IS NULL').bind(referrer.user_id, now, session.user_id).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO referral_records (id, referrer_id, referred_user_id, referral_code, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Pending', ?, ?)`).bind(crypto.randomUUID(), referrer.user_id, session.user_id, entered, now, now).run();
  return Response.json({ ok: true, referral: { code: own.referral_code, linked: true } });
});
route('GET', '/api/admin/referral-settings', async ({ request, env }) => {
  const session = await getSession(request, env, 'admin');
  if (!session) return Response.json({ ok: false, error: 'Admin access required' }, { status: 401 });
  await ensureReferralTables(env);
  const settings = await env.DB.prepare('SELECT enabled, reward_percent, minimum_qualifying_deposit, maximum_reward, updated_at FROM referral_settings WHERE id = 1').first();
  return Response.json({ ok: true, settings: settings || {} });
});
route('POST', '/api/admin/referral-settings', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const session = await getSession(request, env, 'admin');
  if (!session) return Response.json({ ok: false, error: 'Admin access required' }, { status: 401 });
  await ensureReferralTables(env);
  let input = {};
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const enabled = input?.enabled ? 1 : 0;
  const rewardPercent = Number(input?.rewardPercent || 0);
  const minimum = Number(input?.minimumQualifyingDeposit || 0);
  const maximum = Number(input?.maximumReward || 0);
  if (!Number.isFinite(rewardPercent) || rewardPercent < 0 || rewardPercent > 100) return Response.json({ ok: false, error: 'Reward percent must be between 0 and 100' }, { status: 400 });
  if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < 0) return Response.json({ ok: false, error: 'Invalid referral limits' }, { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE referral_settings SET enabled = ?, reward_percent = ?, minimum_qualifying_deposit = ?, maximum_reward = ?, updated_at = ? WHERE id = 1').bind(enabled, rewardPercent, minimum, maximum, now).run();
  return Response.json({ ok: true });
});
