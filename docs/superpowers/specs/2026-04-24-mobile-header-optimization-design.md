# Mobile Header Optimization Design

**Date:** 2026-04-24
**Status:** Approved

## Problem

1. **首页 header 移动端拥挤**：标题行挤了 logo、"批量 GT" 按钮、成就面板、Refresh 按钮共 4 个元素，参差不齐
2. **批量 GT 页面头部风格不统一**：大标题 + 描述文字，和首页的紧凑 header 风格不一致
3. **批量 GT 入口不够优雅**：紧贴 logo 的小按钮，视觉上像补丁

## Solution

### 一、首页移动端 Header → 极简单行

**Before（3 层）:**
```
┌──────────────────────────────────┐
│ Trends Board  [批量GT]    🏆 🔄 │
├──────────────────────────────────┤
│ 🔥Trending │ 📊Queries │ 💻... │
└──────────────────────────────────┘
```

**After（2 层）:**
```
┌──────────────────────────────────┐
│ Trends Board        🏆   ⋯  🔄 │
├──────────────────────────────────┤
│ 🔥Trending │ 📊Queries │ 💻... │
└──────────────────────────────────┘
```

**变更点：**
- 移除紧贴 logo 的「批量 GT」按钮
- 右侧排列：成就面板药丸 → ⋯（更多菜单）→ Refresh 按钮
- ⋯ 按钮使用内联 SVG（三个水平圆点），16px 大小

### 二、⋯ 下拉菜单（Popover）

点击 ⋯ 弹出浮层菜单：

```
       ┌───────────────────────────┐
       │   批量 GT 浏览器      →  │
       └───────────────────────────┘
```

**规格：**
- 定位：在 ⋯ 按钮下方居中弹出
- 背景：`var(--bg-elevated)`，边框 `1px solid var(--border)`，圆角 `var(--radius-md)`
- 宽度：180px，padding 4px
- 菜单项：高 32px，padding 0 12px，13px Inter weight 510
  - hover 背景 `var(--bg-secondary)`，圆角 `var(--radius-sm)`
  - 文字 `var(--text-secondary)`，箭头 `var(--text-quaternary)`
- 点击菜单项跳转 `/batch-gt`
- 点击菜单外区域关闭
- 仅在移动端（<640px）显示 ⋯ 按钮，桌面端不需要

**菜单项（初始）：**
| 标签 | 动作 |
|------|------|
| 批量 GT 浏览器 | `window.location.href = '/batch-gt'` |

### 三、批量 GT 页面 Header

**Before:**
```
┌──────────────────────────────────┐
│ 批量 GT 浏览器                   │  ← h1 大标题
│ 今日已查看: 5 / 128 | 快捷键...  │  ← 描述文字
└──────────────────────────────────┘
```

**After:**
```
┌──────────────────────────────────┐
│ ← 批量 GT              ⋯        │  ← 统一 header 风格
├──────────────────────────────────┤
│ (筛选 chips + 统计信息)           │  ← 非 header，保持原有布局
└──────────────────────────────────┘
```

**变更点：**
- 替换大标题为统一风格的 header：`←` 返回箭头 + "批量 GT" 标题
- Header 使用和首页相同的 sticky + backdrop-blur-md 样式
- `←` 使用内联 SVG 箭头（16px），点击 `router.back()` 或 `window.location.href = '/'`
- 右侧 ⋯ 菜单（可选，用于"全量同步"等操作，本次暂不实现菜单内容，只放占位）
- 移除原来的 `<h1>` 和描述段落
- 已看/总数统计移到筛选栏区域（和 filter chips 同行，右侧显示）

### 四、Design Token 遵循

所有样式遵循 DESIGN.md Linear 设计规范：
- 字体：Inter Variable，13px weight 510（按钮/标签）、16px weight 510（标题）
- 颜色：`--accent-blue-hover (#828fff)` 高亮、`--text-secondary (#d0d6e0)` 次要文字、`--bg-elevated (#111214)` 提升背景
- 间距：header padding `px-3 py-2`（移动端）、`px-4 py-4`（桌面端）
- 圆角：`--radius-sm`（按钮/菜单项）、`--radius-md`（菜单容器）
- 毛玻璃：`backdrop-blur-md` + `rgba(8, 9, 10, 0.85)` 半透明背景

### 五、不改动

- 桌面端 header 布局保持不变（logo 全称、keywords 输入框、批量 GT 按钮保留）
- 移动端 tab 栏保持不变（6 个 tab 图标+文字）
- 成就面板组件（AchievementPanel.tsx）不改动
- Refresh 按钮功能和样式不变

## Files Changed

| 文件 | 变更 |
|------|------|
| `app/page.tsx` | 移除「批量 GT」按钮，添加 ⋯ 下拉菜单组件，仅移动端显示 |
| `app/batch-gt/page.tsx` | 替换 h1 标题为统一 header（← + 标题 + ⋯），统计信息移到筛选栏 |
