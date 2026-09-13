import { route } from './router.js';
import { hasTrustedOrigin, requireSession } from './session.js';

const MIN_BALANCES = Object.freeze({ 1: 150, 2: 250 });
const ENTRY_WINDOW_RATIO = 0.2;

function nowSec() { return Math.floor(Date.now() / 1000); }
function cycleKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function stateForRound(round, now) {
  const start = Number(round.start_at);
  const duration = Number(round.duration_seconds);
  const end = start + duration;
  const entryWindow = Math.max(15, Math.floor(duration * ENTRY_WINDOW_RATIO));
  if (now < start) return 'UPCOMING';
  if (now < start + entryWindow) return 'ENTRY_OPEN';
  if (now < end) return 'LOCKED';
  return 'RESULT';
}
function roundPayload(round, balance = null, trade = null) {
  const now = nowSec();
  const state = stateForRound(round, now);
  const minBalance = MIN_BALANCES[round.round_no];
  const canEnter = state === 'ENTRY_OPEN' && (balance == null || balance >= minBalance);
  return {
    id: round.id,
    roundNo: round.round_no,
    direction: round.direction,
    startAt: Number(round.start_at),
    durationSeconds: Number(round.duration_seconds),
    entryWindowSeconds: Math.max(15, Math.floor(Number(round.duration_seconds) * ENTRY_WINDOW_RATIO)),
    profitPct: Number(round.profit_pct),
    feePct: Number(round.fee_pct),
    result: round.result,
    minBalance,
    state: balance != null && balance < minBalance && state !== 'RESULT' ? 'LOCKED' : state,
    canEnter,
    trade: trade ? {
      id: trade.id,
      investment: Number(trade.investment),
      direction: trade.direction,
      entryPrice: Number(trade.entry_price),
      exitPrice: trade.exit_price == null ? null : Number(trade.exit_price),
      grossPnl: Number(trade.gross_pnl),
      fee: Number(trade.fee),
      netPnl: Number(trade.net_pnl),
      result: trade.result,
      status: trade.status,
      startedAt: Number(trade.started_at),
      settledAt: trade.settled_at == null ? null : Number(trade.settled_at)
    } : null
  };
}
function basePrice(round) { return 105000 + (Number(round.round_no) * 1000); }
function simulatedPrice(round, at) {
  const start = Number(round.start_at);
  const duration = Number(round.duration_seconds);
  const progress = Math.max(0, Math.min(1, (at - start) / duration));
  const direction = round.direction === 'UP' ? 1 : -1;
  const seed = Number(round.round_no) * 17;
  const wave = Math.sin((progress * Math.PI * 2) + seed) * 0.00055;
  const trend = direction * (0.001 + (0.0035 * progress));
  return Math.round(basePrice(round) * (1 + trend + wave));
}
async function ensureDefaultRounds(env, cycleId, now) {
  const defaults = [
    { roundNo: 1, direction: 'UP', startAt: now + 60, result: 'WIN' },
    { roundNo: 2, direction: 'DOWN', startAt: now + 3660, result: 'WIN' }
  ];
  for (const round of defaults) {
    await env.DB.prepare(`INSERT OR IGNORE INTO rounds
      (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 300, 5, 0.5, ?, ?, ?)`)
      .bind(crypto.randomUUID(), cycleId, round.roundNo, round.direction, round.startAt, round.result, now, now)
      .run();
  }
}
async function getCurrentCycle(env) {
  const now = nowSec();
  const today = cycleKey(new Date());
  let cycle = await env.DB.prepare('SELECT * FROM round_cycles WHERE cycle_key = ? LIMIT 1').bind(today).first();
  if (!cycle) {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO round_cycles (id, cycle_key, created_at, status) VALUES (?, ?, ?, 'scheduled')").bind(id, today, now).run();
    cycle = await env.DB.prepare('SELECT * FROM round_cycles WHERE id = ?').bind(id).first();
  }
  await ensureDefaultRounds(env, cycle.id, now);
  return cycle;
}
async function getRoundsForCycle(env, cycleId) {
  return await env.DB.prepare('SELECT * FROM rounds WHERE cycle_id = ? ORDER BY round_no ASC').bind(cycleId).all();
}
async function ensureWallet(env, userId) {
  const existing = await env.DB.prepare('SELECT user_id, balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(userId).first();
  if (existing) return existing;
  const now = nowSec();
  await env.DB.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, balance, updated_at) VALUES (?, 0, ?)').bind(userId, now).run();
  return await env.DB.prepare('SELECT user_id, balance FROM wallet_accounts WHERE user_id = ? LIMIT 1').bind(userId).first();
}
async function settleTrade(env, tradeId, now = nowSec()) {
  const trade = await env.DB.prepare(`SELECT t.*, r.start_at, r.duration_seconds, r.profit_pct, r.fee_pct, r.result, r.direction AS round_direction
    FROM round_trades t JOIN rounds r ON r.id = t.round_id WHERE t.id = ? LIMIT 1`).bind(tradeId).first();
  if (!trade || trade.status === 'SETTLED') return trade;
  const endAt = Number(trade.start_at) + Number(trade.duration_seconds);
  if (now < endAt) return trade;
  const exitPrice = simulatedPrice(trade, endAt);
  const investment = Number(trade.investment);
  const gross = trade.result === 'WIN' ? investment * Number(trade.profit_pct) / 100 : 0;
  const fee = trade.result === 'WIN' ? investment * Number(trade.fee_pct) / 100 : 0;
  const net = Math.max(0, gross - fee);
  const wallet = await ensureWallet(env, trade.user_id);
  const nextBalance = Number(wallet.balance) + net;
  const settledAt = now;
  const walletTxId = crypto.randomUUID();
  const txType = trade.result === 'WIN' ? 'ROUND_PROFIT' : 'ROUND_SETTLEMENT';
  await env.DB.batch([
    env.DB.prepare("UPDATE round_trades SET exit_price = ?, gross_pnl = ?, fee = ?, net_pnl = ?, status = 'SETTLED', settled_at = ? WHERE id = ? AND status = 'LOCKED'").bind(exitPrice, gross, fee, net, settledAt, tradeId),
    env.DB.prepare('UPDATE wallet_accounts SET balance = ?, updated_at = ? WHERE user_id = ?').bind(nextBalance, settledAt, trade.user_id),
    env.DB.prepare("INSERT INTO wallet_transactions (id, user_id, trade_id, type, amount, balance_after, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Completed', ?)").bind(walletTxId, trade.user_id, tradeId, txType, net, nextBalance, settledAt)
  ]);
  return await env.DB.prepare('SELECT * FROM round_trades WHERE id = ? LIMIT 1').bind(tradeId).first();
}

route('GET', '/api/rounds', async ({ request, env }) => {
  const cycle = await getCurrentCycle(env);
  const rounds = await getRoundsForCycle(env, cycle.id);
  const session = await requireSession(request, env);
  let balance = null;
  if (session.ok) {
    const wallet = await ensureWallet(env, session.session.user_id);
    balance = Number(wallet.balance);
    const active = await env.DB.prepare("SELECT id FROM round_trades WHERE user_id = ? AND status = 'LOCKED'").bind(session.session.user_id).all();
    for (const trade of active.results || []) await settleTrade(env, trade.id);
  }
  const latest = new Map();
  if (session.ok) {
    const rows = await env.DB.prepare('SELECT * FROM round_trades WHERE user_id = ? ORDER BY created_at DESC').bind(session.session.user_id).all();
    for (const trade of rows.results || []) if (!latest.has(trade.round_id)) latest.set(trade.round_id, trade);
  }
  return Response.json({ ok: true, cycle: { id: cycle.id, cycleKey: cycle.cycle_key, status: cycle.status }, balance, rounds: (rounds.results || []).map(r => roundPayload(r, balance, latest.get(r.id) || null)) });
});

route('GET', '/api/wallet', async ({ request, env }) => {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const wallet = await ensureWallet(env, auth.session.user_id);
  const tx = await env.DB.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(auth.session.user_id).all();
  return Response.json({ ok: true, balance: Number(wallet.balance), transactions: tx.results || [] });
});

route('GET', '/api/rounds/history', async ({ request, env }) => {
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare("SELECT t.*, r.round_no, r.direction AS configured_direction FROM round_trades t JOIN rounds r ON r.id = t.round_id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100").bind(auth.session.user_id).all();
  for (const trade of rows.results || []) if (trade.status === 'LOCKED') await settleTrade(env, trade.id);
  const fresh = await env.DB.prepare("SELECT t.*, r.round_no, r.direction AS configured_direction FROM round_trades t JOIN rounds r ON r.id = t.round_id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100").bind(auth.session.user_id).all();
  return Response.json({ ok: true, history: fresh.results || [] });
});

route('POST', '/api/rounds/trade', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const roundId = typeof input?.roundId === 'string' ? input.roundId : '';
  const investment = Number(input?.investment);
  if (!roundId || !Number.isFinite(investment) || investment <= 0) return Response.json({ ok: false, error: 'Round and investment are required' }, { status: 400 });
  const round = await env.DB.prepare('SELECT * FROM rounds WHERE id = ? LIMIT 1').bind(roundId).first();
  if (!round) return Response.json({ ok: false, error: 'Round not found' }, { status: 404 });
  const now = nowSec();
  if (stateForRound(round, now) !== 'ENTRY_OPEN') return Response.json({ ok: false, error: 'Entry window is closed' }, { status: 409 });
  const wallet = await ensureWallet(env, auth.session.user_id);
  const minBalance = MIN_BALANCES[round.round_no];
  if (Number(wallet.balance) < minBalance) return Response.json({ ok: false, error: `Minimum wallet balance for Round ${round.round_no} is ${minBalance} USDT` }, { status: 403 });
  const activeTrade = await env.DB.prepare("SELECT id FROM round_trades WHERE user_id = ? AND round_id = ? AND status = 'LOCKED' LIMIT 1").bind(auth.session.user_id, round.id).first();
  if (activeTrade) return Response.json({ ok: false, error: 'You already have an active trade in this round' }, { status: 409 });
  const tradeId = crypto.randomUUID();
  const entryPrice = simulatedPrice(round, now);
  await env.DB.prepare("INSERT INTO round_trades (id, user_id, round_id, investment, direction, entry_price, result, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'LOCKED', ?, ?)").bind(tradeId, auth.session.user_id, round.id, investment, round.direction, entryPrice, round.result, now, now).run();
  return Response.json({ ok: true, trade: { id: tradeId, roundId: round.id, investment, direction: round.direction, entryPrice, result: round.result, status: 'LOCKED', startedAt: now } }, { status: 201 });
});

route('GET', '/api/admin/rounds', async ({ request, env }) => {
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  const cycle = await getCurrentCycle(env);
  const rounds = await getRoundsForCycle(env, cycle.id);
  return Response.json({ ok: true, cycle, rounds: rounds.results || [], minBalances: MIN_BALANCES });
});

route('POST', '/api/admin/rounds', async ({ request, env }) => {
  if (!hasTrustedOrigin(request)) return Response.json({ ok: false, error: 'Untrusted origin' }, { status: 403 });
  const auth = await requireSession(request, env, 'admin');
  if (!auth.ok) return auth.response;
  let input;
  try { input = await request.json(); } catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const roundNo = Number(input?.roundNo);
  const direction = input?.direction;
  const startAt = Number(input?.startAt);
  const durationSeconds = Number(input?.durationSeconds);
  const profitPct = Number(input?.profitPct);
  const feePct = Number(input?.feePct);
  const result = input?.result;
  if (![1,2].includes(roundNo) || !['UP','DOWN'].includes(direction) || !Number.isFinite(startAt) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(profitPct) || profitPct < 0 || !Number.isFinite(feePct) || feePct < 0 || !['WIN','LOSS'].includes(result)) return Response.json({ ok: false, error: 'Invalid round configuration' }, { status: 400 });
  const cycle = await getCurrentCycle(env);
  const existing = await env.DB.prepare('SELECT id FROM rounds WHERE cycle_id = ? AND round_no = ? LIMIT 1').bind(cycle.id, roundNo).first();
  const now = nowSec();
  if (existing) {
    await env.DB.prepare('UPDATE rounds SET direction = ?, start_at = ?, duration_seconds = ?, profit_pct = ?, fee_pct = ?, result = ?, updated_at = ? WHERE id = ?').bind(direction, startAt, durationSeconds, profitPct, feePct, result, now, existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), cycle.id, roundNo, direction, startAt, durationSeconds, profitPct, feePct, result, now, now).run();
  }
  const saved = await env.DB.prepare('SELECT * FROM rounds WHERE cycle_id = ? AND round_no = ? LIMIT 1').bind(cycle.id, roundNo).first();
  return Response.json({ ok: true, round: saved, minBalance: MIN_BALANCES[roundNo] });
});
