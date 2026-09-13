-- Isolated Tradehub admin/staff account storage.
-- The API also creates this table defensively so deployment does not require a manual migration step.
CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  recovery_pin_hash TEXT,
  recovery_pin_salt TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('master', 'staff')),
  permissions_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_role ON admin_accounts(role);
