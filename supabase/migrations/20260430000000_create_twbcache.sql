CREATE TABLE IF NOT EXISTS twb_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE twb_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select twb_cache" ON twb_cache FOR SELECT USING (true);
CREATE POLICY "Allow anon insert twb_cache" ON twb_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update twb_cache" ON twb_cache FOR UPDATE USING (true);
