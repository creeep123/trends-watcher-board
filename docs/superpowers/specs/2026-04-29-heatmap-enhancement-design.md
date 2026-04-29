# Heatmap Enhancement — 对标 GitHub 贡献热力图

## 目标

将现有热力图从基础网格升级为 GitHub 风格的交互式贡献图，提升数据可读性和视觉体验。

## 设计决策

- **时间范围**: 12 周（84 天），维持现状
- **分类方式**: 单行热力图，不按来源拆分（来源过多）
- **Tooltip**: 自定义浮层，显示日期总数 + 各来源明细
- **月份标签**: 每月第一周的列上方标注月份

## 变更清单

### 1. 后端：heatmap 数据增加每日分类明细

**文件**: `app/api/read-stats/route.ts`

当前 `heatmap` 返回 `{ date: string; count: number }[]`，改为：

```typescript
interface HeatmapDay {
  date: string;        // YYYY-MM-DD
  count: number;       // 当日总已读
  by_type: Record<string, number>; // { github: 3, reddit: 5, hn: 2, ... }
}
```

实现方式：在现有的 heatmapItems 查询中，改为 `select("item_type, read_at")`，然后按 `(date, item_type)` 双维度聚合。

### 2. 前端：Heatmap 组件增强

**文件**: `lib/AchievementPanel.tsx`

#### 2a. 月份标签

在热力图网格上方渲染月份标签。逻辑：
- 遍历每周的第一天（周一），检查该天所属月份
- 当月份变化时，在该列上方显示月份名（如 "3月"、"4月"）
- 同一月份只标注一次，后续周留空
- 标签对齐到该列的顶部

#### 2b. 自定义 Tooltip

替换原生 `title` 属性，使用定位浮层：
- 鼠标 hover 时在格子上方显示
- 内容格式：
  ```
  4月28日 周一 · 23 条已读
  GitHub: 3 · Reddit: 5 · HN: 2 · TechNews: 4
  PH: 3 · HF: 2 · IH: 2 · Trending: 1 · Queries: 1
  ```
- 只显示 count > 0 的来源
- 使用 CSS `position: absolute` 定位，基于 mouseMove 事件坐标
- 鼠标离开格子时隐藏

来源名称映射：
```typescript
const TYPE_LABELS: Record<string, string> = {
  trending: "Trending", queries: "Queries", github: "GitHub",
  reddit: "Reddit", hn: "HN", technews: "TechNews",
  ph: "Product Hunt", hf: "HuggingFace", ih: "Indie Hackers",
};
```

#### 2c. 入场动画

- 格子初始 `opacity: 0`，通过 CSS animation 渐入
- 每列延迟 20ms（`animation-delay: ${weekIndex * 20}ms`）
- 总动画时长 ~1s（12 列 × 20ms + 过渡时间）
- 使用 `@keyframes` + CSS-only，无需 JS 动画库
- `prefers-reduced-motion` 时跳过动画

#### 2d. 汇总栏

在热力图下方加一行文字摘要：
```
过去 12 周共阅读 482 条 · 最长连续 7 天 · 最高单日 45 条
```

替换现有的三列统计卡片（`总已读 | 连续天数 | 最高单日`），保持信息量但更紧凑。

### 3. ReadStats 类型更新

**文件**: `lib/AchievementPanel.tsx`（内联 interface）

```typescript
interface ReadStats {
  today: { ... }; // 不变
  heatmap: { date: string; count: number; by_type: Record<string, number> }[];
  cumulative: { total_reads: number; streak: number; best_day: number };
  goals: { total: number; new_words: number; info: number };
}
```

## 不变项

- 5 级颜色等级不变
- 每日目标不变
- ProgressRing + StackedBar 组件不变
- 面板整体布局不变（模态框）
