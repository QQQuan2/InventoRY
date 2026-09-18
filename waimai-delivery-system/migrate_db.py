"""migrate_db.py —— 增量迁移脚本（idempotent）

执行时机：
    当用户已有 waimai.db 又不想覆盖时，init_db.py 会执行本文件中的语句。
    全部使用 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS 之类的
    幂等语句，重复执行不会报错。

版本记录：
    v3 (2026-09-18)：新增 Addresses 表（用户地址簿）
"""

CREATE_ADDRESSES_TABLE = """
CREATE TABLE IF NOT EXISTS Addresses (
  address_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  receiver_name  TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  address_label  TEXT,
  detail_address TEXT NOT NULL,
  is_default     INTEGER NOT NULL DEFAULT 0
                 CHECK(is_default IN (0,1)),
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
"""

CREATE_ADDRESSES_INDEX = """
CREATE INDEX IF NOT EXISTS idx_addresses_user ON Addresses(user_id);
"""


def main() -> int:
    import os
    import sqlite3
    base = os.path.dirname(os.path.abspath(__file__))
    db = os.path.join(base, "waimai.db")
    if not os.path.exists(db):
        print(f"[migrate] 未找到 {db}，无需迁移。")
        return 0
    with sqlite3.connect(db) as conn:
        conn.executescript(CREATE_ADDRESSES_TABLE)
        conn.executescript(CREATE_ADDRESSES_INDEX)
        conn.commit()
    print("[migrate] 增量迁移完成（v3 Addresses）。")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())