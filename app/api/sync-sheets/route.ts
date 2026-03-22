import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1CHUGqL06X5ZNhYDDHLQdRahgeQztJNn1UMqtM2JrC8g";

// Parse service account key from env var
function getServiceAccountAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  }

  let keyData: any;
  try {
    keyData = typeof key === "string" ? JSON.parse(key) : key;
  } catch (e) {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY format");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: keyData,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return auth;
}

// OR use simple CSV export for public sheets
async function fetchPublicSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter(l => l.trim());

  // Parse CSV (simple implementation)
  const keywords: string[] = [];
  for (let i = 1; i < lines.length; i++) {  // Skip header
    const cols = lines[i].split(",");
    if (cols[0] && cols[0].trim()) {
      keywords.push(cols[0].trim().replace(/^"|"$/g, ""));  // Remove quotes
    }
  }

  return keywords;
}

// Fetch using Google Sheets API (Service Account)
async function fetchWithAPI() {
  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A:A",  // First column
  });

  const rows = result.data.values || [];
  const keywords: string[] = [];

  for (let i = 1; i < rows.length; i++) {  // Skip header
    const keyword = rows[i][0];
    if (keyword && keyword.trim()) {
      keywords.push(keyword.trim());
    }
  }

  return keywords;
}

export async function POST(request: NextRequest) {
  try {
    const { method = "api" } = await request.json().catch(() => ({}));

    let keywords: string[];

    if (method === "public") {
      keywords = await fetchPublicSheet();
    } else {
      keywords = await fetchWithAPI();
    }

    // Sync to Supabase
    for (const keyword of keywords) {
      await supabase
        .from("twb_root_keywords")
        .upsert({ keyword }, { onConflict: "keyword" });
    }

    return NextResponse.json({
      success: true,
      synced: keywords.length,
      keywords: keywords.slice(0, 10),  // Return first 10 for preview
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Manual sync trigger (GET)
export async function GET(request: NextRequest) {
  try {
    // Try public method first, fallback to API
    let keywords: string[];

    try {
      keywords = await fetchPublicSheet();
    } catch (e) {
      console.log("Public fetch failed, trying API...");
      keywords = await fetchWithAPI();
    }

    // Sync to Supabase
    for (const keyword of keywords) {
      await supabase
        .from("twb_root_keywords")
        .upsert({ keyword }, { onConflict: "keyword" });
    }

    return NextResponse.json({
      success: true,
      synced: keywords.length,
      message: `Synced ${keywords.length} keywords`,
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
