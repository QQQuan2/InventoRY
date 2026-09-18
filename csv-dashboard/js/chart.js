// ============================================================
// 图表模块：基于 Chart.js 生成柱状图 / 折线图
// 依赖：Chart.js（window.Chart，CDN）、window.App.state、window.App.csv
// ============================================================
(function () {
  window.App = window.App || {};
  let chartInstance = null; // 保存当前图表实例，重绘前需销毁

  // 按 X 轴分组、对 Y 轴求和，得到图表所需的 labels 与 values
  function aggregate(xCol, yCol) {
    const rows = window.App.state.currentView || [];
    const map = {};
    rows.forEach(function (r) {
      const x = r[xCol] == null ? '' : String(r[xCol]);
      const y = window.App.csv.isNumeric(r[yCol]) ? Number(r[yCol]) : 0;
      map[x] = (map[x] || 0) + y;
    });
    const labels = Object.keys(map);
    const values = labels.map(function (k) { return map[k]; });
    return { labels, values };
  }

  // 重建图表（读取当前下拉选择；数据使用已筛选的 currentView）
  function rebuild() {
    const st = window.App.state;
    if (!st.columns.length) return;

    const type = document.getElementById('chart-type').value;
    const x = document.getElementById('chart-x').value;
    const y = document.getElementById('chart-y').value;
    const hint = document.getElementById('chart-hint');

    if (!x || !y) {
      hint.textContent = '请选择 X 轴与 Y 轴字段。';
      return;
    }
    if (st.columnTypes[y] !== 'number') {
      hint.textContent = 'Y 轴字段需为数值列，请重新选择。';
      return;
    }

    const agg = aggregate(x, y);
    hint.textContent = '当前数据（已含筛选）：' + agg.labels.length + ' 个分组';

    // 读取主题色，让图表在深浅色下都清晰
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#333';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#ddd';

    const cfg = {
      type: type,
      data: {
        labels: agg.labels,
        datasets: [{
          label: y,
          data: agg.values,
          backgroundColor: type === 'bar' ? 'rgba(37,99,235,.6)' : 'rgba(37,99,235,.2)',
          borderColor: 'rgba(37,99,235,1)',
          borderWidth: 2,
          fill: type === 'line' // 折线图填充区域
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor } }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    };

    if (chartInstance) chartInstance.destroy(); // 销毁旧实例，避免叠加
    const ctx = document.getElementById('chart-canvas').getContext('2d');
    chartInstance = new window.Chart(ctx, cfg);
  }

  window.App.chart = { rebuild };
})();
