# Trends Watcher Board

## Project Overview
趋势看板系统，前端 Next.js + Vercel，后端 Python FastAPI（`api-server/`）。

## Credentials Location
所有 API 密钥/Token 存放于 `api-server/.env`（已 gitignore），systemd 通过 `EnvironmentFile` 加载。
- `OPENROUTER_API_KEY` — LLM 摘要用（OpenRouter 免费模型）
- `PRODUCT_HUNT_TOKEN` — Product Hunt GraphQL API
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase
- `VAPID_*` — Push Notifications

## Architecture
- `api-server/server.py` — Python FastAPI 后端，端口 8765
- `app/` — Next.js App Router 前端
- `lib/` — TypeScript 类型定义和工具函数
- `app/api/*/route.ts` — Next.js API 代理路由（转发到后端）

## Development
- 包管理器: pnpm
- 后端启动: `sudo systemctl restart pytrends-api.service`
- 后端日志: `journalctl -u pytrends-api -f`
