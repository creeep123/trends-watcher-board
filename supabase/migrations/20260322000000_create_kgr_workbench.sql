-- KGR Workbench 表
CREATE TABLE IF NOT EXISTS twb_kgr_workbench (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  allintitle_count INTEGER,
  allintitle_timestamp TIMESTAMPTZ,
  search_volume INTEGER,
  search_volume_timestamp TIMESTAMPTZ,
  kd NUMERIC(5,2),
  kd_timestamp TIMESTAMPTZ,
  kgr NUMERIC(10,4),
  kgr_status TEXT,
  ekgr NUMERIC(10,4),
  ekgr_status TEXT,
  kdroi NUMERIC(10,2),
  kdroi_status TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT,  -- 可选：用于多用户隔离
  device_id TEXT  -- 可选：用于设备识别
);

-- 索引
CREATE INDEX IF NOT EXISTS twb_kgr_workbench_keyword_idx ON twb_kgr_workbench(keyword);
CREATE INDEX IF NOT EXISTS twb_kgr_workbench_user_idx ON twb_kgr_workbench(user_id);
CREATE INDEX IF NOT EXISTS twb_kgr_workbench_added_at_idx ON twb_kgr_workbench(added_at DESC);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tw_kgr_workbench_updated_at ON twb_kgr_workbench;
CREATE TRIGGER update_tw_kgr_workbench_updated_at
  BEFORE UPDATE ON twb_kgr_workbench
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
