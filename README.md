# InventoRY · 个人作品集

欢迎来到我的作品集仓库！这里收录我在课程学习和个人探索中完成的项目。

## 📦 项目列表

### 1. 外卖配送系统 · [waimai-delivery-system/](waimai-delivery-system/)

《管理信息系统》课程期末项目：一个可以真正跑起来的外卖点餐与配送管理系统。

- **技术栈**：Python · Flask · SQLite / MySQL · 原生 HTML / CSS / JS
- **核心功能**：
  - 四种角色：顾客 / 骑手 / 商家 / 管理员（示例账号见项目 README）
  - 商家、菜品、订单、配送、评论的完整数据模型（7 张业务表）
  - REST API：登录注册、浏览商家与菜品、下单、订单状态流转
  - 默认 SQLite 开箱即用，一行配置可切换 MySQL
- **快速体验**：`python init_db.py && python app.py`，浏览器打开 `http://127.0.0.1:5000`
- 详细文档 👉 [waimai-delivery-system/README.md](waimai-delivery-system/README.md)

### 2. CSV 数据可视化仪表盘 · [csv-dashboard/](csv-dashboard/index.html)

上传本地 CSV 文件，即可快速预览、统计与可视化的纯前端仪表盘。

- **技术栈**：HTML / CSS / JS · Chart.js（图表）· PapaParse（CSV 解析）
- **核心功能**：
  - 点击 / 拖拽上传 CSV 文件
  - 数据表格即时预览与统计
  - 多种图表可视化
  - 深浅色主题一键切换
- **使用方式**：直接用浏览器打开 [csv-dashboard/index.html](csv-dashboard/index.html) 即可

---

> 💡 更多项目持续更新中 ✨
