/* 外卖配送系统 · 在线试运行
 * 纯前端演示版：业务流程与状态流转与 Flask 后端版保持一致，数据存 localStorage。
 * 登录 / 注册 / 找回密码与后端版行为一致（身份绑定账号，登录后才能进入对应视图）。
 * 订单状态：pending_accept（待商家接单）→ accepted（商家已接单，待骑手抢单）
 *         → delivering（骑手配送中）→ delivered（已送达）→ completed（顾客已评价）
 *         前置阶段可 → cancelled
 */
(function () {
  'use strict';

  var STORE_KEY = 'waimai_demo_v2';

  /* ---------------- 示例数据（与 init_db.py / schema_sqlite.sql 对应） ---------------- */

  function seedData() {
    var now = Date.now();
    var day = 24 * 3600 * 1000;
    function ago(days, hours) { return now - days * day - hours * 3600 * 1000; }
    // 最近 7 天的已完成订单（给管理员看板提供数据）
    var historyOrders = [
      { u: 'alice', m: 1, d: 6, h: 3, total: 30, items: [['招牌炸酱面', 22, 1], ['凉拌黄瓜', 8, 1]], addr: '北京市朝阳区幸福小区 3 号楼 201', remark: '面软一点，多放黄瓜', cutlery: true, rider: 'bob' },
      { u: 'xiaomei', m: 2, d: 6, h: 5, total: 35, items: [['血糯米奶茶', 15, 1], ['杨枝甘露', 20, 1]], addr: '北京市海淀区学院路 15 号学生公寓 6 栋 502', remark: '少糖去冰', cutlery: false, rider: 'zhou' },
      { u: 'qiang', m: 3, d: 5, h: 2, total: 70, items: [['蜜汁叉烧饭', 32, 1], ['烧鸭腿饭', 38, 1]], addr: '北京市朝阳区望京 SOHO T3 1808', remark: '烧鸭不要辣', cutlery: true, rider: 'bob' },
      { u: 'lina', m: 1, d: 5, h: 6, total: 52, items: [['招牌炸酱面', 22, 2], ['老北京酸奶', 10, 1]], addr: '北京市海淀区中关村大街 5 号科研楼 8 层', remark: '加两双筷子', cutlery: true, rider: 'bob' },
      { u: 'alice', m: 2, d: 4, h: 4, total: 20, items: [['杨枝甘露', 20, 1]], addr: '北京市朝阳区幸福小区 3 号楼 201', remark: '', cutlery: true, rider: 'zhou' },
      { u: 'xiaomei', m: 3, d: 3, h: 2, total: 82, items: [['蜜汁叉烧饭', 32, 2], ['冻柠茶', 12, 1]], addr: '北京市海淀区学院路 15 号学生公寓 6 栋 502', remark: '和室友一起点的，餐具要 3 套', cutlery: true, rider: 'bob' },
      { u: 'lina', m: 2, d: 2, h: 5, total: 50, items: [['血糯米奶茶', 15, 2], ['杨枝甘露', 20, 1]], addr: '北京市海淀区中关村大街 5 号科研楼 8 层', remark: '', cutlery: false, rider: 'zhou' },
      { u: 'qiang', m: 1, d: 1, h: 4, total: 30, items: [['招牌炸酱面', 22, 1], ['凉拌黄瓜', 8, 1]], addr: '北京市朝阳区望京 SOHO T3 1808', remark: '', cutlery: false, rider: 'zhou' }
    ];
    var orders = historyOrders.map(function (h, i) {
      return {
        id: i + 1,
        userName: h.u,
        merchantId: h.m,
        items: h.items.map(function (it) { return { name: it[0], price: it[1], qty: it[2] }; }),
        total: h.total,
        status: 'completed',
        address: h.addr,
        remark: h.remark,
        cutlery: h.cutlery,
        rider: h.rider,
        createdAt: ago(h.d, h.h),
        acceptedAt: ago(h.d, h.h - 0.1),
        claimedAt: ago(h.d, h.h - 0.5),
        deliveredAt: ago(h.d, h.h - 1),
        completedAt: ago(h.d, h.h - 1.2),
        comment: i % 2 === 0
          ? { score: i === 0 ? 5 : 4, content: i === 0 ? '面条很筋道，黄瓜也脆，配送快。' : '味道不错，下次还点。', time: ago(h.d, h.h - 1.1), reply: i === 0 ? '感谢支持，欢迎再来！' : '' }
          : null
      };
    });
    // 一个待商家接单（给商家端操作）
    orders.push({
      id: 9, userName: 'xiaomei', merchantId: 1,
      items: [{ name: '招牌炸酱面', price: 22, qty: 1 }, { name: '老北京酸奶', price: 10, qty: 1 }],
      total: 32, status: 'pending_accept',
      address: '北京市海淀区学院路 15 号学生公寓 6 栋 502', remark: '不要香菜', cutlery: false,
      rider: '', createdAt: now - 20 * 60 * 1000
    });
    // 一个待骑手抢单（给骑手端操作）
    orders.push({
      id: 10, userName: 'qiang', merchantId: 2,
      items: [{ name: '血糯米奶茶', price: 15, qty: 2 }],
      total: 30, status: 'accepted',
      address: '北京市朝阳区望京 SOHO T3 1808', remark: '少糖', cutlery: false,
      rider: '', createdAt: now - 35 * 60 * 1000, acceptedAt: now - 25 * 60 * 1000
    });
    return {
      // 密码为演示用明文，仅存于浏览器本地；真实后端使用 PBKDF2 哈希存储
      users: [
        { id: 1, username: 'alice', password: '123456', role: 'customer', phone: '13800000001' },
        { id: 2, username: 'xiaomei', password: '123456', role: 'customer', phone: '13800000002' },
        { id: 3, username: 'qiang', password: '123456', role: 'customer', phone: '13800000003' },
        { id: 4, username: 'lina', password: '123456', role: 'customer', phone: '13800000004' },
        { id: 5, username: 'shop_zha', password: '123456', role: 'merchant', phone: '010-12345678' },
        { id: 6, username: 'shop_hu', password: '123456', role: 'merchant', phone: '021-12345678' },
        { id: 7, username: 'shop_guang', password: '123456', role: 'merchant', phone: '020-12345678' },
        { id: 8, username: 'bob', password: '123456', role: 'rider', phone: '13900000001' },
        { id: 9, username: 'zhou', password: '123456', role: 'rider', phone: '13900000002' },
        { id: 10, username: 'admin', password: '123456', role: 'admin', phone: '' }
      ],
      merchants: [
        { id: 1, name: '老北京炸酱面馆', phone: '010-12345678', address: '北京市朝阳区美食街 1 号', rating: 4.7, owner: 'shop_zha' },
        { id: 2, name: '沪上阿姨奶茶', phone: '021-12345678', address: '上海市浦东新区大学城 8 号', rating: 4.5, owner: 'shop_hu' },
        { id: 3, name: '广式烧腊店', phone: '020-12345678', address: '广州市天河区天河路 99 号', rating: 4.8, owner: 'shop_guang' }
      ],
      dishes: [
        { id: 1, merchantId: 1, name: '招牌炸酱面', price: 22.0, stock: 100, category: '主食', emoji: '🍜', onShelf: true },
        { id: 2, merchantId: 1, name: '凉拌黄瓜', price: 8.0, stock: 50, category: '小吃', emoji: '🥒', onShelf: true },
        { id: 3, merchantId: 1, name: '老北京酸奶', price: 10.0, stock: 30, category: '饮品', emoji: '🥛', onShelf: true },
        { id: 4, merchantId: 2, name: '血糯米奶茶', price: 15.0, stock: 80, category: '饮品', emoji: '🧋', onShelf: true },
        { id: 5, merchantId: 2, name: '杨枝甘露', price: 20.0, stock: 60, category: '甜品', emoji: '🍨', onShelf: true },
        { id: 6, merchantId: 3, name: '蜜汁叉烧饭', price: 32.0, stock: 70, category: '主食', emoji: '🍛', onShelf: true },
        { id: 7, merchantId: 3, name: '烧鸭腿饭', price: 38.0, stock: 50, category: '主食', emoji: '🦆', onShelf: true },
        { id: 8, merchantId: 3, name: '冻柠茶', price: 12.0, stock: 80, category: '饮品', emoji: '🍋', onShelf: true }
      ],
      addresses: [
        { id: 1, userId: 1, label: '家', detail: '北京市朝阳区幸福小区 3 号楼 201', isDefault: true },
        { id: 2, userId: 1, label: '学校', detail: '北京市海淀区学院路 15 号学生公寓 6 栋 502', isDefault: false }
      ],
      orders: orders,
      session: null,          // 当前登录用户名（未登录为 null）
      resetCode: null,        // 找回密码验证码 { username, code }
      seq: { order: 11, addr: 3, user: 11, merchant: 4, dish: 9 }
    };
  }

  /* ---------------- 数据层 ---------------- */

  var db;
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      db = raw ? JSON.parse(raw) : seedData();
    } catch (e) { db = seedData(); }
    // 兼容旧版本数据（v1 没有用户体系）
    if (!db.users) { db = seedData(); }
    if (db.session && !findUser(db.session)) db.session = null;
    save();
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  function reset() { db = seedData(); save(); render(); }
  function findMerchant(id) { return db.merchants.filter(function (m) { return m.id === id; })[0]; }
  function findUser(name) { return db.users.filter(function (u) { return u.username === name; })[0]; }
  function cur() { return db.session ? findUser(db.session) : null; }
  function myAddresses() {
    var u = cur();
    return u ? db.addresses.filter(function (a) { return a.userId === u.id; }) : [];
  }

  /* ---------------- 状态与工具 ---------------- */

  var STATUS = {
    pending_accept: '待商家接单', accepted: '待骑手抢单', delivering: '骑手配送中',
    delivered: '已送达', completed: '已完成', cancelled: '已取消'
  };
  var ROLE_TEXT = { customer: '用户', merchant: '商家', rider: '骑手', admin: '管理员' };
  var loginRole = 'customer'; // 登录页当前选中的身份
  var state = { customerTab: 'order', merchantTab: 'pending', riderTab: 'hall', currentMerchant: null, cart: {} };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(t) {
    if (!t) return '—';
    var d = new Date(t);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtMoney(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 22px;border-radius:999px;font-size:14px;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.25);';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  /* ---------------- 业务动作 ---------------- */

  function placeOrder(f) {
    var u = cur();
    var items = [];
    var total = 0;
    Object.keys(state.cart).forEach(function (did) {
      var d = db.dishes.filter(function (x) { return x.id === +did; })[0];
      var qty = state.cart[did];
      if (!d || !qty) return;
      if (qty > d.stock) { toast('「' + d.name + '」库存不足'); throw new Error('stock'); }
      items.push({ name: d.name, price: d.price, qty: qty });
      total += d.price * qty;
    });
    if (!items.length) { toast('购物车是空的'); throw new Error('empty'); }
    var addr = myAddresses().filter(function (a) { return a.id === +f.address.value; })[0];
    items.forEach(function (it) {
      var d = db.dishes.filter(function (x) { return x.name === it.name; })[0];
      if (d) d.stock -= it.qty;
    });
    db.orders.push({
      id: db.seq.order++,
      userName: u.username,
      merchantId: state.currentMerchant,
      items: items,
      total: total,
      status: 'pending_accept',
      address: addr ? addr.detail : '',
      remark: f.remark.value.trim(),
      cutlery: f.cutlery.checked,
      rider: '',
      createdAt: Date.now()
    });
    state.cart = {};
    save();
    toast('下单成功，等待商家接单');
  }

  function merchantAction(id, act) {
    var o = db.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    if (act === 'accept') {
      o.status = 'accepted'; o.acceptedAt = Date.now(); toast('已接单，等待骑手抢单');
    } else if (act === 'reject') {
      var reason = prompt('请填写拒单理由：');
      if (reason == null) return;
      o.status = 'cancelled'; o.cancelReason = reason || '未填写';
      // 拒单退库存
      o.items.forEach(function (it) {
        var d = db.dishes.filter(function (x) { return x.name === it.name; })[0];
        if (d) d.stock += it.qty;
      });
      toast('已拒单（理由：' + o.cancelReason + '），库存已回补');
    }
    save();
  }

  function toggleDish(id) {
    var d = db.dishes.filter(function (x) { return x.id === id; })[0];
    d.onShelf = !d.onShelf;
    save(); toast(d.onShelf ? '已上架' : '已下架');
  }

  function claimOrder(id) {
    var u = cur();
    var o = db.orders.filter(function (x) { return x.id === id; })[0];
    if (o.status !== 'accepted') { toast('该订单已被抢'); render(); return; }
    o.status = 'delivering'; o.rider = u.username; o.claimedAt = Date.now();
    save(); toast('抢单成功');
  }
  function deliverOrder(id) {
    var o = db.orders.filter(function (x) { return x.id === id; })[0];
    o.status = 'delivered'; o.deliveredAt = Date.now();
    save(); toast('已标记送达，等待顾客评价');
  }

  function cancelOrder(id) {
    var o = db.orders.filter(function (x) { return x.id === id; })[0];
    if (o.status !== 'pending_accept') { toast('当前状态不可取消'); return; }
    o.status = 'cancelled';
    o.items.forEach(function (it) {
      var d = db.dishes.filter(function (x) { return x.name === it.name; })[0];
      if (d) d.stock += it.qty;
    });
    save(); toast('订单已取消，库存已回补');
  }

  function submitComment(id, f) {
    var o = db.orders.filter(function (x) { return x.id === id; })[0];
    o.comment = { score: +f.score.value, content: f.content.value.trim(), time: Date.now(), reply: '' };
    o.status = 'completed'; o.completedAt = Date.now();
    save(); toast('评价成功，订单完成');
  }

  function addAddress(f) {
    var u = cur();
    var detail = f.detail.value.trim();
    if (!detail) { toast('请填写地址'); return; }
    var mine = myAddresses();
    var isDefault = mine.length === 0;
    db.addresses.push({ id: db.seq.addr++, userId: u.id, label: f.label.value.trim() || '新地址', detail: detail, isDefault: isDefault });
    save(); toast('地址已添加');
  }
  function setDefaultAddr(id) {
    var u = cur();
    db.addresses.forEach(function (a) { a.isDefault = (a.userId === u.id && a.id === id); });
    save(); toast('已设为默认地址');
  }
  function delAddress(id) {
    db.addresses = db.addresses.filter(function (a) { return a.id !== id; });
    save(); toast('地址已删除');
  }

  /* ---------------- 渲染 ---------------- */

  var app = document.getElementById('app');
  var userBox = document.getElementById('userBox');

  function render() {
    var u = cur();
    // 顶栏：显示当前登录用户或空
    if (u) {
      userBox.innerHTML = '<span class="user-chip">' + esc(u.username) + ' · ' + ROLE_TEXT[u.role] + '</span>' +
        '<button class="link-btn" id="logoutBtn">退出登录</button>';
      document.getElementById('logoutBtn').addEventListener('click', function () {
        db.session = null; state.cart = {}; state.currentMerchant = null; save(); render();
        toast('已退出登录');
      });
    } else {
      userBox.innerHTML = '';
    }
    if (!u) { renderLogin(); return; }
    if (u.role === 'customer') renderCustomer();
    else if (u.role === 'merchant') renderMerchant();
    else if (u.role === 'rider') renderRider();
    else renderAdmin();
  }

  /* ---------- 登录 / 注册 / 找回密码 ---------- */

  function renderLogin() {
    var roles = [
      { k: 'customer', ico: '🛍️', name: '用户' },
      { k: 'merchant', ico: '🏪', name: '商家' },
      { k: 'rider', ico: '🛵', name: '骑手' },
      { k: 'admin', ico: '🛡️', name: '管理员' }
    ];
    var h = '<div class="auth-wrap"><div class="auth-card card">';
    h += '<div class="role-grid">' +
      roles.map(function (r) {
        return '<div class="role-card' + (r.k === loginRole ? ' active' : '') + '" data-role="' + r.k + '" onclick="App.pickRole(\'' + r.k + '\')">' +
          '<div class="ico">' + r.ico + '</div><div class="name">' + r.name + '</div></div>';
      }).join('') + '</div>';

    // 登录
    h += '<div id="paneLogin">' +
      '<form onsubmit="return App.doLogin(this)">' +
      '<div class="field"><label>用户名</label><input type="text" name="username" placeholder="请输入用户名" required></div>' +
      '<div class="field"><label>密码</label><input type="password" name="password" placeholder="请输入密码" required></div>' +
      '<button class="btn" style="width:100%;padding:12px" type="submit" id="loginBtn">以「' + ROLE_TEXT[loginRole] + '」身份登录</button>' +
      '</form>' +
      '<div class="switch-line">没有账号？<a onclick="App.switchPane(\'register\')">立即注册</a>' +
      ' &nbsp;·&nbsp; <a onclick="App.switchPane(\'forgot\')">忘记密码？</a></div>' +
      '<div class="demo-accounts">演示账号（密码都是 <b>123456</b>，点击填入）：<br>' +
      '用户 <code data-u="alice" data-r="customer" onclick="App.fillDemoAccount(\'alice\')">alice</code> ｜ ' +
      '商家 <code data-u="shop_zha" data-r="merchant" onclick="App.fillDemoAccount(\'shop_zha\')">shop_zha</code> ｜ ' +
      '骑手 <code data-u="bob" data-r="rider" onclick="App.fillDemoAccount(\'bob\')">bob</code> ｜ ' +
      '管理员 <code data-u="admin" data-r="admin" onclick="App.fillDemoAccount(\'admin\')">admin</code></div></div>';

    // 注册
    h += '<div id="paneRegister" style="display:none">' +
      '<form onsubmit="return App.doRegister(this)">' +
      '<div class="field"><label>用户名</label><input type="text" name="username" placeholder="2-20 位字母 / 数字 / 中文" required></div>' +
      '<div class="field"><label>密码（至少 6 位）</label><input type="password" name="password" required></div>' +
      '<div class="field"><label>手机号（选填）</label><input type="text" name="phone"></div>' +
      '<div class="field" id="rgMerchantNameField" style="' + (loginRole === 'merchant' ? '' : 'display:none') + '">' +
      '<label>店铺名称</label><input type="text" name="merchantName" placeholder="例如：川香居"></div>' +
      '<button class="btn" style="width:100%;padding:12px" type="submit">注册</button>' +
      '</form>' +
      '<div class="switch-line">已有账号？<a onclick="App.switchPane(\'login\')">去登录</a></div></div>';

    // 找回密码
    h += '<div id="paneForgot" style="display:none">' +
      '<div class="field"><label>第一步：输入用户名获取验证码</label>' +
      '<div class="row"><input type="text" id="fpUsername" placeholder="注册时的用户名" style="flex:1">' +
      '<button type="button" class="btn ghost" onclick="App.sendCode()">获取验证码</button></div></div>' +
      '<div id="fpCodeTip" class="code-tip" style="display:none"></div>' +
      '<form onsubmit="return App.doReset(this)">' +
      '<div class="field"><label>第二步：输入验证码</label><input type="text" name="code" placeholder="6 位数字验证码" required></div>' +
      '<div class="field"><label>设置新密码（至少 6 位）</label><input type="password" name="newPassword" required></div>' +
      '<button class="btn" style="width:100%;padding:12px" type="submit">重置密码</button>' +
      '</form>' +
      '<div class="switch-line">想起来密码了？<a onclick="App.switchPane(\'login\')">去登录</a></div></div>';

    h += '</div></div>';
    app.innerHTML = h;
  }

  function switchPane(name) {
    ['Login', 'Register', 'Forgot'].forEach(function (p) {
      var el = document.getElementById('pane' + p);
      if (el) el.style.display = p.toLowerCase() === name ? 'block' : 'none';
    });
  }

  /* ---------- 顾客端 ---------- */

  function renderCustomer() {
    var u = cur();
    var h = '';
    h += '<div class="tabs">' +
      tabBtn('order', '点餐', state.customerTab) +
      tabBtn('orders', '我的订单', state.customerTab) +
      tabBtn('addresses', '我的地址', state.customerTab) +
      '</div>';
    if (state.customerTab === 'order') {
      if (state.currentMerchant == null) {
        h += '<h2 class="sec">选择商家</h2><div class="grid">';
        db.merchants.forEach(function (m) {
          h += '<div class="m-card" onclick="App.enterMerchant(' + m.id + ')">' +
            '<b>' + esc(m.name) + '</b>' +
            '<span class="muted">' + esc(m.address) + '</span><br>' +
            '<span class="rating">评分 ' + m.rating + '</span> <span class="muted">· ' +
            db.dishes.filter(function (d) { return d.merchantId === m.id && d.onShelf; }).length + ' 个在售菜品</span></div>';
        });
        h += '</div>';
      } else {
        var m = findMerchant(state.currentMerchant);
        h += '<div class="row spread" style="margin-bottom:12px"><h2 class="sec" style="margin:0">' + esc(m.name) +
          ' <span class="muted" style="font-size:13px;font-weight:400">评分 ' + m.rating + '</span></h2>' +
          '<button class="btn ghost small" onclick="App.enterMerchant(null)">换一家</button></div>';
        h += '<div class="grid">';
        db.dishes.filter(function (d) { return d.merchantId === m.id; }).forEach(function (d) {
          var inCart = state.cart[d.id] || 0;
          h += '<div class="d-card' + (d.onShelf ? '' : ' off') + '">' +
            '<div class="dish-emoji">' + d.emoji + '</div>' +
            '<b>' + esc(d.name) + '</b>' +
            '<span class="tag">' + esc(d.category) + '</span><br><br>' +
            '<div class="row spread"><span><span class="price">¥' + fmtMoney(d.price) + '</span> <span class="stock">库存 ' + d.stock + '</span></span>' +
            (d.onShelf && d.stock > 0
              ? '<span class="qty">' +
                (inCart > 0 ? '<button onclick="App.cartAdd(' + d.id + ',-1)">−</button><span>' + inCart + '</span>' : '') +
                '<button onclick="App.cartAdd(' + d.id + ',1)">+</button></span>'
              : '<span class="muted">' + (d.onShelf ? '已售罄' : '已下架') + '</span>') +
            '</div></div>';
        });
        h += '</div>';
      }
    } else if (state.customerTab === 'orders') {
      h += '<h2 class="sec">我的订单</h2>';
      var mine = db.orders.filter(function (o) { return o.userName === u.username; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
      if (!mine.length) h += '<div class="empty">还没有订单</div>';
      mine.forEach(function (o) { h += orderCard(o, 'customer'); });
    } else {
      h += '<h2 class="sec">我的地址</h2><div class="card">';
      var addrs = myAddresses();
      if (!addrs.length) h += '<div class="muted" style="padding:8px 0">还没有地址，下单前请先添加收货地址。</div>';
      addrs.forEach(function (a) {
        h += '<div class="row spread" style="padding:8px 0;border-bottom:1px solid #f3f4f6">' +
          '<span><span class="tag">' + esc(a.label) + '</span> ' + esc(a.detail) +
          (a.isDefault ? ' <span class="st delivered" style="margin-left:6px">默认</span>' : '') + '</span>' +
          '<span>' + (a.isDefault ? '' : '<button class="btn ghost small" onclick="App.setDefault(' + a.id + ')">设为默认</button> ') +
          '<button class="btn ghost small" onclick="App.delAddr(' + a.id + ')">删除</button></span></div>';
      });
      h += '<form onsubmit="return App.addAddr(this)" style="margin-top:14px"><div class="field"><label>新增地址</label>' +
        '<div class="row"><input type="text" name="label" placeholder="标签（如 家 / 公司）" style="max-width:160px">' +
        '<input type="text" name="detail" placeholder="详细地址" style="flex:1;min-width:200px">' +
        '<button class="btn small" type="submit">添加</button></div></div></form></div>';
    }

    // 购物车结算条（点餐页才有）
    if (state.customerTab === 'order' && state.currentMerchant != null) {
      var cnt = 0, total = 0;
      Object.keys(state.cart).forEach(function (id) {
        var d = db.dishes.filter(function (x) { return x.id === +id; })[0];
        if (d) { cnt += state.cart[id]; total += d.price * state.cart[id]; }
      });
      h += '<div style="height:70px"></div>';
      h += '<div class="cart-bar"><span>🛒</span><span class="cart-items">' +
        (cnt ? cartSummary() : '购物车是空的') + '</span><span class="total">¥' + fmtMoney(total) + '</span>' +
        '<button class="btn" ' + (cnt ? '' : 'disabled style="opacity:.5"') + ' onclick="App.openCheckout()">去结算</button></div>';
    }
    app.innerHTML = h;
  }

  function cartSummary() {
    var parts = [];
    Object.keys(state.cart).forEach(function (id) {
      var d = db.dishes.filter(function (x) { return x.id === +id; })[0];
      if (d && state.cart[id]) parts.push(d.name + ' × ' + state.cart[id]);
    });
    return esc(parts.join('，'));
  }

  function openCheckout() {
    var addrOpts = myAddresses().map(function (a) {
      return '<option value="' + a.id + '"' + (a.isDefault ? ' selected' : '') + '>' + esc(a.label + ' · ' + a.detail) + '</option>';
    }).join('');
    var html =
      '<form id="checkoutForm" onsubmit="return App.checkout(this)">' +
      '<h3 style="margin-bottom:10px">确认订单</h3>' +
      '<div style="font-size:14px;line-height:1.9;margin-bottom:10px">' + cartSummary() + '</div>' +
      '<div class="field"><label>收货地址</label><select name="address">' + (addrOpts || '<option value="">请先在「我的地址」添加</option>') + '</select></div>' +
      '<div class="field"><label>备注</label><input type="text" name="remark" placeholder="口味偏好等（选填）"></div>' +
      '<label class="row" style="font-size:14px"><input type="checkbox" name="cutlery"> 需要一次性餐具（默认不需要，支持环保）</label>' +
      '<div class="row" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" onclick="this.closest(\'#modal\').remove()">取消</button>' +
      '<button type="submit" class="btn" ' + (addrOpts ? '' : 'disabled style="opacity:.5"') + '>提交订单</button></div></form>';
    openModal(html);
  }

  /* ---------- 商家端 ---------- */

  function renderMerchant() {
    var u = cur();
    var me = db.merchants.filter(function (m) { return m.owner === u.username; })[0];
    if (!me) { app.innerHTML = '<div class="empty">未找到你的店铺信息</div>'; return; }
    var h = '<div class="card row spread"><span>当前商家：<b>' + esc(me.name) + '</b> <span class="muted">' + esc(me.address) + '</span></span>' +
      '<span class="tag">评分 ' + me.rating + '</span></div>';
    h += '<div class="tabs">' +
      tabBtn('pending', '待处理订单', state.merchantTab) +
      tabBtn('dishes', '菜品管理', state.merchantTab) +
      tabBtn('reviews', '评价', state.merchantTab) +
      '</div>';
    var mine = db.orders.filter(function (o) { return o.merchantId === me.id; });

    if (state.merchantTab === 'pending') {
      var pending = mine.filter(function (o) { return o.status === 'pending_accept'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      var active = mine.filter(function (o) { return o.status !== 'pending_accept' && o.status !== 'cancelled'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      h += '<h2 class="sec">待接单 <span class="muted" style="font-size:13px;font-weight:400">（' + pending.length + '）</span></h2>';
      if (!pending.length) h += '<div class="empty">暂无待接单订单</div>';
      pending.forEach(function (o) {
        h += orderCard(o, 'merchant');
      });
      h += '<h2 class="sec">进行中 / 历史订单</h2>';
      if (!active.length) h += '<div class="empty">暂无</div>';
      active.forEach(function (o) { h += orderCard(o, 'merchant'); });
    } else if (state.merchantTab === 'dishes') {
      h += '<h2 class="sec">菜品管理</h2>';
      h += '<form class="card" onsubmit="return App.addDish(this)" style="margin-bottom:14px"><div class="field" style="margin-bottom:0"><label>新增菜品</label>' +
        '<div class="row"><input type="text" name="name" placeholder="菜品名" style="flex:1;min-width:120px" required>' +
        '<input type="text" name="price" placeholder="价格" style="max-width:90px" required>' +
        '<input type="text" name="stock" placeholder="库存" style="max-width:80px" required>' +
        '<select name="category" style="max-width:90px">' + ['主食', '小吃', '饮品', '甜品'].map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
        '<select name="emoji" style="max-width:80px">' + ['🍜', '🥗', '🥛', '🧋', '🍛', '🍖', '🍋', '🥟'].map(function (e) { return '<option>' + e + '</option>'; }).join('') + '</select>' +
        '<button class="btn small" type="submit">添加</button></div></div></form>';
      var dishes = db.dishes.filter(function (d) { return d.merchantId === me.id; });
      if (!dishes.length) h += '<div class="empty">还没有菜品，先添加一道吧。</div>';
      dishes.forEach(function (d) {
        h += '<div class="card row spread"><span style="font-size:26px">' + d.emoji + '</span>' +
          '<span style="flex:1"><b>' + esc(d.name) + '</b> <span class="tag">' + esc(d.category) + '</span><br>' +
          '<span class="price" style="color:#ff6b1a">¥' + fmtMoney(d.price) + '</span> <span class="muted">库存 ' + d.stock + '</span></span>' +
          '<button class="btn small ' + (d.onShelf ? 'ghost' : 'green') + '" onclick="App.toggleDish(' + d.id + ')">' + (d.onShelf ? '下架' : '上架') + '</button></div>';
      });
      h += '<p class="muted">说明：菜品无实拍图时以 emoji 占位展示，与后端版行为一致。</p>';
    } else {
      h += '<h2 class="sec">顾客评价</h2>';
      var cmts = mine.filter(function (o) { return o.comment; });
      if (!cmts.length) h += '<div class="empty">暂无评价</div>';
      cmts.forEach(function (o) {
        h += '<div class="card"><div class="row spread"><span>订单 #' + o.id + ' <span class="muted">· ' + esc(o.userName) + '</span></span>' +
          '<span class="muted">' + fmt(o.comment.time) + '</span></div>' +
          '<div class="cmt"><span class="stars">' + stars(o.comment.score) + '</span> ' + esc(o.comment.content || '') +
          (o.comment.reply
            ? '<div class="reply"><b>商家回复：</b>' + esc(o.comment.reply) + '</div>'
            : '<div class="actions"><button class="btn small ghost" onclick="App.reply(' + o.id + ')">回复</button></div>') +
          '</div></div>';
      });
    }
    app.innerHTML = h;
  }

  /* ---------- 骑手端 ---------- */

  function renderRider() {
    var u = cur();
    var h = '<div class="stat-grid">' +
      statCard(riderEarnings(), '累计收入（元）') +
      statCard(db.orders.filter(function (o) { return o.rider === u.username; }).length, '累计配送') +
      statCard(db.orders.filter(function (o) { return o.rider === u.username && o.status === 'delivering'; }).length, '配送中') +
      '</div>';
    h += '<div class="tabs">' +
      tabBtn('hall', '抢单大厅', state.riderTab) +
      tabBtn('doing', '配送中', state.riderTab) +
      tabBtn('history', '历史配送', state.riderTab) +
      '</div>';
    var mine = db.orders.filter(function (o) { return o.rider === u.username; });
    if (state.riderTab === 'hall') {
      var hall = db.orders.filter(function (o) { return o.status === 'accepted'; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
      h += '<h2 class="sec">可抢订单</h2>';
      if (!hall.length) h += '<div class="empty"><div class="big">🎯</div>暂时没有可抢的订单</div>';
      hall.forEach(function (o) {
        h += orderCard(o, 'rider');
      });
    } else if (state.riderTab === 'doing') {
      var doing = mine.filter(function (o) { return o.status === 'delivering'; });
      h += '<h2 class="sec">配送中</h2>';
      if (!doing.length) h += '<div class="empty"><div class="big">🚴</div>当前没有配送中的订单</div>';
      doing.forEach(function (o) { h += orderCard(o, 'rider'); });
    } else {
      var done = mine.filter(function (o) { return o.status === 'delivered' || o.status === 'completed'; })
        .sort(function (a, b) { return (b.deliveredAt || 0) - (a.deliveredAt || 0); });
      h += '<h2 class="sec">历史配送</h2>';
      if (!done.length) h += '<div class="empty"><div class="big">📦</div>还没有历史配送记录</div>';
      done.forEach(function (o) { h += orderCard(o, 'rider'); });
    }
    app.innerHTML = h;
  }

  function riderEarnings() {
    var u = cur();
    // 演示口径：每单配送费按订单金额 10% 估算
    var sum = 0;
    db.orders.forEach(function (o) {
      if (o.rider === u.username && (o.status === 'delivered' || o.status === 'completed')) sum += o.total * 0.1;
    });
    return fmtMoney(sum);
  }

  /* ---------- 管理员端 ---------- */

  function renderAdmin() {
    var orders = db.orders;
    var completed = orders.filter(function (o) { return o.status === 'completed'; });
    var revenue = 0;
    completed.forEach(function (o) { revenue += o.total; });
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayCnt = orders.filter(function (o) { return o.createdAt >= today.getTime(); }).length;

    var h = '<h2 class="sec">数据看板</h2>';
    h += '<div class="stat-grid">' +
      statCard(db.merchants.length, '入驻商家') +
      statCard(db.users.filter(function (u) { return u.role === 'customer'; }).length, '注册用户') +
      statCard(db.users.filter(function (u) { return u.role === 'rider'; }).length, '注册骑手') +
      statCard(orders.length, '累计订单') +
      statCard(todayCnt, '今日订单') +
      statCard(fmtMoney(revenue), '累计营收（元）') +
      '</div>';

    // 近 7 天订单量 / 营收（纯 CSS 柱状图）
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i);
      var d1 = new Date(d0.getTime() + 24 * 3600 * 1000);
      var dayOrders = orders.filter(function (o) { return o.createdAt >= d0.getTime() && o.createdAt < d1.getTime(); });
      var dayRev = 0;
      dayOrders.forEach(function (o) { dayRev += o.total; });
      days.push({ label: (d0.getMonth() + 1) + '/' + d0.getDate(), cnt: dayOrders.length, rev: dayRev });
    }
    var maxCnt = Math.max.apply(null, days.map(function (d) { return d.cnt; }).concat([1]));
    h += '<div class="card"><b style="font-size:15px">近 7 天订单量</b><div class="chart">';
    days.forEach(function (d) {
      h += '<div class="col"><div class="bar" style="height:' + Math.round(d.cnt / maxCnt * 100) + '%">' +
        '<span class="val">' + d.cnt + '</span></div><span class="day">' + d.label + '</span></div>';
    });
    h += '</div></div>';

    // 订单状态分布
    h += '<div class="card"><b style="font-size:15px">订单状态分布</b>';
    Object.keys(STATUS).forEach(function (k) {
      var n = orders.filter(function (o) { return o.status === k; }).length;
      h += '<div class="rank-row"><span style="width:90px"><span class="st ' + k + '">' + STATUS[k] + '</span></span>' +
        '<span class="bar-wrap"><span class="bar-fill" style="width:' + (n / orders.length * 100) + '%"></span></span>' +
        '<span class="muted" style="width:28px;text-align:right">' + n + '</span></div>';
    });
    h += '</div>';

    // 商家营收排行
    h += '<div class="card"><b style="font-size:15px">商家营收排行</b>';
    var rank = db.merchants.map(function (m) {
      var rev = 0;
      completed.filter(function (o) { return o.merchantId === m.id; }).forEach(function (o) { rev += o.total; });
      return { name: m.name, rev: rev };
    }).sort(function (a, b) { return b.rev - a.rev; });
    var maxRev = Math.max.apply(null, rank.map(function (r) { return r.rev; }).concat([1]));
    rank.forEach(function (r) {
      h += '<div class="rank-row"><span style="width:130px">' + esc(r.name) + '</span>' +
        '<span class="bar-wrap"><span class="bar-fill" style="width:' + (r.rev / maxRev * 100) + '%"></span></span>' +
        '<span class="muted" style="width:70px;text-align:right">¥' + fmtMoney(r.rev) + '</span></div>';
    });
    h += '</div>';

    // 用户列表
    h += '<div class="card"><b style="font-size:15px">用户列表</b>';
    db.users.forEach(function (u) {
      h += '<div class="rank-row"><span style="width:130px"><b>' + esc(u.username) + '</b></span>' +
        '<span class="bar-wrap" style="background:none"><span class="tag">' + ROLE_TEXT[u.role] + '</span>' +
        (u.phone ? ' <span class="muted">' + esc(u.phone) + '</span>' : '') + '</span></div>';
    });
    h += '</div>';
    app.innerHTML = h;
  }

  /* ---------- 通用组件 ---------- */

  function tabBtn(id, label, curTab) {
    return '<button class="tab-btn' + (curTab === id ? ' active' : '') + '" onclick="App.switchTab(\'' + id + '\')">' + label + '</button>';
  }
  function statCard(num, label) {
    return '<div class="stat-card"><div class="num">' + num + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function orderCard(o, viewer) {
    var u = cur();
    var m = findMerchant(o.merchantId);
    var h = '<div class="o-card"><div class="head"><b>' + esc(m ? m.name : '商家') +
      ' <span class="muted" style="font-weight:400">#' + o.id + '</span></b>' +
      '<span class="st ' + o.status + '">' + STATUS[o.status] + '</span></div>';
    h += '<div class="body"><div class="items-line">' +
      o.items.map(function (it) { return esc(it.name) + ' × ' + it.qty; }).join('，') +
      '　<span style="color:#ff6b1a;font-weight:700">合计 ¥' + fmtMoney(o.total) + '</span></div>';
    h += '<div class="muted">顾客：' + esc(o.userName) + ' · 送达：' + esc(o.address) + '</div>';
    if (o.remark) h += '<div class="muted">备注：' + esc(o.remark) + '</div>';
    if (o.cutlery) h += '<div class="muted">餐具：需要一次性餐具</div>';
    if (o.rider) h += '<div class="muted">骑手：' + esc(o.rider) + '</div>';
    if (o.cancelReason) h += '<div class="muted" style="color:#dc2626">拒单理由：' + esc(o.cancelReason) + '</div>';
    h += '<div class="timeline">下单 ' + fmt(o.createdAt) +
      (o.acceptedAt ? ' → 接单 ' + fmt(o.acceptedAt) : '') +
      (o.claimedAt ? ' → 抢单 ' + fmt(o.claimedAt) : '') +
      (o.deliveredAt ? ' → 送达 ' + fmt(o.deliveredAt) : '') +
      (o.completedAt ? ' → 完成 ' + fmt(o.completedAt) : '') + '</div>';

    if (o.comment) {
      h += '<div class="cmt"><span class="stars">' + stars(o.comment.score) + '</span> ' +
        esc(o.comment.content || '') +
        (o.comment.reply ? '<div class="reply"><b>商家回复：</b>' + esc(o.comment.reply) + '</div>' : '') + '</div>';
    }

    h += '<div class="actions">';
    if (viewer === 'merchant' && o.status === 'pending_accept') {
      h += '<button class="btn small green" onclick="App.mAct(' + o.id + ',\'accept\')">接单</button>' +
        '<button class="btn small danger" onclick="App.mAct(' + o.id + ',\'reject\')">拒单</button>';
    }
    if (viewer === 'merchant' && o.comment && !o.comment.reply && o.status === 'completed') {
      h += '<button class="btn small ghost" onclick="App.reply(' + o.id + ')">回复评价</button>';
    }
    if (viewer === 'rider' && o.status === 'accepted') {
      h += '<button class="btn small" onclick="App.claim(' + o.id + ')">抢单</button>';
    }
    if (viewer === 'rider' && o.status === 'delivering' && o.rider === u.username) {
      h += '<button class="btn small green" onclick="App.deliver(' + o.id + ')">我已送达</button>';
    }
    if (viewer === 'customer' && o.userName === u.username) {
      if (o.status === 'pending_accept') h += '<button class="btn small ghost" onclick="App.cancel(' + o.id + ')">取消订单</button>';
      if (o.status === 'delivered' && !o.comment) {
        h += '<button class="btn small" onclick="App.openComment(' + o.id + ')">评价</button>';
      }
    }
    h += '</div></div>';
    return h;
  }

  function openModal(inner) {
    var mask = document.createElement('div');
    mask.id = 'modal';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;padding:24px;max-width:460px;width:100%;max-height:80vh;overflow:auto;';
    box.innerHTML = inner;
    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function openComment(id) {
    var html =
      '<form onsubmit="return App.comment(' + id + ',this)">' +
      '<h3 style="margin-bottom:12px">评价订单 #' + id + '</h3>' +
      '<div class="field"><label>评分</label><select name="score">' +
      [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '">' + n + ' 星</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>评价内容</label><textarea name="content" placeholder="说说这单的体验" required></textarea></div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" onclick="this.closest(\'#modal\').remove()">取消</button>' +
      '<button type="submit" class="btn">提交评价</button></div></form>';
    openModal(html);
  }

  /* ---------------- 对外接口 ---------------- */

  window.App = {
    reset: reset,
    pickRole: function (r) {
      loginRole = r;
      // 就地更新登录界面，避免清空已输入内容
      document.querySelectorAll('.role-card').forEach(function (c) {
        c.classList.toggle('active', c.dataset.role === r);
      });
      var lb = document.getElementById('loginBtn');
      if (lb) lb.textContent = '以「' + ROLE_TEXT[r] + '」身份登录';
      var mf = document.getElementById('rgMerchantNameField');
      if (mf) mf.style.display = r === 'merchant' ? 'block' : 'none';
    },
    switchPane: switchPane,
    fillDemoAccount: function (username) {
      var user = findUser(username);
      if (!user) return;
      this.pickRole(user.role);
      switchPane('login');
      var form = document.querySelector('#paneLogin form');
      form.username.value = username;
      form.password.value = '123456';
    },
    doLogin: function (f) {
      var u = f.username.value.trim();
      var p = f.password.value;
      var user = findUser(u);
      if (!user) { toast('用户不存在'); return false; }
      if (user.password !== p) { toast('密码错误'); return false; }
      if (user.role !== loginRole) {
        toast('身份选择不正确：该账号是「' + ROLE_TEXT[user.role] + '」，请重新选择');
        return false;
      }
      db.session = user.username;
      state.cart = {}; state.currentMerchant = null;
      state.customerTab = 'order'; state.merchantTab = 'pending'; state.riderTab = 'hall';
      save(); render();
      toast('登录成功，欢迎 ' + user.username);
      return false;
    },
    doRegister: function (f) {
      var u = f.username.value.trim();
      var p = f.password.value;
      var phone = f.phone.value.trim();
      var shopName = f.merchantName ? f.merchantName.value.trim() : '';
      if (!/^[\u4e00-\u9fa5A-Za-z0-9]{2,20}$/.test(u)) { toast('用户名需 2-20 位字母 / 数字 / 中文'); return false; }
      if (p.length < 6) { toast('密码至少 6 位'); return false; }
      if (findUser(u)) { toast('用户名已被注册'); return false; }
      if (loginRole === 'merchant' && !shopName) { toast('商家注册需填写店铺名称'); return false; }
      var user = { id: db.seq.user++, username: u, password: p, role: loginRole, phone: phone };
      db.users.push(user);
      if (loginRole === 'merchant') {
        db.merchants.push({ id: db.seq.merchant++, name: shopName, phone: phone || '', address: '（新店开业）', rating: 5.0, owner: u });
      }
      save();
      toast('注册成功，请登录');
      switchPane('login');
      var form = document.querySelector('#paneLogin form');
      form.username.value = u;
      form.password.value = '';
      return false;
    },
    sendCode: function () {
      var name = document.getElementById('fpUsername').value.trim();
      var user = findUser(name);
      if (!user) { toast('用户不存在'); return; }
      var code = '';
      for (var i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
      db.resetCode = { username: name, code: code };
      save();
      var tip = document.getElementById('fpCodeTip');
      tip.style.display = 'block';
      tip.textContent = '验证码：' + code + '（演示环境直接显示，真实项目会通过邮件 / 短信发送）';
    },
    doReset: function (f) {
      var name = document.getElementById('fpUsername').value.trim();
      var code = f.code.value.trim();
      var np = f.newPassword.value;
      var user = findUser(name);
      if (!user) { toast('用户不存在'); return false; }
      if (!db.resetCode || db.resetCode.username !== name || db.resetCode.code !== code) {
        toast('验证码错误'); return false;
      }
      if (np.length < 6) { toast('新密码至少 6 位'); return false; }
      user.password = np;
      db.resetCode = null;
      save();
      toast('密码重置成功，请用新密码登录');
      switchPane('login');
      var form = document.querySelector('#paneLogin form');
      form.username.value = name;
      form.password.value = '';
      return false;
    },
    switchTab: function (t) {
      var u = cur();
      if (u.role === 'customer') state.customerTab = t;
      else if (u.role === 'merchant') state.merchantTab = t;
      else state.riderTab = t;
      render();
    },
    enterMerchant: function (id) { state.currentMerchant = id; render(); },
    cartAdd: function (id, delta) {
      var d = db.dishes.filter(function (x) { return x.id === id; })[0];
      var curQty = state.cart[id] || 0;
      var next = curQty + delta;
      if (next < 0) next = 0;
      if (next > d.stock) { toast('最多只能买 ' + d.stock + ' 份'); return; }
      if (next === 0) delete state.cart[id]; else state.cart[id] = next;
      render();
    },
    openCheckout: openCheckout,
    checkout: function (f) {
      try {
        placeOrder(f);
        document.getElementById('modal').remove();
        state.customerTab = 'orders';
        render();
      } catch (e) { /* toast 已提示 */ }
      return false;
    },
    mAct: function (id, act) { merchantAction(id, act); render(); },
    toggleDish: function (id) { toggleDish(id); render(); },
    addDish: function (f) {
      var u = cur();
      var me = db.merchants.filter(function (m) { return m.owner === u.username; })[0];
      var name = f.name.value.trim();
      var price = parseFloat(f.price.value);
      var stock = parseInt(f.stock.value, 10);
      if (!name) { toast('请填写菜品名'); return false; }
      if (!isFinite(price) || price <= 0) { toast('价格需为正数'); return false; }
      if (!isFinite(stock) || stock < 0) { toast('库存需为非负整数'); return false; }
      db.dishes.push({ id: db.seq.dish++, merchantId: me.id, name: name, price: price, stock: stock, category: f.category.value, emoji: f.emoji.value, onShelf: true });
      save(); toast('菜品已添加'); render();
      return false;
    },
    reply: function (id) {
      var o = db.orders.filter(function (x) { return x.id === id; })[0];
      var txt = prompt('回复顾客评价：', o.comment && o.comment.reply ? o.comment.reply : '');
      if (txt == null) return;
      o.comment.reply = txt.trim(); o.comment.replyTime = Date.now();
      save(); toast('回复成功'); render();
    },
    claim: function (id) { claimOrder(id); render(); },
    deliver: function (id) { deliverOrder(id); render(); },
    cancel: function (id) { cancelOrder(id); render(); },
    openComment: openComment,
    comment: function (id, f) {
      submitComment(id, f);
      document.getElementById('modal').remove();
      render();
      return false;
    },
    setDefault: function (id) { setDefaultAddr(id); render(); },
    delAddr: function (id) { delAddress(id); render(); },
    addAddr: function (f) { addAddress(f); render(); return false; }
  };

  /* ---------------- 启动 ---------------- */

  document.getElementById('resetBtn').addEventListener('click', function () {
    if (confirm('确定重置演示数据吗？当前操作记录将丢失。')) reset();
  });
  load();
  render();
})();
