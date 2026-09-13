-- Tradehub controlled round-trading engine.
-- Five rounds per 24-hour cycle. Minimum balances are system rules, not admin data.

CREATE TABLE IF NOT EXISTS round_cycles (
  id TEXT PRIMARY KEY,
  cycle_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 5),
  direction TEXT NOT NULL CHECK (direction IN ('UP','DOWN')),
  start_at INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  profit_pct REAL NOT NULL CHECK (profit_pct >= 0),
  fee_pct REAL NOT NULL CHECK (fee_pct >= 0),
  result TEXT NOT NULL CHECK (result IN ('WIN','LOSS')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(cycle_id, round_no),
  FOREIGN KEY (cycle_id) REFERENCES round_cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rounds_cycle_start ON rounds(cycle_id, start_at);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id TEXT PRIMARY KEY,
  balance REAL NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS round_trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  investment REAL NOT NULL CHECK (investment > 0),
  direction TEXT NOT NULL CHECK (direction IN ('UP','DOWN')),
  entry_price REAL NOT NULL,
  exit_price REAL,
  gross_pnl REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  net_pnl REAL NOT NULL DEFAULT 0,
  result TEXT NOT NULL CHECK (result IN ('WIN','LOSS')),
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED','SETTLED')),
  started_at INTEGER NOT NULL,
  settled_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_round_trades_user_created ON round_trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_trades_round ON round_trades(round_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trade_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('ROUND_PROFIT','ROUND_SETTLEMENT')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Pending','Completed','Failed')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trade_id) REFERENCES round_trades(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);

INSERT OR IGNORE INTO round_cycles (id, cycle_key, created_at, status)
VALUES ('bootstrap-cycle', strftime('%Y-%m-%d','now'), unixepoch(), 'scheduled');
