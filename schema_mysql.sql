-- ============================================================
-- 外卖配送系统 · MySQL 版建表 + 示例数据
-- 用法：mysql -u root -p < schema_mysql.sql
-- ============================================================

-- 1) 建库
CREATE DATABASE IF NOT EXISTS waimai DEFAULT CHARSET utf8mb4;
USE waimai;

-- 2) 删旧表（重复执行也能跑；有外键，先删子表）
DROP TABLE IF EXISTS Comments;
DROP TABLE IF EXISTS Deliveries;
DROP TABLE IF EXISTS Order_Details;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Dishes;
DROP TABLE IF EXISTS Merchants;
DROP TABLE IF EXISTS Users;

-- 3) 建表
CREATE TABLE Users (
  user_id      INT PRIMARY KEY AUTO_INCREMENT,
  username     VARCHAR(50) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,                  -- 已加密
  phone        VARCHAR(20) UNIQUE,
  role         VARCHAR(20) NOT NULL,
  avatar_url   VARCHAR(255),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Merchants (
  merchant_id          INT PRIMARY KEY AUTO_INCREMENT,
  merchant_name        VARCHAR(100) NOT NULL,
  merchant_phone       VARCHAR(20) UNIQUE,
  business_address     VARCHAR(255),
  rating               DECIMAL(2,1),
  business_license_url VARCHAR(255)
);

CREATE TABLE Dishes (
  dish_id        INT PRIMARY KEY AUTO_INCREMENT,
  merchant_id    INT NOT NULL,
  dish_name      VARCHAR(100) NOT NULL,
  price          DECIMAL(8,2) NOT NULL,
  stock          INT NOT NULL DEFAULT 0,
  category       VARCHAR(50),
  dish_image_url VARCHAR(255),
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id)
);

CREATE TABLE Orders (
  order_id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id          INT NOT NULL,
  merchant_id      INT NOT NULL,
  order_time       DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_price      DECIMAL(8,2) NOT NULL,
  order_status     VARCHAR(20) NOT NULL,
  delivery_address VARCHAR(255),
  cancel_reason    VARCHAR(255),
  need_cutlery     TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES Users(user_id),
  FOREIGN KEY (merchant_id) REFERENCES Merchants(merchant_id)
);

CREATE TABLE Order_Details (
  detail_id  INT PRIMARY KEY AUTO_INCREMENT,
  order_id   INT NOT NULL,
  dish_id    INT NOT NULL,
  quantity   INT NOT NULL,
  unit_price DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (dish_id)  REFERENCES Dishes(dish_id)
);

CREATE TABLE Deliveries (
  delivery_id      INT PRIMARY KEY AUTO_INCREMENT,
  order_id         INT NOT NULL UNIQUE,
  rider_id         INT NOT NULL,
  delivery_status  VARCHAR(20) NOT NULL,
  pickup_time      DATETIME,
  complete_time    DATETIME,
  current_lat      DECIMAL(10,6),
  current_lng      DECIMAL(10,6),
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (rider_id) REFERENCES Users(user_id)
);

CREATE TABLE Comments (
  comment_id       INT PRIMARY KEY AUTO_INCREMENT,
  order_id         INT NOT NULL,
  user_id          INT NOT NULL,
  score            INT,
  comment_content  TEXT,
  comment_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
  comment_image_url VARCHAR(255),
  FOREIGN KEY (order_id) REFERENCES Orders(order_id),
  FOREIGN KEY (user_id)  REFERENCES Users(user_id)
);

-- 4) 示例数据
-- 密码统一是 123456；启动 app.py 后调用 /api/auth/register 重置
-- 或者先用 init_db.py 风格的脚本重新覆盖密码
INSERT INTO Users (username, password, phone, role) VALUES
  ('alice',    'placeholder', '13800000001', 'customer'),
  ('bob',      'placeholder', '13800000002', 'rider'),
  ('shop_zha', 'placeholder', '010-12345678', 'merchant'),
  ('admin',    'placeholder', '13800000000', 'admin');

INSERT INTO Merchants (merchant_name, merchant_phone, business_address, rating) VALUES
  ('老北京炸酱面馆', '010-12345678', '北京市朝阳区美食街 1 号',     4.7),
  ('沪上阿姨奶茶',   '021-12345678', '上海市浦东新区大学城 8 号',   4.5),
  ('广式烧腊店',     '020-12345678', '广州市天河区天河路 99 号',    4.8);

INSERT INTO Dishes (merchant_id, dish_name, price, stock, category) VALUES
  (1, '招牌炸酱面',   22.0, 100, '主食'),
  (1, '凉拌黄瓜',      8.0,  50, '小吃'),
  (1, '老北京酸奶',   10.0,  30, '饮品'),
  (2, '血糯米奶茶',   15.0,  80, '饮品'),
  (2, '杨枝甘露',     20.0,  60, '甜品'),
  (3, '蜜汁叉烧饭',   32.0,  70, '主食'),
  (3, '烧鸭腿饭',     38.0,  50, '主食'),
  (3, '冻柠茶',       12.0,  80, '饮品');

INSERT INTO Orders (user_id, merchant_id, total_price, order_status, delivery_address, need_cutlery) VALUES
  (1, 1, 30.0, 'completed',      '北京市朝阳区 XX 小区 1 号楼',       1),
  (1, 2, 35.0, 'pending_accept', '上海市浦东新区 XX 路 100 号',       1),
  (1, 3, 70.0, 'delivering',     '广州市天河区 XX 大厦 A 座 1808 室', 0);

INSERT INTO Order_Details (order_id, dish_id, quantity, unit_price) VALUES
  (1, 1, 1, 22.0),
  (1, 2, 1,  8.0),
  (2, 4, 1, 15.0),
  (2, 5, 1, 20.0),
  (3, 6, 1, 32.0),
  (3, 7, 1, 38.0);

INSERT INTO Deliveries (order_id, rider_id, delivery_status, pickup_time) VALUES
  (3, 2, 'delivering', NOW());