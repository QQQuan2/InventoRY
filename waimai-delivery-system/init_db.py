"""
init_db.py —— 一键初始化 SQLite 数据库
=========================================

用法：
    python init_db.py

会做两件事：
1. 读取 schema_sqlite.sql，执行里面所有语句（建表 + 示例数据）
2. 把示例用户的密码（统一是 123456）用 werkzeug pbkdf2 哈希覆盖掉
   这样后续通过 /api/auth/login 用 123456 登录就能成功。
"""

import os
import sqlite3
import sys

from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQL_PATH = os.path.join(BASE_DIR, "schema_sqlite.sql")
DB_PATH = os.path.join(BASE_DIR, "waimai.db")

# 4 个示例用户，密码统一 123456
SAMPLE_USERS = ["alice", "bob", "shop_zha", "admin"]
SAMPLE_PASSWORD = "123456"


def main() -> int:
    if not os.path.exists(SQL_PATH):
        print(f"[ERROR] 找不到 schema 文件: {SQL_PATH}")
        return 1

    if os.path.exists(DB_PATH):
        ans = input(f"检测到已存在 {DB_PATH}，是否覆盖重建？[y/N]: ").strip().lower()
        if ans != "y":
            print("已取消。")
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