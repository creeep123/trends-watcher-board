import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MIGRATION_SQL = `
-- 创建 KGR Workbench 表
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
  FOR DELETE USING (true);
`;

export async function POST(request: NextRequest) {
  try {
    // 获取 service role key 从环境变量或 header
    const serviceRoleKey = request.headers.get('x-service-role-key')
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcnV0aGxudG5wanRmYXJkbXRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU0OTY3OCwiZXhwIjoyMDg4MTI1Njc4fQ.g2N4GYhKlbjDtTxkVwuNO2Q1rPWD0ui6GnCmrS66LRw';

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    // 通过 Supabase REST API 执行 SQL
    const response = await fetch(`${projectUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to execute migration", details: responseText, status: response.status },
        { status: 500 }
      );
    }

    // 检查表是否创建成功
    const checkTable = await fetch(`${projectUrl}/rest/v1/twb_kgr_workbench?select=id&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    const tableExists = checkTable.ok;

    return NextResponse.json({
      success: true,
      message: tableExists ? "KGR Workbench table created successfully" : "Migration executed",
      tableExists,
      details: responseText
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Migration failed", stack: error.stack?.split('\n')[0] },
      { status: 500 }
    );
  }
}

// GET 用于检查表是否存在
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const response = await fetch(`${supabaseUrl}/rest/v1/twb_kgr_workbench?select=id&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });

    const data = await response.json();

    return NextResponse.json({
      exists: response.ok,
      error: !response.ok ? data : null,
      hasData: data && data.length > 0
    });
  } catch (error: any) {
    return NextResponse.json({
      exists: false,
      error: error.message
    });
  }
}
