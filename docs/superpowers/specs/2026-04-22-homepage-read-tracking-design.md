# Homepage Read Tracking Design

## Problem

The homepage has 6 content sections (Trending, Queries, Reddit, HN, Tech News, GitHub) but no way to track what the user has already read. When revisiting the page, all items look the same — there's no sense of progress or completion. The batch-gt page already has viewing records, but the homepage (the primary browsing surface) has nothing.

## Solution

Add per-item read tracking across all 6 homepage sections using Supabase persistence. Clicked items get marked as read and visually dimmed, giving the user a sense of daily progress.

## Data Layer

### New Table: `twb_read_items`

```sql
CREATE TABLE twb_read_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,        -- trending | queries | reddit | hn | technews | github
  item_key text NOT NULL,         -- unique identifier per type (see mapping below)
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_read_items_unique ON twb_read_items (item_type, item_key);
```

### item_key Mapping

| Section | item_type | item_key | Source |
|---------|-----------|----------|--------|
| Trending | `trending` | keyword string | `TrendKeyword.name` |
| Queries | `queries` | query string | `TrendKeyword.name` |
| Reddit | `reddit` | post URL | `RedditPost.url` |
| Hacker News | `hn` | post ID string | `HackerNewsPost.id` |
| Tech News | `technews` | article URL | `TechNewsPost.url` |
| GitHub | `github` | `owner/repo` | `TrendingItem.repo` |

## API Layer

### New Route: `/api/read-items`

**GET** — Batch query read status
- Query: `?items=trending:ai,hn:12345,reddit:https://...`
- Response: `{ read: string[] }` — array of `"type:key"` strings that are already read

**POST** — Mark item as read
- Body: `{ item_type: string, item_key: string }`
- Logic: `INSERT ... ON CONFLICT (item_type, item_key) DO NOTHING`
- Response: `{ ok: true }`

## UI Behavior

### Marking as Read
- Clicking a post/item's title or card body → marks as read AND navigates to the original URL (existing behavior preserved, just adds the read record)
- Optimistic update: immediately dim the item in UI, fire API in background
- Read state stored in React state (useState) for the session

### Visual Treatment for Read Items
- `opacity: 0.4` on the entire card/row
- Text color changes to `--text-quaternary`
- No confetti or celebration (this is a browsing context, not a task-completion context)

### Page Load Flow
1. Load all section data (existing logic, unchanged)
2. Collect all visible `(item_type, item_key)` pairs from loaded data
3. Single GET request to `/api/read-items` with all pairs
4. Store read set in state, apply dimming during render

### What We Don't Do
- No "mark as unread" toggle (keep it simple)
- No "today's read count" filter on homepage (can add later)
- No confetti/celebration animations (wrong context)
- No changes to data fetching logic (only display layer changes)

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/xxx_create_read_items.sql` | New table + unique index |
| `app/api/read-items/route.ts` | New API route (GET + POST) |
| `app/page.tsx` | Add read state, batch query on load, mark on click, dim styling per section |
