-- 词根表
CREATE TABLE IF NOT EXISTS twb_root_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  sheets_row_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword)
);

-- 查看记录表
CREATE TABLE IF NOT EXISTS twb_viewing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID REFERENCES twb_root_keywords(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- 索引
CREATE INDEX IF NOT EXISTS twb_root_keywords_keyword_idx ON twb_root_keywords(keyword);
CREATE INDEX IF NOT EXISTS twb_viewing_records_keyword_idx ON twb_viewing_records(keyword_id, viewed_at DESC);
