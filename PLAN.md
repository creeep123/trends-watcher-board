# P0: 上站评分系统（Score + 新鲜度 + 多国 + 手动竞争度）

## 目标
在 Related Queries 的 DecisionPanel（展开面板）中，新增一个"上站评估区"，让用户一眼判断一个词值不值得冲。

## 核心设计

### 评估区 UI（在 DecisionPanel 中，趋势图下方、跳转链接上方）

```
┌─────────────────────────────────────────────┐
│ 📐 上站评估                                  │
│                                             │
│  新鲜度  ████████░░  82    ← 自动算         │
│  多国    ████████░░  4/6   ← 自动查         │
│  供给量  [______] 填入 allintitle 结果数     │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ KGR = 0.018  ✅ 可冲！              │    │
│  │ (热度 82 / 供给 4500)                │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  💡 怎么查供给量？                           │
│  Google 搜 allintitle:"关键词"              │
│  看"约 X 条结果"那个数字，填到上面           │
│  [一键复制搜索词] [打开 Google 查]           │
│                                             │
│  KGR < 0.25 → ✅ 可冲                       │
│  KGR 0.25~1 → ⚠️ 有竞争                    │
│  KGR > 1    → ❌ 太卷                       │
└─────────────────────────────────────────────┘
```

### 三个维度的数据来源

#### 1. 新鲜度（Freshness Score, 0-100）— 自动
- **后端新增** `/api/freshness?keyword=xxx&geo=xxx`
- 用 pytrends 拉两段 interest_over_time：
  - `now 1-d`（过去 24h）的均值 → recent
  - `today 1-m`（过去 30d）的均值 → baseline
- `freshness = min(100, round(recent / max(baseline, 1) * 50))`
- baseline 接近 0 说明以前没人搜 → 极新 → 高分
- 已有较高 baseline 的老词 → 低分
- **缓存 30 分钟**

#### 2. 多国验证（Multi-Geo）— 自动
- **已有** `/api/multi-geo` 端点，返回 `found_in` 数组
- 前端展开时自动调用，显示 "4/6 国在涨"
- 标签着色：≥3 绿色，1-2 黄色，0 灰色

#### 3. 供给量 / KGR（手动输入）
- 前端 input 框，用户填入 allintitle 结果数
- **存储在 localStorage**：`kgr_data::{keyword}` → `{supply: number, timestamp: string}`
- KGR 计算：`interest_value / supply`（interest 用 7d 趋势图的 peak 值）
- 状态用 localStorage 跨会话持久化，刷新不丢

### 指引文案（写死在前端）
关键是让你每次看到都记得怎么操作：

```
💡 怎么查供给量？
1. Google 搜索 allintitle:"关键词"
2. 看搜索结果页顶部 "约 X,XXX 条结果"
3. 把这个数字填到上面的输入框

KGR = 搜索热度 / 页面供给量
• < 0.25 → ✅ 低竞争，值得冲
• 0.25~1 → ⚠️ 有竞争，谨慎评估
• > 1    → ❌ 供给过剩，不建议
```

## 改动范围

### 后端 `api-server/server.py`
1. 新增 `GET /api/freshness?keyword=xxx&geo=xxx`
   - 拉 1d + 30d interest 数据，算新鲜度分
   - 缓存 30 分钟

### 前端类型 `lib/types.ts`
1. 新增 `FreshnessData` 接口
2. 新增 `MultiGeoData` 接口

### 前端代理 `app/api/`
1. 新增 `app/api/freshness/route.ts` — 代理到后端
2. 新增 `app/api/multi-geo/route.ts` — 代理到后端

### 前端页面 `app/page.tsx`
1. `DecisionPanel` 组件重构：趋势图下方新增"上站评估区"
   - 自动 fetch freshness + multi-geo
   - allintitle 手动输入框 + localStorage 持久化
   - KGR 计算 + 颜色状态显示
   - 指引文案区（可折叠）
   - allintitle 一键复制 + 一键打开 Google 搜索按钮
2. 排序增强：`sortBySignal` 纳入 freshness 分数

## 不做什么
- 不自动抓 Google 搜索结果（反爬风险）
- 不改 Trending Now 列 — 只改 Related Queries 的展开面板
- 不做后端持久化数据库 — localStorage 够用
