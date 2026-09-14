import { route } from './router.js';
import { getSession } from './session.js';

route('GET', '/api/admin/referrals', async ({ request, env }) => {
  const session = await getSession(request, env, 'admin');
  if (!session) return Response.json({ ok: false, error: 'Admin access required' }, { status: 401 });

  const rows = await env.DB.prepare(`
    SELECT
      rr.id, rr.referrer_id, rr.referred_user_id, rr.referral_code, rr.status,
      rr.qualifying_amount, rr.reward_amount, rr.created_at, rr.qualified_at, rr.rewarded_at,
      ref.full_name AS referrer_name,
      user.full_name AS referred_name
    FROM referral_records rr
    LEFT JOIN users ref ON ref.id = rr.referrer_id
    LEFT JOIN users user ON user.id = rr.referred_user_id
    ORDER BY rr.created_at DESC
    LIMIT 500
  `).all();

  const records = rows.results || [];
  const stats = records.reduce((a, r) => {
    a.total += 1;
    if (r.status === 'Pending') a.pending += 1;
    if (r.status === 'Qualified' || r.status === 'Rewarded') a.qualified += 1;
    if (r.status === 'Rewarded') a.earned += Number(r.reward_amount || 0);
    return a;
  }, { total: 0, pending: 0, qualified: 0, earned: 0 });

  return Response.json({ ok: true, stats, records });
});
