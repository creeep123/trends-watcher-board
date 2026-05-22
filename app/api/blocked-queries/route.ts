import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ITEM_TYPE = "blocked_queries";

/** GET /api/blocked-queries — 返回所有被拉黑的 query */
export async function GET() {
  const { data, error } = await supabase
    .from("twb_read_items")
    .select("item_key")
    .eq("item_type", ITEM_TYPE);

  if (error) {
    console.error("Blocked queries fetch error:", error);
    return NextResponse.json({ blocked: [] }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { blocked: (data || []).map(r => r.item_key) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** POST /api/blocked-queries — 拉黑一个 query */
export async function POST(request: NextRequest) {
  const { keyword } = await request.json();
  if (!keyword) {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await supabase
    .from("twb_read_items")
    .upsert({ item_type: ITEM_TYPE, item_key: keyword, read_at: new Date().toISOString() }, { onConflict: "item_type,item_key" });

  if (error) {
    console.error("Blocked queries upsert error:", error);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/blocked-queries — 取消拉黑 */
export async function DELETE(request: NextRequest) {
  const { keyword } = await request.json();
  if (!keyword) {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { error } = await supabase
    .from("twb_read_items")
    .delete()
    .eq("item_type", ITEM_TYPE)
    .eq("item_key", keyword);

  if (error) {
    console.error("Blocked queries delete error:", error);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
