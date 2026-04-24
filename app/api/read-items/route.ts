import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/** 9AM Beijing time = 1AM UTC */
function getCycleStart(): string {
  const now = new Date();
  const utcH = now.getUTCHours();
  // If UTC hour < 1, the 9AM BJT boundary hasn't been crossed yet today
  const day = utcH < 1 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}T01:00:00Z`;
}

export async function GET(request: NextRequest) {
  const itemsParam = request.nextUrl.searchParams.get("items");
  if (!itemsParam) {
    return NextResponse.json({ read: [] });
  }

  // Parse "trending:ai,hn:12345,reddit:https://..." into array of {item_type, item_key}
  // Split on first colon only — item_key (URLs) may contain colons
  const pairs = itemsParam.split(",").map(pair => {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) return null;
    return {
      item_type: pair.slice(0, colonIdx),
      item_key: pair.slice(colonIdx + 1),
    };
  }).filter(Boolean) as { item_type: string; item_key: string }[];

  if (pairs.length === 0) {
    return NextResponse.json({ read: [] });
  }

  // Build OR filter: match any (item_type, item_key) pair within current daily cycle
  const cycleStart = getCycleStart();
  const conditions = pairs.map(p =>
    `item_type.eq.${p.item_type},item_key.eq.${encodeURIComponent(p.item_key)}`
  ).join(",");

  const { data, error } = await supabase
    .from("twb_read_items")
    .select("item_type, item_key")
    .or(conditions)
    .gte("read_at", cycleStart);

  if (error) {
    console.error("Read items query error:", error);
    return NextResponse.json({ read: [] });
  }

  const readSet = new Set(
    (data || []).map(r => `${r.item_type}:${r.item_key}`)
  );

  return NextResponse.json({ read: Array.from(readSet) });
}

export async function POST(request: NextRequest) {
  const { item_type, item_key } = await request.json();

  if (!item_type || !item_key) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { error } = await supabase
    .from("twb_read_items")
    .upsert({ item_type, item_key, read_at: new Date().toISOString() }, { onConflict: "item_type,item_key" });

  if (error) {
    console.error("Read items upsert error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
