import { NextRequest, NextResponse } from "next/server";
import { getKGRWorkbench, upsertKGRItem, deleteKGRItem } from "@/lib/supabase";
import type { KGRItem } from "@/lib/types";

/**
 * GET /api/kgr-workbench
 * Fetch all KGR workbench items from Supabase
 */
export async function GET() {
  try {
    const items = await getKGRWorkbench();

    // Transform Supabase format to KGRItem format
    const kgrItems: KGRItem[] = items.map(item => ({
      keyword: item.keyword,
      allintitleCount: item.allintitle_count,
      allintitleTimestamp: item.allintitle_timestamp,
      searchVolume: item.search_volume,
      searchVolumeTimestamp: item.search_volume_timestamp,
      kd: item.kd,
      kdTimestamp: item.kd_timestamp,
      kgr: item.kgr,
      kgrStatus: item.kgr_status as 'good' | 'medium' | 'bad' | null,
      ekgr: item.ekgr,
      ekgrStatus: item.ekgr_status as 'good' | 'medium' | 'bad' | null,
      kdroi: item.kdroi,
      kdroiStatus: item.kdroi_status as 'good' | 'medium' | 'bad' | null,
      notes: item.notes ?? undefined,
      addedAt: item.added_at,
    }));

    return NextResponse.json({ items: kgrItems });
  } catch (error: any) {
    console.error("[KGR Workbench API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch KGR workbench" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kgr-workbench
 * Upsert a KGR workbench item to Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { item } = body as { item: KGRItem };

    if (!item?.keyword) {
      return NextResponse.json(
        { error: "keyword is required" },
        { status: 400 }
      );
    }

    await upsertKGRItem({
      keyword: item.keyword,
      allintitle_count: item.allintitleCount,
      allintitle_timestamp: item.allintitleTimestamp,
      search_volume: item.searchVolume,
      search_volume_timestamp: item.searchVolumeTimestamp,
      kd: item.kd,
      kd_timestamp: item.kdTimestamp,
      kgr: item.kgr,
      kgr_status: item.kgrStatus,
      ekgr: item.ekgr,
      ekgr_status: item.ekgrStatus,
      kdroi: item.kdroi,
      kdroi_status: item.kdroiStatus,
      notes: item.notes || null,
      added_at: item.addedAt,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[KGR Workbench API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upsert KGR item" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kgr-workbench
 * Delete a KGR workbench item from Supabase
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get("keyword");

    if (!keyword) {
      return NextResponse.json(
        { error: "keyword is required" },
        { status: 400 }
      );
    }

    await deleteKGRItem(keyword);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[KGR Workbench API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete KGR item" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/kgr-workbench/sync
 * Sync multiple KGR items to Supabase
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body as { items: KGRItem[] };

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "items array is required" },
        { status: 400 }
      );
    }

    // Transform and sync each item
    for (const item of items) {
      await upsertKGRItem({
        keyword: item.keyword,
        allintitle_count: item.allintitleCount,
        allintitle_timestamp: item.allintitleTimestamp,
        search_volume: item.searchVolume,
        search_volume_timestamp: item.searchVolumeTimestamp,
        kd: item.kd,
        kd_timestamp: item.kdTimestamp,
        kgr: item.kgr,
        kgr_status: item.kgrStatus,
        ekgr: item.ekgr,
        ekgr_status: item.ekgrStatus,
        kdroi: item.kdroi,
        kdroi_status: item.kdroiStatus,
        notes: item.notes || null,
        added_at: item.addedAt,
      });
    }

    return NextResponse.json({ success: true, synced: items.length });
  } catch (error: any) {
    console.error("[KGR Workbench API] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync KGR items" },
      { status: 500 }
    );
  }
}
