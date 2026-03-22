import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface RootKeyword {
  id: string;
  keyword: string;
  category?: string;
  priority: 'high' | 'medium' | 'low';
  sheets_row_id?: string;
  synced_at?: string;
  created_at: string;
}

export interface ViewingRecord {
  id: string;
  keyword_id: string;
  viewed_at: string;
  notes?: string;
}

export interface RootKeywordWithRecords extends RootKeyword {
  records?: ViewingRecord[];
  latest_view?: string;
}

// API functions
export async function getRootKeywords(): Promise<RootKeyword[]> {
  const { data, error } = await supabase
    .from('twb_root_keywords')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getRootKeywordsWithViewingRecords(): Promise<RootKeywordWithRecords[]> {
  const { data, error } = await supabase
    .from('twb_root_keywords')
    .select(`
      *,
      twb_viewing_records(id, viewed_at, notes)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(k => ({
    ...k,
    records: k.twb_viewing_records || [],
    latest_view: k.twb_viewing_records && k.twb_viewing_records.length > 0
      ? k.twb_viewing_records.sort((a: any, b: any) =>
          new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime())[0]?.viewed_at
      : undefined
  }));
}

export async function addRootKeyword(keyword: string, category?: string, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<RootKeyword> {
  const { data, error } = await supabase
    .from('twb_root_keywords')
    .insert({ keyword, category, priority })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addViewingRecord(keywordId: string, notes?: string): Promise<ViewingRecord> {
  const { data, error } = await supabase
    .from('twb_viewing_records')
    .insert({ keyword_id: keywordId, notes })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function syncKeywordsFromSheets(keywords: string[]): Promise<void> {
  for (const keyword of keywords) {
    await supabase
      .from('twb_root_keywords')
      .upsert({ keyword }, { onConflict: 'keyword' });
  }
}

// --- KGR Workbench ---

export interface KGRWorkbenchItem {
  id: string;
  keyword: string;
  allintitle_count: number | null;
  allintitle_timestamp: string | null;
  search_volume: number | null;
  search_volume_timestamp: string | null;
  kd: number | null;
  kd_timestamp: string | null;
  kgr: number | null;
  kgr_status: string | null;
  ekgr: number | null;
  ekgr_status: string | null;
  kdroi: number | null;
  kdroi_status: string | null;
  added_at: string;
  updated_at: string;
  user_id?: string;
  device_id?: string;
}

/**
 * Get all KGR workbench items from Supabase
 */
export async function getKGRWorkbench(): Promise<KGRWorkbenchItem[]> {
  const { data, error } = await supabase
    .from('twb_kgr_workbench')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Upsert a KGR workbench item to Supabase
 */
export async function upsertKGRItem(item: {
  keyword: string;
  allintitle_count?: number | null;
  allintitle_timestamp?: string | null;
  search_volume?: number | null;
  search_volume_timestamp?: string | null;
  kd?: number | null;
  kd_timestamp?: string | null;
  kgr?: number | null;
  kgr_status?: string | null;
  ekgr?: number | null;
  ekgr_status?: string | null;
  kdroi?: number | null;
  kdroi_status?: string | null;
  added_at?: string;
  user_id?: string;
  device_id?: string;
}): Promise<KGRWorkbenchItem> {
  const { data, error } = await supabase
    .from('twb_kgr_workbench')
    .upsert(item, { onConflict: 'keyword' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a KGR workbench item from Supabase
 */
export async function deleteKGRItem(keyword: string): Promise<void> {
  const { error } = await supabase
    .from('twb_kgr_workbench')
    .delete()
    .eq('keyword', keyword);

  if (error) throw error;
}

/**
 * Sync multiple KGR items to Supabase (batch operation)
 */
export async function syncKGRItems(
  items: Array<{
    keyword: string;
    allintitle_count?: number | null;
    allintitle_timestamp?: string | null;
    search_volume?: number | null;
    search_volume_timestamp?: string | null;
    kd?: number | null;
    kd_timestamp?: string | null;
    kgr?: number | null;
    kgr_status?: string | null;
    ekgr?: number | null;
    ekgr_status?: string | null;
    kdroi?: number | null;
    kdroi_status?: string | null;
    added_at?: string;
    user_id?: string;
    device_id?: string;
  }>
): Promise<void> {
  // Supabase doesn't support batch upsert directly, so we do it sequentially
  // In production, consider using a stored procedure or RPC
  for (const item of items) {
    await upsertKGRItem(item);
  }
}
