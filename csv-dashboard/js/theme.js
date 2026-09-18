// ============================================================
// 主题模块：管理深色 / 浅色模式，并把偏好写入 localStorage
// 依赖：无（仅操作 DOM 与 window.App）
// ============================================================
(function () {
  // 所有模块共享一个全局命名空间，避免污染全局作用域
  window.App = window.App || {};

  // 本地存储键名
  const STORAGE_KEY = 'csv-dashboard-theme';

  // 初始化主题：优先读取用户上次的选择，否则跟随系统配色
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    updateToggleIcon(theme);
  }

  // 把主题写入 <html data-theme>
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // 切换按钮上的图标（月亮=当前浅色可切深色；太阳=当前深色可切浅色）
  function updateToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // 切换主题并持久化；图表配色依赖主题，切换后重绘
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    updateToggleIcon(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (window.App.chart && window.App.chart.rebuild) window.App.chart.rebuild();
  }

  // 对外暴露接口
  window.App.theme = { initTheme, toggleTheme };
})();
