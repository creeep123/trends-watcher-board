# Achievement Panel Design

## Problem

The homepage has no way to visualize daily reading progress. Users browse trends, Reddit, HN, tech news every day but get no sense of accomplishment. They need a daily goal system with visual progress feedback — like GitHub's contribution graph meets a fitness tracker.

## Solution

A compact summary bar on the homepage (always visible) that expands into a detail panel with:
1. Today's progress — total + 2 category sub-goals with stacked progress bars
2. A GitHub-style heatmap showing daily activity over the past 12 weeks
3. Cumulative stats (total reads, streak, best day)

All visuals follow the Linear design system defined in `DESIGN.md`.

## Design System Reference (Linear)

All components use the project's established Linear tokens:
- Backgrounds: `--bg-primary` (#08090a), `--bg-card` (rgba 0.02), `--bg-elevated` (rgba 0.05)
- Borders: `--border` (rgba 0.08), `--border-subtle` (rgba 0.05)
- Text: `--text-primary` (#f7f8f8), `--text-secondary` (#d0d6e0), `--text-tertiary` (#8a8f98), `--text-quaternary` (#62666d)
- Accent: `--accent-blue` (#5e6ad2), `--accent-blue-hover` (#7170ff), `--accent-blue-muted` (#7a7fad)
- Success: `--accent-green-bright` (#10b981)
- Radius: `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-full` (9999px)
- Font: Inter Variable, weight 400 (reading) / 510 (emphasis) / 590 (strong)
- Shadows: background luminance stepping, no drop shadows

## Component 1: Summary Bar (always visible on homepage)

A single-line pill in the homepage header area.

**Layout**: `[progress-ring 24px] 今日 28/40  [tap to expand ▸]`

- Progress ring: 24px SVG circle, stroke uses `--accent-blue`, track uses `--border-subtle`
- Text: 13px Inter Variable weight 510, `--text-tertiary` for label, `--text-secondary` for numbers
- When goal reached: ring stroke changes to `--accent-green-bright`, text gets a subtle green tint
- Container: `--bg-card` background, `1px solid --border`, `--radius-full`
- Tap/click opens the detail panel

## Component 2: Detail Panel (modal/overlay)

Opens as a centered modal with `--bg-secondary` (#0f1011) background, `--shadow-dialog` shadow, `--radius-xl` (12px) corners. Max-width 480px.

### Section A — Today's Progress

**Total ring** (centered, 80px):
- Large SVG ring, `--accent-blue` stroke, percentage in center (24px weight 590)
- When >= 100%: `--accent-green-bright` stroke + subtle glow (box-shadow with green)

**Category stacked bars** (2 rows):

Categories:
- **新词** (New Words): trending + queries + github → default goal 20
- **资讯** (Info): reddit + hn + technews → default goal 20

Each bar structure:
```
新词  14/20
[████████████ trending(6) | ███ queries(3) | ████ github(5) | ░░░░░░]
```

**Stacked bar visual spec (Linear style)**:
- Track: 8px height, `--bg-elevated` background, `--radius-full` (pill shape)
- Segments are contiguous (no gaps) within the track, each with its own color using luminance steps of the accent blue to maintain cohesion:
  - Segment 1: `--accent-blue` (#5e6ad2) — most prominent
  - Segment 2: `--accent-blue-hover` (#7170ff) — slightly lighter
  - Segment 3: `--accent-blue-muted` (#7a7fad) — most muted
- First segment gets left border-radius, last gets right border-radius (CSS `border-radius` on outer edges only)
- Remaining unfilled portion shows the track background
- On hover over a segment: show tooltip with section name + count (e.g. "trending: 6")
- Text above bar: category name (13px weight 510, `--text-tertiary`) on left, count (13px weight 510, `--text-secondary`) on right
- When category reaches goal: entire bar transitions to `--accent-green-bright`

### Section B — Heatmap

A GitHub-style contribution grid for the past 12 weeks (~84 days).

**Grid spec**:
- 12 columns (weeks) × 7 rows (days of week)
- Cell size: 11px × 11px, 2px gap
- Day labels on left: 周一 through 周日 (10px weight 510, `--text-quaternary`), only show 周一 and 周四 to reduce clutter
- Month labels on top (10px weight 510, `--text-quaternary`)

**Color scale** (5 levels, achromatic → accent):
- Level 0 (no reads): `--bg-elevated` (rgba 255,255,255,0.05) with `1px solid --border-subtle`
- Level 1 (1-25% of goal): `rgba(94, 106, 210, 0.15)`
- Level 2 (26-50% of goal): `rgba(94, 106, 210, 0.35)`
- Level 3 (51-99% of goal): `rgba(94, 106, 210, 0.6)`
- Level 4 (>= 100% goal met): `--accent-blue` (#5e6ad2)

- Hover tooltip: `4月15日 · 32条` (12px weight 400, `--text-primary`) on a `--bg-secondary` surface with `--shadow-elevated`

### Section C — Cumulative Stats

Three metrics in a horizontal row:
- 总已读 (Total): all-time read count
- 连续天数 (Streak): consecutive days with >=1 read
- 最高单日 (Best Day): highest single-day count

Each metric:
- Number: 24px weight 590, `--text-primary`
- Label: 11px weight 510, `--text-quaternary`
- Subtle vertical dividers between metrics (`1px solid --border-subtle`)

## Component 3: Goal Settings

Users can customize their daily goals. Settings are stored per-user in Supabase.

**Interaction**: In the detail panel, each goal number is tappable → turns into an inline number input → save on blur or Enter.

**Default goals**:
- Total: 40
- 新词 (trending + queries + github): 20
- 资讯 (reddit + hn + technews): 20

## Data Layer

### New Table: `twb_daily_goals`

```sql
CREATE TABLE twb_daily_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_goal int NOT NULL DEFAULT 40,
  new_words_goal int NOT NULL DEFAULT 20,
  info_goal int NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Single row, upsert
INSERT INTO twb_daily_goals (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
```

### Read Stats API: `/api/read-stats`

**GET** — Returns all data the panel needs in one request.

Query params: none (computes everything server-side from `twb_read_items`).

Response:
```json
{
  "today": {
    "total": 28,
    "new_words": { "total": 14, "trending": 6, "queries": 3, "github": 5 },
    "info": { "total": 14, "reddit": 8, "hn": 3, "technews": 3 }
  },
  "heatmap": [
    { "date": "2026-04-23", "count": 28 },
    { "date": "2026-04-22", "count": 35 },
    ...
  ],
  "cumulative": {
    "total_reads": 1247,
    "streak": 12,
    "best_day": 63
  },
  "goals": {
    "total": 40,
    "new_words": 20,
    "info": 20
  }
}
```

**PUT** — Update daily goals.

Body: `{ total_goal?: int, new_words_goal?: int, info_goal?: int }`

Response: `{ ok: true }`

### Data Computation (all from `twb_read_items`)

- **Today counts**: `SELECT item_type, COUNT(*) FROM twb_read_items WHERE read_at >= today_start GROUP BY item_type`
- **Heatmap**: `SELECT DATE(read_at) as date, COUNT(*) as count FROM twb_read_items WHERE read_at >= now() - interval '84 days' GROUP BY date ORDER BY date`
- **Cumulative total**: `SELECT COUNT(*) FROM twb_read_items`
- **Streak**: Starting from today, count consecutive days with >=1 read going backwards
- **Best day**: `SELECT DATE(read_at), COUNT(*) FROM twb_read_items GROUP BY 1 ORDER BY 2 DESC LIMIT 1`

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/xxx_create_daily_goals.sql` | New table |
| `app/api/read-stats/route.ts` | New API (GET stats + PUT goals) |
| `app/page.tsx` | Add summary bar + detail panel component |
