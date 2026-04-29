import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// --- Helpers ---

const NEW_WORD_TYPES = ["trending", "queries", "github"];
const INFO_TYPES = ["reddit", "hn", "technews", "ph", "hf", "ih"];

function todayStartISO(): string {
  return new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toDateKey(iso: string): string {
  // Extract YYYY-MM-DD from an ISO string
  return iso.slice(0, 10);
}

// --- GET ---

export async function GET() {
  try {
    const todayStart = todayStartISO();
    const heatmapStart = daysAgoISO(84);

    // 1. Today's reads
    const { data: todayItems, error: todayErr } = await supabase
      .from("twb_read_items")
      .select("item_type")
      .gte("read_at", todayStart);

    if (todayErr) {
      console.error("read-stats today query error:", todayErr);
      return NextResponse.json({ error: "Failed to fetch today stats" }, { status: 500 });
    }

    // Group today's item types
    const typeCounts: Record<string, number> = {};
    for (const item of todayItems || []) {
      typeCounts[item.item_type] = (typeCounts[item.item_type] || 0) + 1;
    }

    const trending = typeCounts["trending"] || 0;
    const queries = typeCounts["queries"] || 0;
    const github = typeCounts["github"] || 0;
    const reddit = typeCounts["reddit"] || 0;
    const hn = typeCounts["hn"] || 0;
    const technews = typeCounts["technews"] || 0;
    const ph = typeCounts["ph"] || 0;
    const hf = typeCounts["hf"] || 0;
    const ih = typeCounts["ih"] || 0;

    const newWordsTotal = trending + queries + github;
    const infoTotal = reddit + hn + technews + ph + hf + ih;
    const todayTotal = newWordsTotal + infoTotal;

    // 2. Heatmap (last 84 days) + best day
    const { data: heatmapItems, error: heatmapErr } = await supabase
      .from("twb_read_items")
      .select("item_type, read_at")
      .gte("read_at", heatmapStart);

    if (heatmapErr) {
      console.error("read-stats heatmap query error:", heatmapErr);
      return NextResponse.json({ error: "Failed to fetch heatmap data" }, { status: 500 });
    }

    // Group by (date, item_type)
    const dateTypeCounts: Record<string, Record<string, number>> = {};
    for (const item of heatmapItems || []) {
      const key = toDateKey(item.read_at);
      if (!dateTypeCounts[key]) dateTypeCounts[key] = {};
      dateTypeCounts[key][item.item_type] = (dateTypeCounts[key][item.item_type] || 0) + 1;
    }

    // Build heatmap array for last 84 days
    const heatmap: { date: string; count: number; by_type: Record<string, number> }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d.toISOString());
      const byType = dateTypeCounts[key] || {};
      const count = Object.values(byType).reduce((sum, n) => sum + n, 0);
      heatmap.push({ date: key, count, by_type: byType });
    }

    // Best day
    const bestDay = heatmap.length > 0
      ? Math.max(...heatmap.map(h => h.count), 0)
      : 0;

    // 3. Cumulative total
    const { count: totalReads, error: countErr } = await supabase
      .from("twb_read_items")
      .select("*", { count: "exact", head: true });

    if (countErr) {
      console.error("read-stats total count error:", countErr);
      return NextResponse.json({ error: "Failed to fetch total reads" }, { status: 500 });
    }

    // 4. Streak: count consecutive days with reads going backwards from today
    let streak = 0;
    for (let i = 0; i < heatmap.length; i++) {
      if (heatmap[i].count > 0) {
        streak++;
      } else {
        // Only break if this is a past day (today can be 0 and streak still counts from yesterday)
        if (i > 0) break;
      }
    }

    // 5. Goals
    const { data: goalsRow, error: goalsErr } = await supabase
      .from("twb_daily_goals")
      .select("*")
      .limit(1)
      .single();

    if (goalsErr && goalsErr.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is OK (use defaults)
      console.error("read-stats goals query error:", goalsErr);
    }

    const goals = {
      total: goalsRow?.total_goal ?? 40,
      new_words: goalsRow?.new_words_goal ?? 20,
      info: goalsRow?.info_goal ?? 20,
    };

    return NextResponse.json({
      today: {
        total: todayTotal,
        new_words: { total: newWordsTotal, trending, queries, github },
        info: { total: infoTotal, reddit, hn, technews, ph, hf, ih },
      },
      heatmap,
      cumulative: {
        total_reads: totalReads ?? 0,
        streak,
        best_day: bestDay,
      },
      goals,
    });
  } catch (err) {
    console.error("read-stats GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// --- PUT ---

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { total_goal, new_words_goal, info_goal } = body;

    if (total_goal === undefined && new_words_goal === undefined && info_goal === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updates: Record<string, number> = {};
    if (total_goal !== undefined) updates.total_goal = total_goal;
    if (new_words_goal !== undefined) updates.new_words_goal = new_words_goal;
    if (info_goal !== undefined) updates.info_goal = info_goal;

    const { error } = await supabase
      .from("twb_daily_goals")
      .update(updates)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    if (error) {
      console.error("read-stats PUT error:", error);
      return NextResponse.json({ error: "Failed to update goals" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("read-stats PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
