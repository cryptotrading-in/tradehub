-- Seed the first five-round cycle so the client has a complete Rounds workspace immediately.
-- Admin may replace these values for the cycle; round count remains fixed at five.

INSERT OR IGNORE INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
SELECT 'bootstrap-round-1', id, 1, 'UP', unixepoch() + 60, 300, 5, 0.5, 'WIN', unixepoch(), unixepoch()
FROM round_cycles WHERE cycle_key = strftime('%Y-%m-%d','now') LIMIT 1;

INSERT OR IGNORE INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
SELECT 'bootstrap-round-2', id, 2, 'DOWN', unixepoch() + 3660, 300, 5, 0.5, 'WIN', unixepoch(), unixepoch()
FROM round_cycles WHERE cycle_key = strftime('%Y-%m-%d','now') LIMIT 1;

INSERT OR IGNORE INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
SELECT 'bootstrap-round-3', id, 3, 'UP', unixepoch() + 7260, 300, 5, 0.5, 'WIN', unixepoch(), unixepoch()
FROM round_cycles WHERE cycle_key = strftime('%Y-%m-%d','now') LIMIT 1;

INSERT OR IGNORE INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
SELECT 'bootstrap-round-4', id, 4, 'DOWN', unixepoch() + 10860, 300, 5, 0.5, 'LOSS', unixepoch(), unixepoch()
FROM round_cycles WHERE cycle_key = strftime('%Y-%m-%d','now') LIMIT 1;

INSERT OR IGNORE INTO rounds (id, cycle_id, round_no, direction, start_at, duration_seconds, profit_pct, fee_pct, result, created_at, updated_at)
SELECT 'bootstrap-round-5', id, 5, 'UP', unixepoch() + 14460, 300, 5, 0.5, 'WIN', unixepoch(), unixepoch()
FROM round_cycles WHERE cycle_key = strftime('%Y-%m-%d','now') LIMIT 1;
