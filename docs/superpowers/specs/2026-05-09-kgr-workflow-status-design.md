# KGR Decision Workbench — Workflow Status Column

## Overview

Add a user-driven workflow status to each KGR item, enabling tracking of keyword research progress from discovery to publishing decision.

## Data Model

### New field on `KGRItem`

```typescript
status: 'unresearched' | 'researched' | 'to-publish' | 'abandoned'
```

- Default: `'unresearched'` when a new keyword is added
- States are mutually exclusive (linear flow)
- No enforced transition order — user can set any state from any state
- Persisted alongside other KGR fields in Supabase and localStorage

### State definitions

| Status | Color | Meaning |
|--------|-------|---------|
| `unresearched` | Gray `●` | Just added, no research done yet |
| `researched` | Blue `●` | Allintitle/volume/KD data gathered, ready for decision |
| `to-publish` | Green `●` | Approved — candidate for publishing |
| `abandoned` | Red `●` | Rejected — not pursuing this keyword |

## UI Changes

### 1. Collapsed KGR button

Current: `KGR (12)` with blue highlight

New: `KGR (12) ● 3 ● 5`
- Only shows `unresearched` (gray) and `to-publish` (green) counts
- These are the two actionable states — items needing work and items ready to go
- `researched` and `abandoned` are hidden to keep it compact

### 2. Expanded table — new Status column

- Added as the second column (after keyword, before allintitle)
- Each cell shows a colored badge with the status text
- Clicking the badge opens a small dropdown menu to change status
- Dropdown options listed in natural order: 未调研 → 已调研 → 待上站 → 已放弃

### 3. Filter dropdown

- Add status filter options to the existing filter dropdown
- Options: All / 未调研 / 已调研 / 待上站 / 已放弃
- Combinable with existing metric filters (good-kgr, good-ekgr, good-kdroi)

## Backend Changes

### Supabase migration

Add `status` column to `twb_kgr_workbench` table:

```sql
ALTER TABLE twb_kgr_workbench
ADD COLUMN status TEXT NOT NULL DEFAULT 'unresearched'
CHECK (status IN ('unresearched', 'researched', 'to-publish', 'abandoned'));
```

### API route

- `GET /api/kgr-workbench` — returns `status` field
- `PUT /api/kgr-workbench` — accepts and persists `status` field

## Files to Modify

1. `lib/types.ts` — add `status` field to `KGRItem` interface
2. `supabase/migrations/` — new migration for status column
3. `app/page.tsx` — collapsed button, table column, filter, status dropdown
4. `app/api/kgr-workbench/route.ts` — handle status in GET/PUT

## Scope

This is a focused feature addition. No changes to existing KGR/EKGR/KDROI computation logic or other board sections.
