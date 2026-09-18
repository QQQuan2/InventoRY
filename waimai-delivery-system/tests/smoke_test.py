"""
smoke_test.py —— 外卖配送系统接口冒烟测试
==========================================

用法（先执行 python init_db.py 建库）：
    python tests/smoke_test.py

说明：
- 使用 Flask 自带的测试客户端，不占用端口、不需要真的启动服务器
- 覆盖：健康检查、商家/菜品、登录鉴权、下单、状态流转、错误分支
- 全部通过时进程退出码为 0，可直接接入 CI
"""

from __future__ import annotations

import os
import sys

# 让脚本无论从哪个目录执行都能 import 到上一级的 app.py
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import app as server  # noqa: E402

PASSED = 0
FAILED = 0


def check(name: str, condition: bool, extra: str = "") -> None:
    """记录一条断言结果。"""
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  [PASS] {name}")
    else:
        FAILED += 1
        print(f"  [FAIL] {name} {extra}")


def main() -> int:
    if not os.path.exists(os.path.join(BASE_DIR, "waimai.db")):
        print("[ERROR] 未找到 waimai.db，请先运行：python init_db.py")
        return 2

    client = server.app.test_client()

    print("\n[1] 健康检查与首页")
    r = client.get("/api/health")
    check("GET /api/health 返回 200", r.status_code == 200, f"got {r.status_code}")
    check("后端为 sqlite", r.get_json().get("backend") == "sqlite", str(r.get_json()))

    r = client.get("/")
    check("GET / 返回前台页面", r.status_code == 200 and b"<html" in r.data.lower())

    print("\n[2] 商家与菜品")
    r = client.get("/api/merchants")
    merchants = r.get_json()
    check("GET /api/merchants 返回列表", r.status_code == 200 and isinstance(merchants, list))
    check("商家数量大于 0", len(merchants) > 0, f"got {len(merchants)}")

    r = client.get("/api/dishes")
    dishes = r.get_json()
    check("GET /api/dishes 返回列表", r.status_code == 200 and isinstance(dishes, list))
    check("菜品数量大于 0", len(dishes) > 0, f"got {len(dishes)}")

    if dishes:
        mid = dishes[0]["merchant_id"]
        r = client.get(f"/api/dishes?merchant_id={mid}")
        rows = r.get_json()
        check(
            "按商家筛选菜品只返回该商家",
            r.status_code == 200 and all(d["merchant_id"] == mid for d in rows),
        )

    print("\n[3] 登录鉴权")
    r = client.post("/api/auth/login", json={"username": "alice", "password": "123456"})
    body = r.get_json() or {}
    check("示例用户 alice 登录成功", r.status_code == 200 and body.get("role") == "customer", str(body))

    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    check("错误密码返回 401", r.status_code == 401, f"got {r.status_code}")

    r = client.post("/api/auth/login", json={"username": "nobody"})
    check("缺少密码返回 400", r.status_code == 400, f"got {r.status_code}")

    r = client.post("/api/auth/register", json={"username": "alice", "password": "123456"})
    check("重复用户名注册被拒绝", r.status_code == 400, f"got {r.status_code}")

    r = client.post("/api/auth/register", json={"username": "tester_x", "password": "123456", "role": "customer"})
    if r.status_code == 200:
        check("新用户注册成功", True)
    else:
        check("新用户注册成功（已存在则视为通过）", r.status_code == 400, f"got {r.status_code}")
    user_id = 1

    print("\n[4] 下单与状态流转")
    dish = dishes[0]
    payload = {
        "user_id": user_id,
        "merchant_id": dish["merchant_id"],
        "delivery_address": "冒烟测试地址",
        "items": [{"dish_id": dish["dish_id"], "quantity": 2}],
        "need_cutlery": True,
    }
    r = client.post("/api/orders", json=payload)
    created = r.get_json() or {}
    check("POST /api/orders 下单成功", r.status_code == 200 and created.get("ok") is True, str(created))
    order_id = created.get("order_id")
    expected_total = float(dish["price"]) * 2
    check(
        "订单总价按菜品单价×数量计算",
        order_id is not None and abs(float(created.get("total_price", 0)) - expected_total) < 0.01,
        f"expected {expected_total}, got {created.get('total_price')}",
    )

    r = client.post("/api/orders", json={"user_id": user_id})
    check("缺少必填字段下单返回 400", r.status_code == 400, f"got {r.status_code}")

    r = client.post("/api/orders", json={**payload, "items": [{"dish_id": 999999, "quantity": 1}]})
    check("菜品不存在时下单返回 400", r.status_code == 400, f"got {r.status_code}")

    if order_id:
        r = client.post(f"/api/orders/{order_id}/status", json={"status": "delivering"})
        check("修改订单状态成功", r.status_code == 200, f"got {r.status_code}")

        r = client.post(f"/api/orders/{order_id}/status", json={"status": "unknown"})
        check("非法状态值返回 400", r.status_code == 400, f"got {r.status_code}")

        r = client.get(f"/api/orders/{order_id}")
        check(
            "订单详情状态已更新为 delivering",
            r.status_code == 200 and r.get_json().get("order_status") == "delivering",
            str(r.get_json()),
        )

    r = client.get("/api/orders/999999")
    check("不存在的订单返回 404", r.status_code == 404, f"got {r.status_code}")

    print("\n[5] 订单列表")
    r = client.get("/api/orders")
    orders = r.get_json()
    check("GET /api/orders 返回列表", r.status_code == 200 and isinstance(orders, list))
    if orders:
        check("订单包含用户与商家名称", "username" in orders[0] and "merchant_name" in orders[0])
        check("订单包含明细数组", isinstance(orders[0].get("details"), list))

    print(f"\n===== 结果：{PASSED} 通过 / {FAILED} 失败 =====")
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
