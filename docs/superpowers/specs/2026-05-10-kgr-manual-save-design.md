# KGR Manual Save Design

## Problem

Two bugs in the KGR workbench:
1. **Delete doesn't persist** — items reappear on page reload because delete only updates React state + localStorage, but doesn't call the Supabase DELETE API.
2. **Status changes don't save** — the PUT sync endpoint is missing the `status` field, so status only lives in localStorage and gets overwritten by Supabase defaults on reload.

Additionally, the current auto-sync (`useEffect([kgrItems])`) fires a full PUT on every state change, generating redundant network requests during rapid operations.

## Solution: Manual Save with Immediate Delete

### Data Flow

```
User edits status/values → React state + localStorage (immediate)
                          ↓ mark dirty flag
                   Click "Save" → PUT /api/kgr-workbench (full upsert with status)

User deletes item → React state + localStorage (immediate)
                  + DELETE /api/kgr-workbench?keyword=xxx (immediate Supabase delete)
```

### Dirty State Tracking

- New `kgrDirty` boolean state, default `false`
- Set `true` on: `handleUpdateKGR`, `handleBatchImport`, manual keyword add
- Set `false` on: successful save to Supabase
- Not affected by: delete operations (those sync immediately)

### Save Button UI

- **Location**: KGR expanded panel header row, right side, next to existing action buttons
- **States**:
  - Clean: muted gray button "保存"
  - Dirty: blue button with small dot indicator "保存 ●"
  - Saving: disabled + spinner "保存中..."
  - Saved: green checkmark "已保存 ✓" (reverts to clean after 1.5s)
- **Behavior**: clickable at all times, but only triggers API call when dirty

### Bug Fixes (included)

1. PUT endpoint (`app/api/kgr-workbench/route.ts`): add `status` field to upsert params
2. Delete: keep existing DELETE API call (immediate Supabase sync)
3. Remove `useEffect([kgrItems])` auto-sync to Supabase
4. Keep localStorage read/write on every change (no change)

### What Stays The Same

- Page load: Supabase first → localStorage fallback → merge
- CSV export, filtering, sorting logic
- localStorage key (`kgr_workbench_v3`)
- KGR collapsed view status counts
- Status dropdown in table rows

### Files to Change

| File | Change |
|------|--------|
| `app/page.tsx` | Add `kgrDirty` state, save button UI, remove auto-sync useEffect, add `handleSaveKGR` function |
| `app/api/kgr-workbench/route.ts` | Add `status` to PUT upsert params |
| `lib/supabase.ts` | Ensure `upsertKGRItem` accepts `status` param |

### Acceptance Criteria

1. Changing a KGR item's status → only saves to localStorage, button shows dirty
2. Clicking "保存" → syncs all items (including status) to Supabase, button shows saved
3. Deleting a KGR item → immediately removed from UI and Supabase, no save needed
4. Reloading page → all saved items (with correct status) load from Supabase
5. Rapid status changes → no network requests until "保存" clicked
