// ============================================================
// 主入口：全局状态管理、模块装配、事件绑定
// 依赖：所有其他 js 模块（均已挂到 window.App）
// ============================================================
(function () {
  window.App = window.App || {};

  // 全局状态：整个应用共享一份数据
  window.App.state = {
    rawData: [],        // 解析后的原始行（对象数组）
    columns: [],        // 字段名列表
    columnTypes: {},    // 字段名 -> 'number' | 'string'
    filters: {},        // 字段名 -> 列筛选关键字
    globalSearch: '',   // 全局搜索关键字
    sort: { column: null, dir: 'asc' }, // 当前排序列与方向
    currentView: []     // 经过筛选+排序后的视图（供图表/导出使用）
  };

  // 初始化：绑定各类交互事件
  function init() {
    // 主题
    window.App.theme.initTheme();
    document.getElementById('theme-toggle').addEventListener('click', window.App.theme.toggleTheme);

    // 文件上传（顶部按钮与空状态按钮两个入口）
    ['file-input', 'file-input-2'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
    });

    // 拖拽上传
    const dz = document.getElementById('drop-zone');
    if (dz) {
      ['dragover', 'dragenter'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drop-zone--active'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drop-zone--active'); });
      });
      dz.addEventListener('drop', function (e) {
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }

    // 全局搜索
    const gs = document.getElementById('global-search');
    if (gs) gs.addEventListener('input', function () {
      window.App.state.globalSearch = gs.value;
      window.App.table.updateBody();
      window.App.chart.rebuild();
    });

    // 统计列选择
    const sc = document.getElementById('stats-column');
    if (sc) sc.addEventListener('change', function () { window.App.stats.render(sc.value); });

    // 图表控件（类型 / X 轴 / Y 轴）
    ['chart-type', 'chart-x', 'chart-y'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', window.App.chart.rebuild);
    });

    // 导出
    const ex = document.getElementById('export-btn');
    if (ex) ex.addEventListener('click', window.App.export.exportCurrent);
  }

  // 处理上传的文件：解析 -> 写入状态 -> 渲染各模块
  function handleFile(file) {
    if (!file) return;
    window.App.csv.parseFile(file, function (res) {
      const st = window.App.state;
      st.rawData = res.data;
      st.columns = res.columns;
      st.columnTypes = res.columnTypes;
      st.filters = {};
      st.globalSearch = '';
      st.sort = { column: null, dir: 'asc' };
      st.currentView = res.data.slice();

      // 切换显示：隐藏空状态，显示仪表盘
      document.getElementById('empty-state').hidden = true;
      document.getElementById('dashboard').hidden = false;

      // 概览卡片
      renderOverview();

      // 填充下拉框
      fillSelect('stats-column', st.columns);
      fillSelect('chart-x', st.columns);
      fillSelect('chart-y', st.columns.filter(function (c) { return st.columnTypes[c] === 'number'; }));

      // 设置默认值：X 取首个字符列，Y 取首个数值列，统计列取首个数值列
      const firstNum = st.columns.find(function (c) { return st.columnTypes[c] === 'number'; });
      const firstStr = st.columns.find(function (c) { return st.columnTypes[c] === 'string'; });
      if (firstNum) document.getElementById('chart-y').value = firstNum;
      if (firstStr) document.getElementById('chart-x').value = firstStr;
      else if (st.columns[0]) document.getElementById('chart-x').value = st.columns[0];
      if (firstNum) document.getElementById('stats-column').value = firstNum;

      // 渲染各模块
      window.App.table.render();
      window.App.stats.render(firstNum || st.columns[0]);
      window.App.chart.rebuild();
    }, function (err) {
      alert('解析失败：' + (err && err.message ? err.message : err));
    });
  }

  // 渲染概览卡片（总行数 / 字段数 / 数值列 / 字符列）
  function renderOverview() {
    const st = window.App.state;
    const box = document.getElementById('overview-cards');
    const numCols = st.columns.filter(function (c) { return st.columnTypes[c] === 'number'; }).length;
    box.innerHTML = [
      ov('总行数', st.rawData.length),
      ov('字段数', st.columns.length),
      ov('数值列', numCols),
      ov('字符列', st.columns.length - numCols)
    ].join('');
  }

  // 生成概览卡片 HTML
  function ov(label, value) {
    return '<div class="stat-card">' +
      '<div class="stat-card__label">' + label + '</div>' +
      '<div class="stat-card__value">' + value + '</div>' +
      '</div>';
  }

  // 向下拉框填充选项
  function fillSelect(id, options) {
    const el = document.getElementById(id);
    el.innerHTML = options.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('');
  }

  // DOM 就绪后初始化（兼容脚本在 body 末尾加载的情况）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
