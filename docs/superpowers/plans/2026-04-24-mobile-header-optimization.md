# Mobile Header Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize mobile header layout — simplify to one row, move batch GT into dropdown menu, unify batch-gt page header style.

**Architecture:** Modify homepage header to remove inline batch GT button and add a mobile-only ⋯ dropdown menu. Replace batch-gt page's h1 header with a unified sticky header matching homepage style. All changes use inline styles + Tailwind responsive classes. Dropdown menu uses local state + click-outside detection.

**Tech Stack:** React, Next.js, Tailwind CSS, inline styles with CSS variables

---

### Task 1: Add ⋯ dropdown menu component to homepage header

**Files:**
- Modify: `app/page.tsx:925-955` (title row inside header)

- [ ] **Step 1: Add mobile menu state and handlers**

In the homepage component function body (before the return), add:

```tsx
const [menuOpen, setMenuOpen] = useState(false);
```

Add a ref for click-outside detection — add `useRef` to the import from "react" on line 1:

```tsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
```

- [ ] **Step 2: Replace the title row in the header**

Replace lines 925–956 (the `<div className="flex items-center justify-between">` title row) with:

```tsx
{/* Title row */}
<div className="flex items-center justify-between">
  <h1 className="text-lg font-medium sm:text-xl">
    <span style={{ color: "var(--accent-blue-hover)", letterSpacing: "-0.02em" }}>Trends</span>{" "}
    <span className="hidden sm:inline">Watcher Board</span>
    <span className="sm:hidden">Board</span>
  </h1>
  <div className="flex items-center gap-2">
    <AchievementSummary />
    {/* Mobile-only ⋯ menu */}
    <div className="relative sm:hidden" ref={(el) => { (menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
        style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
        aria-label="更多"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
        </svg>
      </button>
      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            width: 180,
            padding: 4,
            boxShadow: "var(--shadow-dialog)",
            zIndex: 20,
          }}
        >
          <a
            href="/batch-gt"
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-colors"
            style={{ color: "var(--text-secondary)", textDecoration: "none" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            批量 GT 浏览器
            <svg width="12" height="12" viewBox="0 0 12 12" fill="var(--text-quaternary)">
              <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </a>
        </div>
      )}
    </div>
    <button
      onClick={() => { fetchData(); fetchTrending(); fetchReddit(); fetchHackerNews(); fetchTechNews(); }}
      disabled={loading}
      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm"
      style={{
        background: loading ? "var(--bg-elevated)" : "var(--accent-blue)",
        color: "var(--text-primary)",
        opacity: loading ? 0.6 : 1,
        boxShadow: loading ? "none" : "var(--shadow-subtle)",
      }}
    >
      {loading ? "..." : "Refresh"}
    </button>
  </div>
</div>
```

Note: The `ref` uses a callback ref because `useRef` hasn't been added to the component yet. In the next step we add the proper ref.

- [ ] **Step 3: Add click-outside handler for menu**

Add `useRef` to imports (line 1) and add a ref declaration near the other useState hooks:

```tsx
const menuRef = useRef<HTMLDivElement | null>(null);
```

Add a useEffect to close menu on outside click:

```tsx
useEffect(() => {
  if (!menuOpen) return;
  const handler = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [menuOpen]);
```

Update the menu container's ref to use the simple ref:

```tsx
<div className="relative sm:hidden" ref={menuRef}>
```

- [ ] **Step 4: Keep desktop batch GT link untouched**

The desktop version should still show the batch GT button. Since we removed it from the title row, add it back as desktop-only inside the title row, right after the `<h1>`:

```tsx
<div className="flex items-center gap-3">
  <h1 className="text-lg font-medium sm:text-xl">
    <span style={{ color: "var(--accent-blue-hover)", letterSpacing: "-0.02em" }}>Trends</span>{" "}
    <span className="hidden sm:inline">Watcher Board</span>
    <span className="sm:hidden">Board</span>
  </h1>
  {/* Desktop-only batch GT link */}
  <a
    href="/batch-gt"
    className="hidden rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-80 sm:inline-block"
    style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}
  >
    批量 GT
  </a>
</div>
```

Note the `hidden sm:inline-block` — this hides it on mobile, shows on desktop.

- [ ] **Step 5: Build and verify**

Run: `npx next build 2>&1 | grep -E "error|Compiled"`
Expected: Compiled successfully

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: simplify mobile header with dropdown menu"
```

---

### Task 2: Redesign batch-gt page header

**Files:**
- Modify: `app/batch-gt/page.tsx:284-293` (header section)

- [ ] **Step 1: Replace header section**

Replace lines 286–293 (the `<div className="mb-4 sm:mb-6">` header block) with a unified sticky header:

```tsx
{/* Header — unified style */}
<header
  className="sticky top-0 z-10 backdrop-blur-md -mx-3 sm:-mx-6"
  style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(8, 9, 10, 0.85)" }}
>
  <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-4">
    <div className="flex items-center gap-3">
      <button
        onClick={() => window.location.href = '/'}
        className="flex items-center justify-center w-8 h-8 rounded-md transition-colors"
        style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
        aria-label="返回"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3L5 8L10 13"/>
        </svg>
      </button>
      <h1 className="text-lg font-medium sm:text-xl" style={{ color: "var(--text-secondary)" }}>
        <span style={{ letterSpacing: "-0.02em" }}>批量 GT</span>
      </h1>
    </div>
  </div>
</header>
```

- [ ] **Step 2: Move viewed-today stats to filter chips row**

Find the filter chips section (line 326) and modify it to include the stats on the right side. Replace the filter chips `<div>` with:

```tsx
{/* Filter Chips + Stats */}
<div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
  <div className="flex gap-2 flex-shrink-0">
    {FILTER_CONFIG.map(f => (
      <button
        key={f.key}
        onClick={() => { setActiveFilter(f.key); setSelectedIndex(null); }}
        className="flex-shrink-0 px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap"
        style={{
          background: activeFilter === f.key ? "var(--accent-blue)" : "var(--bg-elevated)",
          color: activeFilter === f.key ? "var(--text-primary)" : "var(--text-tertiary)",
          borderRadius: "var(--radius-full)",
          border: activeFilter === f.key ? "1px solid var(--accent-blue)" : "1px solid var(--border)",
        }}
      >
        {f.label} ({filterCounts[f.key]})
      </button>
    ))}
  </div>
  <span className="ml-auto flex-shrink-0 text-xs whitespace-nowrap" style={{ color: "var(--text-quaternary)" }}>
    已看 <span className={flashId ? "batch-count-bounce" : ""}>{viewedToday}</span>/{keywords.length}
  </span>
</div>
```

- [ ] **Step 3: Build and verify**

Run: `npx next build 2>&1 | grep -E "error|Compiled"`
Expected: Compiled successfully

- [ ] **Step 4: Commit**

```bash
git add app/batch-gt/page.tsx
git commit -m "feat: unified header for batch-gt page with back navigation"
```

---

### Task 3: Playwright verification + deploy

- [ ] **Step 1: Run Playwright mobile test**

Write and run a test script to verify:
- Homepage header shows: logo, achievement pill, ⋯ button, refresh (no batch GT button)
- Clicking ⋯ opens dropdown with "批量 GT 浏览器"
- Clicking dropdown item navigates to /batch-gt
- Batch-gt page has sticky header with ← back arrow and "批量 GT" title
- Stats line shows "已看 X/Y" next to filter chips

- [ ] **Step 2: Push and verify deployment**

```bash
git push
```

Wait for Vercel deployment, then verify on mobile viewport via Playwright.

- [ ] **Step 3: Final commit if any hotfixes needed**
