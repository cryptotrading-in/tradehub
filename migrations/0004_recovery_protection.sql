-- Recovery PIN protection for password resets.
ALTER TABLE users ADD COLUMN recovery_pin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN recovery_pin_locked_until INTEGER;
