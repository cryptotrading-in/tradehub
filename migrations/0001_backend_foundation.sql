-- Tradehub backend foundation migration.
-- Business tables are intentionally added in later, ordered migrations.

CREATE TABLE IF NOT EXISTS _schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
