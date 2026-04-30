# Scheduled Prefetch Cache — 定时预取缓存系统

## 目标

将数据获取模式从"用户打开时实时拉取"改为"定时预取 + 数据库缓存 + 手动刷新"。用户打开页面时直接读 Supabase 缓存，秒开。

## 架构

```
定时任务 (Python warmup_loop)
  ↓ 每4小时
  ↓ 拉取全部板块数据
  ↓ upsert 到 Supabase twb_cache
  ↓
用户打开页面
  ↓ Next.js API route
  ↓ 查 Supabase twb_cache (expires_at > now)
  ↓ 命中 → 直接返回 (ms 级)
  ↓ 未命中 → fallback Python 后端实时拉 → 回写 Supabase
```

## 变更清单

### 1. 数据库：`twb_cache` 表

```sql
CREATE TABLE twb_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE twb_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON twb_cache FOR SELECT USING (true);
CREATE POLICY "Allow anon insert" ON twb_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON twb_cache FOR UPDATE USING (true);
```

RLS 全开（anon 可读写），与 twb_read_items 一致。

### 2. 缓存 Key 与 TTL

| 板块 | Key 模式 | TTL |
|---|---|---|
| Trending | `trending\|{geo}` | 4h |
| Queries (默认组合) | `queries\|AI,LLM,maker,generator,creator,filter\|today\|US` | 4h |
| GitHub | `github` | 4h |
| Reddit | `reddit\|{sort}` | 4h |
| HN | `hackernews` | 4h |
| TechNews | `technews` | 4h |
| ProductHunt | `ph\|{period}` | 8h |
| HuggingFace | `huggingface` | 4h |
| IndieHackers | `indiehackers` | 4h |

### 3. Python 后端：定时写入 Supabase

**文件**: `api-server/server.py`

改造现有 `_warmup_loop`（每小时执行）：

- **启动时立即执行一次**全量预取（已实现）
- **每 4 小时**执行全量预取：遍历所有板块 endpoint，拉数据，upsert 到 Supabase `twb_cache`
- 预取时跳过 LLM 摘要（避免 OpenRouter 配额消耗，与现有行为一致）
- 每次预取完成后打印日志：`[prefetch] wrote N keys to twb_cache`

新增环境变量（复用现有 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）。

新增 `/api/refresh-all` 端点：
- 手动触发全量预取
- 返回 `{ ok: true, refreshed: N }`

实现方式：
- `prefetch_all()` 函数遍历 endpoint 列表，调用现有 handler 获取数据，upsert 到 Supabase
- 使用 `httpx` (已在 server.py 使用) 调 Supabase REST API

### 4. Next.js API 路由：Supabase 缓存优先

**文件**: 所有 `app/api/*/route.ts`

每个路由改为：

```typescript
// 1. 构建 cache key
const cacheKey = `trending|${geo}`;

// 2. 查 Supabase 缓存
const { data: cached } = await supabase
  .from("twb_cache")
  .select("data")
  .eq("key", cacheKey)
  .gt("expires_at", new Date().toISOString())
  .single();

if (cached && !searchParams.has("refresh")) {
  return NextResponse.json(cached.data);
}

// 3. Fallback: 实时拉取
const res = await fetch(`${API_BASE}/api/trending?geo=${geo}`);
const json = await res.json();

// 4. 异步回写缓存
supabase.from("twb_cache").upsert({
  key: cacheKey,
  data: json,
  expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
}).then();

return NextResponse.json(json);
```

需要改的路由（9 个）：
- `app/api/trending/route.ts`
- `app/api/trends/route.ts` (只缓存默认组合)
- `app/api/reddit/route.ts`
- `app/api/hackernews/route.ts`
- `app/api/technews/route.ts`
- `app/api/producthunt/route.ts`
- `app/api/huggingface/route.ts`
- `app/api/indiehackers/route.ts`
- `app/api/github/route.ts` (如果有独立路由)

### 5. 手动刷新

前端刷新按钮/下拉刷新时，给 API 请求加 `?refresh=1` 参数。Next.js 路由检测到该参数时跳过 Supabase 缓存，走后端实时拉取 + 回写。

## 不变项

- 前端 UI 不变（各板块的展示逻辑、加载状态不变）
- Python 后端的 LLM 摘要逻辑不变
- `enrich`、`freshness`、`multi-geo`、`interest` 等按需计算的接口不缓存（依赖用户输入参数）
- `read-items`、`read-stats` 不走此缓存（已有自己的表）
