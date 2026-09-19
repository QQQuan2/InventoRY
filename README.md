# InventoRY · 个人作品集

这个仓库收录我在课程学习和个人探索中完成的项目。

## 项目列表

### 1. 外卖配送系统 · [waimai-delivery-system/](waimai-delivery-system/)

《管理信息系统》课程期末项目：一个可以真正跑起来的外卖点餐与配送管理系统，四种角色数据互相联动。

- **在线试运行**（浏览器直接操作，无需安装）：[外卖系统 · 在线试运行](https://qqquan2.github.io/InventoRY/waimai-preview/demo/)
- **在线预览**（界面截图）：[外卖系统 · 预览页](https://qqquan2.github.io/InventoRY/waimai-preview/)

**本地运行（3 步）**：

```powershell
cd waimai-delivery-system
python init_db.py     # 首次运行：建库 + 示例数据（密码统一 123456）
python app.py         # 启动服务
```

然后浏览器打开 <http://127.0.0.1:5000>

- **技术栈**：Python · Flask · SQLite / MySQL · 原生 HTML / CSS / JS
- **核心功能**：
  - 四种角色联动：顾客下单、商家接单、骑手抢单配送、送达、顾客评价、商家回复
  - 登录页四种身份选择，支持找回密码（验证码演示流程）
  - 顾客地址簿：保存多个收货地址、一键设为默认、下单时快捷选用
  - 环保餐具选项：下单时可选择是否需要一次性餐具（默认不需要）
  - 商家端：菜品管理、实拍图上传（无图时自动用 emoji 占位展示）、评价回复
  - 管理员可视化看板：近 7 天订单/营收走势、订单状态分布、商家营收排行、用户管理
- **数据模型**：8 张业务表（Users / Merchants / Dishes / Orders / Order_Details / Deliveries / Comments / Addresses）
- **质量保障**：`python tests/smoke_test.py`，77 项接口冒烟测试全覆盖
- 详细文档：[waimai-delivery-system/README.md](waimai-delivery-system/README.md)

### 2. CSV 数据可视化仪表盘 · [csv-dashboard/](csv-dashboard/index.html)

上传本地 CSV 文件，即可预览、统计与可视化的纯前端仪表盘。

- **在线试运行**：[CSV 仪表盘](https://qqquan2.github.io/InventoRY/csv-dashboard/)

- **技术栈**：HTML / CSS / JS · Chart.js（图表）· PapaParse（CSV 解析）
- **核心功能**：
  - 点击 / 拖拽上传 CSV 文件
  - 数据表格即时预览与统计
  - 多种图表可视化
  - 深浅色主题切换
- 浏览器直接打开即可使用，无需安装。

---

> 更多项目持续更新中，欢迎交流。
