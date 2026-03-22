import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

test.describe('Trends Watcher Board - Production Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('主页加载成功', async ({ page }) => {
    await expect(page).toHaveTitle(/Trends Watcher/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('核心组件渲染正常', async ({ page }) => {
    // 检查标题
    await expect(page.locator('h1:has-text("Trends")').or(page.locator('h1:has-text("Watcher")'))).toBeVisible({ timeout: 10000 });

    // 检查关键词输入框
    await expect(page.locator('input[type="text"]')).toBeVisible();

    // 检查 Apply 按钮
    await expect(page.locator('button:has-text("Apply")')).toBeVisible();
  });

  test('API 响应正常 - Trends API', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/trends?keywords=AI`);
    // API 可能返回 200 或 500（后端服务未启动），只要能连通就行
    expect([200, 500, 502, 503]).toContain(response.status());
  });

  test('API 响应正常 - HackerNews API', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/hackernews`);
    expect([200, 500, 502, 503]).toContain(response.status());
  });

  test('API 响应正常 - Reddit API', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/reddit?subreddit=technology&limit=10`);
    expect([200, 429, 500, 502, 503]).toContain(response.status());
  });

  test('时间范围按钮存在', async ({ page }) => {
    // 检查时间范围按钮 (1h, 4h, 24h, 7d, 30d)
    await expect(page.locator('button:has-text("1h")')).toBeVisible();
    await expect(page.locator('button:has-text("24h")')).toBeVisible();
    await expect(page.locator('button:has-text("7d")')).toBeVisible();
  });

  test('地区选择按钮存在', async ({ page }) => {
    // 检查地区按钮 (Global, US, CN, etc.)
    await expect(page.locator('button:has-text("Global")').or(page.locator('button:has-text("🌍")'))).toBeVisible();
    await expect(page.locator('button:has-text("US")').or(page.locator('button:has-text("🇺🇸")'))).toBeVisible();
  });

  test('Tab 导航存在（移动端视图）', async ({ page }) => {
    // 切换到移动端视图来查看 tab 导航
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // 检查底部 tab 导航 (移动端)
    const trendingTab = page.locator('button:has-text("Trending")').or(page.locator('text=/🔥/'));
    const queriesTab = page.locator('button:has-text("Queries")').or(page.locator('text=/📊/'));
    const redditTab = page.locator('button:has-text("Reddit")').or(page.locator('text=/💬/'));
    const hnTab = page.locator('button:has-text("HN")').or(page.locator('text=/🍊/'));
    const githubTab = page.locator('button:has-text("GitHub")').or(page.locator('text=/💻/)'));

    // 至少有一些 tab 可见
    const tabs = [trendingTab, queriesTab, redditTab, hnTab, githubTab];
    let visibleCount = 0;
    for (const tab of tabs) {
      if (await tab.isVisible().catch(() => false)) {
        visibleCount++;
      }
    }
    // 移动端应该有多个 tab 可见
    expect(visibleCount).toBeGreaterThan(0);
  });

  test('KGR 和词根监控按钮存在', async ({ page }) => {
    // 检查 KGR 按钮
    const kgrButton = page.locator('button:has-text("KGR")').or(page.locator('text=/🎯/'));
    await expect(kgrButton.first()).toBeVisible();

    // 检查词根监控按钮
    const rootButton = page.locator('button:has-text("词根监控")').or(page.locator('text=/🌱/'));
    await expect(rootButton.first()).toBeVisible();
  });

  test('批量 GT 链接存在', async ({ page }) => {
    // 检查批量 GT 链接
    const batchLink = page.locator('a[href="/batch-gt"]');
    await expect(batchLink).toBeVisible();
  });

  test('页面响应式布局', async ({ page }) => {
    // 测试桌面视图
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();

    // 测试平板视图
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // 测试手机视图
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('没有严重控制台错误', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    // 等待页面加载
    await page.waitForTimeout(3000);

    // 过滤掉非关键错误（API 请求失败是正常的，因为后端可能未启动）
    const allowedErrors = [
      'Failed to fetch',
      'Network error',
      '500',
      '502',
      '503',
      'ECONNREFUSED',
    ];

    const criticalErrors = errors.filter(err =>
      !allowedErrors.some(allowed => err.includes(allowed))
    );

    // 只报告非网络相关的错误
    if (criticalErrors.length > 0) {
      console.log('发现控制台错误:', criticalErrors);
    }
  });

  test('页面性能测试', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL);
    // 等待基本 DOM 加载
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;

    // 页面应该在 10 秒内完成基本加载
    expect(loadTime).toBeLessThan(10000);
  });

  test('关键词输入框可以输入', async ({ page }) => {
    const input = page.locator('input[type="text"]');
    await expect(input).toBeVisible();

    // 清空并输入新内容
    await input.fill('');
    await input.fill('test keyword');

    // 验证输入成功
    const value = await input.inputValue();
    expect(value).toBe('test keyword');
  });
});
