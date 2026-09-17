# 外卖配送系统（Waimai Delivery System）

> 一个基于 **Flask + SQLite / MySQL** 的外卖配送后台管理示例项目，对外提供 REST API，对内提供简洁的前台页面。

本仓库把以下两份课程作业合并成"能跑"的版本：

- **`final project qwq/`** —— 完整的外卖业务表结构（Users / Merchants / Dishes / Orders / Order_Details / Deliveries / Comments），原本只接 SQLite + FastAPI，只实现了登录/注册。
- **`final project minimal working example/`** —— 跑得通的 Flask + MySQL 外卖前台，但缺业务表细节。

合并版默认走 **SQLite**（零依赖、双击就能跑），同时兼容 **MySQL**（如果你机器上装了 MySQL 也可切换）。

---

## ✨ 功能一览

- 商家列表 / 菜品列表 / 订单列表（带订单明细 + 状态）
- 修改订单状态（待接单 → 配送中 → 已完成 / 已取消）
- 注册 / 登录（密码 PBKDF2 哈希加密存储）
- 同时支持 **SQLite**（默认）和 **MySQL**（可选）
- 配置走 `.env` 文件，不在源码里写死任何账号 / 路径

---

## 🗂 目录结构

```
waimai-delivery-system/
├── app.py                # Flask 主入口（SQLite 默认 / MySQL 可选）
├── index.html            # 前台页面（订单 + 商家 + 菜品）
├── schema_sqlite.sql     # SQLite 版建表 + 示例数据
├── schema_mysql.sql      # MySQL 版建表 + 示例数据
├── init_db.py            # 一键初始化 SQLite 数据库的脚本
├── requirements.txt      # Python 依赖
├── .env.example          # 配置文件样例（复制为 .env 后修改）
├── .gitignore            # 忽略 .env、__pycache__、*.db、虚拟环境等
└── screenshots/          # 截图（可选）
```

---

## 🚀 快速开始（SQLite，无需 MySQL）

> 假设你用的是 Python 3.10+（已在 Windows 10/11 + PowerShell 上验证）。

```powershell
# 1) 进入项目目录
cd "d:\lqq\新建文件夹\大学\课件&作业\大二下\管理信息系统\waimai-delivery-system"

# 2) 创建虚拟环境并安装依赖（可选但推荐）
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3) 初始化数据库（自动生成 waimai.db，并写入示例数据）
python init_db.py

# 4) 启动服务
python app.py
```

启动后访问：

- 前台页面：<http://127.0.0.1:5000/>
- API 根：<http://127.0.0.1:5000/api/health>

---

## 🐬 切换到 MySQL

1. 安装并启动 MySQL（8.x 即可）
2. 复制配置：

   ```powershell
   cp .env.example .env
   ```

3. 编辑 `.env`：

   ```
   DB_BACKEND=mysql
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=你的密码
   MYSQL_DB=waimai
   ```

4. 一次性建库 + 灌示例数据：

   ```powershell
   mysql -u root -p < schema_mysql.sql
   ```

5. 启动：`python app.py`

---

## 🔌 API 速览

| Method | Path | 说明 |
| --- | --- | --- |
| GET    | `/api/health`                | 健康检查 |
| GET    | `/api/orders`                | 订单列表（含用户 / 明细） |
| GET    | `/api/orders/<order_id>`     | 单个订单详情 |
| POST   | `/api/orders/<order_id>/status` | 修改订单状态，body：`{"status":"配送中"}` |
| POST   | `/api/orders`                | 新建订单，body：`{"user_id":1,"merchant_id":1,"delivery_address":"...","items":[{"dish_id":1,"quantity":2}]}` |
| GET    | `/api/merchants`             | 商家列表 |
| GET    | `/api/dishes?merchant_id=1`  | 某商家下的菜品 |
| POST   | `/api/auth/register`         | 注册，body：`{"username":"x","password":"z","role":"customer","phone":"138..."}` |
| POST   | `/api/auth/login`            | 登录，body：`{"username":"x","password":"z"}` |

---

## 🧪 试一下

启动 `python app.py` 后，在 PowerShell 里跑：

```powershell
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/orders
curl -X POST http://127.0.0.1:5000/api/orders/1/status -H "Content-Type: application/json" -d '{"status":"配送中"}'
```

打开 <http://127.0.0.1:5000/> 就能看到订单列表 + 商家 + 菜品，点击按钮可切换订单状态。

---

## ⚠️ 已知限制 / 待完善

- 没有支付、推送、地图等真实业务能力，纯教学示例
- 用户鉴权是基础版（无 JWT / Session），正式使用请自行加上
- 默认示例数据只有几个用户 / 商家 / 菜品，方便本地试跑

---

## 📚 参考与致谢

本项目基于 2025–2026 学年《管理信息系统》课程的两次作业：
- final project qwq —— 业务表结构 / 注册登录
- final project minimal working example —— Flask + MySQL 最小工作示例