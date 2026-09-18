-- ============================================================
-- 外卖配送系统 · SQLite 版建表 + 示例数据（v2）
-- 在 init_db.py 里会被一次性执行（你也可以手动执行）
--
-- v2 主要变化：
--   * Users     增加 reset_code / reset_expire（找回密码验证码）
--   * Merchants 增加 user_id（商家账号 <-> 店铺绑定）
--   * Dishes    增加 emoji（未上传实拍图时的展示占位）
--   * Orders    状态机升级为完整外卖流程 + rider_id / 各节点时间 / 顾客备注
--   * Comments  增加商家回复 reply_content / reply_time
--   * Sessions  新增：登录 token 表
-- ============================================================

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS Sessions;
DROP TABLE IF EXISTS Comments;
DROP TABLE IF EXISTS Deliveries;
DROP TABLE IF EXISTS Order_Details;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Dishes;
DROP TABLE IF EXISTS Merchants;
DROP TABLE IF EXISTS Users;

-- ============== 1. 用户表 ==============
CREATE TABLE Users (
  user_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,                  -- 已加密存储（PBKDF2）
  phone        TEXT UNIQUE,
  role         TEXT NOT NULL
                CHECK(role IN ('customer','rider','merchant','admin')),
  avatar_url   TEXT,
  reset_code   TEXT,                           -- 找回密码验证码（演示用）
  reset_expire DATETIME,                       -- 验证码过期时间
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============== 2. 商家表 ==============
CREATE TABLE Merchants (
  merchant_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER UNIQUE,         -- 店铺所属账号（merchant 角色）
  merchant_name        TEXT NOT NULL,
  merchant_phone       TEXT UNIQUE,
  business_address     TEXT,
  rating               REAL CHECK(rating IS NULL OR (rating BETWEEN 0 AND 5)),
  business_license_url TEXT,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- ============== 3. 菜品表 ==============
CREATE TABLE Dishes (
  dish_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id    INTEGER NOT NULL,
  dish_name      TEXT NOT NULL,
  price          REAL NOT NULL CHECK(price > 0),
  stock          INTEGER NOT NULL CHECK(stock >= 0),
  category       TEXT,
  emoji          TEXT DEFAULT '🍽️',            -- 没有实拍图时用 emoji 展示
  dish_image_url TEXT,                          -- 商家实拍上传的图片（可空）
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id)
);

-- ============== 4. 订单表 ==============
-- 状态机：pending_accept（待商家接单）→ accepted（商家已接单，待骑手抢单）
--        → delivering（骑手配送中）→ delivered（已送达）→ completed（顾客已评价）
--        任意前置阶段可 cancelled（取消，记录 cancel_reason）
CREATE TABLE Orders (
  order_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL,
  merchant_id      INTEGER NOT NULL,
  order_time       DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_price      REAL NOT NULL CHECK(total_price >= 0),
  order_status     TEXT NOT NULL
                     CHECK(order_status IN ('pending_accept','accepted',
                                            'delivering','delivered',
                                            'completed','cancelled')),
  delivery_address TEXT,
  remark           TEXT,                       -- 顾客备注
  cancel_reason    TEXT,
  need_cutlery     INTEGER NOT NULL DEFAULT 1 CHECK(need_cutlery IN (0,1)),
  rider_id         INTEGER,                    -- 抢单的骑手
  accept_time      DATETIME,                   -- 商家接单时间
  claim_time       DATETIME,                   -- 骑手抢单时间
  deliver_time     DATETIME,                   -- 送达时间
  complete_time    DATETIME,                   -- 评价完成时间
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id),
  FOREIGN KEY (rider_id) REFERENCES Users(user_id)
);

-- ============== 5. 订单明细 ==============
CREATE TABLE Order_Details (
  detail_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  dish_id    INTEGER NOT NULL,
  quantity   INTEGER NOT NULL CHECK(quantity > 0),
  unit_price REAL NOT NULL CHECK(unit_price >= 0),
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (dish_id)  REFERENCES Dishes(dish_id)
);

-- ============== 6. 配送表（骑手配送记录） ==============
CREATE TABLE Deliveries (
  delivery_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL UNIQUE,
  rider_id         INTEGER NOT NULL,
  delivery_status  TEXT NOT NULL
                     CHECK(delivery_status IN ('pending','picked',
                                               'delivering','completed')),
  pickup_time      DATETIME,
  complete_time    DATETIME,
  current_lat      REAL,
  current_lng      REAL,
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (rider_id) REFERENCES Users(user_id)
);

-- ============== 7. 评价表 ==============
CREATE TABLE Comments (
  comment_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL,
  user_id          INTEGER NOT NULL,
  score            INTEGER CHECK(score BETWEEN 1 AND 5),
  comment_content  TEXT,
  comment_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
  comment_image_url TEXT,
  reply_content    TEXT,                       -- 商家回复
  reply_time       DATETIME,
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (user_id)  REFERENCES Users(user_id)
);

-- ============== 8. 登录会话表 ==============
CREATE TABLE Sessions (
  token      TEXT PRIMARY KEY,                 -- 登录后下发的 Bearer Token
  user_id    INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- ============== 9. 用户地址簿（v3 新增） ==============
-- 顾客可以保存多个收货地址，标记默认地址；下单时可直接选用
CREATE TABLE Addresses (
  address_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  receiver_name  TEXT NOT NULL,                -- 收货人
  receiver_phone TEXT NOT NULL,                -- 收货电话
  address_label  TEXT,                         -- 自定义标签：家/公司/宿舍等
  detail_address TEXT NOT NULL,                -- 详细地址（街道/门牌）
  is_default     INTEGER NOT NULL DEFAULT 0
                 CHECK(is_default IN (0,1)),
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
CREATE INDEX idx_addresses_user ON Addresses(user_id);

-- ============================================================
-- 示例数据
-- ============================================================

-- 6 个示例用户（密码统一 123456，init_db.py 会覆盖成真实哈希）
INSERT INTO Users (username, password, phone, role) VALUES
  ('alice',     'placeholder', '13800000001', 'customer'),
  ('bob',       'placeholder', '13800000002', 'rider'),
  ('shop_zha',  'placeholder', '010-12345678', 'merchant'),
  ('shop_hu',   'placeholder', '021-12345678', 'merchant'),
  ('shop_guang','placeholder', '020-12345678', 'merchant'),
  ('admin',     'placeholder', '13800000000', 'admin');

-- 3 个商家（绑定到 3 个 merchant 账号）
INSERT INTO Merchants (user_id, merchant_name, merchant_phone, business_address, rating) VALUES
  (3, '老北京炸酱面馆', '010-12345678', '北京市朝阳区美食街 1 号',   4.7),
  (4, '沪上阿姨奶茶',   '021-12345678', '上海市浦东新区大学城 8 号', 4.5),
  (5, '广式烧腊店',     '020-12345678', '广州市天河区天河路 99 号',  4.8);

-- 8 个菜品（emoji 用于无实拍图时的占位展示）
INSERT INTO Dishes (merchant_id, dish_name, price, stock, category, emoji) VALUES
  (1, '招牌炸酱面',   22.0, 100, '主食', '🍜'),
  (1, '凉拌黄瓜',      8.0,  50, '小吃', '🥒'),
  (1, '老北京酸奶',   10.0,  30, '饮品', '🥛'),
  (2, '血糯米奶茶',   15.0,  80, '饮品', '🧋'),
  (2, '杨枝甘露',     20.0,  60, '甜品', '🍨'),
  (3, '蜜汁叉烧饭',   32.0,  70, '主食', '🍛'),
  (3, '烧鸭腿饭',     38.0,  50, '主食', '🦆'),
  (3, '冻柠茶',       12.0,  80, '饮品', '🍋');

-- 10 个订单：覆盖全部状态 + 分散在最近 7 天（给管理员图表提供数据）
INSERT INTO Orders (user_id, merchant_id, order_time, total_price, order_status,
                    delivery_address, remark, need_cutlery, rider_id,
                    accept_time, claim_time, deliver_time, complete_time) VALUES
  -- 已完成的 4 单（含评价）
  (1, 1, DATETIME('now','-6 days','-3 hours'), 30.0, 'completed',
      '北京市朝阳区幸福小区 3 号楼 201', '面软一点，多放黄瓜', 1, 2,
      DATETIME('now','-6 days','-3 hours','-10 minutes'),
      DATETIME('now','-6 days','-2 hours','-50 minutes'),
      DATETIME('now','-6 days','-2 hours','-10 minutes'),
      DATETIME('now','-6 days','-2 hours')),
  (1, 2, DATETIME('now','-5 days','-4 hours'), 35.0, 'completed',
      '北京市朝阳区幸福小区 3 号楼 201', '少糖', 1, 2,
      DATETIME('now','-5 days','-4 hours','-8 minutes'),
      DATETIME('now','-5 days','-3 hours','-40 minutes'),
      DATETIME('now','-5 days','-3 hours','-5 minutes'),
      DATETIME('now','-5 days','-3 hours')),
  (1, 3, DATETIME('now','-3 days','-2 hours'), 70.0, 'completed',
      '北京市朝阳区幸福小区 3 号楼 201', NULL, 0, 2,
      DATETIME('now','-3 days','-2 hours','-15 minutes'),
      DATETIME('now','-3 days','-1 hours','-45 minutes'),
      DATETIME('now','-3 days','-1 hours','-5 minutes'),
      DATETIME('now','-3 days','-1 hours')),
  (1, 1, DATETIME('now','-2 days','-5 hours'), 52.0, 'completed',
      '北京市朝阳区幸福小区 3 号楼 201', '加两双筷子', 1, 2,
      DATETIME('now','-2 days','-5 hours','-12 minutes'),
      DATETIME('now','-2 days','-4 hours','-30 minutes'),
      DATETIME('now','-2 days','-4 hours'),
      DATETIME('now','-2 days','-3 hours','-50 minutes')),
  -- 昨天的 2 单（已完成 + 已取消）
  (1, 2, DATETIME('now','-1 day','-6 hours'), 20.0, 'completed',
      '北京市朝阳区幸福小区 3 号楼 201', NULL, 1, 2,
      DATETIME('now','-1 day','-6 hours','-6 minutes'),
      DATETIME('now','-1 day','-5 hours','-35 minutes'),
      DATETIME('now','-1 day','-5 hours'),
      DATETIME('now','-1 day','-4 hours','-55 minutes')),
  (1, 3, DATETIME('now','-1 day','-2 hours'), 12.0, 'cancelled',
      '北京市朝阳区幸福小区 3 号楼 201', NULL, 1, NULL,
      NULL, NULL, NULL, NULL),
  -- 今天：待商家接单 / 待骑手抢单 / 配送中 / 已送达各 1 单
  (1, 1, DATETIME('now','-20 minutes'), 30.0, 'pending_accept',
      '北京市朝阳区幸福小区 3 号楼 201', '不要香菜', 1, NULL, NULL, NULL, NULL, NULL),
  (1, 2, DATETIME('now','-40 minutes'), 35.0, 'accepted',
      '北京市朝阳区幸福小区 3 号楼 201', NULL, 1, NULL,
      DATETIME('now','-35 minutes'), NULL, NULL, NULL),
  (1, 3, DATETIME('now','-1 hours'), 70.0, 'delivering',
      '北京市朝阳区幸福小区 3 号楼 201', '放前台就行', 0, 2,
      DATETIME('now','-55 minutes'), DATETIME('now','-30 minutes'), NULL, NULL),
  (1, 1, DATETIME('now','-2 hours'), 30.0, 'delivered',
      '北京市朝阳区幸福小区 3 号楼 201', NULL, 1, 2,
      DATETIME('now','-2 hours','-10 minutes'),
      DATETIME('now','-1 hours','-30 minutes'),
      DATETIME('now','-50 minutes'), NULL);

INSERT INTO Order_Details (order_id, dish_id, quantity, unit_price) VALUES
  (1, 1, 1, 22.0), (1, 2, 1,  8.0),
  (2, 4, 1, 15.0), (2, 5, 1, 20.0),
  (3, 6, 1, 32.0), (3, 7, 1, 38.0),
  (4, 1, 2, 22.0), (4, 3, 1, 10.0),
  (5, 5, 1, 20.0),
  (6, 8, 1, 12.0),
  (7, 1, 1, 22.0), (7, 2, 1,  8.0),
  (8, 4, 1, 15.0), (8, 5, 1, 20.0),
  (9, 6, 1, 32.0), (9, 7, 1, 38.0),
  (10, 1, 1, 22.0), (10, 2, 1, 8.0);

-- 配送记录（配送中 / 已完成 / 已送达 的单）
INSERT INTO Deliveries (order_id, rider_id, delivery_status, pickup_time, complete_time) VALUES
  (1, 2, 'completed', DATETIME('now','-6 days','-2 hours','-50 minutes'), DATETIME('now','-6 days','-2 hours','-10 minutes')),
  (2, 2, 'completed', DATETIME('now','-5 days','-3 hours','-40 minutes'), DATETIME('now','-5 days','-3 hours','-5 minutes')),
  (3, 2, 'completed', DATETIME('now','-3 days','-1 hours','-45 minutes'), DATETIME('now','-3 days','-1 hours','-5 minutes')),
  (4, 2, 'completed', DATETIME('now','-2 days','-4 hours','-30 minutes'), DATETIME('now','-2 days','-4 hours')),
  (5, 2, 'completed', DATETIME('now','-1 day','-5 hours','-35 minutes'),  DATETIME('now','-1 day','-5 hours')),
  (9, 2, 'delivering', DATETIME('now','-30 minutes'), NULL),
  (10, 2, 'completed', DATETIME('now','-1 hours','-30 minutes'), DATETIME('now','-50 minutes'));

-- 历史评价（含商家回复）
INSERT INTO Comments (order_id, user_id, score, comment_content, comment_time, reply_content, reply_time) VALUES
  (1, 1, 5, '炸酱面很正宗，黄瓜爽口，骑手小哥超快！', DATETIME('now','-6 days','-2 hours'), '谢谢亲的认可，欢迎常来～', DATETIME('now','-6 days','-1 hours')),
  (2, 1, 4, '奶茶不错，就是有点排队久。', DATETIME('now','-5 days','-3 hours'), '抱歉让您久等啦，下次提前做～', DATETIME('now','-5 days','-2 hours')),
  (3, 1, 5, '烧腊份量十足，冻柠茶解腻。', DATETIME('now','-3 days','-1 hours'), NULL, NULL),
  (4, 1, 4, '面还是那个味，稳定发挥。', DATETIME('now','-2 days','-3 hours'), NULL, NULL);

-- 示例地址簿：给 alice 两个地址（默认"家"）
INSERT INTO Addresses (user_id, receiver_name, receiver_phone, address_label, detail_address, is_default) VALUES
  (1, '李芊泉', '13800000001', '家',     '北京市朝阳区幸福小区 3 号楼 201',     1),
  (1, '李芊泉', '13800000001', '实验室', '北京市海淀区中关村大街 5 号科研楼 8 层', 0);
