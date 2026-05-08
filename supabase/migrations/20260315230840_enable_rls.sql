-- 给 anon 用户添加访问权限
ALTER TABLE twb_root_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON twb_root_keywords;
CREATE POLICY "Allow public read access" ON twb_root_keywords
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON twb_root_keywords;
CREATE POLICY "Allow public insert access" ON twb_root_keywords
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access" ON twb_root_keywords;
CREATE POLICY "Allow public update access" ON twb_root_keywords
  FOR UPDATE USING (true);

-- viewing_records 同样处理
ALTER TABLE twb_viewing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON twb_viewing_records;
CREATE POLICY "Allow public read access" ON twb_viewing_records
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON twb_viewing_records;
CREATE POLICY "Allow public insert access" ON twb_viewing_records
  FOR INSERT WITH CHECK (true);
