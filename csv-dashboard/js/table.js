// ============================================================
// 表格模块：渲染表格、列筛选、全局搜索、点击列头排序
// 依赖：window.App.state、window.App.csv、window.App.chart
// ============================================================
(function () {
  window.App = window.App || {};

  // 生成「当前视图」：先按列筛选 + 全局搜索，再排序，结果存入 state.currentView
  function buildView() {
    const st = window.App.state;
    let rows = st.rawData.slice();

    // 1) 逐列筛选
    st.columns.forEach(function (col) {
      const f = (st.filters[col] || '').trim().toLowerCase();
      if (f) {
        rows = rows.filter(function (r) {
          return String(r[col] == null ? '' : r[col]).toLowerCase().indexOf(f) !== -1;
        });
      }
    });

    // 2) 全局搜索（任意列包含关键字即保留）
    const g = (st.globalSearch || '').trim().toLowerCase();
    if (g) {
      rows = rows.filter(function (r) {
        return st.columns.some(function (col) {
          return String(r[col] == null ? '' : r[col]).toLowerCase().indexOf(g) !== -1;
        });
      });
    }

    // 3) 排序
    const sort = st.sort;
    if (sort.column) {
      const numeric = st.columnTypes[sort.column] === 'number';
      rows.sort(function (a, b) {
        let av = a[sort.column];
        let bv = b[sort.column];
        let cmp;
        if (numeric) {
          // 数值列：空值/非数值统一排到最后（升序时）
          av = window.App.csv.isNumeric(av) ? Number(av) : NaN;
          bv = window.App.csv.isNumeric(bv) ? Number(bv) : NaN;
          if (isNaN(av) && isNaN(bv)) cmp = 0;
          else if (isNaN(av)) cmp = 1;
          else if (isNaN(bv)) cmp = -1;
          else cmp = av - bv;
        } else {
          av = av == null ? '' : String(av);
          bv = bv == null ? '' : String(bv);
          cmp = av.localeCompare(bv, 'zh'); // 中文按拼音排序
        }
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }

    st.currentView = rows;
    return rows;
  }

  // HTML 转义，防止单元格内容破坏结构或注入
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 首次渲染：构建表头（排序标题行 + 筛选输入框行）并绑定事件，再渲染表体
  function render() {
    const st = window.App.state;
    const table = document.getElementById('data-table');

    let thead = '<thead><tr class="head-row">';
    st.columns.forEach(function (col) {
      thead += '<th data-col="' + esc(col) + '">' +
        '<span class="th-label">' + esc(col) + '</span><span class="th-arrow"></span></th>';
    });
    thead += '</tr><tr class="filter-row">';
    st.columns.forEach(function (col) {
      thead += '<th><input class="input input--sm" data-filter="' + esc(col) +
        '" placeholder="筛选" value="' + esc(st.filters[col] || '') + '"></th>';
    });
    thead += '</tr></thead>';

    table.innerHTML = thead + '<tbody></tbody>';

    bindSort();
    bindFilters();
    updateBody();
  }

  // 仅更新表体与提示、排序箭头；不重建输入框，保持筛选输入焦点
  function updateBody() {
    const st = window.App.state;
    const table = document.getElementById('data-table');
    const rows = buildView();

    const MAX = 500; // 控制一次性渲染行数，避免超大文件卡顿
    const shown = rows.slice(0, MAX);
    let tbody = '';
    shown.forEach(function (r) {
      tbody += '<tr>';
      st.columns.forEach(function (col) { tbody += '<td>' + esc(r[col]) + '</td>'; });
      tbody += '</tr>';
    });
    table.querySelector('tbody').innerHTML = tbody ||
      '<tr><td colspan="' + st.columns.length + '">无匹配数据</td></tr>';

    const hint = document.getElementById('table-hint');
    if (hint) {
      hint.textContent = '共 ' + rows.length + ' 行' +
        (rows.length > MAX ? '（仅显示前 ' + MAX + ' 行）' : '') +
        ' / 字段 ' + st.columns.length + ' 个';
    }
    updateArrows();
  }

  // 刷新列头排序箭头（▲/▼）
  function updateArrows() {
    const st = window.App.state;
    document.querySelectorAll('#data-table .head-row th').forEach(function (th) {
      const col = th.getAttribute('data-col');
      const arrow = th.querySelector('.th-arrow');
      if (!arrow) return;
      arrow.textContent = st.sort.column === col ? (st.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    });
  }

  // 绑定列头点击排序
  function bindSort() {
    document.querySelectorAll('#data-table .head-row th').forEach(function (th) {
      th.addEventListener('click', function () {
        const col = th.getAttribute('data-col');
        const st = window.App.state;
        if (st.sort.column === col) {
          st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc'; // 再次点击切换方向
        } else {
          st.sort.column = col;
          st.sort.dir = 'asc';
        }
        updateBody();
      });
    });
  }

  // 绑定列筛选输入（输入即更新，不丢失焦点）
  function bindFilters() {
    document.querySelectorAll('#data-table .filter-row input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const col = inp.getAttribute('data-filter');
        window.App.state.filters[col] = inp.value;
        updateBody();
        if (window.App.chart) window.App.chart.rebuild(); // 图表随筛选联动
      });
    });
  }

  window.App.table = { render: render, updateBody: updateBody, buildView: buildView };
})();
