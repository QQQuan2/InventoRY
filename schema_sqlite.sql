-- ============================================================
-- 外卖配送系统 · SQLite 版建表 + 示例数据
-- 在 init_db.py 里会被一次性执行（你也可以手动执行）
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============== 1. 用户表 ==============
DROP TABLE IF EXISTS Comments;
DROP TABLE IF EXISTS Deliveries;
DROP TABLE IF EXISTS Order_Details;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Dishes;
DROP TABLE IF EXISTS Merchants;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
  user_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,                  -- 已加密存储（PBKDF2）
  phone        TEXT UNIQUE,
  role         TEXT NOT NULL
                CHECK(role IN ('customer','rider','merchant','admin')),
  avatar_url   TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============== 2. 商家表 ==============
CREATE TABLE Merchants (
  merchant_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_name        TEXT NOT NULL,
  merchant_phone       TEXT UNIQUE,
  business_address     TEXT,
  rating               REAL CHECK(rating IS NULL OR (rating BETWEEN 0 AND 5)),
  business_license_url TEXT
);

-- ============== 3. 菜品表 ==============
CREATE TABLE Dishes (
  dish_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id    INTEGER NOT NULL,
  dish_name      TEXT NOT NULL,
  price          REAL NOT NULL CHECK(price > 0),
  stock          INTEGER NOT NULL CHECK(stock >= 0),
  category       TEXT,
  dish_image_url TEXT,
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id)
);

-- ============== 4. 订单表 ==============
CREATE TABLE Orders (
  order_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL,
  merchant_id      INTEGER NOT NULL,
  order_time       DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_price      REAL NOT NULL CHECK(total_price >= 0),
  order_status     TEXT NOT NULL
                     CHECK(order_status IN ('pending_pay','pending_accept',
                                            'delivering','completed','cancelled')),
  delivery_address TEXT,
  cancel_reason    TEXT,
  need_cutlery     INTEGER NOT NULL DEFAULT 1 CHECK(need_cutlery IN (0,1)),
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id)
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

-- ============== 6. 配送表 ==============
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
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (user_id)  REFERENCES Users(user_id)
);

-- ============================================================
-- 示例数据
-- ============================================================

-- 4 个用户：1 个 customer / 1 个 rider / 1 个 merchant / 1 个 admin
-- 密码统一是 123456。init_db.py 会用 werkzeug pbkdf2 把密码覆盖成真实哈希。
INSERT INTO Users (username, password, phone, role) VALUES
  ('alice',   'placeholder', '13800000001', 'customer'),
  ('bob',     'placeholder', '13800000002', 'rider'),
  ('shop_zha', 'placeholder', '010-12345678', 'merchant'),
  ('admin',   'placeholder', '13800000000', 'admin');

-- 3 个商家
INSERT INTO Merchants (merchant_name, merchant_phone, business_address, rating) VALUES
  ('老北京炸酱面馆',   '010-12345678', '北京市朝阳区美食街 1 号',     4.7),
  ('沪上阿姨奶茶',     '021-12345678', '上海市浦东新区大学城 8 号',   4.5),
  ('广式烧腊店',       '020-12345678', '广州市天河区天河路 99 号',    4.8);

-- 8 个菜品（每个商家分点）
INSERT INTO Dishes (merchant_id, dish_name, price, stock, category) VALUES
  (1, '招牌炸酱面',   22.0, 100, '主食'),
  (1, '凉拌黄瓜',      8.0, 50,  '小吃'),
  (1, '老北京酸奶',   10.0, 30,  '饮品'),
  (2, '血糯米奶茶',   15.0, 80,  '饮品'),
  (2, '杨枝甘露',     20.0, 60,  '甜品'),
  (3, '蜜汁叉烧饭',   32.0, 70,  '主食'),
  (3, '烧鸭腿饭',     38.0, 50,  '主食'),
  (3, '冻柠茶',       12.0, 80,  '饮品');

-- 3 个订单（含明细）
INSERT INTO Orders (user_id, merchant_id, total_price, order_status, delivery_address, need_cutlery) VALUES
  (1, 1, 30.0,  'completed',     '北京市朝阳区 XX 小区 1 号楼',        1),
  (1, 2, 35.0,  'pending_accept', '上海市浦东新区 XX 路 100 号',        1),
  (1, 3, 70.0,  'delivering',     '广州市天河区 XX 大厦 A 座 1808 室',   0);

INSERT INTO Order_Details (order_id, dish_id, quantity, unit_price) VALUES
  (1, 1, 1, 22.0),
  (1, 2, 1,  8.0),
  (2, 4, 1, 15.0),
  (2, 5, 1, 20.0),
  (3, 6, 1, 32.0),
  (3, 7, 1, 38.0);

-- 给配送中的订单派一个骑手
INSERT INTO Deliveries (order_id, rider_id, delivery_status, pickup_time) VALUES
  (3, 2, 'delivering', CURRENT_TIMESTAMP);