"""
init_db.py —— 一键初始化 SQLite 数据库
=========================================

用法：
    python init_db.py            # 交互式（检测到旧库会询问是否覆盖）
    python init_db.py --yes      # 免确认，直接重建（CI / 冒烟测试用）

会做两件事：
1. 读取 schema_sqlite.sql，执行里面所有语句（建表 + 示例数据）
2. 把示例用户的密码（统一是 123456）用 werkzeug pbkdf2 哈希覆盖掉
   这样后续通过 /api/auth/login 用 123456 登录就能成功。

迁移逻辑：
    如果已有数据库且选择不覆盖，则执行 migrate_db.py 中的追加语句
（如 v3 新增 Addresses 表），保证平滑升级。
"""

import os
import sqlite3
import sys

from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQL_PATH = os.path.join(BASE_DIR, "schema_sqlite.sql")
DB_PATH = os.path.join(BASE_DIR, "waimai.db")
MIGRATE_PATH = os.path.join(BASE_DIR, "migrate_db.py")

# 6 个示例用户，密码统一 123456
SAMPLE_USERS = ["alice", "bob", "shop_zha", "shop_hu", "shop_guang", "admin"]
SAMPLE_PASSWORD = "123456"


def _run_migrate_if_any(conn: sqlite3.Connection) -> None:
    """执行可选的迁移脚本（idempotent 语句）。"""
    if not os.path.exists(MIGRATE_PATH):
        return
    with open(MIGRATE_PATH, "r", encoding="utf-8") as f:
        sql = f.read()
    conn.executescript(sql)
    conn.commit()


def main() -> int:
    if not os.path.exists(SQL_PATH):
        print(f"[ERROR] 找不到 schema 文件: {SQL_PATH}")
        return 1

    if os.path.exists(DB_PATH):
        confirmed = "--yes" in sys.argv
        if not confirmed:
            try:
                ans = input(f"检测到已存在 {DB_PATH}，是否覆盖重建？[y/N]: ").strip().lower()
                confirmed = ans == "y"
            except EOFError:
                # 非交互式环境（管道/CI）默认视为确认
                confirmed = True
        if not confirmed:
            print("未覆盖旧库，开始尝试平滑迁移 ...")
            conn = sqlite3.connect(DB_PATH)
            try:
                _run_migrate_if_any(conn)
                print("[DONE] 迁移完成，原有数据未被覆盖。")
            finally:
                conn.close()
            return 0
        os.remove(DB_PATH)

    print(f"[1/2] 正在执行 {os.path.basename(SQL_PATH)} ...")
    with open(SQL_PATH, "r", encoding="utf-8") as f:
        sql_script = f.read()

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(sql_script)
        conn.commit()
        print(f"        建表 + 示例数据写入完成 -> {DB_PATH}")

        print("[2/2] 正在覆盖示例用户密码为真实哈希 ...")
        hashed = generate_password_hash(SAMPLE_PASSWORD, method="pbkdf2:sha256")
        cur = conn.cursor()
        for username in SAMPLE_USERS:
            cur.execute(
                "UPDATE Users SET password = ? WHERE username = ?",
                (hashed, username),
            )
        conn.commit()
        print(f"        已为 {len(SAMPLE_USERS)} 个示例用户设置统一密码：{SAMPLE_PASSWORD!r}")
    finally:
        conn.close()

    print("\n[DONE] 初始化完成！现在可以运行：python app.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
