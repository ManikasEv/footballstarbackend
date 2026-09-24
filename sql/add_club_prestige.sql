-- Club prestige: fans + ranking points (run once against Neon / local Postgres)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS fans integer NOT NULL DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS ranking_points integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS clubs_ranking_points_idx ON clubs (ranking_points);
