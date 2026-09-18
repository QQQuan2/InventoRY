// ============================================================
// 导出模块：把当前筛选 / 排序后的视图导出为 CSV 并下载
// 依赖：window.App.state
// ============================================================
(function () {
  window.App = window.App || {};

  // 将二维数据转成 CSV 文本，含引号转义（逗号/引号/换行用双引号包裹）
  function toCSV(rows, columns) {
    const esc = function (v) {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = columns.map(esc).join(',');
    const body = rows.map(function (r) {
      return columns.map(function (c) { return esc(r[c]); }).join(',');
    }).join('\n');
    return head + '\n' + body;
  }

  // 导出当前视图为 CSV 文件（带 BOM，解决 Excel 打开中文乱码）
  function exportCurrent() {
    const st = window.App.state;
    if (!st.currentView || !st.currentView.length) {
      alert('没有可导出的数据');
      return;
    }
    const csv = toCSV(st.currentView, st.columns);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '导出数据_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // 释放临时 URL
  }

  window.App.export = { exportCurrent };
})();
