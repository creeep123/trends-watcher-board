# 异步数据获取架构优化设计

**日期:** 2026-03-22
**状态:** 设计阶段
**作者:** Claude + Happy

## 问题概述

### 当前问题

1. **板块间数据获取可能互相影响**
   - FastAPI 运行 2 个 sync workers
   - Reddit 请求耗时 ~2 秒（8个子版块 × 0.2s 延迟）
   - 当 Reddit 请求占用 worker 时，其他板块请求排队等待

2. **Twitter 数据源不稳定**
   - 当前使用 twitrss.me RSS 服务
   - 频繁返回 521 错误（服务过载）
   - 导致 Twitter 板块经常显示空数据

### 目标

1. 各板块数据获取完全独立，互不影响
2. 提高整体数据获取性能
3. Twitter 数据源更可靠

## 架构设计

### 1. 后端异步化

**变更前：**
```python
from fastapi import FastAPI
import requests

app = FastAPI()

@app.get("/api/reddit")
def get_reddit():
    posts = []
    for sub in REDDIT_SUB_NAMES[:8]:
        p = _fetch_subreddit_rss(sub)  # 同步阻塞
        posts.extend(p)
        time.sleep(0.2)
    return {"posts": posts}
```

**变更后：**
```python
from fastapi import FastAPI
import aiohttp
import asyncio

app = FastAPI()

async def _fetch_subreddit_rss_async(session: aiohttp.ClientSession, sub: str):
    url = f"https://www.reddit.com/r/{sub}/hot/.rss?limit=15"
    async with session.get(url, timeout=10) as resp:
        xml = await resp.text()
        # 解析 RSS...

@app.get("/api/reddit")
async def get_reddit():
    async with aiohttp.ClientSession() as session:
        tasks = [_fetch_subreddit_rss_async(session, sub) for sub in REDDIT_SUB_NAMES[:8]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        posts = [p for r in results if r for p in r]
    return {"posts": posts}
```

**关键变更：**
- `def` → `async def`
- `requests` → `aiohttp`
- 串行请求 → 并行请求 (`asyncio.gather`)
- workers: 2 → 6

**预期收益：**
- Reddit 请求时间: 2s → ~0.5s（并行）
- Worker 不再阻塞，其他板块可并行处理

### 2. Twitter 数据源迁移

**当前：** twitrss.me（单点，不稳定）

**新方案：** Nitter 公共实例池

```python
NITTER_INSTANCES = [
    "nitter.net",
    "nitter.poast.org",
    "nitter.privacydev.net",
    "nitter.mint.lgbt",
    "nitter.1d4.us",
]

async def fetch_twitter_nitter(username: str):
    """轮询 Nitter 实例获取 Twitter 数据"""
    for instance in NITTER_INSTANCES:
        try:
            url = f"https://{instance}/{username}/rss"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=5) as resp:
                    if resp.status == 200:
                        xml = await resp.text()
                        return parse_nitter_rss(xml)
        except Exception:
            continue
    return None
```

**Nitter 优势：**
- 开源项目，多个公共实例
- 无需 API key
- 提供 RSS/JSON 接口
- 实例故障时可切换

### 3. 错误处理与降级

**分级降级策略：**

```
┌─────────────────┐
│  1. 尝试主数据源  │
└────────┬────────┘
         │ 失败
         ▼
┌─────────────────┐
│  2. 尝试备用实例  │  ← Nitter: 轮询其他实例
└────────┬────────┘
         │ 仍失败
         ▼
┌─────────────────┐
│ 3. 返回缓存数据  │  ← 标记 _stale: true
└────────┬────────┘
         │ 无缓存
         ▼
┌─────────────────┐
│ 4. 返回空数据    │  + error message
└─────────────────┘
```

**各板块独立处理：**
- Reddit 失败 → 不影响 HN
- Twitter 失败 → 不影响 Reddit
- 每个板块有自己的重试和降级逻辑

### 4. 部署配置

**systemd 服务更新：**
```ini
[Unit]
Description=PyTrends FastAPI Server (Async)

[Service]
WorkingDirectory=/root/claude_workspace/trends-watcher-board/api-server
ExecStart=/root/claude_workspace/trends-watcher-board/api-server/venv/bin/python -m uvicorn server:app \
    --host 127.0.0.1 \
    --port 8765 \
    --workers 6 \
    --loop uvloop  # 高性能事件循环

Restart=always
```

**依赖更新：**
```bash
pip install aiohttp uvloop
```

## 文件变更清单

### 后端
- `api-server/server.py`
  - 所有 API 端点改为 async def
  - requests → aiohttp
  - Twitter: twitrss.me → Nitter 实例池
  - Reddit: 串行 → 并行请求

### 前端
- `app/page.tsx`
  - 无需大改（已经独立）
  - 可选：添加 stale 数据提示

### 依赖
- `api-server/requirements.txt`
  - 添加: aiohttp, uvloop
  - 移除: requests（可选保留兼容）

## 实施步骤

1. **安装异步依赖**
   ```bash
   cd /root/claude_workspace/trends-watcher-board/api-server
   source venv/bin/activate
   pip install aiohttp uvloop
   ```

2. **重构 Reddit 端点为异步**
   - 创建 `_fetch_subreddit_rss_async`
   - 使用 `asyncio.gather` 并行请求
   - 测试单个端点

3. **重构 HN 端点为异步**
   - 同样模式

4. **重构 Twitter 端点**
   - 实现 Nitter 实例池
   - 轮询逻辑
   - 测试各实例可用性

5. **更新 systemd 配置**
   - workers: 2 → 6
   - 添加 uvloop

6. **测试部署**
   - 本地测试各端点
   - 并发测试
   - 部署到生产环境

7. **前端更新（可选）**
   - 添加 stale 数据提示
   - 优化错误显示

## 测试计划

### 单元测试
- 异步请求函数
- Nitter 轮询逻辑
- 错误处理

### 集成测试
- 各 API 端点响应时间
- 并发请求处理能力
- 单个失败不影响其他

### 性能测试
```bash
# 并发测试
ab -n 100 -c 10 https://api.example.com/api/reddit
ab -n 100 -c 10 https://api.example.com/api/twitter
```

**预期指标：**
- Reddit: < 1s
- Twitter: < 1s
- HN: < 0.5s
- 并发 10 个请求: 全部成功

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Nitter 实例全部不可用 | Twitter 板块不可用 | 保留 twitrss.me 作为最后备用 |
| 异步重构引入 bug | 部分功能失效 | 充分测试，渐进式迁移 |
| uvloop 兼容性问题 | 服务启动失败 | 可选依赖，失败时回退默认 loop |
| Vercel 超时 | 前端仍 504 | 后端超时 < 5s 即可 |

## 后续优化

1. **连接池优化**
   - aiohttp ClientSession 复用
   - 限制最大连接数

2. **缓存策略优化**
   - Redis 替代内存缓存（多进程共享）
   - 缓存预热

3. **监控**
   - 请求耗时统计
   - 错误率监控
   - Nitter 实例健康检查

## 参考资料

- [FastAPI Async](https://fastapi.tiangolo.com/async/)
- [aiohttp Documentation](https://docs.aiohttp.org/)
- [Nitter Project](https://github.com/zedeus/nitter)
- [uvloop](https://github.com/MagicStack/uvloop)
