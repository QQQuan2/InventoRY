"""
app.py —— 外卖配送系统 Flask 后端入口
========================================

- 默认走 SQLite（DB_BACKEND=sqlite）
- 配置通过 .env 文件读取（也可以直接改环境变量）
- 一键启动：python init_db.py && python app.py

API 列表：
    GET  /                          前台页面
    GET  /api/health                健康检查
    GET  /api/orders                订单列表（含用户 / 明细）
    GET  /api/orders/<order_id>     单个订单详情
    POST /api/orders/<order_id>/status   修改订单状态
    POST /api/orders                新建订单
    GET  /api/merchants             商家列表
    GET  /api/dishes?merchant_id=N  商家下的菜品
    POST /api/auth/register         注册（PBKDF2 哈希存储密码）
    POST /api/auth/login            登录（返回基本信息）
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterable

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

# python-dotenv 是可选依赖；如果用户没装，我们自己手动读 .env
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except ImportError:
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(_env_path):
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#") or "=" not in _line:
                    continue
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())


# ----------------------------------------------------------------------
# 配置读取
# ----------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite").lower()

if DB_BACKEND == "sqlite":
    SQLITE_PATH = os.environ.get("SQLITE_PATH", "waimai.db")
    if not os.path.isabs(SQLITE_PATH):
        SQLITE_PATH = os.path.join(BASE_DIR, SQLITE_PATH)
else:
    MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
    MYSQL_USER = os.environ.get("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
    MYSQL_DB = os.environ.get("MYSQL_DB", "waimai")
    MYSQL_CHARSET = os.environ.get("MYSQL_CHARSET", "utf8mb4")


# ----------------------------------------------------------------------
# DB 适配层：统一 SQLite / MySQL 的差异
# ----------------------------------------------------------------------
class DB:
    """轻量适配器：把 sqlite3.Connection / pymysql.Connection 暴露成统一接口。"""

    def __init__(self) -> None:
        self.backend = DB_BACKEND
        if self.backend == "sqlite":
            import sqlite3

            self._sqlite_path = SQLITE_PATH
        else:
            import pymysql  # noqa: F401  只有切到 mysql 才需要

    # ---- 连接 / 上下文管理器 ----
    def connect(self):
        if self.backend == "sqlite":
            import sqlite3

            conn = sqlite3.connect(self._sqlite_path)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            return conn
        else:
            import pymysql
            from pymysql.cursors import DictCursor

            return pymysql.connect(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                database=MYSQL_DB,
                charset=MYSQL_CHARSET,
                cursorclass=DictCursor,
            )

    @contextmanager
    def cursor(self):
        conn = self.connect()
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ---- 占位符转换 ----
    def placeholder(self) -> str:
        return "?" if self.backend == "sqlite" else "%s"


db = DB()
PH = db.placeholder()


def _to_dicts(rows: Iterable[Any]) -> list[dict]:
    """把 sqlite3.Row / dict / tuple 都转成普通 dict 列表。"""
    out = []
    for r in rows:
        if isinstance(r, dict):
            out.append(r)
        else:
            out.append({k: r[k] for k in r.keys()})
    return out


# ----------------------------------------------------------------------
# Flask app
# ----------------------------------------------------------------------
app = Flask(__name__, static_folder=None)
CORS(app)
app.config["JSON_AS_ASCII"] = False


# ----------------------------------------------------------------------
# 工具接口
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "backend": db.backend})


# ----------------------------------------------------------------------
# 鉴权
# ----------------------------------------------------------------------
@app.post("/api/auth/register")
def auth_register():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or "customer"
    phone = body.get("phone")

    if not username or not password:
        return jsonify({"detail": "username 和 password 必填"}), 400
    if role not in ("customer", "rider", "merchant", "admin"):
        return jsonify({"detail": "role 不合法"}), 400

    hashed = generate_password_hash(password, method="pbkdf2:sha256")

    with db.cursor() as cur:
        cur.execute(f"SELECT user_id FROM Users WHERE username = {PH}", (username,))
        if cur.fetchone():
            return jsonify({"detail": "用户名已存在"}), 400
        cur.execute(
            f"INSERT INTO Users (username, password, role, phone) VALUES ({PH},{PH},{PH},{PH})",
            (username, hashed, role, phone),
        )
        new_id = cur.lastrowid

    return jsonify({"message": "注册成功", "user_id": new_id, "username": username, "role": role})


@app.post("/api/auth/login")
def auth_login():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    if not username or not password:
        return jsonify({"detail": "username 和 password 必填"}), 400

    with db.cursor() as cur:
        cur.execute(
            f"SELECT user_id, username, password, role FROM Users WHERE username = {PH}",
            (username,),
        )
        row = cur.fetchone()

    if not row:
        return jsonify({"detail": "用户名或密码错误"}), 401
    if not check_password_hash(row["password"], password):
        return jsonify({"detail": "用户名或密码错误"}), 401

    return jsonify(
        {
            "message": "登录成功",
            "user_id": row["user_id"],
            "username": row["username"],
            "role": row["role"],
        }
    )


# ----------------------------------------------------------------------
# 商家 / 菜品
# ----------------------------------------------------------------------
@app.get("/api/merchants")
def list_merchants():
    with db.cursor() as cur:
        cur.execute("SELECT * FROM Merchants ORDER BY merchant_id")
        rows = _to_dicts(cur.fetchall())
    return jsonify(rows)


@app.get("/api/dishes")
def list_dishes():
    merchant_id = request.args.get("merchant_id", type=int)
    with db.cursor() as cur:
        if merchant_id is None:
            cur.execute("SELECT * FROM Dishes ORDER BY merchant_id, dish_id")
        else:
            cur.execute(
                f"SELECT * FROM Dishes WHERE merchant_id = {PH} ORDER BY dish_id",
                (merchant_id,),
            )
        rows = _to_dicts(cur.fetchall())
    return jsonify(rows)


# ----------------------------------------------------------------------
# 订单
# ----------------------------------------------------------------------
@app.get("/api/orders")
def list_orders():
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT o.order_id, o.user_id, u.username, u.phone,
                   o.merchant_id, m.merchant_name,
                   o.total_price, o.order_status, o.order_time,
                   o.delivery_address, o.need_cutlery
            FROM Orders o
            JOIN Users u     ON o.user_id = u.user_id
            JOIN Merchants m ON o.merchant_id = m.merchant_id
            ORDER BY o.order_id DESC
            """
        )
        orders = _to_dicts(cur.fetchall())
        for o in orders:
            if o.get("order_time") is not None:
                o["order_time"] = str(o["order_time"])
            cur.execute(
                f"SELECT d.dish_name, od.quantity, od.unit_price, od.dish_id "
                f"FROM Order_Details od JOIN Dishes d ON od.dish_id = d.dish_id "
                f"WHERE od.order_id = {PH}",
                (o["order_id"],),
            )
            details = _to_dicts(cur.fetchall())
            for d in details:
                d["unit_price"] = float(d["unit_price"])
            o["details"] = details
    return jsonify(orders)


@app.get("/api/orders/<int:order_id>")
def get_order(order_id: int):
    with db.cursor() as cur:
        cur.execute(
            f"SELECT * FROM Orders WHERE order_id = {PH}", (order_id,)
        )
        order = cur.fetchone()
        if not order:
            return jsonify({"detail": "订单不存在"}), 404
        order = dict(order)
        cur.execute(
            f"SELECT d.dish_name, od.quantity, od.unit_price FROM Order_Details od "
            f"JOIN Dishes d ON od.dish_id = d.dish_id WHERE od.order_id = {PH}",
            (order_id,),
        )
        order["details"] = _to_dicts(cur.fetchall())
    return jsonify(order)


@app.post("/api/orders/<int:order_id>/status")
def set_order_status(order_id: int):
    body = request.get_json(force=True, silent=True) or {}
    status = body.get("status")
    allowed = ("pending_pay", "pending_accept", "delivering", "completed", "cancelled")
    if status not in allowed:
        return jsonify({"detail": f"status 必须是 {allowed} 之一"}), 400

    with db.cursor() as cur:
        cur.execute(
            f"UPDATE Orders SET order_status = {PH} WHERE order_id = {PH}",
            (status, order_id),
        )
        if cur.rowcount == 0:
            return jsonify({"detail": "订单不存在"}), 404

    return jsonify({"ok": True, "order_id": order_id, "status": status})


@app.post("/api/orders")
def create_order():
    body = request.get_json(force=True, silent=True) or {}
    user_id = body.get("user_id")
    merchant_id = body.get("merchant_id")
    delivery_address = body.get("delivery_address")
    items = body.get("items") or []
    need_cutlery = 1 if body.get("need_cutlery", True) else 0

    if not (user_id and merchant_id and items):
        return jsonify({"detail": "user_id / merchant_id / items 必填"}), 400

    total = 0.0
    priced_items: list[tuple[int, int, float]] = []
    with db.cursor() as cur:
        for it in items:
            dish_id = int(it["dish_id"])
            qty = int(it["quantity"])
            cur.execute(
                f"SELECT price FROM Dishes WHERE dish_id = {PH}", (dish_id,)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"detail": f"菜品 {dish_id} 不存在"}), 400
            price = float(row["price"])
            total += price * qty
            priced_items.append((dish_id, qty, price))

        cur.execute(
            f"INSERT INTO Orders (user_id, merchant_id, total_price, order_status, delivery_address, need_cutlery) "
            f"VALUES ({PH},{PH},{PH},'pending_pay',{PH},{PH})",
            (user_id, merchant_id, total, delivery_address, need_cutlery),
        )
        new_id = cur.lastrowid

        for dish_id, qty, price in priced_items:
            cur.execute(
                f"INSERT INTO Order_Details (order_id, dish_id, quantity, unit_price) "
                f"VALUES ({PH},{PH},{PH},{PH})",
                (new_id, dish_id, qty, price),
            )

    return jsonify(
        {
            "ok": True,
            "order_id": new_id,
            "total_price": total,
            "status": "pending_pay",
        }
    )


# ----------------------------------------------------------------------
# 错误处理
# ----------------------------------------------------------------------
@app.errorhandler(404)
def not_found(_):
    return jsonify({"detail": "Not Found"}), 404


@app.errorhandler(500)
def internal_error(err):
    return jsonify({"detail": "Internal Server Error", "error": str(err)}), 500


# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------
if __name__ == "__main__":
    print(f"[INFO] 后端类型: {db.backend}")
    if db.backend == "sqlite":
        print(f"[INFO] SQLite 数据库: {SQLITE_PATH}")
    else:
        print(f"[INFO] MySQL: {MYSQL_USER}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}")
    print("[INFO] 启动 Flask 服务，访问 http://127.0.0.1:5000/")
    app.run(host="0.0.0.0", port=5000, debug=True)