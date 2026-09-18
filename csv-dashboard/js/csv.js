// ============================================================
// CSV 解析模块：封装 PapaParse，并对每一列做类型推断
// 依赖：PapaParse（window.Papa，CDN 引入）
// ============================================================
(function () {
  window.App = window.App || {};

  // 判断单个值是否为「有限数字」（空值视为非数字）
  function isNumeric(value) {
    if (value === '' || value == null) return false;
    const n = Number(value);
    return !isNaN(n) && isFinite(n);
  }

  // 解析本地文件，解析完成后通过回调返回 { data, columns, columnTypes }
  // onDone(res) / onError(err)
  function parseFile(file, onDone, onError) {
    if (!window.Papa) {
      onError && onError(new Error('PapaParse 未加载，请检查网络（CDN）'));
      return;
    }
    window.Papa.parse(file, {
      header: true,            // 第一行作为字段名
      skipEmptyLines: true,    // 跳过空行
      complete: function (results) {
        const data = results.data || [];
        if (!data.length) {
          onError && onError(new Error('文件为空或没有有效数据'));
          return;
        }
        // 字段顺序以 meta.fields 为准（更稳定）
        const columns = results.meta.fields || Object.keys(data[0]);
        const columnTypes = inferTypes(data, columns);
        onDone({ data, columns, columnTypes });
      },
      error: function (err) {
        onError && onError(err);
      }
    });
  }

  // 类型推断：某列所有「非空值」都能转成数字，则该列记为 number，否则 string
  function inferTypes(data, columns) {
    const types = {};
    columns.forEach(function (col) {
      let allNumber = true;
      let hasValue = false;
      for (let i = 0; i < data.length; i++) {
        const v = data[i][col];
        if (v === '' || v == null) continue; // 空值不参与判断
        hasValue = true;
        if (!isNumeric(v)) { allNumber = false; break; }
      }
      types[col] = (hasValue && allNumber) ? 'number' : 'string';
    });
    return types;
  }

  window.App.csv = { parseFile, isNumeric, inferTypes };
})();
