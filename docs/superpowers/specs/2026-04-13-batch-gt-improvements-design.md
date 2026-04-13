# Batch GT 页面优化设计

日期: 2026-04-13

## 需求概述

对批量 GT 浏览器页面 (`/batch-gt`) 做三项改进：

1. **GT 对比日期范围改为 7 天**
2. **移动端适配**
3. **筛选功能** — 按未查看时间筛选关键词

## 1. GT 对比日期范围

当前 `generateGTCompareUrl` 默认 timeframe 为 `"today 1-m"`（1个月）。

**改动**: 在 `app/batch-gt/page.tsx` 调用处传入 `"today 7-d"`，不修改函数默认值。主站页面保持 1-m 不变。

```tsx
// app/batch-gt/page.tsx
href={generateGTCompareUrl(kw.keyword, "today 7-d")}
```

## 2. 移动端适配

当前页面在大屏显示正常，移动端需要以下调整：

- **Header**: 标题用响应式字号，快捷键提示在移动端隐藏（`hidden sm:inline`）
- **导入区**: textarea 全宽，按钮在窄屏下堆叠（`flex-col sm:flex-row`）
- **关键词卡片**: 内边距 `p-3 sm:p-4`，文字大小响应式
- **Filter chips**: 横向可滚动（`overflow-x-auto`，`flex-nowrap`）

## 3. Filter Chips 筛选

在关键词列表上方添加一排 filter chips，用于按未查看时间筛选：

```
全部 (50) | 3天未看 (32) | 7天未看 (18) | 30天未看 (5)
```

### 筛选逻辑

| Chip | 条件 |
|------|------|
| 全部 | 显示所有关键词 |
| 3天未看 | `latest_view` 为空或超过 3 天 |
| 7天未看 | `latest_view` 为空或超过 7 天 |
| 30天未看 | `latest_view` 为空或超过 30 天 |

### 交互

- 每个 chip 括号内显示匹配数量
- 点击切换，高亮当前选中的 chip
- 默认选中「全部」
- 客户端过滤，数据从 Supabase 一次性加载后本地计算

### 状态

新增 `activeFilter` state：`"all" | "3d" | "7d" | "30d"`

### 视觉

- Chip 样式：圆角胶囊形，选中态用蓝色背景，未选中用灰色背景
- 移动端横向滚动，桌面端一行展示

## 涉及文件

- `app/batch-gt/page.tsx` — 主要改动文件
- `lib/types.ts` — 无需改动（函数已支持 timeframe 参数）
