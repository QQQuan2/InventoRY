"""
smoke_test.py —— 全流程冒烟测试
================================

覆盖：四角色注册登录、找回密码、完整订单闭环
（下单 → 商家接单 → 骑手抢单 → 送达 → 评价）、
菜品管理与实拍图上传、权限隔离、管理员看板。

用法：先启动服务（python app.py），再运行：
    python tests/smoke_test.py
"""

import io
import json
import struct
import sys
import urllib.error
import urllib.request
import zlib

# Windows 控制台默认 GBK，强制 UTF-8 避免输出 emoji 报错
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:5000"

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(name: str, cond: bool, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  ❌ {name} {extra}")


def req(method: str, path: str, body=None, token: str | None = None, raw: bytes | None = None,
        filename: str | None = None):
    """极简 HTTP 客户端（不引第三方依赖）。"""
    url = BASE + path
    headers = {}
    data = None
    if raw is not None:
        # multipart/form-data 手工构造
        boundary = "----waimaitestboundary"
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        part = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: image/png\r\n\r\n"
        ).encode() + raw + b"\r\n" + f"--{boundary}--\r\n".encode()
        data = part
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    def _parse(bs: bytes):
        try:
            return json.loads(bs.decode() or "{}")
        except Exception:
            return {}  # 页面等非 JSON 响应

    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, _parse(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, _parse(e.read())


def section(title: str):
    print(f"\n▶ {title}")


def tiny_png() -> bytes:
    """生成一个 1x1 的合法 PNG，用于测试图片上传。"""
    def chunk(typ: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\x00\x00")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main() -> int:
    section("基础可用性")
    st, data = req("GET", "/api/health")
    check("健康检查 /api/health", st == 200 and data.get("ok"))
    st, _ = req("GET", "/")
    check("登录页可访问 /", st == 200)
    for page in ("customer", "merchant", "rider", "admin"):
        st, _ = req("GET", f"/{page}")
        check(f"页面 /{page} 可访问", st == 200)

    section("注册")
    st, _ = req("POST", "/api/auth/register", {"username": "test_cust", "password": "abc12345", "role": "customer", "phone": "13911112222"})
    check("注册顾客", st == 200)
    st, _ = req("POST", "/api/auth/register", {"username": "test_shop", "password": "abc12345", "role": "merchant", "merchant_name": "测试小馆", "phone": "13911113333"})
    check("注册商家（自动建店铺）", st == 200)
    st, _ = req("POST", "/api/auth/register", {"username": "test_rider", "password": "abc12345", "role": "rider"})
    check("注册骑手", st == 200)
    st, data = req("POST", "/api/auth/register", {"username": "test_cust", "password": "abc12345", "role": "customer"})
    check("重复用户名被拒绝", st == 400)
    st, _ = req("POST", "/api/auth/register", {"username": "test_admin_x", "password": "abc12345", "role": "admin"})
    check("注册管理员", st == 200)

    section("登录 / 身份校验")
    st, tok_c = req("POST", "/api/auth/login", {"username": "alice", "password": "123456", "role": "customer"})
    check("顾客登录", st == 200 and tok_c.get("token"))
    TOKEN_C = tok_c.get("token", "")
    st, tok_m = req("POST", "/api/auth/login", {"username": "shop_zha", "password": "123456", "role": "merchant"})
    check("商家登录", st == 200 and tok_m.get("token"))
    TOKEN_M = tok_m.get("token", "")
    st, tok_r = req("POST", "/api/auth/login", {"username": "bob", "password": "123456", "role": "rider"})
    check("骑手登录", st == 200 and tok_r.get("token"))
    TOKEN_R = tok_r.get("token", "")
    st, tok_a = req("POST", "/api/auth/login", {"username": "admin", "password": "123456", "role": "admin"})
    check("管理员登录", st == 200 and tok_a.get("token"))
    TOKEN_A = tok_a.get("token", "")
    st, _ = req("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
    check("错误密码被拒绝", st == 401)
    st, _ = req("POST", "/api/auth/login", {"username": "alice", "password": "123456", "role": "merchant"})
    check("身份选错时被拦截提示", st == 400)

    section("找回密码")
    st, data = req("POST", "/api/auth/forgot", {"username": "test_rider"})
    code = data.get("reset_code", "")
    check("获取重置验证码", st == 200 and len(code) == 6)
    st, _ = req("POST", "/api/auth/reset", {"username": "test_rider", "code": "000000" if code != "000000" else "111111", "new_password": "newpass66"})
    check("错误验证码被拒绝", st == 400)
    st, _ = req("POST", "/api/auth/reset", {"username": "test_rider", "code": code, "new_password": "newpass66"})
    check("重置密码成功", st == 200)
    st, _ = req("POST", "/api/auth/login", {"username": "test_rider", "password": "newpass66", "role": "rider"})
    check("新密码可登录", st == 200)

    section("顾客点餐")
    st, merchants = req("GET", "/api/merchants")
    check("商家列表", st == 200 and len(merchants) >= 3)
    st, dishes = req("GET", "/api/dishes?merchant_id=1")
    check("商家 1 菜品列表", st == 200 and len(dishes) >= 2)
    st, data = req("POST", "/api/orders", {
        "merchant_id": 1,
        "delivery_address": "测试地址 301",
        "remark": "冒烟测试订单",
        "items": [{"dish_id": 1, "quantity": 2}],
    }, TOKEN_C)
    check("下单成功", st == 200 and data.get("status") == "pending_accept")
    ORDER = data.get("order_id")
    st, data = req("POST", "/api/orders", {"merchant_id": 1, "items": [{"dish_id": 1, "quantity": 1}]}, TOKEN_C)
    check("缺配送地址被拒绝", st == 400)
    st, data = req("GET", "/api/dishes?merchant_id=1")
    d1 = next(d for d in data if d["dish_id"] == 1)
    check("下单后库存扣减", d1["stock"] == 100 - 2, f"实际 stock={d1['stock']}")

    section("订单闭环：商家接单 → 骑手抢单 → 送达 → 评价")
    st, data = req("GET", "/api/orders", token=TOKEN_M)
    check("商家能看到本店订单", st == 200 and any(o["order_id"] == ORDER for o in data))
    st, _ = req("POST", f"/api/orders/{ORDER}/accept", {}, TOKEN_R)
    check("骑手不能替商家接单（403）", st == 403)
    st, _ = req("POST", f"/api/orders/{ORDER}/accept", {}, TOKEN_M)
    check("商家接单", st == 200)
    st, hall = req("GET", "/api/orders?scope=available", token=TOKEN_R)
    check("骑手抢单大厅可见该单", any(o["order_id"] == ORDER for o in hall))
    st, _ = req("POST", f"/api/orders/{ORDER}/claim", {}, TOKEN_R)
    check("骑手抢单", st == 200)
    st, _ = req("POST", f"/api/orders/{ORDER}/deliver", {}, TOKEN_R)
    check("骑手标记送达", st == 200)
    st, _ = req("POST", f"/api/orders/{ORDER}/comment", {"score": 3}, TOKEN_R)
    check("骑手不能评价（403）", st == 403)
    st, _ = req("POST", f"/api/orders/{ORDER}/comment", {"score": 5, "content": "冒烟测试五星好评"}, TOKEN_C)
    check("顾客评价 → 订单完成", st == 200)
    st, data = req("GET", f"/api/orders/{ORDER}", token=TOKEN_C)
    check("订单详情含评价", data.get("comment", {}).get("score") == 5)
    st, merchants = req("GET", "/api/merchants")
    m1 = next(m for m in merchants if m["merchant_id"] == 1)
    check("商家评分随评价刷新", abs(m1["rating"] - 5.0) < 2.0)

    section("商家回复评价")
    st, comments = req("GET", "/api/merchants/1/comments", token=TOKEN_M)
    check("商家可查看本店评价", st == 200 and len(comments) >= 1)
    cid = comments[0]["comment_id"]
    st, _ = req("POST", f"/api/comments/{cid}/reply", {"content": "谢谢支持～"}, TOKEN_M)
    check("商家回复评价", st == 200)

    section("取消订单与库存回补")
    st, dishes_before = req("GET", "/api/dishes?merchant_id=1")
    stock_before = next(d for d in dishes_before if d["dish_id"] == 1)["stock"]
    st, data = req("POST", "/api/orders", {
        "merchant_id": 1, "delivery_address": "测试地址",
        "items": [{"dish_id": 1, "quantity": 3}],
    }, TOKEN_C)
    ORDER2 = data.get("order_id")
    st, _ = req("POST", f"/api/orders/{ORDER2}/cancel", {"reason": "不想吃了"}, TOKEN_C)
    check("顾客取消待接单订单", st == 200)
    st, dishes_after = req("GET", "/api/dishes?merchant_id=1")
    stock_after = next(d for d in dishes_after if d["dish_id"] == 1)["stock"]
    check("取消后库存回补到下单前水平", stock_after == stock_before, f"{stock_before} -> {stock_after}")

    section("菜品管理与图片上传")
    st, data = req("POST", "/api/dishes", {"dish_name": "冒烟测试菜", "price": 9.9, "stock": 10, "category": "小吃", "emoji": "🥟"}, TOKEN_M)
    check("新增菜品", st == 200)
    NEWDISH = data.get("dish_id")
    st, _ = req("PUT", f"/api/dishes/{NEWDISH}", {"price": 12.9}, TOKEN_M)
    check("修改菜品价格", st == 200)
    st, _ = req("POST", f"/api/dishes/{NEWDISH}/image", token=TOKEN_M)
    check("不带文件上传被拒绝", st == 400)
    st, _ = req("POST", f"/api/dishes/{NEWDISH}/image", raw=tiny_png(), filename="test.png", token=TOKEN_M)
    check("上传实拍图", st == 200)
    st, dishes = req("GET", "/api/dishes?merchant_id=1")
    nd = next(d for d in dishes if d["dish_id"] == NEWDISH)
    check("实拍图 URL 生效", bool(nd.get("dish_image_url")))
    st, _ = req("DELETE", f"/api/dishes/{NEWDISH}/image", token=TOKEN_M)
    check("删除实拍图（回落 emoji）", st == 200)
    st, _ = req("POST", "/api/dishes", {"dish_name": "x", "price": 1}, TOKEN_C)
    check("顾客不能新增菜品（403）", st == 403)
    st, _ = req("DELETE", f"/api/dishes/{NEWDISH}", token=TOKEN_M)
    check("删除无订单菜品", st == 200)

    section("骑手统计与管理员看板")
    st, s = req("GET", "/api/rider/stats", token=TOKEN_R)
    check("骑手统计数据", st == 200 and s.get("completed") >= 1)
    st, s = req("GET", "/api/admin/stats", token=TOKEN_A)
    check("管理员看板数据", st == 200 and "cards" in s and s.get("weekly") is not None)
    check("看板包含近 7 天走势", len(s.get("weekly", [])) >= 1)
    check("看板包含商家排行", len(s.get("merchant_rank", [])) >= 1)
    st, _ = req("GET", "/api/admin/stats", token=TOKEN_C)
    check("顾客不能访问看板（403）", st == 403)
    st, users = req("GET", "/api/admin/users", token=TOKEN_A)
    check("管理员用户列表", st == 200 and len(users) >= 6)
    check("用户列表含密码哈希（PBKDF2）",
          all(u.get("password_hash", "").startswith("pbkdf2:sha256") for u in users))

    section("管理员用户管理（重置密码）")
    # 找到 alice 的 user_id，重置其密码再改回
    alice = next(u for u in users if u["username"] == "alice")
    st, _ = req("PUT", f"/api/admin/users/{alice['user_id']}/reset-password",
                {"new_password": "temp654321"}, TOKEN_A)
    check("管理员重置用户密码", st == 200)
    st, _ = req("POST", "/api/auth/login", {"username": "alice", "password": "temp654321"})
    check("新密码可登录", st == 200)
    st, _ = req("PUT", f"/api/admin/users/{alice['user_id']}/reset-password",
                {"new_password": "123456"}, TOKEN_A)
    check("重置回演示密码", st == 200)
    st, _ = req("POST", "/api/auth/login", {"username": "alice", "password": "123456"})
    check("alice 恢复原密码", st == 200)
    st, _ = req("PUT", f"/api/admin/users/{alice['user_id']}/reset-password",
                {"new_password": "123"}, TOKEN_C)
    check("顾客不能重置他人密码（403）", st == 403)
    st, _ = req("PUT", "/api/admin/users/99999/reset-password",
                {"new_password": "abcdef123"}, TOKEN_A)
    check("重置不存在的用户（404）", st == 404)

    section("未登录拦截")
    st, _ = req("GET", "/api/orders")
    check("未登录访问订单被拦截（401）", st == 401)

    section("地址簿 CRUD + 默认地址切换")
    st, addrs = req("GET", "/api/addresses", token=TOKEN_C)
    check("列出地址簿", st == 200 and isinstance(addrs, list))
    base_count = len(addrs)
    # 新增一条地址，不设为默认
    st, a1 = req("POST", "/api/addresses", {
        "receiver_name": "测试收", "receiver_phone": "13800000099",
        "address_label": "测试", "detail_address": "北京市朝阳区测试路 1 号",
    }, TOKEN_C)
    check("新增地址", st == 200 and a1.get("address_id"))
    new_id = a1["address_id"]
    # 设为默认
    st, _ = req("POST", f"/api/addresses/{new_id}/default", {}, TOKEN_C)
    check("设为默认地址", st == 200)
    st, addrs2 = req("GET", "/api/addresses", token=TOKEN_C)
    defs = [a for a in addrs2 if a.get("is_default")]
    check("默认地址唯一且为新设的", len(defs) == 1 and defs[0]["address_id"] == new_id)
    # 修改
    st, _ = req("PUT", f"/api/addresses/{new_id}", {
        "receiver_name": "测试收改", "receiver_phone": "13900000099",
        "address_label": "测试改", "detail_address": "北京市朝阳区测试路 2 号",
    }, TOKEN_C)
    check("修改地址", st == 200)
    # 字段校验
    st, body = req("POST", "/api/addresses", {
        "receiver_name": "x", "receiver_phone": "abc", "detail_address": "北京市",
    }, TOKEN_C)
    check("电话格式错误返回 400", st == 400)
    st, body = req("POST", "/api/addresses", {
        "receiver_name": "x", "receiver_phone": "13800000099", "detail_address": "",
    }, TOKEN_C)
    check("地址过短返回 400", st == 400)
    # 跨角色拒绝
    st, _ = req("GET", "/api/addresses", token=TOKEN_R)
    check("骑手不能访问顾客地址簿（403）", st == 403)
    # 删除（如果是默认，应自动迁移默认到剩余最新一条）
    st, _ = req("DELETE", f"/api/addresses/{new_id}", token=TOKEN_C)
    check("删除地址", st == 200)
    st, addrs3 = req("GET", "/api/addresses", token=TOKEN_C)
    check("删除后地址数 -1", len(addrs3) == base_count)
    # 验证 still has exactly one default
    defs2 = [a for a in addrs3 if a.get("is_default")]
    check("默认地址始终唯一（删除触发回退）", len(defs2) == 1)

    section("订单 need_cutlery 环保选项")
    st, o1 = req("POST", "/api/orders", {
        "merchant_id": 1, "delivery_address": "addr",
        "items": [{"dish_id": 1, "quantity": 1}], "need_cutlery": False,
    }, TOKEN_C)
    check("下单 need_cutlery=False", st == 200)
    st, detail = req("GET", f"/api/orders/{o1['order_id']}", token=TOKEN_C)
    check("订单落库 need_cutlery=0（支持环保）", detail.get("need_cutlery") == 0)

    st, o2 = req("POST", "/api/orders", {
        "merchant_id": 1, "delivery_address": "addr",
        "items": [{"dish_id": 1, "quantity": 1}], "need_cutlery": True,
    }, TOKEN_C)
    check("下单 need_cutlery=True", st == 200)
    st, detail = req("GET", f"/api/orders/{o2['order_id']}", token=TOKEN_C)
    check("订单落库 need_cutlery=1", detail.get("need_cutlery") == 1)

    print(f"\n{'=' * 40}")
    print(f"通过 {PASS} 项，失败 {FAIL} 项")
    print(f"PASS={PASS} FAIL={FAIL}")
    if FAILURES:
        print("FAIL_ITEMS:", ";".join(FAILURES))
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
