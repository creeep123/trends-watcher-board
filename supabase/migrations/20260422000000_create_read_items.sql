CREATE TABLE IF NOT EXISTS twb_read_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL,
  item_key TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_read_items_unique ON twb_read_items (item_type, item_key);

ALTER TABLE twb_read_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select" ON twb_read_items FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON twb_read_items FOR INSERT WITH CHECK (true);
