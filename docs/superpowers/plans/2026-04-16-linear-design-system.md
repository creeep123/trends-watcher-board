# Linear Design System Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Trends Watcher Board from its current blue-purple dark theme to a Linear-inspired design system — Inter font with cv01/ss03, near-black luminance-stepped surfaces, semi-transparent white borders, brand indigo accent, and Linear's shadow/border hierarchy.

**Architecture:** The migration is primarily a CSS variable swap (the main page uses `var(--xxx)` inline styles extensively, so updating globals.css handles ~80% of page.tsx automatically). The batch-gt page uses raw Tailwind classes and needs manual conversion. Inter font is loaded via `next/font/google`.

**Tech Stack:** Next.js 15, Tailwind CSS v4, CSS custom properties, Inter Variable (Google Fonts)

**Reference:** Linear design spec at `/tmp/getdesign-templates/package/templates/linear.app.md`

---

## Design Token Mapping

| Token | Current Value | New Value (Linear) | Notes |
|-------|--------------|-------------------|-------|
| `--bg-primary` | `#0a0a0f` | `#08090a` | Near-pure black, barely-cool undertone |
| `--bg-secondary` | `#12121a` | `#0f1011` | Panel dark, one step up |
| `--bg-card` | `#1a1a2e` | `rgba(255,255,255,0.02)` | Elevated surface, translucent |
| `--bg-card-hover` | `#222240` | `rgba(255,255,255,0.04)` | Hover state surface |
| `--border` | `#2a2a4a` | `rgba(255,255,255,0.08)` | Standard semi-transparent border |
| `--border-subtle` | (new) | `rgba(255,255,255,0.05)` | Subtle borders |
| `--text-primary` | `#e8e8f0` | `#f7f8f8` | Near-white, not pure white |
| `--text-secondary` | `#9898b0` | `#d0d6e0` | Cool silver-gray (body, descriptions) |
| `--text-tertiary` | (new) | `#8a8f98` | Muted gray (labels, metadata) |
| `--text-quaternary` | (new) | `#62666d` | Subdued gray (timestamps, disabled) |
| `--accent-blue` | `#4f8ff7` | `#5e6ad2` | Brand indigo (CTAs, active states) |
| `--accent-blue-hover` | (new) | `#7170ff` | Accent violet (hover) |
| `--accent-blue-muted` | (new) | `#7a7fad` | Security/muted indigo |
| `--accent-green` | `#34d399` | `#27a644` | Success/active status (kept semantic) |
| `--accent-green-bright` | (new) | `#10b981` | Secondary success, pill badges |
| `--accent-orange` | `#f59e0b` | `#f59e0b` | Warning/attention (unchanged) |
| `--accent-red` | `#ef4444` | `#ef4444` | Error/danger (unchanged) |
| `--accent-purple` | `#a78bfa` | `#a78bfa` | Info accent (unchanged) |

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `app/globals.css` | CSS variables, base styles, scrollbar | **Modify** — swap all tokens, add Linear utility classes |
| `app/layout.tsx` | Root layout, font loading | **Modify** — add Inter font, update themeColor |
| `app/page.tsx` | Main dashboard (2764 lines) | **Modify** — update hardcoded colors, focus rings, a few inline styles |
| `app/batch-gt/page.tsx` | Batch GT viewer (304 lines) | **Modify** — convert raw Tailwind classes to CSS variables |
| `app/supabase-migrate/page.tsx` | DB migration utility | **Skip** — intentionally light-themed, not part of dashboard |

---

### Task 1: Update globals.css with Linear design tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace CSS custom properties with Linear tokens**

Replace the entire `:root` block and body styles with Linear's design system. The new globals.css should be:

```css
@import "tailwindcss";

:root {
  /* === Background Surfaces (Linear luminance steps) === */
  --bg-primary: #08090a;
  --bg-secondary: #0f1011;
  --bg-card: rgba(255, 255, 255, 0.02);
  --bg-card-hover: rgba(255, 255, 255, 0.04);
  --bg-elevated: rgba(255, 255, 255, 0.05);

  /* === Borders (semi-transparent white, never solid dark) === */
  --border: rgba(255, 255, 255, 0.08);
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-prominent: rgba(255, 255, 255, 0.12);

  /* === Text (luminance hierarchy, not pure white) === */
  --text-primary: #f7f8f8;
  --text-secondary: #d0d6e0;
  --text-tertiary: #8a8f98;
  --text-quaternary: #62666d;

  /* === Brand Accent (Linear indigo-violet) === */
  --accent-blue: #5e6ad2;
  --accent-blue-hover: #7170ff;
  --accent-blue-muted: #7a7fad;

  /* === Semantic Status Colors (kept for data visualization) === */
  --accent-green: #27a644;
  --accent-green-bright: #10b981;
  --accent-orange: #f59e0b;
  --accent-red: #ef4444;
  --accent-purple: #a78bfa;

  /* === Shadows (designed for dark surfaces) === */
  --shadow-subtle: 0px 1.2px 0px rgba(0, 0, 0, 0.03);
  --shadow-surface: rgba(0, 0, 0, 0.2) 0px 0px 0px 1px;
  --shadow-elevated: rgba(0, 0, 0, 0.4) 0px 2px 4px;
  --shadow-dialog: 0px 8px 2px rgba(0,0,0,0), 0px 5px 2px rgba(0,0,0,0.01), 0px 3px 2px rgba(0,0,0,0.04), 0px 1px 1px rgba(0,0,0,0.07), 0px 0px 1px rgba(0,0,0,0.08);
  --shadow-focus: rgba(0, 0, 0, 0.1) 0px 4px 12px;

  /* === Border Radius (Linear scale) === */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar — Linear-style thin, dark */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Hide horizontal scrollbar in filter bar on mobile */
.overflow-x-auto {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.overflow-x-auto::-webkit-scrollbar {
  display: none;
}

/* Smooth tap highlight for mobile */
button, a {
  -webkit-tap-highlight-color: transparent;
}

/* Scroll to top button animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.scrollToTop-fade {
  animation: fadeIn 0.2s ease-out;
}

/* Linear signature weight 510 — available as arbitrary Tailwind class */
/* Usage: className="font-[510]" when you need Linear's between-regular-and-medium weight */
/* Most places use font-medium (500) as a close approximation */

/* Focus ring — Linear style */
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent-blue-hover);
  border-radius: inherit;
}

/* Select element dark theme fix for WebKit */
select option {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Verify the file was written correctly**

Run: `cat app/globals.css | head -5`
Expected: `@import "tailwindcss";`

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: update CSS tokens to Linear design system

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 2: Update layout.tsx — Inter font + themeColor

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add Inter font and update theme color**

Replace the entire `app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  featureSettings: "'cv01' 1, 'ss03' 1",
});

export const viewport: Viewport = {
  themeColor: "#08090a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Trends Watcher Board",
  description: "AI trends monitoring dashboard - Google Trends & GitHub Trending",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trends Watcher",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
```

Key changes:
- Import `Inter` from `next/font/google` with `cv01` and `ss03` OpenType features
- Set CSS variable `--font-sans` so `globals.css` body can reference it
- themeColor updated to `#08090a`
- Applied `antialiased` class for subpixel rendering

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "style: add Inter font with cv01/ss03 features for Linear look

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 3: Update page.tsx — Header & Navigation

**Files:**
- Modify: `app/page.tsx` (lines 903-998 — the header and mobile tab bar)

The main page uses `var(--xxx)` inline styles extensively. Since we already changed the variable values in Task 1, most colors will update automatically. This task handles the **hardcoded colors** and **structural class changes** that CSS variables alone can't fix.

- [ ] **Step 1: Update header backdrop and border**

In `page.tsx` line ~906-908, change the header's inline style:

FROM:
```tsx
<header
  className="sticky top-0 z-10 border-b backdrop-blur-md"
  style={{ borderColor: "var(--border)", background: "rgba(10, 10, 15, 0.88)" }}
>
```

TO:
```tsx
<header
  className="sticky top-0 z-10 backdrop-blur-md"
  style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(8, 9, 10, 0.85)" }}
>
```

Changes: remove `border-b` class (use inline border instead for semi-transparent), update background opacity color to match new `--bg-primary`.

- [ ] **Step 2: Update h1 title styling**

In `page.tsx` line ~914-917, update the title:

FROM:
```tsx
<h1 className="text-lg font-bold tracking-tight sm:text-xl">
  <span style={{ color: "var(--accent-blue)" }}>Trends</span>{" "}
  <span className="hidden sm:inline">Watcher Board</span>
  <span className="sm:hidden">Board</span>
</h1>
```

TO:
```tsx
<h1 className="text-lg font-medium tracking-tight sm:text-xl" style={{ letterSpacing: "-0.02em" }}>
  <span style={{ color: "var(--accent-blue-hover)" }}>Trends</span>{" "}
  <span className="hidden sm:inline">Watcher Board</span>
  <span className="sm:hidden">Board</span>
</h1>
```

Changes: `font-bold` → `font-medium` (Linear uses weight 400-510, never 700 for titles), use `--accent-blue-hover` (#7170ff) for the brand accent, add slight negative letter-spacing.

- [ ] **Step 3: Update nav link buttons ("批量 GT", push button)**

In `page.tsx` line ~919-938, update nav link button styling:

The "批量 GT" link (line ~919-925):
FROM: `style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}`
TO: `style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}`

The push notification button (line ~927-938):
FROM: `style={{ background: push.subscribed ? "rgba(16, 185, 129, 0.15)" : "var(--bg-secondary)", color: push.subscribed ? "#34d399" : "var(--text-secondary)" }}`
TO: `style={{ background: push.subscribed ? "rgba(39, 166, 68, 0.1)" : "var(--bg-elevated)", color: push.subscribed ? "var(--accent-green-bright)" : "var(--text-tertiary)" }}`

- [ ] **Step 4: Update Refresh button**

In `page.tsx` line ~941-952, update the Refresh CTA:

FROM:
```tsx
style={{
  background: loading ? "var(--border)" : "var(--accent-blue)",
  color: "#fff",
  opacity: loading ? 0.6 : 1,
}}
```

TO:
```tsx
style={{
  background: loading ? "var(--bg-elevated)" : "var(--accent-blue)",
  color: "#f7f8f8",
  opacity: loading ? 0.6 : 1,
  boxShadow: loading ? "none" : "var(--shadow-subtle)",
}}
```

- [ ] **Step 5: Update keywords input focus ring**

In `page.tsx` line ~958-966, update the input:

FROM: `className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 sm:py-1.5 sm:text-xs"`
TO: `className="min-w-0 flex-1 border px-3 py-2 text-sm outline-none transition-colors sm:py-1.5 sm:text-xs"`

Changes: removed `focus:border-blue-500` (now handled by the global `*:focus-visible` rule in globals.css), removed `rounded-lg` from input (Linear uses `rounded-md` / 6px for inputs).

Also update the inline style:
FROM: `style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}`
TO: `style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 6: Update Apply button next to input**

In `page.tsx` line ~967-973:

FROM: `className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5"`
TO: `className="shrink-0 border px-3 py-2 text-xs font-medium transition-colors sm:py-1.5"`

FROM: `style={{ background: "var(--bg-card)", color: "var(--text-secondary)", borderColor: "var(--border)" }}`
TO: `style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", borderColor: "var(--border)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 7: Update mobile tab bar**

In `page.tsx` line ~979-998, update the mobile tab bar container:

FROM: `style={{ top: "auto", borderColor: "var(--border)", background: "var(--bg-primary)" }}`
TO: `style={{ top: "auto", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-primary)" }}`

Update active tab indicator:
FROM: `borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue)" : "2px solid transparent"`
TO: `borderBottom: mobileTab === tab.key ? "2px solid var(--accent-blue-hover)" : "2px solid transparent"`

Update active tab text color:
FROM: `color: mobileTab === tab.key ? "var(--accent-blue)" : "var(--text-secondary)"`
TO: `color: mobileTab === tab.key ? "var(--accent-blue-hover)" : "var(--text-tertiary)"`

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "style: update header and navigation to Linear design

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 4: Update page.tsx — KGR Workbench Panel

**Files:**
- Modify: `app/page.tsx` (lines 1000-1296 — KGR panel and Roots panel)

- [ ] **Step 1: Update KGR panel container**

Line ~1003-1006:
FROM:
```tsx
<div className="rounded-lg border" style={{
  background: "var(--bg-card)",
  borderColor: "var(--border)"
}}>
```
TO:
```tsx
<div className="border" style={{
  background: "var(--bg-card)",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-surface)",
}}>
```

- [ ] **Step 2: Update KGR panel inner borders**

Line ~1007:
FROM: `className="border-b p-3" style={{ borderColor: "var(--border)" }}`
TO: `className="p-3" style={{ borderBottom: "1px solid var(--border)" }}`

Line ~1057:
FROM: `className="border-b p-3" style={{ borderColor: "var(--border)" }}`
TO: `className="p-3" style={{ borderBottom: "1px solid var(--border)" }}`

Line ~1103:
FROM: `className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}`
TO: `className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}`

- [ ] **Step 3: Update KGR help text border**

Line ~1176:
FROM: `className="border-t p-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}`
TO: `className="p-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-tertiary)" }}`

- [ ] **Step 4: Update KGR action buttons**

Line ~1022-1027 (一键分析 button):
FROM: `style={{ background: "var(--accent-blue)", color: "#fff" }}`
TO: `style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}`

Line ~1028-1032 (导出 button):
FROM: `style={{ background: "var(--accent-green)", color: "#fff" }}`
TO: `style={{ background: "var(--accent-green)", color: "var(--text-primary)" }}`

Line ~1035-1037 (对比 button):
FROM: `style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}`
TO: `style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}`

Line ~1041-1044 (批量 button):
Same pattern as above — `--bg-card` → `--bg-elevated`, `--text-secondary` → `--text-tertiary`

Line ~1047-1050 (close button):
FROM: `style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}`
TO: `style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}`

- [ ] **Step 5: Update KGR input focus**

Line ~1065 and ~1076, remove `focus:border-blue-500` from className (now handled by global focus-visible):

FROM: `className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"`
TO: `className="w-full border px-3 py-2 text-sm outline-none transition-colors"`

- [ ] **Step 6: Update KGR count badge**

Line ~1014:
FROM: `style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}`
TO: `style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}`

- [ ] **Step 7: Update Root Keywords panel (same patterns)**

Apply the same changes as KGR panel (steps 1-6) to the Root Keywords Monitoring panel (lines 1214-1296):
- Container: add `boxShadow: "var(--shadow-surface)"`, use `borderRadius: "var(--radius-lg)"`
- Inner borders: switch from `border-b` class + borderColor style to `borderBottom` inline
- Close button: `--text-secondary` → `--text-tertiary`
- Input: remove `focus:border-blue-500`
- Delete button (line ~1286): keep `--accent-red` but change text to `var(--text-primary)`

- [ ] **Step 8: Update toggle buttons (lines 1299-1350)**

All toggle buttons ("KGR", "词根监控"):
FROM: `style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: kgrItems.length > 0 ? "var(--accent-blue)" : "var(--text-secondary)" }}`
TO: `style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: kgrItems.length > 0 ? "var(--accent-blue-hover)" : "var(--text-tertiary)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx
git commit -m "style: update KGR and Roots panels to Linear design

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 5: Update page.tsx — Main Content Cards & Components

**Files:**
- Modify: `app/page.tsx` (lines 1352-1670 — main content area)

- [ ] **Step 1: Update SectionHeader component (line ~1676-1688)**

FROM:
```tsx
<h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
<span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
```
TO:
```tsx
<h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)", letterSpacing: "-0.01em" }}>{title}</h2>
<span className="px-2 py-0.5 text-xs font-medium" style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)", borderRadius: "var(--radius-full)" }}>
```

Changes: `font-bold` → `font-medium`, text color to `--text-secondary` (section headers should be muted, not primary), count badge uses `--bg-elevated`.

- [ ] **Step 2: Update CompactTimeSelector and CompactGeoSelector**

In both selectors (lines ~1698-1736 and ~1738-1770):

Active state buttons:
FROM: `background: value === opt.value ? "var(--accent-blue)" : "transparent"`
TO: `background: value === opt.value ? "var(--accent-blue)" : "transparent"`

Inactive text color:
FROM: `color: value !== opt.value ? "var(--text-secondary)" : "#fff"`
TO: `color: value !== opt.value ? "var(--text-tertiary)" : "var(--text-primary)"`

Desktop selects:
FROM: `style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-primary)" }}`
TO: `style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-secondary)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 3: Update TrendingCard (line ~1793-1817)**

FROM:
```tsx
<div className="rounded-lg border transition-all"
  style={{
    background: isTech ? "rgba(79, 143, 247, 0.06)" : "var(--bg-card)",
    borderColor: isExpanded ? "var(--accent-blue)" : isTech ? "rgba(79, 143, 247, 0.3)" : "var(--border)",
  }}>
```
TO:
```tsx
<div className="border transition-all"
  style={{
    background: isTech ? "rgba(94, 106, 210, 0.06)" : "var(--bg-card)",
    borderColor: isExpanded ? "var(--accent-blue-hover)" : isTech ? "rgba(94, 106, 210, 0.2)" : "var(--border)",
    borderRadius: "var(--radius-lg)",
  }}>
```

Changes: Tech highlight color shifted to Linear indigo, expanded border uses `--accent-blue-hover`, removed `rounded-lg` class.

- [ ] **Step 4: Update RedditCard (line ~1843-1867)**

Line ~1848-1851:
FROM:
```tsx
style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff4500"; }}
onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
```
TO:
```tsx
style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}
onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255, 69, 0, 0.4)"; }}
onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
```

Changes: hover border to semi-transparent (more Linear-like), added borderRadius inline.

- [ ] **Step 5: Update HackerNewsCard (line ~1898-1912)**

Same pattern as RedditCard:
FROM:
```tsx
style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ff6600"; }}
onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
```
TO:
```tsx
style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "var(--radius-lg)" }}
onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255, 102, 0, 0.4)"; }}
onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
```

- [ ] **Step 6: Update Tech News cards (inline JSX, NOT a named component)**

The tech news section renders cards as inline JSX around line 1578-1622 (search for `techNewsPosts.map`). There is NO `TechNewsCard` function — it's inline code.

Line ~1581-1582:
FROM:
```tsx
className="group rounded-lg border p-3 transition-colors hover:border-blue-500/50"
style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
```
TO:
```tsx
className="group border p-3 transition-colors"
style={{ borderColor: "var(--border)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}
```
Changes: removed `rounded-lg`, removed `hover:border-blue-500/50` (hover effect now handled by subtle borderColor change in CSS or JS), added borderRadius inline.

Line ~1595 and ~1600 (author and time text):
FROM: `style={{ color: "var(--text-secondary)" }}`
TO: `style={{ color: "var(--text-tertiary)" }}`

Line ~1616-1617 (article title link):
FROM: `className="block text-sm font-medium leading-snug transition-colors hover:text-blue-500"`
TO: `className="block text-sm font-medium leading-snug transition-colors"`

Changes: removed `hover:text-blue-500` (hover effect not needed with Linear's minimal interaction model).

- [ ] **Step 7: Update all `focus:border-blue-500` occurrences in page.tsx**

Search and replace ALL remaining `focus:border-blue-500` in className strings with empty string (remove them). The global `*:focus-visible` rule now handles focus rings.

Run: `grep -n "focus:border-blue-500" app/page.tsx`

Each match should have `focus:border-blue-500` removed from the className string.

- [ ] **Step 8: Update error banner**

Line ~1363-1366:
FROM: `style={{ borderColor: "var(--accent-red)", background: "rgba(239, 68, 68, 0.1)", color: "var(--accent-red)" }}`
TO: `style={{ borderBottom: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.06)", color: "var(--accent-red)", borderRadius: "var(--radius-lg)" }}`

- [ ] **Step 9: Update stale data warning banner**

Line ~1449:
FROM: `style={{ borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}`
TO: `style={{ borderBottom: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.06)", color: "#fbbf24", borderRadius: "var(--radius-lg)" }}`

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx
git commit -m "style: update cards and content components to Linear design

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 6: Update page.tsx — Remaining Hardcoded Colors

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Find all remaining hardcoded color references**

Run: `grep -n "style.*#[0-9a-fA-F]\|style.*rgba" app/page.tsx`

For each match, evaluate:
- If it references a semantic status color (green for KGR success, red for danger, orange for warning) — **keep as-is** (these are data-driven)
- If it references `#4f8ff7` or `#34d399` for brand/interactive purposes — **update to Linear equivalents**
- If it references `rgba(79, 143, 247, ...)` (the old blue) — **update to `rgba(94, 106, 210, ...)` or `rgba(113, 112, 255, ...)`**

Specific replacements to make:
- `#4f8ff7` → `#5e6ad2` (brand indigo)
- `rgba(79, 143, 247, 0.15)` → `rgba(94, 106, 210, 0.15)` (brand badge bg)
- `rgba(79, 143, 247, 0.06)` → `rgba(94, 106, 210, 0.06)` (brand card bg)
- `rgba(79, 143, 247, 0.3)` → `rgba(94, 106, 210, 0.2)` (brand card border)
- `#34d399` (when used for non-semantic brand purposes) → `var(--accent-green-bright)` or `#10b981`
- `rgba(52, 211, 153, 0.15)` → `rgba(16, 185, 129, 0.15)` (green badge bg)
- `rgba(16, 185, 129, 0.15)` → keep (push button already updated)
- `#f87171` → keep (error/surge tag — semantic)
- `#fbbf24` → keep (warning — semantic)
- `rgba(239, 68, 68, 0.15)` → keep (error badge — semantic)
- `rgba(239, 68, 68, 0.1)` → `rgba(239, 68, 68, 0.06)` (lighter error bg)
- `#fff` → `var(--text-primary)` or `#f7f8f8` (in buttons/labels)

- [ ] **Step 2: Update tagColor function (line ~43-49)**

FROM:
```tsx
function tagColor(tag: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    surge: { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171" },
    multi_geo: { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" },
    fresh: { bg: "rgba(251, 191, 36, 0.15)", color: "#fbbf24" },
  };
  return map[tag] || { bg: "rgba(107,114,128,0.15)", color: "#9ca3af" };
}
```
TO:
```tsx
function tagColor(tag: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    surge: { bg: "rgba(239, 68, 68, 0.1)", color: "#f87171" },
    multi_geo: { bg: "rgba(94, 106, 210, 0.1)", color: "#7170ff" },
    fresh: { bg: "rgba(251, 191, 36, 0.1)", color: "#fbbf24" },
  };
  return map[tag] || { bg: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" };
}
```

Changes: multi_geo tag uses Linear indigo instead of blue, default tag uses Linear subtle bg, badge backgrounds slightly more transparent (0.1 instead of 0.15).

- [ ] **Step 3: Update loading spinner color**

Line ~1464:
FROM: `className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"`
TO: `className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent-blue-hover)", borderTopColor: "transparent" }}`

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "style: replace remaining hardcoded colors with Linear tokens

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 7: Update batch-gt/page.tsx

**Files:**
- Modify: `app/batch-gt/page.tsx`

The batch-gt page uses raw Tailwind classes (bg-gray-950, text-gray-100, etc.) instead of CSS variables. It needs to be converted to use the same variable system.

- [ ] **Step 1: Update page container**

Line 181:
FROM: `<div className="min-h-screen bg-gray-950 text-gray-100 px-3 py-4 sm:p-6">`
TO: `<div className="min-h-screen px-3 py-4 sm:p-6" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>`

- [ ] **Step 2: Update header section**

Line 185-189:
FROM:
```tsx
<h1 className="text-2xl sm:text-3xl font-bold mb-2">批量 GT 浏览器</h1>
<p className="text-gray-400 text-sm sm:text-base">
```
TO:
```tsx
<h1 className="text-2xl sm:text-3xl font-medium mb-2" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>批量 GT 浏览器</h1>
<p className="text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
```

- [ ] **Step 3: Update import section card**

Line 193:
FROM: `<div className="mb-4 sm:mb-6 bg-gray-900 rounded-lg p-3 sm:p-4">`
TO: `<div className="mb-4 sm:mb-6 p-3 sm:p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>`

Line 194:
FROM: `<h2 className="text-base sm:text-lg font-semibold mb-2">导入词根</h2>`
TO: `<h2 className="text-base sm:text-lg font-medium mb-2" style={{ color: "var(--text-secondary)" }}>导入词根</h2>`

- [ ] **Step 4: Update textarea**

Line 199:
FROM: `className="w-full h-20 sm:h-24 bg-gray-800 border border-gray-700 rounded p-2 text-sm"`
TO: `className="w-full h-20 sm:h-24 p-2 text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 5: Update import/sync buttons**

Line 202-206 (import button):
FROM: `className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 text-sm"`
TO: `className="px-4 py-2 rounded disabled:opacity-50 text-sm" style={{ background: "var(--accent-blue)", color: "var(--text-primary)" }}`

Line 209-213 (sync button):
FROM: `className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 text-sm"`
TO: `className="px-4 py-2 rounded disabled:opacity-50 text-sm" style={{ background: "var(--accent-green)", color: "var(--text-primary)" }}`

- [ ] **Step 6: Update filter chips**

Line 225-229:
FROM:
```tsx
className={`
  flex-shrink-0 px-3 py-1.5 rounded-full text-xs sm:text-sm whitespace-nowrap
  ${activeFilter === f.key
    ? "bg-blue-600 text-white"
    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
  }
`}
```
TO:
```tsx
className="flex-shrink-0 px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap"
style={{
  background: activeFilter === f.key ? "var(--accent-blue)" : "var(--bg-elevated)",
  color: activeFilter === f.key ? "var(--text-primary)" : "var(--text-tertiary)",
  borderRadius: "var(--radius-full)",
  border: activeFilter === f.key ? "1px solid var(--accent-blue)" : "1px solid var(--border)",
}}
```

- [ ] **Step 7: Update keyword list items**

Line 248-252:
FROM:
```tsx
className={`
  flex items-center justify-between p-3 sm:p-4 rounded-lg cursor-pointer
  ${isSelected ? "bg-blue-900/30 ring-2 ring-blue-500" : "bg-gray-900"}
  hover:bg-gray-800
`}
```
TO:
```tsx
className="flex items-center justify-between p-3 sm:p-4 cursor-pointer"
style={{
  background: isSelected ? "rgba(94, 106, 210, 0.08)" : "var(--bg-card)",
  border: `1px solid ${isSelected ? "var(--accent-blue-hover)" : "var(--border)"}`,
  borderRadius: "var(--radius-lg)",
}}
```

- [ ] **Step 8: Update checkbox**

Line 260-266:
FROM:
```tsx
className={`
  flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center
  ${isViewedToday || markingId === kw.id
    ? "bg-green-500 border-green-500 text-white"
    : "border-gray-600"
  }
  ${markingId === kw.id ? "animate-pulse" : ""}
`}
```
TO:
```tsx
className={`
  flex-shrink-0 w-6 h-6 flex items-center justify-center
  ${markingId === kw.id ? "animate-pulse" : ""}
`}
style={{
  background: isViewedToday || markingId === kw.id ? "var(--accent-green)" : "transparent",
  border: `2px solid ${isViewedToday || markingId === kw.id ? "var(--accent-green)" : "var(--border)"}`,
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
}}
```

- [ ] **Step 9: Update keyword text and metadata**

Line 273:
FROM: `<div className="font-semibold text-sm sm:text-base truncate">{kw.keyword}</div>`
TO: `<div className="font-medium text-sm sm:text-base truncate" style={{ color: "var(--text-primary)" }}>{kw.keyword}</div>`

Line 275:
FROM: `<div className="text-xs text-gray-500">`
TO: `<div className="text-xs" style={{ color: "var(--text-quaternary)" }}>`

- [ ] **Step 10: Update GT compare button**

Line 287:
FROM: `className="flex-shrink-0 ml-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-green-600 hover:bg-green-700 rounded text-xs sm:text-sm"`
TO: `className="flex-shrink-0 ml-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm" style={{ background: "var(--accent-green)", color: "var(--text-primary)", borderRadius: "var(--radius-md)" }}`

- [ ] **Step 11: Update empty state**

Line 296:
FROM: `<div className="text-center text-gray-500 py-12">`
TO: `<div className="text-center py-12" style={{ color: "var(--text-quaternary)" }}>`

- [ ] **Step 12: Update loading state**

Line 174-176:
FROM:
```tsx
<div className="flex items-center justify-center h-screen">
  <div className="text-xl">Loading...</div>
</div>
```
TO:
```tsx
<div className="flex items-center justify-center h-screen">
  <div className="text-xl" style={{ color: "var(--text-tertiary)" }}>Loading...</div>
</div>
```

- [ ] **Step 13: Commit**

```bash
git add app/batch-gt/page.tsx
git commit -m "style: migrate batch-gt page to Linear design tokens

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 8: Update page.tsx — KeywordCard component (deep dive)

**Files:**
- Modify: `app/page.tsx`

The KeywordCard is the most complex component — it displays scores, tags, and action buttons. It has many hardcoded inline color references.

- [ ] **Step 1: Read the full KeywordCard component**

Run: `grep -n "function KeywordCard" app/page.tsx`

Then read the full component from its start through to its closing. The component is likely around lines 1913-2050 (approximately).

- [ ] **Step 2: Update KeywordCard container**

Apply same card pattern as other cards:
- Add `borderRadius: "var(--radius-lg)"` to inline style
- Remove `rounded-lg` from className
- If expanded border uses `--accent-blue`, change to `--accent-blue-hover`

- [ ] **Step 3: Update score badge colors**

Find all score/number badge styling in KeywordCard:
- Green score badges: keep green semantic colors but use `var(--accent-green-bright)` / `rgba(16, 185, 129, 0.1)`
- Red score badges: keep red semantic colors
- Blue score badges: change from `#4f8ff7` / `rgba(79, 143, 247, ...)` to `#5e6ad2` / `rgba(94, 106, 210, ...)`

- [ ] **Step 4: Update action link colors**

Find all `style={{ color: "var(--accent-blue)" }}` in link elements within KeywordCard and change to `style={{ color: "var(--accent-blue-hover)" }}`.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "style: update KeywordCard to Linear design tokens

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 9: Update page.tsx — Remaining Sub-Components

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update Rank component**

Find the Rank component. It likely renders a number with specific styling.
Ensure it uses `var(--text-tertiary)` for muted rank numbers and `var(--text-primary)` for emphasized ones.

- [ ] **Step 2: Update Chevron component**

Find the Chevron component. Ensure its color uses `var(--text-tertiary)`.

- [ ] **Step 3: Update ExternalIcon component**

Find ExternalIcon. Ensure its color uses `var(--text-tertiary)`.

- [ ] **Step 4: Update EmptyState component**

Find EmptyState. Ensure text color uses `var(--text-tertiary)` and link color uses `var(--accent-blue-hover)`.

- [ ] **Step 5: Update DecisionPanel component**

Find DecisionPanel (function starting around line 2246). This renders the expanded keyword detail view with interest over time data and action buttons. Apply these changes:

- Container: add `borderRadius: "var(--radius-lg)"` to the outer div's inline style
- Score badges: any blue-tinted badges should use `rgba(94, 106, 210, ...)` instead of `rgba(79, 143, 247, ...)`
- Action links (`style={{ color: "var(--accent-blue)" }}`): change to `style={{ color: "var(--accent-blue-hover)" }}`
- Score number colors (green for good KGR, red for bad): keep semantic colors unchanged
- "Add to KGR" button: keep `--accent-green` but change text to `var(--text-primary)` instead of `#fff`
- Metadata text: change `var(--text-secondary)` to `var(--text-tertiary)` for less important info
- Remove any `focus:border-blue-500` from inputs within DecisionPanel

- [ ] **Step 6: Search for any remaining `font-bold` usage**

Run: `grep -n "font-bold" app/page.tsx`

For each match, evaluate if it should be `font-medium` (Linear rarely uses bold/700). Exception: data values and numbers can stay bold.

- [ ] **Step 7: Search for any remaining `rounded-lg` on cards/containers**

Run: `grep -n "rounded-lg" app/page.tsx`

For card/container elements using inline styles, remove `rounded-lg` from className and add `borderRadius: "var(--radius-lg)"` to inline style instead.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "style: update remaining sub-components to Linear design

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 10: Build & Verify

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

Run: `pnpm build 2>&1 | tail -40`

Expected: Build completes with no TypeScript errors. CSS/compilation warnings are acceptable.

If there are TypeScript errors, fix them before proceeding.

- [ ] **Step 2: Check for any remaining old color references**

Run: `grep -rn "#4f8ff7\|#1a1a2e\|#12121a\|#2a2a4a\|#0a0a0f\|#e8e8f0\|#9898b0" app/page.tsx app/batch-gt/page.tsx app/globals.css`

Expected: No matches (all old colors should have been replaced). If matches remain, evaluate and fix.

- [ ] **Step 3: Verify CSS variable consistency**

Run: `grep -oP 'var\(--[a-z0-9-]+\)' app/page.tsx | sort -u`

Verify that all referenced variables are defined in `app/globals.css`. If any are missing, add them.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address remaining design token inconsistencies

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```
