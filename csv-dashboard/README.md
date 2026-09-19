# CSV 数据可视化仪表盘

纯前端、零构建的数据分析小工具。上传本地 CSV 即可预览、筛选、排序、统计并生成图表；数据全程只在浏览器本地处理，不会上传任何服务器。

## 功能

- 上传本地 CSV（也支持拖拽）
- 数据预览：逐列筛选、全局搜索、点击列头排序（升/降）
- 图表：柱状图 / 折线图，自选 X 轴 / Y 轴字段（基于 Chart.js）
- 基础统计：均值、最大值、最小值、样本数量
- 深色 / 浅色主题切换（偏好记忆）
- 导出当前筛选结果为 CSV
- 响应式布局，移动端可用
- 全部代码带中文注释

## 技术栈

- 原生 HTML / CSS / JavaScript（无框架、无构建步骤）
- [Chart.js v4](https://www.chartjs.org/)（CDN，图表）
- [PapaParse](https://www.papaparse.com/)（CDN，CSV 解析）

## 本地运行

直接双击 `index.html` 即可（需联网以加载 CDN 上的 Chart.js 与 PapaParse）。

或启动一个静态服务器（推荐，避免个别浏览器对本地文件的限制）：

```bash
# Python 3
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

## 部署到 GitHub Pages

把本仓库推送到 GitHub，在仓库 **Settings → Pages** 选择对应分支的根目录，稍等片刻即可获得公开访问地址。

## 目录结构

```
csv-dashboard/
├── index.html          # 页面骨架
├── css/
│   └── styles.css      # 样式（CSS 变量做主题 + 响应式）
├── js/
│   ├── app.js          # 主入口：状态管理、事件绑定
│   ├── csv.js          # CSV 解析与类型推断
│   ├── table.js        # 表格渲染、筛选、排序
│   ├── stats.js        # 均值/最大/最小/样本数
│   ├── chart.js        # Chart.js 柱状图/折线图
│   ├── export.js       # 导出筛选结果为 CSV
│   └── theme.js        # 深色/浅色切换
└── README.md
```

## 使用说明

1. 点击「上传 CSV」或把文件拖入空状态区域。
2. 首行将作为字段名；数值列会被自动识别（用于统计与 Y 轴）。
3. 在表格上方输入筛选关键字，或点击列头排序。
4. 选择「图表」区的类型与 X / Y 轴字段查看可视化。
5. 点击「导出筛选结果 CSV」下载当前视图。
