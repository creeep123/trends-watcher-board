# 移动端体验优化设计文档

**日期**: 2026-03-21
**方案**: 渐进式优化 (方案 A)
**目标**: 改善移动端内容卡片区域的用户体验

## 概述

优化移动端 (≤640px) 内容卡片区域的布局、交互和滚动体验。

## 改动范围

- **文件**: `app/page.tsx`, `app/globals.css`
- **代码量**: ~150 行
- **影响**: 仅移动端，桌面端不受影响

## 具体改进

### 1. 卡片布局优化

#### 卡片间距和内边距
- 列表间距: `space-y-1.5` → `gap-y-4`
- 卡片内边距: `p-3` → `p-4`
- Rank 徽章: `h-5 w-5` → `h-6 w-6`

#### 触摸目标
- 所有按钮添加 `min-h-[44px]`
- 可点击区域确保 ≥44x44px

### 2. 展开面板优化 (EnrichedDecisionPanel)

#### 垂直间距
- 面板内边距: `px-3 py-2.5` → `px-4 py-3 sm:px-3 sm:py-2.5`
- 元素间距: `gap-2` → `gap-3 sm:gap-2`

#### 图表优化
- 高度: `h-14` → `h-20 sm:h-14`

#### 链接按钮
- 移动端改为全宽堆叠: `flex-col`
- 按钮高度: `py-1.5` → `py-2.5`
- 字体: `text-xs` → `text-sm`

#### 供给量输入
- 输入框高度: `py-1` → `py-2.5`
- 字体: `text-xs` → `text-base`

### 3. 滚动体验优化

#### 回到顶部按钮
- 显示条件: `window.scrollY > 300`
- 位置: 右下角固定 `bottom-6 right-4`
- 样式: 圆形，带阴影
- 图标: ↑ 箭头

#### 内容区域
- 最大高度调整: `calc(100vh-280px)` → `calc(100vh-240px)`

### 4. 新增组件

#### ScrollToTopButton 组件
- 固定位置浮动按钮
- 平滑滚动到顶部
- 淡入淡出动画

## 技术实现

### 新增 CSS (globals.css)
```css
/* 回到顶部按钮动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.scrollToTop-fade {
  animation: fadeIn 0.2s ease-out;
}
```

### 新增组件 (page.tsx)
```tsx
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg scrollToTop-fade"
      style={{
        background: 'var(--accent-blue)',
        color: '#fff',
        '@media (max-width: 640px)': {
          bottom: '80px', // 避开 tab bar
        }
      }}
      aria-label="回到顶部"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
      </svg>
    </button>
  );
}
```

## 测试要点

- [ ] 移动端卡片间距增加
- [ ] 展开面板更清晰
- [ ] 所有按钮触摸目标 ≥44px
- [ ] 回到顶部按钮正常工作
- [ ] 桌面端不受影响
