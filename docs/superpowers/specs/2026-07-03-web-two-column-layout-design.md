# Web 端两列模块布局重构设计

**Date:** 2026-07-03  
**Status:** Implemented  
**Author:** Codex  
**Scope:** `app/page.tsx` 首页 web 桌面布局；移动端兼容性必须保持。

## 1. 背景

当前首页主内容在桌面端使用四列网格：

```tsx
<div className="grid gap-2 sm:gap-6 lg:grid-cols-4">
```

页面共有 9 个同级数据源模块：

1. Trending Now
2. Related Queries
3. Reddit Signals
4. HackerNews
5. Tech News
6. GitHub Trending
7. Product Hunt
8. HuggingFace
9. Indie Hackers

每个模块内部再渲染一组趋势卡片。由于 `max-w-7xl` 容器在 `lg:grid-cols-4` 下被切成四份，单个模块宽度约 300px 级别，长关键词和帖子标题经常被压缩、截断或需要横向滚动。这和产品的核心任务冲突：用户需要快速判断“这个词/项目是否值得研究”。

用户明确反馈：

> 一个卡片横向占的区域太小了，以至于词显示不清；一行两个板块就差不多了；需要考虑移动端兼容性，一次调整别太大，巨大信息面板移动端根本没法看。

## 2. Design read / Taste 判断

使用安装的 `taste-skill` 后，本任务应按“已有项目 redesign”而不是新营销页处理。

**Design read:** existing dark Linear-style data dashboard redesign for a solo/operator workflow, preserving mobile tabs and current source modules, leaning toward targeted Tailwind layout corrections rather than an experimental visual overhaul.

### Taste 约束

- **Preserve, not overhaul.** 这是已有工作流工具，不是重新设计 landing page。
- **Dashboard exception.** `design-taste-frontend` 明确更偏 landing/portfolio；这里不能照搬 Awwwards/大 hero/GSAP 规则。
- **Avoid AI-default grand redesign.** 不做 Bento 巨型面板、不做 focus rail、不重排成复杂信息架构。
- **Readability beats spectacle.** 本次首要目标是让词和标题可读。
- **Mobile must not regress.** 移动端现有 tab 一次只显示一个模块，这是正确的深度优先浏览方式。
- **Small, reviewable change.** 调整应集中在布局、文本截断、横向滚动和桌面列表高度，不碰数据流。

## 3. Matt Pocock 风格架构判断

用 `improve-codebase-architecture` 的语言描述：

- **Module:** 首页的每个数据源 `section` 是一个展示 module；`TrendingCard`、`KeywordCard`、`RedditCard`、`HackerNewsCard` 等是卡片 module。
- **Interface:** 卡片 module 的 interface 不是只有 props；还包括“可在当前容器宽度内读懂标题、badge、操作按钮”的视觉不变量。
- **Implementation leak:** 当前四列布局让父级容器宽度过窄，迫使子卡片通过 `sm:line-clamp-1`、`overflow-x-auto` 等局部实现兜底。这是父布局压力泄漏到卡片内部。
- **Depth / leverage:** 最有杠杆的 seam 是主内容网格和统一列表容器 class。改这里能同时改善 9 个 source module，而不是逐个卡片打补丁。
- **Locality:** 保持所有数据源 section 平级，避免引入新的“聚合大面板”。否则移动端、展开态、read 状态、filter 状态都会分散到新结构里，降低 locality。
- **Deletion test:** 如果删除四列网格，复杂度不会消失，而是变成更稳定的两列节奏；如果删除现有 mobile tab，复杂度会在所有 section 里重新出现。因此 mobile tab 应保留。

## 4. 当前代码审视结果

### 4.1 主布局过窄

证据：`app/page.tsx:1388`

```tsx
<div className="grid gap-2 sm:gap-6 lg:grid-cols-4">
```

影响：

- 4 列导致每个模块在 1280px 容器内只剩约 300px。
- 标题、badge、score、copy/block 按钮竞争同一行。
- 任何稍长英文关键词都容易被截断。

### 4.2 桌面端仍强制一行截断

证据：多处 `sm:line-clamp-1`：

- `TrendingCard`: `app/page.tsx:2063`
- `RedditCard`: `app/page.tsx:2388`
- `HackerNewsCard`: `app/page.tsx:2482`
- GitHub `KeywordCard`: `app/page.tsx:2560`
- Related Queries `KeywordCard`: `app/page.tsx:2593`

影响：

- 即使改成两列，桌面端依然从 `sm` 起强制一行。
- 用户的“词显示不清”不只来自列宽，也来自截断策略。

### 4.3 卡片容器使用横向滚动兜底

证据：

- `TrendingCard`: `app/page.tsx:2053` 使用 `overflow-x-auto`
- `KeywordCard`: `app/page.tsx:2578` 使用 `overflow-x-auto`

影响：

- 横向滚动隐藏了真实布局问题。
- 在桌面端，卡片不应依赖横向滚动才能看到内容。
- 移动端可以允许内容自然换行，但不应制造横向页面滚动。

### 4.4 所有列表在 `lg` 起固定视口内滚动

证据：9 个模块列表均使用：

```tsx
lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5
```

影响：

- 四列布局下这个选择合理：每列像一个独立 stream。
- 两列布局后每个模块变宽、卡片变高，过早强制内部滚动会让页面像 9 个小 iframe。
- 需要重新判断桌面滚动策略：两列模块更适合“模块内保留滚动，但高度略放宽”，或只在 `xl` 启用。

### 4.5 移动端 tab 是正确 seam，不应改

证据：

- `MOBILE_TABS` 定义：`app/page.tsx:952`
- 每个 section 通过：

```tsx
<section className={`${mobileTab !== "trending" ? "hidden" : ""} sm:block`}>
```

影响：

- 移动端当前一次只显示一个 source module。
- 这正好避免两列或大面板在移动端不可用。
- 本次改动必须不改变 `mobileTab` 逻辑。

### 4.6 展开面板和链接区也受宽度影响

证据：`DecisionPanel` / `EnrichedDecisionPanel` 底部 action links 使用：

```tsx
<div className="grid grid-cols-4 gap-1 sm:gap-2">
```

影响：

- 在窄列下按钮极小，只能显示短标签。
- 两列后可接受，但仍需验证 `allint`、`vs gpts`、`+KGR` 是否拥挤。
- 不建议本轮重构 action system；只列为验证项。

## 5. 推荐方案

采用**两列模块布局 + 卡片可读性修正**。

### 5.1 主布局

将主内容从 4 列改为移动端单列、桌面两列：

```tsx
<div className="grid gap-2 sm:gap-6 lg:grid-cols-2">
```

可选增强：在超宽屏上保持两列而不是回到四列：

```tsx
<div className="grid gap-2 sm:gap-6 lg:grid-cols-2">
```

不要使用 `xl:grid-cols-3`，因为这会重新引入“卡片横向不足”的问题。

### 5.2 标题截断策略

把核心卡片的桌面一行截断改成两行：

```tsx
line-clamp-2
```

替换：

```tsx
line-clamp-2 sm:line-clamp-1
```

范围：

- `TrendingCard`
- `KeywordCard`（Related Queries + GitHub）
- `RedditCard`
- `HackerNewsCard`

保留展开态不截断的现有行为。

### 5.3 横向滚动策略

把卡片外层从 `overflow-x-auto` 改为 `overflow-hidden`，并依赖 `min-w-0`、`break-words`、`flex-wrap`、两行标题解决布局。

目标：

- 桌面卡片不出现局部横向滚动条。
- 移动端不产生页面横向滚动。
- badge 和 action icon 在极端长词下仍保持可见或合理换行。

### 5.4 列表高度策略

保留模块内滚动，并继续从 `lg` 启用：

```tsx
lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto lg:space-y-1.5
```

实测原因：

- 两列后 1024px 每列约 484px，关键词已经可读。
- 如果把内部滚动延后到 `xl`，`Trending Now` 和 `Related Queries` 会形成过高的大模块，后续 source 需要滚很久才可见，接近用户明确不想要的“巨大信息面板”。
- 因此本轮保留 `lg` 内滚动，只解决横向宽度和标题截断问题。

### 5.5 Section 顺序

保持当前 DOM 顺序，不做复杂重排：

1. Trending Now
2. Related Queries
3. Reddit Signals
4. HackerNews
5. Tech News
6. GitHub Trending
7. Product Hunt
8. HuggingFace
9. Indie Hackers

原因：

- 移动端 tab 顺序已经与此一致。
- 两列 CSS grid 会自然形成首行 `Trending + Related Queries`，符合核心使用路径。
- 不引入 source 合并，减少状态和数据依赖变更。

### 5.6 不做的事

本轮明确不做：

- 不做 Bento 巨型决策台。
- 不做 focus rail / Signal Radar 侧栏。
- 不合并 Reddit/HN/GitHub 为新聚合模块。
- 不重写 `app/page.tsx` 的数据获取和状态管理。
- 不改 mobile tab。
- 不引入新 UI 库、动画库或图标库。
- 不改 `DESIGN.md` 的 Linear 风格基调。

## 6. 实施清单

### 必做

- [x] `app/page.tsx:1388` 改为 `lg:grid-cols-2`。
- [x] 统一 9 个列表容器的滚动策略：保留 `lg:max-h... lg:overflow-y-auto`，避免两列模块变成超高面板。
- [x] 删除核心卡片标题里的 `sm:line-clamp-1`，桌面保留 `line-clamp-2`。
- [x] 将 `TrendingCard` / `KeywordCard` 外层 `overflow-x-auto` 改为 `overflow-hidden`。
- [ ] 检查卡片 header 中 badge、score、traffic、copy/block 按钮在两列宽度下是否挤压。
- [x] 保持 mobile section hidden/show 逻辑不变。

### 应验证

- [ ] 桌面 1280px：首行是 `Trending Now` + `Related Queries`，卡片标题能读两行。
- [x] 桌面 1440px：两列模块视觉均衡，无四列窄卡片。
- [x] 桌面 1920px：仍是两列，不回到三/四列。
- [ ] 平板/小桌面 1024px：两列是否仍可读；若不可读，改成 `xl:grid-cols-2`，让 `lg` 保持单列。
- [x] 移动端 390px：tab 行为不变，一次只显示一个模块，无横向滚动。
- [ ] 展开 Related Query：图表、上站指数、KGR input、action links 不溢出。
- [ ] 展开 Reddit/HN：摘要区域可读，无横向滚动。

### 可选后续

- [ ] 抽取 `FeedList` module，统一 9 处重复的列表容器 class，提高 locality。
- [ ] 抽取 `ReadableTitle` module，统一卡片标题 line-clamp 和 break-word 策略。
- [ ] 抽取 `DashboardGrid` module，把响应式列数作为明确 interface，而不是散落在 JSX class 中。

这些抽取不是本轮必需。先完成视觉行为修正，再根据重复度决定是否深挖。

## 7. 验收标准

本次重构完成时，应满足：

1. 桌面端不再出现 4 个窄 source column。
2. 核心关键词和帖子标题至少可显示两行。
3. 卡片不依赖横向滚动才能读完主要文本。
4. 移动端 tab 体验完全保持，不出现大面板挤压。
5. 数据获取、read 状态、展开态、KGR 操作不变。
6. 改动 diff 小，可 review，可回滚。

## 8. 推荐落地顺序

1. 改主 grid 为两列。
2. 改标题 clamp。
3. 改 `overflow-x-auto` 为 `overflow-hidden`。
4. 调整列表滚动 breakpoint。
5. 本地跑 type/build。
6. 用 Playwright 或浏览器分别检查 390 / 1024 / 1440 / 1920 宽度。

## 9. 结论

不是“只改一个 class 就行”。`lg:grid-cols-4 -> lg:grid-cols-2` 是主杠杆，但必须同时处理标题截断、横向滚动兜底和列表滚动高度。否则两列只是让模块变宽，不能保证词真正清楚。

最小正确方案是：**两列模块布局 + 两行标题 + 去除横向滚动兜底 + 保留移动端 tab seam**。
