/* ============================================================
   顾客端：浏览商家 → 点餐加购 → 下单 → 跟踪订单 → 评价
   ============================================================ */
if (!guard("customer")) throw new Error("redirecting");

document.getElementById("topbar").innerHTML = renderTopbar();
bindTabs("#mainTabs");
window._onTabChange = tab => {
  if (tab === "tabMyOrders") loadMyOrders();
  if (tab === "tabAddresses") loadAddresses();
};

/* ================= 点餐 ================= */
let currentMerchant = null;
let menu = [];
const cart = {};          // dish_id -> {dish, qty}

async function loadMerchants() {
  const box = document.getElementById("merchantList");
  const list = await API.get("/api/merchants");
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="big">🏪</div>暂时没有商家入驻</div>`; return; }
  box.innerHTML = `<h3 style="margin-bottom:12px">选择商家</h3><div class="merchant-grid">` + list.map(m => `
    <div class="card merchant-card" onclick="openMenu(${m.merchant_id}, '${m.merchant_name}', ${m.rating})">
      <div class="m-ico">🍜</div>
      <div style="flex:1">
        <div style="font-weight:700">${m.merchant_name}</div>
        <div class="muted" style="margin:4px 0">📍 ${m.business_address || "暂无地址"}</div>
        <div style="font-size:13px">
          <span style="color:#f59e0b">★ ${m.rating}</span>
          <span class="muted" style="margin-left:10px">${m.dish_count} 个菜品</span>
        </div>
      </div>
      <div style="align-self:center;color:var(--primary)">›</div>
    </div>`).join("") + `</div>`;
}

async function openMenu(merchantId, name, rating) {
  currentMerchant = { id: merchantId, name };
  menu = await API.get(`/api/dishes?merchant_id=${merchantId}`);
  document.getElementById("merchantList").style.display = "none";
  const view = document.getElementById("menuView");
  view.style.display = "block";
  view.innerHTML = `
    <div class="menu-head">
      <button class="btn ghost small" onclick="backToMerchants()">‹ 返回商家列表</button>
      <h3>${name}</h3><span style="color:#f59e0b">★ ${rating}</span>
    </div>
    <div class="dish-grid">` + menu.map(d => `
      <div class="dish-card">
        ${dishVisual(d)}
        <div class="info">
          <div class="name">${d.dish_name}</div>
          <div class="meta">${d.category || "其他"} · 月售 — · ${d.stock > 0 ? "库存 " + d.stock : "<span style='color:var(--danger)'>已售罄</span>"}</div>
          <div class="price">${fmtMoney(d.price)}</div>
        </div>
        ${d.stock > 0
          ? `<button class="btn small" onclick="addToCart(${d.dish_id})">＋ 加入</button>`
          : `<button class="btn small" disabled>补货中</button>`}
      </div>`).join("") + `</div>`;
}

function backToMerchants() {
  document.getElementById("menuView").style.display = "none";
  document.getElementById("merchantList").style.display = "block";
}

/* ================= 购物车 ================= */
function addToCart(dishId) {
  const dish = menu.find(d => d.dish_id === dishId);
  if (!dish) return;
  if (cart[dishId] && cart[dishId].qty >= dish.stock) { toast("已达库存上限", false); return; }
  cart[dishId] = cart[dishId] || { dish, qty: 0 };
  cart[dishId].qty += 1;
  renderCart();
}
function changeQty(dishId, delta) {
  const item = cart[dishId];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) delete cart[dishId];
  renderCart();
}
function clearCart(notify) {
  Object.keys(cart).forEach(k => delete cart[k]);
  renderCart();
  if (notify) toast("购物车已清空");
}
function cartEntries() { return Object.values(cart); }

function renderCart() {
  const bar = document.getElementById("cartBar");
  const entries = cartEntries();
  const count = entries.reduce((s, e) => s + e.qty, 0);
  const total = entries.reduce((s, e) => s + e.qty * e.dish.price, 0);
  document.getElementById("cartCount").textContent = count;
  if (!count) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  document.getElementById("cartMerchant").textContent = currentMerchant ? currentMerchant.name : "";
  document.getElementById("cartSummary").textContent =
    entries.map(e => `${e.dish.emoji}${e.dish.dish_name}×${e.qty}`).join("  ");
  document.getElementById("btnCheckout").textContent = `去结算 ${fmtMoney(total)}`;
}

/* ================= 结算下单 ================= */
document.getElementById("btnCheckout").addEventListener("click", async () => {
  const entries = cartEntries();
  if (!entries.length) return;
  const total = entries.reduce((s, e) => s + e.qty * e.dish.price, 0);
  document.getElementById("checkoutItems").innerHTML =
    entries.map(e => `${e.dish.emoji} ${e.dish.dish_name} × ${e.qty} = ${fmtMoney(e.qty * e.dish.price)}`).join("<br>");
  document.getElementById("ckTotal").textContent = fmtMoney(total);
  // 拉取地址簿，渲染快捷选项
  await renderAddressChips();
  showModal("checkoutModal");
});

document.getElementById("btnSubmitOrder").addEventListener("click", async () => {
  const btn = document.getElementById("btnSubmitOrder");
  const address = document.getElementById("ckAddress").value.trim();
  if (!address) { toast("请填写配送地址", false); return; }
  try {
    btn.disabled = true; btn.textContent = "提交中…";
    const data = await API.post("/api/orders", {
      merchant_id: currentMerchant.id,
      delivery_address: address,
      remark: document.getElementById("ckRemark").value.trim(),
      need_cutlery: document.getElementById("ckCutlery").checked,
      items: cartEntries().map(e => ({ dish_id: e.dish.dish_id, quantity: e.qty })),
    });
    clearCart();
    closeModal("checkoutModal");
    toast(`下单成功！订单号 #${data.order_id}，等待商家接单`);
    document.querySelector('#mainTabs [data-tab="tabMyOrders"]').click();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "提交订单";
  }
});

/* ================= 我的订单 ================= */
let commentOrderId = null;
let commentScore = 5;

async function loadMyOrders() {
  const box = document.getElementById("myOrders");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  try {
    const orders = await API.get("/api/orders");
    if (!orders.length) { box.innerHTML = `<div class="empty"><div class="big">🧾</div>还没有订单，去点一单吧</div>`; return; }
    box.innerHTML = orders.map(o => renderOrderCard(o)).join("");
  } catch (e) {
    box.innerHTML = `<div class="empty">${e.message}</div>`;
  }
}

function renderOrderCard(o) {
  const items = o.details.map(d => `${d.emoji} ${d.dish_name} × ${d.quantity}`).join("，");
  let actions = "";
  if (["pending_accept", "accepted"].includes(o.order_status) && !o.rider_id) {
    actions += `<button class="btn danger small" onclick="cancelOrder(${o.order_id})">取消订单</button>`;
  }
  if (o.order_status === "delivered") {
    actions += `<button class="btn small" onclick="openComment(${o.order_id})">⭐ 评价本单</button>`;
  }
  const comment = o.comment ? `
    <div style="margin-top:10px;padding:10px;background:#fffbeb;border-radius:10px;font-size:13px">
      <b style="color:#b45309">我的评价：</b>${starBar(o.comment.score)} ${o.comment.comment_content || ""}
      ${o.comment.reply_content ? `<div class="muted" style="margin-top:4px">↳ 商家回复：${o.comment.reply_content}</div>` : ""}
    </div>` : "";
  const cancelInfo = o.order_status === "cancelled" && o.cancel_reason
    ? `<div class="muted" style="margin-top:6px">✂️ ${o.cancel_reason}</div>` : "";
  return `
  <div class="order-card">
    <div class="order-head">
      <span class="oid">#${o.order_id}</span>
      <span class="muted">🏪 ${o.merchant_name}</span>
      ${statusBadge(o.order_status)}
      <span class="time" style="margin-left:auto">${fmtTime(o.order_time)}</span>
    </div>
    ${timeline(o.order_status)}
    <div class="order-items">${items}</div>
    <div class="muted">📍 ${o.delivery_address || "—"}${o.remark ? " · 📝 " + o.remark : ""}${o.rider_name ? " · 🛵 骑手 " + o.rider_name : ""}</div>
    ${cancelInfo}${comment}
    <div class="order-foot">
      <span class="total">${fmtMoney(o.total_price)}</span>
      <div class="actions">${actions}</div>
    </div>
  </div>`;
}

async function cancelOrder(orderId) {
  if (!confirm(`确定取消订单 #${orderId} 吗？`)) return;
  try {
    await API.post(`/api/orders/${orderId}/cancel`, { reason: "顾客主动取消" });
    toast("订单已取消");
    loadMyOrders();
  } catch (e) { toast(e.message, false); }
}

/* ---- 评价 ---- */
function openComment(orderId) {
  commentOrderId = orderId;
  commentScore = 5;
  document.getElementById("starPick").textContent = "★★★★★";
  document.getElementById("cmContent").value = "";
  showModal("commentModal");
}

document.getElementById("starPick").addEventListener("click", e => {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  commentScore = Math.max(1, Math.min(5, Math.ceil(x / (rect.width / 5))));
  document.getElementById("starPick").textContent = starBar(commentScore);
  document.getElementById("starTip").textContent = ["", "很差", "一般", "还行", "满意", "超赞"][commentScore];
});

document.getElementById("btnSubmitComment").addEventListener("click", async () => {
  const btn = document.getElementById("btnSubmitComment");
  try {
    btn.disabled = true; btn.textContent = "提交中…";
    await API.post(`/api/orders/${commentOrderId}/comment`, {
      score: commentScore,
      content: document.getElementById("cmContent").value.trim(),
    });
    closeModal("commentModal");
    toast("评价成功，订单完成 🎉");
    loadMyOrders();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "提交评价";
  }
});

/* ================= 弹窗工具 ================= */
function showModal(id) { document.getElementById(id).classList.add("show"); }
function closeModal(id) { document.getElementById(id).classList.remove("show"); }
document.querySelectorAll(".modal-mask").forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("show"); }));

/* ============================================================
   地址簿：列表 + 弹窗 + 设为默认 + 设为结算默认选项
   ============================================================ */
let _addresses = [];
let _editingAddressId = null;   // null = 新增

async function loadAddresses() {
  try {
    _addresses = await API.get("/api/addresses");
  } catch (e) { _addresses = []; toast(e.message, false); }
  renderAddressList();
}

function renderAddressList() {
  const box = document.getElementById("addressList");
  if (!_addresses.length) {
    box.innerHTML = `<div class="card" style="text-align:center;color:var(--text-sub);padding:30px">
      📍 还没有保存的地址，点上方"新增地址"来添加一个吧～</div>`;
    return;
  }
  box.innerHTML = _addresses.map(a => `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;margin-bottom:4px">
          ${a.address_label ? `<span style="background:var(--primary-light);color:var(--primary);padding:1px 8px;border-radius:4px;font-size:12px;margin-right:6px">${escapeHtml(a.address_label)}</span>` : ""}
          ${escapeHtml(a.receiver_name)} · ${escapeHtml(a.receiver_phone)}
          ${a.is_default ? `<span style="background:#e8f5e9;color:#2e7d32;padding:1px 8px;border-radius:4px;font-size:12px;margin-left:6px">默认</span>` : ""}
        </div>
        <div class="muted" style="font-size:13px">${escapeHtml(a.detail_address)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${a.is_default ? "" : `<button class="btn ghost small" onclick="setDefaultAddr(${a.address_id})">设为默认</button>`}
        <button class="btn ghost small" onclick="editAddress(${a.address_id})">编辑</button>
        <button class="btn ghost small" onclick="deleteAddress(${a.address_id})">删除</button>
      </div>
    </div>`).join("");
}

function renderAddressChips() {
  const box = document.getElementById("ckAddressList");
  const input = document.getElementById("ckAddress");
  if (!_addresses.length) {
    box.innerHTML = `<span class="muted" style="font-size:13px">还没有地址，可手动输入（首次保存后会出现在这里）</span>`;
    input.value = "";
    return Promise.resolve();
  }
  return loadAddresses().then(() => {
    box.innerHTML = _addresses.map(a => `
      <button type="button" class="btn ghost small" data-id="${a.address_id}"
        onclick="pickAddressChip(${a.address_id})"
        style="${a.is_default ? 'border-color:var(--primary);color:var(--primary)' : ''}">
        ${a.address_label ? `📍${a.address_label} ` : ""}${escapeHtml(a.receiver_name)}
        ${a.is_default ? " · 默认" : ""}
      </button>`).join("");
    // 默认选中默认地址
    const def = _addresses.find(x => x.is_default) || _addresses[0];
    if (def && !input.value) input.value = def.detail_address;
  });
}

function pickAddressChip(id) {
  const a = _addresses.find(x => x.address_id === id);
  if (a) document.getElementById("ckAddress").value = a.detail_address;
}

function openAddressModal(id) {
  _editingAddressId = id;
  const a = id ? _addresses.find(x => x.address_id === id) : null;
  document.getElementById("addressModalTitle").textContent = id ? "编辑收货地址" : "新增收货地址";
  document.getElementById("adName").value  = a?.receiver_name  || "";
  document.getElementById("adPhone").value = a?.receiver_phone || "";
  document.getElementById("adLabel").value = a?.address_label  || "";
  document.getElementById("adDetail").value = a?.detail_address || "";
  document.getElementById("adDefault").checked = a?.is_default === 1;
  showModal("addressModal");
}
function editAddress(id) { openAddressModal(id); }

document.getElementById("btnAddAddress").addEventListener("click", () => openAddressModal(null));

document.getElementById("btnSaveAddress").addEventListener("click", async () => {
  const body = {
    receiver_name:  document.getElementById("adName").value.trim(),
    receiver_phone: document.getElementById("adPhone").value.trim(),
    address_label: document.getElementById("adLabel").value.trim() || null,
    detail_address: document.getElementById("adDetail").value.trim(),
    is_default: document.getElementById("adDefault").checked,
  };
  if (!body.receiver_name || !body.receiver_phone || !body.detail_address) {
    toast("请填写完整信息", false); return;
  }
  try {
    if (_editingAddressId) await API.put(`/api/addresses/${_editingAddressId}`, body);
    else                  await API.post("/api/addresses", body);
    closeModal("addressModal");
    toast("地址已保存");
    await loadAddresses();
  } catch (e) { toast(e.message, false); }
});

async function setDefaultAddr(id) {
  try {
    await API.post(`/api/addresses/${id}/default`, {});
    toast("已设为默认地址");
    await loadAddresses();
  } catch (e) { toast(e.message, false); }
}

async function deleteAddress(id) {
  if (!confirm("确认删除该地址？")) return;
  try {
    await API.del(`/api/addresses/${id}`);
    toast("地址已删除");
    await loadAddresses();
  } catch (e) { toast(e.message, false); }
}

/* ================= 启动 ================= */
loadMerchants();
