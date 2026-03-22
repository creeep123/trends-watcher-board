export const runtime = 'edge';

export default function SupabaseMigratePage() {
  const MIGRATION_SQL = `-- 创建 KGR Workbench 表
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
  user_id TEXT,
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS twb_kgr_workbench_keyword_idx ON twb_kgr_workbench(keyword);
CREATE INDEX IF NOT EXISTS twb_kgr_workbench_user_idx ON twb_kgr_workbench(user_id);
CREATE INDEX IF NOT EXISTS twb_kgr_workbench_added_at_idx ON twb_kgr_workbench(added_at DESC);

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

-- 启用 RLS
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
  FOR DELETE USING (true);`;

  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Supabase Migration</h1>

      <div style={{ marginBottom: '30px', padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>步骤：</h2>
        <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>打开 <a href="https://supabase.com/dashboard/project/roruthlntpjtfardmte/sql/new" target="_blank" style={{ color: '#0066cc' }}>Supabase SQL Editor</a></li>
          <li>复制下面的 SQL 代码</li>
          <li>粘贴到 SQL Editor 并点击 Run</li>
          <li>执行完成后访问 <a href="/api/supabase-migrate" target="_blank" style={{ color: '#0066cc' }}>验证表是否创建成功</a></li>
        </ol>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>SQL 迁移代码（点击复制）：</label>
        <textarea
          readOnly
          value={MIGRATION_SQL}
          onClick={(e) => (e.currentTarget.select(), navigator.clipboard.writeText(MIGRATION_SQL))}
          style={{
            width: '100%',
            height: '400px',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '15px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            cursor: 'pointer',
            background: '#f9f9f9'
          }}
        />
        <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>点击文本框自动复制</p>
      </div>

      <div style={{ padding: '15px', background: '#e3f2fd', borderRadius: '8px', border: '1px solid #2196f3' }}>
        <strong style={{ color: '#1976d2' }}>注意：</strong> 执行完迁移后，这个页面可以删除或保留
      </div>
    </div>
  );
}
