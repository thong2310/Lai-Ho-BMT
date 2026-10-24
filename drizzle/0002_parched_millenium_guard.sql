-- Compatibility marker for the initial development repair.
-- Migration 0001 already creates rides and all domain indexes without TEXT defaults.
-- Keep this journal position for existing databases, but do not create them twice
-- when the full committed migration chain runs on a fresh database.
SELECT 1;
