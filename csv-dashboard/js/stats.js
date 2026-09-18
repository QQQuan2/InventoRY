// ============================================================
// 统计模块：对选中的数值列计算 均值 / 最大值 / 最小值 / 样本数量
// 依赖：window.App.state、window.App.csv
// ============================================================
(function () {
  window.App = window.App || {};

  // 计算单列统计，返回 { count, mean, max, min }
  function compute(column) {
    const data = window.App.state.rawData;
    const nums = [];
    data.forEach(function (row) {
      const v = row[column];
      if (window.App.csv.isNumeric(v)) nums.push(Number(v));
    });
    if (!nums.length) {
      return { count: 0, mean: null, max: null, min: null };
    }
    let sum = 0, max = -Infinity, min = Infinity;
    nums.forEach(function (n) {
      sum += n;
      if (n > max) max = n;
      if (n < min) min = n;
    });
    return { count: nums.length, mean: sum / nums.length, max: max, min: min };
  }

  // 渲染统计卡片到 #stats-cards
  function render(column) {
    const box = document.getElementById('stats-cards');
    if (!column) {
      box.innerHTML = '<p class="hint">请选择一列查看统计。</p>';
      return;
    }
    const s = compute(column);
    // 数值统一保留两位小数的易读格式；无数据用「—」占位
    const fmt = function (x) { return x == null ? '—' : (Math.round(x * 100) / 100); };
    box.innerHTML = [
      card('样本数量', s.count),
      card('均值', fmt(s.mean)),
      card('最大值', fmt(s.max)),
      card('最小值', fmt(s.min))
    ].join('');
  }

  // 生成单张卡片的 HTML
  function card(label, value) {
    return '<div class="stat-card">' +
      '<div class="stat-card__label">' + label + '</div>' +
      '<div class="stat-card__value">' + value + '</div>' +
      '</div>';
  }

  window.App.stats = { compute, render };
})();
