-- 给 KGR Workbench 表添加访问权限
ALTER TABLE twb_kgr_workbench ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON twb_kgr_workbench;
CREATE POLICY "Allow public read access" ON twb_kgr_workbench
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert access" ON twb_kgr_workbench;
CREATE POLICY "Allow public insert access" ON twb_kgr_workbench
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access" ON twb_kgr_workbench;
CREATE POLICY "Allow public update access" ON twb_kgr_workbench
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete access" ON twb_kgr_workbench;
CREATE POLICY "Allow public delete access" ON twb_kgr_workbench
  FOR DELETE USING (true);
