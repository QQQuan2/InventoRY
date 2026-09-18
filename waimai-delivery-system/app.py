"""
app.py —— 外卖配送系统 Flask 后端入口（v2：四角色完整业务闭环）
================================================================

默认走 SQLite（DB_BACKEND=sqlite），配置通过 .env 文件读取。
一键启动：python init_db.py && python app.py

角色与核心流程
--------------
顾客 customer   : 浏览商家/菜品 → 下单 → （可取消）→ 送达后评价
商家 merchant   : 接单/拒单 → 菜品管理（含实拍图上传，无图用 emoji）→ 回复评价
骑手 rider      : 抢单（商家接单后的订单）→ 配送 → 点击已送达
管理员 admin    : 数据看板（Chart.js 可视化）+ 全量订单/用户数据

订单状态机
----------
pending_accept（待商家接单）→ accepted（商家已接单，待骑手抢单）
→ delivering（骑手配送中）→ delivered（已送达）→ completed（顾客已评价）
前置阶段可 → cancelled

API 列表
--------
GET    /                             登录页
GET    /customer | /merchant | /rider | /admin   各角色页面
GET    /api/health                   健康检查
POST   /api/auth/register            注册（merchant 角色自动建店铺）
POST   /api/auth/login               登录（返回 Bearer token）
POST   /api/auth/logout              退出登录
GET    /api/me                       当前登录用户信息
POST   /api/auth/forgot              找回密码·第一步（演示环境直接下发验证码）
POST   /api/auth/reset               找回密码·第二步（验证码 + 新密码）
GET    /api/merchants                商家列表
GET    /api/merchants/<id>/comments  某商家的评价列表
GET    /api/dishes?merchant_id=N     菜品列表
POST   /api/dishes                   新增菜品（商家）
PUT    /api/dishes/<id>              修改菜品（商家）
DELETE /api/dishes/<id>              删除菜品（商家）
POST   /api/dishes/<id>/image        上传菜品实拍图（商家，multipart）
DELETE /api/dishes/<id>/image        删除实拍图（回落到 emoji 展示）
POST   /api/orders                   下单（顾客）
GET    /api/orders                   订单列表（按当前角色自动过滤）
GET    /api/orders/<id>              订单详情
POST   /api/orders/<id>/accept       商家接单
POST   /api/orders/<id>/reject       商家拒单
POST   /api/orders/<id>/claim        骑手抢单
POST   /api/orders/<id>/deliver      骑手送达
POST   /api/orders/<id>/cancel       顾客取消
POST   /api/orders/<id>/comment      顾客评价（订单 → completed）
POST   /api/comments/<id>/reply      商家回复评价
GET    /api/rider/stats              骑手个人数据
GET    /api/admin/stats              管理员看板数据
GET    /api/admin/users              用户列表（管理员）

地址簿（顾客，v3 新增）
GET    /api/addresses                当前用户地址列表
POST   /api/addresses                新增地址
PUT    /api/addresses/<id>           修改地址
POST   /api/addresses/<id>/default    设为默认地址（取消其他默认）
DELETE /api/addresses/<id>           删除地址
"""

from __future__ import annotations

import json
import os
import re
import secrets
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
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
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

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

ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
RESET_CODE_TTL_MINUTES = 10
RIDER_FEE_PER_ORDER = 5.0  # 演示口径：骑手每单配送费 5 元


# ----------------------------------------------------------------------
# DB 适配层：统一 SQLite / MySQL 的差异
# ----------------------------------------------------------------------
class DB:
    """轻量适配器：把 sqlite3.Connection / pymysql.Connection 暴露成统一接口。"""

    def __init__(self) -> None:
        self.backend = DB_BACKEND
        if self.backend == "sqlite":
            self._sqlite_path = SQLITE_PATH
        else:
            import pymysql  # noqa: F401  只有切到 mysql 才需要

    def connect(self):
        if self.backend == "sqlite":
            import sqlite3

            conn = sqlite3.connect(self._sqlite_path)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            return conn
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


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ----------------------------------------------------------------------
# Flask app
# ----------------------------------------------------------------------
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/static")
CORS(app)
app.config["JSON_AS_ASCII"] = False


# ----------------------------------------------------------------------
# 页面路由
# ----------------------------------------------------------------------
@app.get("/")
def page_login():
    return send_from_directory(BASE_DIR, "login.html")


@app.get("/customer")
def page_customer():
    return send_from_directory(BASE_DIR, "customer.html")


@app.get("/merchant")
def page_merchant():
    return send_from_directory(BASE_DIR, "merchant.html")


@app.get("/rider")
def page_rider():
    return send_from_directory(BASE_DIR, "rider.html")


@app.get("/admin")
def page_admin():
    return send_from_directory(BASE_DIR, "admin.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "backend": db.backend})


# ----------------------------------------------------------------------
# 鉴权工具
# ----------------------------------------------------------------------
def _bad(detail: str, code: int = 400):
    return jsonify({"detail": detail}), code


def current_user() -> dict | None:
    """从 Authorization: Bearer <token> 解析当前登录用户。"""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    with db.cursor() as cur:
        cur.execute(
            f"SELECT u.user_id, u.username, u.role, u.phone "
            f"FROM Sessions s JOIN Users u ON s.user_id = u.user_id "
            f"WHERE s.token = {PH}",
            (token,),
        )
        row = cur.fetchone()
    return _to_dicts([row])[0] if row else None


def require_user() -> dict:
    """要求登录；未登录抛 ValueError，由 errorhandler 转成 401。"""
    user = current_user()
    if not user:
        raise PermissionError("请先登录")
    return user


class RoleError(Exception):
    """已登录但身份不符（403）。"""


def require_role(*roles: str) -> dict:
    user = require_user()
    if user["role"] not in roles:
        raise RoleError(f"该操作需要「{'/'.join(ROLE_LABELS[r] for r in roles)}」身份")
    return user


def _merchant_id_of(user_id: int) -> int | None:
    with db.cursor() as cur:
        cur.execute(
            f"SELECT merchant_id FROM Merchants WHERE user_id = {PH}", (user_id,)
        )
        row = cur.fetchone()
    return row["merchant_id"] if row else None


# ----------------------------------------------------------------------
# 鉴权 API
# ----------------------------------------------------------------------
@app.post("/api/auth/register")
def auth_register():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or "customer"
    phone = (body.get("phone") or "").strip() or None
    merchant_name = (body.get("merchant_name") or "").strip()

    if not username or not password:
        return _bad("用户名和密码必填")
    if len(password) < 6:
        return _bad("密码至少 6 位")
    if role not in ("customer", "rider", "merchant", "admin"):
        return _bad("注册角色只能是 顾客 / 骑手 / 商家 / 管理员")
    if not re.fullmatch(r"[\w\u4e00-\u9fa5]{2,20}", username):
        return _bad("用户名需为 2-20 位字母、数字、下划线或中文")

    hashed = generate_password_hash(password, method="pbkdf2:sha256")

    with db.cursor() as cur:
        cur.execute(f"SELECT user_id FROM Users WHERE username = {PH}", (username,))
        if cur.fetchone():
            return _bad("用户名已存在")
        if phone:
            cur.execute(f"SELECT user_id FROM Users WHERE phone = {PH}", (phone,))
            if cur.fetchone():
                return _bad("该手机号已注册")
        cur.execute(
            f"INSERT INTO Users (username, password, role, phone) VALUES ({PH},{PH},{PH},{PH})",
            (username, hashed, role, phone),
        )
        new_id = cur.lastrowid

        # 商家注册时同步创建店铺
        if role == "merchant":
            cur.execute(
                f"INSERT INTO Merchants (user_id, merchant_name, merchant_phone) "
                f"VALUES ({PH},{PH},{PH})",
                (new_id, merchant_name or f"{username}的店铺", phone),
            )

    return jsonify({"ok": True, "message": "注册成功", "user_id": new_id, "role": role})


@app.post("/api/auth/login")
def auth_login():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role_hint = (body.get("role") or "").strip()  # 登录页选择的身份（可选校验）

    if not username or not password:
        return _bad("用户名和密码必填")

    with db.cursor() as cur:
        cur.execute(
            f"SELECT user_id, username, password, role FROM Users WHERE username = {PH}",
            (username,),
        )
        row = cur.fetchone()

    if not row or not check_password_hash(row["password"], password):
        return jsonify({"detail": "用户名或密码错误"}), 401
    if role_hint and row["role"] != role_hint:
        return _bad(f"该账号是「{ROLE_LABELS[row['role']]}」身份，请在上方切换后重试")

    token = secrets.token_hex(32)
    cur_conn = db.connect()
    try:
        c = cur_conn.cursor()
        c.execute(
            f"INSERT INTO Sessions (token, user_id) VALUES ({PH},{PH})",
            (token, row["user_id"]),
        )
        cur_conn.commit()
    finally:
        cur_conn.close()

    return jsonify(
        {
            "ok": True,
            "message": "登录成功",
            "token": token,
            "user_id": row["user_id"],
            "username": row["username"],
            "role": row["role"],
        }
    )


@app.post("/api/auth/logout")
def auth_logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        with db.cursor() as cur:
            cur.execute(f"DELETE FROM Sessions WHERE token = {PH}", (auth[7:].strip(),))
    return jsonify({"ok": True, "message": "已退出"})


@app.get("/api/me")
def api_me():
    user = require_user()
    data = dict(user)
    if user["role"] == "merchant":
        data["merchant_id"] = _merchant_id_of(user["user_id"])
    return jsonify(data)


# ---- 找回密码（演示环境：验证码直接返回给前端展示；真实项目应发邮件/短信）----
@app.post("/api/auth/forgot")
def auth_forgot():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    with db.cursor() as cur:
        cur.execute(f"SELECT user_id FROM Users WHERE username = {PH}", (username,))
        row = cur.fetchone()
        if not row:
            return _bad("用户不存在")
        code = f"{secrets.randbelow(1000000):06d}"
        expire = (datetime.now() + timedelta(minutes=RESET_CODE_TTL_MINUTES)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        cur.execute(
            f"UPDATE Users SET reset_code = {PH}, reset_expire = {PH} WHERE user_id = {PH}",
            (code, expire, row["user_id"]),
        )
    return jsonify(
        {
            "ok": True,
            "message": f"验证码已生成（{RESET_CODE_TTL_MINUTES} 分钟内有效）。演示环境直接显示，真实项目将通过邮件/短信发送。",
            "reset_code": code,
        }
    )


@app.post("/api/auth/reset")
def auth_reset():
    body = request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    code = (body.get("code") or "").strip()
    new_password = body.get("new_password") or ""
    if not (username and code and new_password):
        return _bad("用户名、验证码、新密码均必填")
    if len(new_password) < 6:
        return _bad("密码至少 6 位")

    with db.cursor() as cur:
        cur.execute(
            f"SELECT user_id, reset_code, reset_expire FROM Users WHERE username = {PH}",
            (username,),
        )
        row = cur.fetchone()
        if not row or not row["reset_code"]:
            return _bad("请先获取验证码")
        if row["reset_code"] != code:
            return _bad("验证码错误")
        if row["reset_expire"] and str(row["reset_expire"]) < _now():
            return _bad("验证码已过期，请重新获取")
        hashed = generate_password_hash(new_password, method="pbkdf2:sha256")
        cur.execute(
            f"UPDATE Users SET password = {PH}, reset_code = NULL, reset_expire = NULL "
            f"WHERE user_id = {PH}",
            (hashed, row["user_id"]),
        )
        # 重置密码后让所有旧会话失效
        cur.execute(f"DELETE FROM Sessions WHERE user_id = {PH}", (row["user_id"],))
    return jsonify({"ok": True, "message": "密码重置成功，请用新密码登录"})


ROLE_LABELS = {"customer": "顾客", "rider": "骑手", "merchant": "商家", "admin": "管理员"}


# ----------------------------------------------------------------------
# 商家 / 菜品
# ----------------------------------------------------------------------
@app.get("/api/merchants")
def list_merchants():
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT m.merchant_id, m.merchant_name, m.business_address, m.rating,
                   COUNT(d.dish_id) AS dish_count
            FROM Merchants m LEFT JOIN Dishes d ON d.merchant_id = m.merchant_id
            GROUP BY m.merchant_id
            ORDER BY m.merchant_id
            """
        )
        rows = _to_dicts(cur.fetchall())
    for r in rows:
        r["rating"] = round(float(r["rating"] or 0), 1)
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
    for r in rows:
        r["price"] = float(r["price"])
        r["emoji"] = r.get("emoji") or "🍽️"
    return jsonify(rows)


def _own_dish_or_error(cur, dish_id: int, merchant_id: int) -> dict:
    cur.execute(f"SELECT * FROM Dishes WHERE dish_id = {PH}", (dish_id,))
    row = cur.fetchone()
    dish = _to_dicts([row])[0] if row else None
    if not dish:
        raise LookupError("菜品不存在")
    if dish["merchant_id"] != merchant_id:
        raise PermissionError("只能操作自己店铺的菜品")
    return dish


@app.post("/api/dishes")
def create_dish():
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    if merchant_id is None:
        return _bad("当前账号没有关联店铺")
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("dish_name") or "").strip()
    price = body.get("price")
    stock = body.get("stock", 50)
    category = (body.get("category") or "其他").strip()
    emoji = (body.get("emoji") or "🍽️").strip()

    if not name or price is None:
        return _bad("菜品名称和价格必填")
    try:
        price = float(price)
        stock = int(stock)
    except (TypeError, ValueError):
        return _bad("价格 / 库存格式不正确")
    if price <= 0 or stock < 0:
        return _bad("价格必须大于 0，库存不能为负")

    with db.cursor() as cur:
        cur.execute(
            f"INSERT INTO Dishes (merchant_id, dish_name, price, stock, category, emoji) "
            f"VALUES ({PH},{PH},{PH},{PH},{PH},{PH})",
            (merchant_id, name, price, stock, category, emoji),
        )
        dish_id = cur.lastrowid
    return jsonify({"ok": True, "dish_id": dish_id, "message": "菜品已上架"})


@app.put("/api/dishes/<int:dish_id>")
def update_dish(dish_id: int):
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    body = request.get_json(force=True, silent=True) or {}
    with db.cursor() as cur:
        try:
            _own_dish_or_error(cur, dish_id, merchant_id)
        except LookupError as e:
            return _bad(str(e)), 404
        except PermissionError as e:
            return _bad(str(e)), 403

        fields, params = [], []
        for col in ("dish_name", "category", "emoji"):
            if col in body:
                fields.append(f"{col} = {PH}")
                params.append(body[col])
        if "price" in body:
            if float(body["price"]) <= 0:
                return _bad("价格必须大于 0")
            fields.append(f"price = {PH}")
            params.append(float(body["price"]))
        if "stock" in body:
            if int(body["stock"]) < 0:
                return _bad("库存不能为负")
            fields.append(f"stock = {PH}")
            params.append(int(body["stock"]))
        if fields:
            params.append(dish_id)
            cur.execute(f"UPDATE Dishes SET {', '.join(fields)} WHERE dish_id = {PH}", params)
    return jsonify({"ok": True, "message": "菜品已更新"})


@app.delete("/api/dishes/<int:dish_id>")
def delete_dish(dish_id: int):
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    with db.cursor() as cur:
        try:
            dish = _own_dish_or_error(cur, dish_id, merchant_id)
        except LookupError as e:
            return _bad(str(e)), 404
        except PermissionError as e:
            return _bad(str(e)), 403
        # 有历史订单的菜品不物理删除，只下架（stock=0），避免破坏订单明细
        cur.execute(
            f"SELECT COUNT(*) AS n FROM Order_Details WHERE dish_id = {PH}", (dish_id,)
        )
        if _to_dicts([cur.fetchone()])[0]["n"] > 0:
            cur.execute(
                f"UPDATE Dishes SET stock = 0 WHERE dish_id = {PH}", (dish_id,)
            )
            return jsonify({"ok": True, "message": "该菜品已有订单，已下架（库存清零）"})
        _remove_image_file(dish.get("dish_image_url"))
        cur.execute(f"DELETE FROM Dishes WHERE dish_id = {PH}", (dish_id,))
    return jsonify({"ok": True, "message": "菜品已删除"})


def _remove_image_file(url: str | None) -> None:
    """删除磁盘上的旧图片文件（仅限 uploads 目录内的文件）。"""
    if not url or not url.startswith("/static/uploads/"):
        return
    fname = os.path.basename(url)
    path = os.path.join(UPLOAD_DIR, fname)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


@app.post("/api/dishes/<int:dish_id>/image")
def upload_dish_image(dish_id: int):
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    f = request.files.get("file")
    if not f or not f.filename:
        return _bad("请选择要上传的图片")
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
    if ext not in ALLOWED_IMAGE_EXT:
        return _bad(f"仅支持图片格式：{', '.join(sorted(ALLOWED_IMAGE_EXT))}")
    data = f.read()
    if len(data) > MAX_IMAGE_SIZE:
        return _bad("图片不能超过 5MB")
    if not data:
        return _bad("图片内容为空")

    with db.cursor() as cur:
        try:
            dish = _own_dish_or_error(cur, dish_id, merchant_id)
        except LookupError as e:
            return _bad(str(e)), 404
        except PermissionError as e:
            return _bad(str(e)), 403

        fname = f"dish_{dish_id}_{uuid.uuid4().hex[:8]}.{ext}"
        with open(os.path.join(UPLOAD_DIR, fname), "wb") as out:
            out.write(data)
        _remove_image_file(dish.get("dish_image_url"))
        cur.execute(
            f"UPDATE Dishes SET dish_image_url = {PH} WHERE dish_id = {PH}",
            (f"/static/uploads/{fname}", dish_id),
        )
    return jsonify({"ok": True, "message": "实拍图已上传", "image_url": f"/static/uploads/{fname}"})


@app.delete("/api/dishes/<int:dish_id>/image")
def delete_dish_image(dish_id: int):
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    with db.cursor() as cur:
        try:
            dish = _own_dish_or_error(cur, dish_id, merchant_id)
        except LookupError as e:
            return _bad(str(e)), 404
        except PermissionError as e:
            return _bad(str(e)), 403
        _remove_image_file(dish.get("dish_image_url"))
        cur.execute(
            f"UPDATE Dishes SET dish_image_url = NULL WHERE dish_id = {PH}", (dish_id,)
        )
    return jsonify({"ok": True, "message": "已删除实拍图，将使用 emoji 展示"})


# ----------------------------------------------------------------------
# 订单：列表 / 详情 / 下单
# ----------------------------------------------------------------------
_ORDER_SELECT = """
    SELECT o.order_id, o.user_id, u.username AS customer_name, u.phone AS customer_phone,
           o.merchant_id, m.merchant_name, m.business_address,
           o.total_price, o.order_status, o.order_time,
           o.delivery_address, o.remark, o.cancel_reason, o.need_cutlery,
           o.rider_id, ru.username AS rider_name,
           o.accept_time, o.claim_time, o.deliver_time, o.complete_time
    FROM Orders o
    JOIN Users u     ON o.user_id = u.user_id
    JOIN Merchants m ON o.merchant_id = m.merchant_id
    LEFT JOIN Users ru ON o.rider_id = ru.user_id
"""


def _serialize_orders(cur, rows) -> list[dict]:
    orders = _to_dicts(rows)
    for o in orders:
        for tcol in ("order_time", "accept_time", "claim_time", "deliver_time", "complete_time"):
            if o.get(tcol) is not None:
                o[tcol] = str(o[tcol])
        o["total_price"] = float(o["total_price"])
        cur.execute(
            f"SELECT od.dish_id, d.dish_name, d.emoji, d.dish_image_url, od.quantity, od.unit_price "
            f"FROM Order_Details od JOIN Dishes d ON od.dish_id = d.dish_id "
            f"WHERE od.order_id = {PH}",
            (o["order_id"],),
        )
        details = _to_dicts(cur.fetchall())
        for d in details:
            d["unit_price"] = float(d["unit_price"])
        o["details"] = details
        cur.execute(
            f"SELECT comment_id, score, comment_content, comment_time, reply_content "
            f"FROM Comments WHERE order_id = {PH} ORDER BY comment_id DESC LIMIT 1",
            (o["order_id"],),
        )
        c = cur.fetchone()
        o["comment"] = _to_dicts([c])[0] if c else None
    return orders


@app.get("/api/orders")
def list_orders():
    user = require_user()
    scope = request.args.get("scope", "all")
    where, params = "1=1", []

    if user["role"] == "customer":
        where, params = f"o.user_id = {PH}", [user["user_id"]]
    elif user["role"] == "merchant":
        merchant_id = _merchant_id_of(user["user_id"])
        if merchant_id is None:
            return jsonify([])
        where, params = f"o.merchant_id = {PH}", [merchant_id]
    elif user["role"] == "rider":
        if scope == "available":  # 大厅：商家已接单、还没骑手抢
            where, params = "o.order_status = 'accepted' AND o.rider_id IS NULL", []
        elif scope == "active":
            where, params = (
                "o.rider_id = ? AND o.order_status IN ('delivering','delivered')",
                [user["user_id"]],
            )
        else:
            where, params = f"o.rider_id = {PH}", [user["user_id"]]
    # admin：看全部

    with db.cursor() as cur:
        cur.execute(
            f"{_ORDER_SELECT} WHERE {where} ORDER BY o.order_id DESC", params
        )
        orders = _serialize_orders(cur, cur.fetchall())
    return jsonify(orders)


@app.get("/api/orders/<int:order_id>")
def get_order(order_id: int):
    user = require_user()
    with db.cursor() as cur:
        cur.execute(f"{_ORDER_SELECT} WHERE o.order_id = {PH}", (order_id,))
        row = cur.fetchone()
        if not row:
            return _bad("订单不存在"), 404
        o = _to_dicts([row])[0]
        allowed = (
            user["role"] == "admin"
            or (user["role"] == "customer" and o["user_id"] == user["user_id"])
            or (user["role"] == "rider" and o["rider_id"] == user["user_id"])
            or (user["role"] == "merchant" and o["merchant_id"] == _merchant_id_of(user["user_id"]))
        )
        if not allowed:
            return _bad("没有权限查看该订单"), 403
        orders = _serialize_orders(cur, [row])
    return jsonify(orders[0])


@app.post("/api/orders")
def create_order():
    user = require_role("customer")
    body = request.get_json(force=True, silent=True) or {}
    merchant_id = body.get("merchant_id")
    delivery_address = (body.get("delivery_address") or "").strip()
    remark = (body.get("remark") or "").strip() or None
    items = body.get("items") or []
    need_cutlery = 1 if body.get("need_cutlery", True) else 0

    if not merchant_id or not items:
        return _bad("merchant_id 和 items 必填")
    if not delivery_address:
        return _bad("请填写配送地址")
    if not isinstance(items, list):
        return _bad("items 格式不正确")

    total = 0.0
    priced_items: list[tuple[int, int, float]] = []
    with db.cursor() as cur:
        cur.execute(
            f"SELECT merchant_id FROM Merchants WHERE merchant_id = {PH}", (merchant_id,)
        )
        if not cur.fetchone():
            return _bad("商家不存在"), 404
        for it in items:
            try:
                dish_id = int(it["dish_id"])
                qty = int(it["quantity"])
            except (KeyError, TypeError, ValueError):
                return _bad("items 中 dish_id / quantity 不合法")
            if qty <= 0:
                return _bad("数量必须大于 0")
            cur.execute(
                f"SELECT price, stock, dish_name, merchant_id FROM Dishes WHERE dish_id = {PH}",
                (dish_id,),
            )
            row = cur.fetchone()
            if not row:
                return _bad(f"菜品 {dish_id} 不存在"), 404
            dish = _to_dicts([row])[0]
            if dish["merchant_id"] != merchant_id:
                return _bad("只能点同一商家的菜品")
            if dish["stock"] < qty:
                return _bad(f"「{dish['dish_name']}」库存不足（剩余 {dish['stock']}）")
            price = float(dish["price"])
            total += price * qty
            priced_items.append((dish_id, qty, price))

        cur.execute(
            f"INSERT INTO Orders (user_id, merchant_id, total_price, order_status, "
            f"delivery_address, remark, need_cutlery) "
            f"VALUES ({PH},{PH},{PH},'pending_accept',{PH},{PH},{PH})",
            (user["user_id"], merchant_id, total, delivery_address, remark, need_cutlery),
        )
        new_id = cur.lastrowid
        for dish_id, qty, price in priced_items:
            cur.execute(
                f"INSERT INTO Order_Details (order_id, dish_id, quantity, unit_price) "
                f"VALUES ({PH},{PH},{PH},{PH})",
                (new_id, dish_id, qty, price),
            )
            cur.execute(
                f"UPDATE Dishes SET stock = stock - {PH} WHERE dish_id = {PH}", (qty, dish_id)
            )
    return jsonify(
        {"ok": True, "order_id": new_id, "total_price": round(total, 2), "status": "pending_accept"}
    )


# ----------------------------------------------------------------------
# 订单状态流转（角色各司其职）
# ----------------------------------------------------------------------
def _load_order(cur, order_id: int) -> dict | None:
    cur.execute(f"SELECT * FROM Orders WHERE order_id = {PH}", (order_id,))
    row = cur.fetchone()
    return _to_dicts([row])[0] if row else None


@app.post("/api/orders/<int:order_id>/accept")
def accept_order(order_id: int):
    """商家接单：pending_accept -> accepted"""
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["merchant_id"] != merchant_id:
            return _bad("只能处理自己店铺的订单"), 403
        if o["order_status"] != "pending_accept":
            return _bad(f"当前状态（{STATUS_LABELS[o['order_status']]}）不能接单")
        cur.execute(
            f"UPDATE Orders SET order_status = 'accepted', accept_time = {PH} WHERE order_id = {PH}",
            (_now(), order_id),
        )
    return jsonify({"ok": True, "message": "已接单，等待骑手抢单", "status": "accepted"})


@app.post("/api/orders/<int:order_id>/reject")
def reject_order(order_id: int):
    """商家拒单：pending_accept -> cancelled"""
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    body = request.get_json(force=True, silent=True) or {}
    reason = (body.get("reason") or "商家暂时无法接单").strip()
    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["merchant_id"] != merchant_id:
            return _bad("只能处理自己店铺的订单"), 403
        if o["order_status"] != "pending_accept":
            return _bad(f"当前状态（{STATUS_LABELS[o['order_status']]}）不能拒单")
        cur.execute(
            f"UPDATE Orders SET order_status = 'cancelled', cancel_reason = {PH}, "
            f"accept_time = {PH} WHERE order_id = {PH}",
            (f"商家拒单：{reason}", _now(), order_id),
        )
        _restock(cur, order_id)
    return jsonify({"ok": True, "message": "已拒单", "status": "cancelled"})


@app.post("/api/orders/<int:order_id>/claim")
def claim_order(order_id: int):
    """骑手抢单：accepted -> delivering"""
    user = require_role("rider")
    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["order_status"] != "accepted" or o["rider_id"] is not None:
            return _bad("手慢了，该订单已被抢走或不可接单")
        cur.execute(
            f"UPDATE Orders SET order_status = 'delivering', rider_id = {PH}, claim_time = {PH} "
            f"WHERE order_id = {PH} AND order_status = 'accepted' AND rider_id IS NULL",
            (user["user_id"], _now(), order_id),
        )
        if cur.rowcount == 0:
            return _bad("手慢了，该订单已被抢走")
        cur.execute(
            f"INSERT INTO Deliveries (order_id, rider_id, delivery_status, pickup_time) "
            f"VALUES ({PH},{PH},'delivering',{PH})",
            (order_id, user["user_id"], _now()),
        )
    return jsonify({"ok": True, "message": "抢单成功，开始配送", "status": "delivering"})


@app.post("/api/orders/<int:order_id>/deliver")
def deliver_order(order_id: int):
    """骑手送达：delivering -> delivered"""
    user = require_role("rider")
    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["rider_id"] != user["user_id"]:
            return _bad("只能操作自己承接的订单"), 403
        if o["order_status"] != "delivering":
            return _bad(f"当前状态（{STATUS_LABELS[o['order_status']]}）不能标记送达")
        cur.execute(
            f"UPDATE Orders SET order_status = 'delivered', deliver_time = {PH} WHERE order_id = {PH}",
            (_now(), order_id),
        )
        cur.execute(
            f"UPDATE Deliveries SET delivery_status = 'completed', complete_time = {PH} "
            f"WHERE order_id = {PH}",
            (_now(), order_id),
        )
    return jsonify({"ok": True, "message": "已送达，等待顾客评价", "status": "delivered"})


@app.post("/api/orders/<int:order_id>/cancel")
def cancel_order(order_id: int):
    """顾客取消：pending_accept / accepted -> cancelled"""
    user = require_role("customer")
    body = request.get_json(force=True, silent=True) or {}
    reason = (body.get("reason") or "顾客主动取消").strip()
    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["user_id"] != user["user_id"]:
            return _bad("只能取消自己的订单"), 403
        if o["order_status"] not in ("pending_accept", "accepted"):
            return _bad(f"当前状态（{STATUS_LABELS[o['order_status']]}）已无法取消")
        if o["order_status"] == "accepted" and o["rider_id"] is not None:
            return _bad("骑手已抢单，无法取消")
        cur.execute(
            f"UPDATE Orders SET order_status = 'cancelled', cancel_reason = {PH} WHERE order_id = {PH}",
            (f"顾客取消：{reason}", order_id),
        )
        _restock(cur, order_id)
    return jsonify({"ok": True, "message": "订单已取消", "status": "cancelled"})


def _restock(cur, order_id: int) -> None:
    """取消/拒单后把库存加回去。"""
    cur.execute(
        f"SELECT dish_id, quantity FROM Order_Details WHERE order_id = {PH}", (order_id,)
    )
    for r in _to_dicts(cur.fetchall()):
        cur.execute(
            f"UPDATE Dishes SET stock = stock + {PH} WHERE dish_id = {PH}",
            (r["quantity"], r["dish_id"]),
        )


@app.post("/api/orders/<int:order_id>/comment")
def comment_order(order_id: int):
    """顾客评价：delivered -> completed，并同步刷新商家评分"""
    user = require_role("customer")
    body = request.get_json(force=True, silent=True) or {}
    score = body.get("score")
    content = (body.get("content") or "").strip() or None
    try:
        score = int(score)
    except (TypeError, ValueError):
        return _bad("score 必须是 1-5 的整数")
    if not 1 <= score <= 5:
        return _bad("score 必须是 1-5 的整数")

    with db.cursor() as cur:
        o = _load_order(cur, order_id)
        if not o:
            return _bad("订单不存在"), 404
        if o["user_id"] != user["user_id"]:
            return _bad("只能评价自己的订单"), 403
        if o["order_status"] != "delivered":
            return _bad(f"当前状态（{STATUS_LABELS[o['order_status']]}）还不能评价")
        cur.execute(
            f"SELECT COUNT(*) AS n FROM Comments WHERE order_id = {PH}", (order_id,)
        )
        if _to_dicts([cur.fetchone()])[0]["n"] > 0:
            return _bad("该订单已评价过")
        cur.execute(
            f"INSERT INTO Comments (order_id, user_id, score, comment_content, comment_time) "
            f"VALUES ({PH},{PH},{PH},{PH},{PH})",
            (order_id, user["user_id"], score, content, _now()),
        )
        cur.execute(
            f"UPDATE Orders SET order_status = 'completed', complete_time = {PH} WHERE order_id = {PH}",
            (_now(), order_id),
        )
        # 商家评分 = 历史评价均值
        cur.execute(
            f"SELECT AVG(c.score) AS avg_score FROM Comments c "
            f"JOIN Orders o ON c.order_id = o.order_id WHERE o.merchant_id = {PH}",
            (o["merchant_id"],),
        )
        avg = _to_dicts([cur.fetchone()])[0]["avg_score"]
        if avg is not None:
            cur.execute(
                f"UPDATE Merchants SET rating = {PH} WHERE merchant_id = {PH}",
                (round(float(avg), 2), o["merchant_id"]),
            )
    return jsonify({"ok": True, "message": "评价成功，订单完成", "status": "completed"})


@app.post("/api/comments/<int:comment_id>/reply")
def reply_comment(comment_id: int):
    user = require_role("merchant")
    merchant_id = _merchant_id_of(user["user_id"])
    body = request.get_json(force=True, silent=True) or {}
    content = (body.get("content") or "").strip()
    if not content:
        return _bad("回复内容不能为空")
    with db.cursor() as cur:
        cur.execute(
            f"SELECT c.comment_id, o.merchant_id FROM Comments c "
            f"JOIN Orders o ON c.order_id = o.order_id WHERE c.comment_id = {PH}",
            (comment_id,),
        )
        row = cur.fetchone()
        if not row:
            return _bad("评价不存在"), 404
        if _to_dicts([row])[0]["merchant_id"] != merchant_id:
            return _bad("只能回复自己店铺收到的评价"), 403
        cur.execute(
            f"UPDATE Comments SET reply_content = {PH}, reply_time = {PH} WHERE comment_id = {PH}",
            (content, _now(), comment_id),
        )
    return jsonify({"ok": True, "message": "回复成功"})


STATUS_LABELS = {
    "pending_accept": "待商家接单",
    "accepted": "商家已接单",
    "delivering": "配送中",
    "delivered": "已送达",
    "completed": "已完成",
    "cancelled": "已取消",
}


@app.get("/api/merchants/<int:merchant_id>/comments")
def merchant_comments(merchant_id: int):
    with db.cursor() as cur:
        cur.execute(
            f"""
            SELECT c.comment_id, c.score, c.comment_content, c.comment_time,
                   c.reply_content, c.reply_time, u.username AS customer_name,
                   o.order_id
            FROM Comments c
            JOIN Orders o ON c.order_id = o.order_id
            JOIN Users u  ON c.user_id = u.user_id
            WHERE o.merchant_id = {PH}
            ORDER BY c.comment_id DESC
            """,
            (merchant_id,),
        )
        rows = _to_dicts(cur.fetchall())
    return jsonify(rows)


# ----------------------------------------------------------------------
# 骑手统计
# ----------------------------------------------------------------------
@app.get("/api/rider/stats")
def rider_stats():
    user = require_role("rider")
    with db.cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) AS n FROM Deliveries WHERE rider_id = {PH} "
            f"AND delivery_status = 'completed'",
            (user["user_id"],),
        )
        done = _to_dicts([cur.fetchone()])[0]["n"]
        cur.execute(
            f"SELECT COUNT(*) AS n FROM Orders WHERE rider_id = {PH} "
            f"AND order_status = 'delivering'",
            (user["user_id"],),
        )
        active = _to_dicts([cur.fetchone()])[0]["n"]
        cur.execute(
            f"""
            SELECT COUNT(*) AS n FROM Orders
            WHERE rider_id = {PH} AND order_status = 'completed'
              AND DATE(order_time) = DATE('now')
            """,
            (user["user_id"],),
        )
        today = _to_dicts([cur.fetchone()])[0]["n"]
    return jsonify(
        {
            "completed": done,
            "active": active,
            "today": today,
            "earnings": round(done * RIDER_FEE_PER_ORDER, 2),
            "fee_per_order": RIDER_FEE_PER_ORDER,
        }
    )


# ----------------------------------------------------------------------
# 管理员：看板 + 用户
# ----------------------------------------------------------------------
@app.get("/api/admin/stats")
def admin_stats():
    require_role("admin")
    with db.cursor() as cur:
        cur.execute("SELECT role, COUNT(*) AS n FROM Users GROUP BY role")
        role_dist = {r["role"]: r["n"] for r in _to_dicts(cur.fetchall())}

        cur.execute("SELECT COUNT(*) AS n FROM Orders")
        total_orders = _to_dicts([cur.fetchone()])[0]["n"]

        cur.execute(
            f"SELECT COALESCE(SUM(total_price),0) AS s FROM Orders "
            f"WHERE order_status IN ('delivered','completed')"
        )
        revenue = float(_to_dicts([cur.fetchone()])[0]["s"] or 0)

        cur.execute(
            f"SELECT COUNT(*) AS n FROM Orders WHERE DATE(order_time) = DATE('now')"
        )
        today_orders = _to_dicts([cur.fetchone()])[0]["n"]

        # 近 7 天订单量 / 营收
        cur.execute(
            f"""
            SELECT DATE(order_time) AS day, COUNT(*) AS orders,
                   COALESCE(SUM(CASE WHEN order_status IN ('delivered','completed')
                                     THEN total_price ELSE 0 END), 0) AS revenue
            FROM Orders
            WHERE order_time >= DATETIME('now', '-6 days', 'start of day')
            GROUP BY DATE(order_time) ORDER BY day
            """
        )
        weekly = _to_dicts(cur.fetchall())

        cur.execute("SELECT order_status AS status, COUNT(*) AS n FROM Orders GROUP BY order_status")
        status_dist = _to_dicts(cur.fetchall())

        cur.execute(
            f"""
            SELECT m.merchant_name, COUNT(o.order_id) AS orders,
                   COALESCE(SUM(CASE WHEN o.order_status IN ('delivered','completed')
                                     THEN o.total_price ELSE 0 END), 0) AS revenue,
                   m.rating
            FROM Merchants m LEFT JOIN Orders o ON o.merchant_id = m.merchant_id
            GROUP BY m.merchant_id ORDER BY revenue DESC
            """
        )
        merchant_rank = _to_dicts(cur.fetchall())

        cur.execute(
            f"""
            SELECT d.dish_name, SUM(od.quantity) AS sold
            FROM Order_Details od JOIN Dishes d ON od.dish_id = d.dish_id
            GROUP BY od.dish_id ORDER BY sold DESC LIMIT 5
            """
        )
        top_dishes = _to_dicts(cur.fetchall())

    for r in weekly:
        r["revenue"] = float(r["revenue"] or 0)
    for r in merchant_rank:
        r["revenue"] = float(r["revenue"] or 0)
        r["rating"] = float(r["rating"] or 0)

    return jsonify(
        {
            "cards": {
                "users": sum(role_dist.values()),
                "customers": role_dist.get("customer", 0),
                "merchants": role_dist.get("merchant", 0),
                "riders": role_dist.get("rider", 0),
                "orders": total_orders,
                "today_orders": today_orders,
                "revenue": round(revenue, 2),
            },
            "role_dist": role_dist,
            "weekly": weekly,
            "status_dist": status_dist,
            "merchant_rank": merchant_rank,
            "top_dishes": top_dishes,
        }
    )


@app.get("/api/admin/users")
def admin_users():
    require_role("admin")
    with db.cursor() as cur:
        cur.execute(
            f"SELECT user_id, username, role, phone, password, created_at FROM Users ORDER BY user_id"
        )
        rows = _to_dicts(cur.fetchall())
    for r in rows:
        if r.get("created_at") is not None:
            r["created_at"] = str(r["created_at"])
        # 密码以 PBKDF2 哈希展示（明文不可还原），同时返回算法与 salt 便于课程演示
        if r.get("password"):
            algo, _, salt_hash = r["password"].partition("$")
            r["password_algo"] = algo
            r["password_hash"] = r["password"]
    return jsonify(rows)


@app.put("/api/admin/users/<int:user_id>/reset-password")
def admin_reset_password(user_id: int):
    """管理员重置任意用户密码（课程演示：管理员掌握全量账号数据）。"""
    require_role("admin")
    body = request.get_json(force=True, silent=True) or {}
    new_password = body.get("new_password") or ""
    if len(new_password) < 6:
        return _bad("新密码至少 6 位")
    with db.cursor() as cur:
        cur.execute(f"SELECT user_id FROM Users WHERE user_id = {PH}", (user_id,))
        if not cur.fetchone():
            return _bad("用户不存在", 404)
        cur.execute(
            f"UPDATE Users SET password = {PH} WHERE user_id = {PH}",
            (generate_password_hash(new_password, method="pbkdf2:sha256"), user_id),
        )
    return jsonify({"ok": True, "message": f"已重置用户 {user_id} 的密码"})


# ----------------------------------------------------------------------
# 错误处理
# ----------------------------------------------------------------------
@app.errorhandler(PermissionError)
def handle_permission(err: PermissionError):
    return jsonify({"detail": str(err)}), 401


@app.errorhandler(RoleError)
def handle_role_error(err: RoleError):
    return jsonify({"detail": str(err)}), 403


@app.errorhandler(404)
def not_found(_):
    return jsonify({"detail": "Not Found"}), 404


@app.errorhandler(500)
def internal_error(err):
    return jsonify({"detail": "Internal Server Error", "error": str(err)}), 500


# ======================================================================
# 地址簿（v3）：每个顾客可保存多个收货地址，0/1 个默认地址
# ======================================================================

def _serialize_address(row) -> dict:
    keys = ("address_id", "user_id", "receiver_name", "receiver_phone",
            "address_label", "detail_address", "is_default", "created_at")
    return {k: row[i] for i, k in enumerate(keys)}


@app.get("/api/addresses")
def list_addresses():
    """列出当前登录顾客的全部地址（默认排在最前）。"""
    user = require_role("customer")
    with db.cursor() as cur:
        cur.execute(
            "SELECT address_id, user_id, receiver_name, receiver_phone, "
            "address_label, detail_address, is_default, created_at "
            "FROM Addresses WHERE user_id = ? "
            "ORDER BY is_default DESC, address_id DESC",
            (user["user_id"],),
        )
        return [_serialize_address(r) for r in cur.fetchall()]


def _validate_address_payload(body: dict) -> tuple[dict, str | None]:
    """统一校验地址字段。"""
    receiver_name = (body.get("receiver_name") or "").strip()
    receiver_phone = (body.get("receiver_phone") or "").strip()
    detail_address = (body.get("detail_address") or "").strip()
    address_label = (body.get("address_label") or "").strip() or None

    if not receiver_name:
        return {}, "收货人姓名不能为空"
    if not receiver_phone:
        return {}, "收货电话不能为空"
    if not re.fullmatch(r"[\d\-\+\s\(\)]{6,20}", receiver_phone):
        return {}, "收货电话格式不正确（仅允许数字/+/空格/-/()）"
    if not detail_address or len(detail_address) < 4:
        return {}, "详细地址不能少于 4 个字"
    if address_label and len(address_label) > 16:
        return {}, "地址标签最多 16 个字"
    return {
        "receiver_name": receiver_name,
        "receiver_phone": receiver_phone,
        "detail_address": detail_address,
        "address_label": address_label,
    }, None


@app.post("/api/addresses")
def add_address():
    """新增地址。如果当前还没有地址，自动设为默认。"""
    user = require_role("customer")
    body = request.get_json(silent=True) or {}
    payload, err = _validate_address_payload(body)
    if err:
        return jsonify({"detail": err}), 400

    with db.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM Addresses WHERE user_id = ?",
            (user["user_id"],),
        )
        is_first = (cur.fetchone()[0] or 0) == 0
        is_default = 1 if is_first else (1 if body.get("is_default") else 0)

        if is_default:
            cur.execute(
                "UPDATE Addresses SET is_default = 0 WHERE user_id = ?",
                (user["user_id"],),
            )

        cur.execute(
            "INSERT INTO Addresses (user_id, receiver_name, receiver_phone, "
            "address_label, detail_address, is_default) VALUES (?, ?, ?, ?, ?, ?)",
            (user["user_id"], payload["receiver_name"], payload["receiver_phone"],
             payload["address_label"], payload["detail_address"], is_default),
        )
        address_id = cur.lastrowid

        cur.execute(
            "SELECT address_id, user_id, receiver_name, receiver_phone, "
            "address_label, detail_address, is_default, created_at "
            "FROM Addresses WHERE address_id = ?",
            (address_id,),
        )
        row = cur.fetchone()
        return _serialize_address(row)


@app.put("/api/addresses/<int:address_id>")
def update_address(address_id: int):
    """修改地址（仅本人）。"""
    user = require_role("customer")
    payload, err = _validate_address_payload(request.get_json(silent=True) or {})
    if err:
        return jsonify({"detail": err}), 400
    with db.cursor() as cur:
        cur.execute(
            "SELECT user_id FROM Addresses WHERE address_id = ?",
            (address_id,),
        )
        row = cur.fetchone()
        if not row or row[0] != user["user_id"]:
            return jsonify({"detail": "地址不存在"}), 404
        cur.execute(
            "UPDATE Addresses SET receiver_name=?, receiver_phone=?, "
            "address_label=?, detail_address=? WHERE address_id=?",
            (payload["receiver_name"], payload["receiver_phone"],
             payload["address_label"], payload["detail_address"], address_id),
        )
        return {"ok": True, "address_id": address_id}


@app.post("/api/addresses/<int:address_id>/default")
def set_default_address(address_id: int):
    """把某个地址设为默认（同一时间只有一个默认）。"""
    user = require_role("customer")
    with db.cursor() as cur:
        cur.execute(
            "SELECT user_id FROM Addresses WHERE address_id = ?",
            (address_id,),
        )
        row = cur.fetchone()
        if not row or row[0] != user["user_id"]:
            return jsonify({"detail": "地址不存在"}), 404
        cur.execute(
            "UPDATE Addresses SET is_default = 0 WHERE user_id = ?",
            (user["user_id"],),
        )
        cur.execute(
            "UPDATE Addresses SET is_default = 1 WHERE address_id = ?",
            (address_id,),
        )
        return {"ok": True}


@app.delete("/api/addresses/<int:address_id>")
def delete_address(address_id: int):
    """删除地址。如果删除的是默认，自动把剩余的最近一条设为默认。"""
    user = require_role("customer")
    with db.cursor() as cur:
        cur.execute(
            "SELECT user_id, is_default FROM Addresses WHERE address_id = ?",
            (address_id,),
        )
        row = cur.fetchone()
        if not row or row[0] != user["user_id"]:
            return jsonify({"detail": "地址不存在"}), 404
        was_default = row[1]
        cur.execute(
            "DELETE FROM Addresses WHERE address_id = ?",
            (address_id,),
        )
        if was_default:
            cur.execute(
                "SELECT address_id FROM Addresses WHERE user_id = ? "
                "ORDER BY address_id DESC LIMIT 1",
                (user["user_id"],),
            )
            nxt = cur.fetchone()
            if nxt:
                cur.execute(
                    "UPDATE Addresses SET is_default = 1 WHERE address_id = ?",
                    (nxt[0],),
                )
        return {"ok": True}


# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------

@app.get("/dev/shot-login")
def shot_login():
    """演示/截图专用：根据 ?role=&username=&next= 直接登录并跳转到目标页。
    仅当 ENV=development 或 FLASK_ENV=development 时启用。"""
    if not (app.debug or os.environ.get("WAIMAI_SHOT_MODE")):
        return jsonify({"detail": "shot mode disabled"}), 404
    role = request.args.get("role", "customer")
    username = request.args.get("username", "alice")
    next_page = request.args.get("next", f"/{role}")
    body = {"username": username, "password": "123456", "role": role}
    with db.cursor() as cur:
        cur.execute(f"SELECT user_id, password, role FROM Users WHERE username = {PH}",
                    (username,))
        row = cur.fetchone()
    if not row or not check_password_hash(row[1], "123456"):
        return jsonify({"detail": "bad credentials"}), 401
    token = secrets.token_hex(32)
    with db.cursor() as cur:
        cur.execute(
            f"INSERT INTO Sessions (token, user_id) VALUES ({PH}, {PH})",
            (token, row[0]),
        )
    # 通过 meta 标签写 localStorage 然后跳转
    user = {"user_id": row[0], "username": username, "role": row[2]}
    return f"""<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
localStorage.setItem('waimai_token', '{token}');
localStorage.setItem('waimai_user', '{json.dumps(user, ensure_ascii=False)}');
location.replace('{next_page}');
</script></body></html>"""


if __name__ == "__main__":
    print(f"[INFO] 后端类型: {db.backend}")
    if db.backend == "sqlite":
        print(f"[INFO] SQLite 数据库: {SQLITE_PATH}")
    else:
        print(f"[INFO] MySQL: {MYSQL_USER}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}")
    print("[INFO] 启动 Flask 服务，访问 http://127.0.0.1:5000/")
    app.run(host="0.0.0.0", port=5000, debug=True)
