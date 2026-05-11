# KGR Manual Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-sync with a manual save button for KGR workbench changes, fixing the delete-reappears and status-not-saved bugs.

**Architecture:** Changes go to localStorage immediately. A "Save" button triggers full upsert to Supabase. Deletes call Supabase DELETE immediately. A dirty flag tracks unsaved changes.

**Tech Stack:** React state, Next.js API routes, Supabase

---

### Task 1: Fix PUT endpoint — add `status` field

**Files:**
- Modify: `app/api/kgr-workbench/route.ts:133-150`

- [ ] **Step 1: Add `status` to the PUT handler's upsert call**

In `app/api/kgr-workbench/route.ts`, change lines 133-150 to include `status`:

```typescript
    // Transform and sync each item
    for (const item of items) {
      await upsertKGRItem({
        keyword: item.keyword,
        status: item.status || 'unresearched',
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
```

- [ ] **Step 2: Commit**

```bash
git add app/api/kgr-workbench/route.ts
git commit -m "fix: add status field to KGR PUT sync endpoint"
```

---

### Task 2: Remove auto-sync useEffect, add dirty state and handleSaveKGR

**Files:**
- Modify: `app/page.tsx` (state declarations around line 265, useEffect around line 511-527)

- [ ] **Step 1: Add `kgrDirty` and `kgrSaving` state**

In `app/page.tsx`, after the existing `kgrItems` state declaration (line ~265):

```typescript
  const [kgrItems, setKgrItems] = useState<KGRItem[]>([]);
  const [kgrDirty, setKgrDirty] = useState(false);
  const [kgrSaving, setKgrSaving] = useState(false);
```

- [ ] **Step 2: Replace the auto-sync useEffect with localStorage-only save**

Replace the entire `useEffect` block at lines 511-527:

```typescript
  // Save KGR workbench to localStorage on change (no auto Supabase sync)
  useEffect(() => {
    saveKGRWorkbench(kgrItems);
  }, [kgrItems]);
```

- [ ] **Step 3: Add `handleSaveKGR` function**

Add after `handleRemoveFromKGR` (after line 765):

```typescript
  const handleSaveKGR = async () => {
    if (!kgrDirty || kgrSaving) return;
    setKgrSaving(true);
    try {
      const res = await fetch('/api/kgr-workbench', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: kgrItems }),
      });
      if (res.ok) {
        setKgrDirty(false);
        setToast({ message: 'KGR 工作台已保存', type: 'success' });
        setTimeout(() => setToast(null), 1500);
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      console.log('[KGR] Save to Supabase failed:', error);
      setToast({ message: '保存失败，请重试', type: 'error' });
      setTimeout(() => setToast(null), 2000);
    } finally {
      setKgrSaving(false);
    }
  };
```

- [ ] **Step 4: Mark dirty in `handleUpdateKGR`**

In `handleUpdateKGR` (line 717), add `setKgrDirty(true)` as the first line inside the function:

```typescript
  const handleUpdateKGR = (keyword: string, updates: Partial<KGRItem>) => {
    setKgrDirty(true);
    setKgrItems(prev => prev.map(item => {
```

- [ ] **Step 5: Mark dirty in `handleAddToKGR`**

In `handleAddToKGR` (line 651), add `setKgrDirty(true)` after the duplicate check, before creating the new item:

```typescript
  const handleAddToKGR = useCallback((keyword: string) => {
    if (kgrItems.some(item => item.keyword === keyword)) {
      setToast({ message: `"${keyword}" 已在工作台中`, type: 'info' });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    setKgrDirty(true);

    const newItem: KGRItem = {
```

- [ ] **Step 6: Mark dirty in `handleBatchImport`**

In `handleBatchImport` (line 768), add `setKgrDirty(true)` at the start:

```typescript
  const handleBatchImport = () => {
    const keywords = batchImportText
      .split('\n')
      .map(k => k.trim())
```

Actually, `handleBatchImport` calls `handleAddToKGR` internally which already sets dirty. Verify by reading the function — if it uses `handleAddToKGR`, no change needed. If it sets state directly, add `setKgrDirty(true)`.

- [ ] **Step 7: Reset dirty after successful Supabase load**

In the initial load useEffect (around line 495), after `setKgrItems(data.items)`:

```typescript
          if (data.items && Array.isArray(data.items)) {
            setKgrItems(data.items);
            setKgrDirty(false);
            saveKGRWorkbench(data.items);
            return;
          }
```

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace auto-sync with manual save, add dirty tracking"
```

---

### Task 3: Add save button to KGR header

**Files:**
- Modify: `app/page.tsx` (KGR expanded header, around lines 1096-1128)

- [ ] **Step 1: Add save button to the button group**

In the KGR expanded header button group (line 1096, inside `<div className="flex gap-2">`), add a save button before the existing action buttons (before the `{kgrItems.length > 0 && (` block):

```tsx
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveKGR}
                    disabled={!kgrDirty || kgrSaving}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: kgrDirty ? "var(--accent-blue)" : "var(--bg-elevated)",
                      color: kgrDirty ? "white" : "var(--text-tertiary)",
                    }}
                    title={kgrDirty ? "有未保存的更改" : "所有更改已保存"}
                  >
                    {kgrSaving ? "保存中..." : kgrDirty ? "保存 ●" : "保存"}
                  </button>
                  {kgrItems.length > 0 && (
```

- [ ] **Step 2: Verify the button appears correctly**

Build the project to check for TypeScript errors:

```bash
pnpm build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add manual save button to KGR workbench header"
```

---

### Task 4: Build verification and push

- [ ] **Step 1: Full build check**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```
