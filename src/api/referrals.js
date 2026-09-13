import { route } from './router.js';
import { getSession, hasTrustedOrigin } from './session.js';

async function ensureReferralTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_profiles (user_id TEXT PRIMARY KEY, referral_code TEXT NOT NULL UNIQUE, referred_by_user_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_profiles_code ON referral_profiles(referral_code)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referral_profiles_referrer ON referral_profiles(referred_by_user_id)`).run();
}
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
async function getOrCreateProfile(env, userId) {
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
  return Response.json({ ok: true, referral: { code: profile.referral_code, link: new URL('/signup/?ref=' + encodeURIComponent(profile.referral_code), request.url).toString(), referredBy: profile.referred_by_user_id || null } });
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
  return Response.json({ ok: true, referral: { code: own.referral_code, linked: true } });
});
