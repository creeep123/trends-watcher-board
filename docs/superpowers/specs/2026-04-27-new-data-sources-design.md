# 新增数据源：Product Hunt / HuggingFace / Indie Hackers

**Date:** 2026-04-27
**Status:** Draft
**Author:** Claude (via HAPI)

## Overview

在现有趋势看板中新增三个数据源板块：Product Hunt、HuggingFace、Indie Hackers。三个板块与现有板块（Reddit、HN、TechNews）平级，在首页 tab 导航中并列展示。每个条目支持可展开的 AI 摘要（2-3 句描述 + 关键标签），先在新板块试验此模式，验证效果好后推广到其他板块。

## Decisions Summary

| 维度 | 决策 |
|------|------|
| 展示模式 | 列表 + 可展开 AI 摘要（试验性质） |
| 数据获取 | 全部走 Python 后端（`api-server/server.py`） |
| 更新频率 | PH 每日快照；HF / IH 复用现有按需 + TTL 缓存 |
| 页面位置 | 首页 tab 导航中与现有板块平级 |
| AI 摘要 | 2-3 句描述 + 关键标签，用 OpenRouter 免费模型（`z-ai/glm-4.5-air:free`） |
| 数据源策略 | 有官方 API 的用 API（PH、HF），有第三方搜索 API 的用 API（IH） |

## Data Source Details

### 1. Product Hunt — GraphQL API

- **API**: Product Hunt GraphQL API v2（免费，需 Developer Token）
- **环境变量**: `PRODUCT_HUNT_TOKEN`（添加到 `server.py` 顶部现有环境变量区域）
- **端点**: `https://api.producthunt.com/v2/api/graphql`
- **数据**: 每日新品（Today's Products），包含名称、tagline、投票数、评论数、缩略图、产品链接、话题标签
- **TTL**: 6 小时（每日数据变化缓慢，6h 足够覆盖时区差异）
- **缓存 key**: `producthunt|today`
- **默认请求**: 当天 top 20 产品，按 votes 降序

**GraphQL Query:**
```graphql
query {
  posts(order: VOTES, first: 20) {
    edges {
      node {
        name
        tagline
        votesCount
        commentsCount
        websiteUrl
        thumbnail {
          url
        }
        topics {
          edges {
            node {
              name
            }
          }
        }
        createdAt
      }
    }
  }
}
```

### 2. HuggingFace — 公开 REST API

- **API**: `https://huggingface.co/api/models`（无需认证，完全免费）
- **数据**: 最近活跃/高下载量模型，包含模型 ID、下载量、点赞数、标签、任务类型、创建时间
- **TTL**: 30 分钟（复用现有高频缓存策略）
- **缓存 key**: `huggingface|trending`
- **默认请求**: 取 top 20

**请求示例:**
```
GET https://huggingface.co/api/models?sort=downloads&limit=20
```

> **注意**: HF API 不支持 `sort=trending`（返回 400），也不支持 `full=true`。使用 `sort=downloads` 作为热门模型排序依据。

**实际 API 返回字段**: `_id`, `createdAt`, `downloads`, `id`, `library_name`, `likes`, `modelId`, `pipeline_tag`, `private`, `tags`
- `author` 需从 `id` 中解析（如 `"meta-llama/Llama-3-8B"` → author = `"meta-llama"`）
- `url` 需拼接 `https://huggingface.co/{id}`

### 3. Indie Hackers — Algolia Search API

- **无官方 API**，Indie Hackers 是 Ember.js SPA，页面内容由 JS 动态渲染，`requests` 无法直接爬取
- **RSS feed** (`/feed`) 返回的是 HTML 而非 RSS XML，不可用
- **方案**: 使用 IH 前端内嵌的 Algolia Search API（公开搜索 key，无需认证）：
  - **App ID**: `N86T1R3OWZ`
  - **Search-only API Key**: `5140dac5e87f47346abbda1a34ee70c3`
  - **Index**: `Post_production`（帖子）、`Product_production`（产品）
- **端点**: `https://{app_id}-dsn.algolia.net/1/indexes/{index}/search`
- **数据**:
  - 帖子：标题、链接、投票数、评论数、作者、分组名称
  - 产品：名称、描述、收入数据（MRR）、产品链接、投票数
- **TTL**: 1 小时（社区内容更新频率中等）
- **缓存 key**: `indiehackers|latest`

## AI 摘要（新功能）

### 通用 LLM 摘要函数

在 `server.py` 中新增一个通用批量摘要函数，供三个新数据源共用：

```python
def _generate_batch_summaries(item_type: str, items: list[dict]) -> list[dict]:
    """Generate 2-3 sentence AI summaries with key tags for a batch of items.

    Returns a list of dicts with 'summary', 'tags', 'relevance' keys,
    aligned with the input items list by index.
    """
```

**Prompt 模板（按数据源定制）:**

- **Product Hunt**: 基于产品名称 + tagline + 话题标签，生成产品定位描述
- **HuggingFace**: 基于模型名 + 任务类型 + 标签，生成模型用途描述
- **Indie Hackers**: 基于帖子标题 + 投票数，或产品名 + 收入数据，生成摘要

**返回结构（每条）:**
```json
{
  "summary": "2-3 句话的产品/模型/帖子描述",
  "tags": ["标签1", "标签2", "标签3"],
  "relevance": "high/medium/low"
}
```

**实现要点:**
- 一次 LLM 调用处理一批（5-10 条），降低 API 调用次数
- 复用现有 OpenRouter 调用模式（`requests.post`、`LLM_MODEL`、JSON 提取）
- 摘要结果随数据一起缓存在服务端，不重复生成
- LLM 调用失败时静默降级，返回空列表，前端不展示摘要区域

## Architecture

### Backend Changes (`api-server/server.py`)

**新增缓存 TTL**（在现有 `CACHE_TTL_MAP` 中追加）:
```python
CACHE_TTL_MAP = {
    ...existing,
    "producthunt": 21600,  # 6h — daily product data
    "huggingface": 1800,   # 30min — trending models
    "indiehackers": 3600,  # 1h — community posts
}
```

**新增环境变量**（在 `server.py` 顶部现有环境变量区域）:
```bash
PRODUCT_HUNT_TOKEN=your_developer_token
```

**新增 API 端点:**
- `GET /api/producthunt` → 今日 Top 20 产品 + AI 摘要
- `GET /api/huggingface` → 热门 Top 20 模型 + AI 摘要
- `GET /api/indiehackers` → 热门帖子 + 产品展示 + AI 摘要

**响应格式:**

```typescript
// Product Hunt
interface ProductHuntResponse {
  products: ProductHuntProduct[];
  timestamp: string; // UTC ISO format
}

interface ProductHuntProduct {
  name: string;
  tagline: string;
  votesCount: number;
  commentsCount: number;
  url: string;
  thumbnail: string;
  topics: string[];
  createdAt: string;
  // AI 摘要（可选，LLM 失败时不包含）
  summary?: string;
  tags?: string[];
}

// HuggingFace
interface HuggingFaceResponse {
  models: HuggingFaceModel[];
  timestamp: string;
}

interface HuggingFaceModel {
  modelId: string;      // 从 API 的 id 字段获取 (如 "meta-llama/Llama-3-8B")
  author: string;       // 从 id 中 "/" 前的部分解析
  downloads: number;
  likes: number;
  tags: string[];       // API 原始 tags
  pipelineTag: string;  // camelCase，与 API 字段一致
  createdAt: string;    // API 原始字段
  url: string;          // 拼接: https://huggingface.co/{id}
  // AI 摘要（可选）
  summary?: string;
  aiTags?: string[];
}

// Indie Hackers
interface IndieHackersResponse {
  posts: IndieHackersPost[];
  timestamp: string;
}

interface IndieHackersPost {
  title: string;
  url: string;
  votes: number;
  comments: number;
  author: string;
  groupName: string;
  type: "post" | "product";
  revenue?: string;
  // AI 摘要（可选）
  summary?: string;
  tags?: string[];
}
```

### Frontend Changes

**新增 TypeScript 类型** (`lib/types.ts`):
- `ProductHuntProduct`, `ProductHuntResponse`
- `HuggingFaceModel`, `HuggingFaceResponse`
- `IndieHackersPost`, `IndieHackersResponse`

**新增 Next.js API 代理** (`app/api/*/route.ts`):
- `app/api/producthunt/route.ts` — 代理到 Python 后端，复用 `lib/cache.ts` 的 30min 前端缓存
- `app/api/huggingface/route.ts` — 同上
- `app/api/indiehackers/route.ts` — 同上

> **注意**: 前端 `lib/cache.ts` 的 TTL 硬编码为 30 分钟。对于 PH（后端 6h TTL），前端缓存会在 30min 后重新请求后端，后端返回缓存数据，不影响效果但会多一次网络请求。此问题暂不处理，后续可考虑按路由配置前端 TTL。

**页面改造** (`app/page.tsx`):

1. **扩展 MobileTab 类型**:
```typescript
type MobileTab = "trending" | "queries" | "github" | "reddit" | "hn" | "technews" | "ph" | "hf" | "ih";
```

2. **扩展 MOBILE_TABS 导航**（3 个新 tab 追加在末尾）:
```typescript
{ key: "ph", label: "PH", icon: "🚀" },
{ key: "hf", label: "HF", icon: "🤗" },
{ key: "ih", label: "IH", icon: "🏪" },
```

> **移动端适配**: 从 6 个 tab 增加到 9 个，改为水平可滑动 tab bar（`overflow-x-auto` + `no-scrollbar`），tab 不再均分宽度，改为 `flex-shrink-0` 固定宽度

3. **新增三个 section**，每个 section 包含:
   - `SectionHeader`（标题 + 图标 + 数量 badge）
   - 卡片列表（新卡片组件：`ProductHuntCard`、`HuggingFaceCard`、`IndieHackersCard`）
   - **可展开 AI 摘要面板**（试验性功能）— 点击卡片展开摘要区域

4. **可展开摘要组件**（新组件 `ExpandableSummary`）:
   - 默认折叠状态：显示标题 + 基本信息行
   - 展开状态：追加显示 AI 摘要（2-3 句）+ 标签 chips
   - 展开时触发 `markAsRead("ph"|"hf"|"ih", itemUrl)`
   - 摘要数据已在后端生成并随列表返回，无需前端额外请求

## Implementation Order

1. **Phase 1 — Backend**: Python 后端三个 API 端点 + 通用批量摘要函数
2. **Phase 2 — Proxy**: Next.js API 代理路由（三个 `/api/*` 路由）
3. **Phase 3 — Types**: TypeScript 类型定义（`lib/types.ts`）
4. **Phase 4 — UI**: 首页 tab 扩展 + 三个 section + 卡片组件 + 可展开摘要
5. **Phase 5 — Polish**: 错误处理、空状态、加载态、9-tab 移动端适配

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|---------|
| PH API Token 未就绪 | 代码中 Token 为空时返回空数据 + 友好提示，不阻塞其他两个源 |
| IH Algolia key 失效 | IH Algolia search-only key 是公开的，失效风险低；失败时返回空数据 |
| HF API 参数变更 | API 简单稳定，参数少；失败时返回空数据 |
| LLM 摘要调用失败/超时 | 静默降级，不展示摘要区域，不影响列表展示 |
| 9 个 tab 移动端拥挤 | 改为水平可滑动 tab bar（`overflow-x-auto` + `flex-shrink-0`） |
