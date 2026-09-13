-- Tradehub now permanently uses only two rounds per cycle.
-- Remove round 3, 4 and 5 configuration rows from existing cycles.
DELETE FROM rounds WHERE round_no IN (3, 4, 5);
