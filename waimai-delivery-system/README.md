# 外卖配送系统（Waimai Delivery System）

> 一个基于 **Flask + SQLite / MySQL** 的完整外卖配送系统：四种角色（顾客 / 商家 / 骑手 / 管理员）数据互相联动，覆盖「下单 → 接单 → 配送 → 送达 → 评价 → 回复」的完整业务闭环。

🎬 **界面预览**：[在线预览页（含全部截图）](https://qqquan2.github.io/InventoRY/waimai-preview/)

---

## ✨ 功能一览

### 🔐 登录与账号
- **登录页四种身份选择**：顾客 / 商家 / 骑手 / 管理员（身份卡片点选）
- **注册**：按身份注册（商家注册自动建店铺），管理员不允许自助注册
- **找回密码**：两步验证码流程（演示环境直接下发验证码）
- 密码 PBKDF2 哈希存储，登录签发 Bearer Token

### 🛍️ 顾客端
- 浏览商家 → 查看菜品 → 加入购物车 → 下单
- **地址簿**：保存多个收货地址、一键设为默认、下单时快捷选用（首个地址自动设默认）
- **环保餐具选项**：下单可选择是否需要一次性餐具（默认不需要，支持环保 🌿）
- 订单状态实时跟踪（时间线展示）、评价打分

### 🏪 商家端
- 接单 / 拒单（拒绝需填写理由）
- 菜品上架 / 修改 / 下架 / 删除
- **实拍图上传**：支持 multipart 图片上传，无图时自动用 emoji 占位展示
- 评价查看与回复

### 🛵 骑手端
- 抢单大厅：实时查看待配送订单，一键抢单
- 配送状态流转：抢单 → 取货 → 送达
- 个人收入统计

### 📊 管理员端
- **可视化看板**：近 7 天订单量与营收走势（柱线混合图）、订单状态分布（环形图）、商家营收排行（横向条形图）
- 核心指标卡：注册用户 / 商家 / 骑手 / 累计订单 / 今日订单 / 累计营收
- **用户管理**：查看全量账号（用户名 / 身份 / 手机号 / 注册时间 / 密码哈希），支持管理员重置任意账号密码
- **管理员可自助注册**：四种身份均开放注册（课程演示需要）

---

## 🚀 快速开始（SQLite，无需 MySQL）

```powershell
# 1) 进入项目目录
cd waimai-delivery-system

# 2) 初始化数据库（自动生成 waimai.db，并写入示例数据）
python init_db.py

# 3) 启动服务
python app.py
```

打开 <http://127.0.0.1:5000/> 即可体验。

**示例账号**（密码统一 `123456`）：

| 角色 | 用户名 | 说明 |
| --- | --- | --- |
| 顾客 | `alice` / `xiaomei` / `qiang` / `lina` | 4 位顾客共同贡献 14 个历史订单（覆盖全部状态）+ 示例地址 |
| 商家 | `shop_zha` / `shop_hu` / `shop_guang` | 各有店铺与菜品 |
| 骑手 | `bob` / `zhou` | 两位骑手交替配送，有配送记录 |
| 管理员 | `admin` | 看板全开 |

---

## 🧪 质量保障：77 项冒烟测试

```powershell
python tests/smoke_test.py
```

覆盖：健康检查 → 注册登录（含管理员注册）→ 找回密码 → 点餐下单 → 订单闭环（商家接单 → 骑手抢单 → 送达 → 评价 → 回复）→ 取消与库存回补 → 菜品管理与图片上传 → 骑手/管理员统计 → 管理员用户管理与重置密码 → 地址簿 CRUD 与默认地址切换 → 订单餐具选项落库 → 越权拦截。

---

## 🗂 目录结构

```
waimai-delivery-system/
├── app.py                # Flask 主入口（SQLite 默认 / MySQL 可选，60+ REST 接口）
├── init_db.py            # 一键初始化 SQLite（含平滑迁移逻辑）
├── migrate_db.py         # 增量迁移脚本（v3 新增 Addresses 表）
├── schema_sqlite.sql     # SQLite 版建表 + 示例数据（v3）
├── schema_mysql.sql      # MySQL 版建表 + 示例数据
├── login.html            # 登录页（四身份 + 找回密码）
├── customer.html         # 顾客端（点餐 / 订单 / 地址簿）
├── merchant.html         # 商家端（接单 / 菜品 / 评价）
├── rider.html            # 骑手端（抢单 / 配送 / 收入）
├── admin.html            # 管理员端（可视化看板）
├── static/
│   ├── css/style.css     # 全站样式
│   ├── js/common.js      # 公共工具（token / 请求封装 / 通用 UI）
│   ├── js/{login,customer,merchant,rider,admin}.js
│   └── uploads/          # 用户上传的菜品实拍图（运行时数据，不入库）
├── tests/smoke_test.py   # 77 项接口冒烟测试
├── docs/screenshots/     # 界面截图（在线预览页引用）
├── requirements.txt      # Python 依赖
└── .env.example          # 配置文件样例（复制为 .env 后修改）
```

---

## 🐬 切换到 MySQL（可选）

1. 安装并启动 MySQL（8.x 即可）
2. 复制配置：`cp .env.example .env`
3. 编辑 `.env`：

   ```
   DB_BACKEND=mysql
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=你的密码
   MYSQL_DB=waimai
   ```

4. 一次性建库 + 灌示例数据：`mysql -u root -p < schema_mysql.sql`
5. 启动：`python app.py`

---

## 🔌 API 速览

| Method | Path | 说明 |
| --- | --- | --- |
| GET    | `/api/health` | 健康检查 |
| POST   | `/api/auth/register` | 注册（merchant 角色自动建店铺） |
| POST   | `/api/auth/login` | 登录（返回 Bearer token） |
| POST   | `/api/auth/forgot` / `/api/auth/reset` | 找回密码两步 |
| GET    | `/api/merchants` / `/api/dishes` | 商家 / 菜品列表 |
| POST   | `/api/orders` | 下单（顾客，含 `need_cutlery` 环保餐具选项） |
| GET    | `/api/orders` / `/api/orders/<id>` | 订单列表 / 详情（按角色自动过滤） |
| POST   | `/api/orders/<id>/accept` / `reject` / `claim` / `deliver` / `cancel` / `comment` | 订单状态流转 |
| POST   | `/api/comments/<id>/reply` | 商家回复评价 |
| GET/POST/PUT/DELETE | `/api/addresses[/<id>]` | 地址簿 CRUD |
| POST   | `/api/addresses/<id>/default` | 设为默认地址 |
| POST   | `/api/dishes/<id>/image` | 商家上传菜品实拍图 |
| GET    | `/api/rider/stats` / `/api/admin/stats` | 骑手统计 / 管理员看板 |
| GET    | `/api/admin/users` | 用户管理 |

---

## ⚠️ 已知限制 / 待完善

- 没有支付、推送、地图等真实业务能力，纯教学示例
- 找回密码的验证码在演示环境直接下发（未接短信/邮件网关）
- 默认示例数据只有几个用户 / 商家 / 菜品，方便本地试跑

---

## 📚 参考与致谢

本项目基于 2025–2026 学年《管理信息系统》课程的两次作业合并升级：
- final project qwq —— 业务表结构 / 注册登录
- final project minimal working example —— Flask + MySQL 最小工作示例
