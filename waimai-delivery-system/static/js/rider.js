/* ============================================================
   骑手端：抢单大厅 → 配送中（标记送达） → 历史配送 + 收入统计
   ============================================================ */
if (!guard("rider")) throw new Error("redirecting");

document.getElementById("topbar").innerHTML = renderTopbar();
bindTabs("#mainTabs");
window._onTabChange = tab => {
  if (tab === "tabHall") loadHall();
  if (tab === "tabActive") loadActive();
  if (tab === "tabHistory") loadHistory();
};

async function loadStats() {
  const s = await API.get("/api/rider/stats");
  document.getElementById("statCards").innerHTML = `
    <div class="stat-card"><div class="num">💰 ${s.earnings}</div><div class="label">累计收入（元）</div></div>
    <div class="stat-card"><div class="num">${s.completed}</div><div class="label">完成单数</div></div>
    <div class="stat-card"><div class="num">${s.today}</div><div class="label">今日完成</div></div>
    <div class="stat-card"><div class="num">${s.active}</div><div class="label">配送中</div></div>`;
}

function orderCard(o, actionHtml) {
  const items = o.details.map(d => `${d.emoji} ${d.dish_name} × ${d.quantity}`).join("，");
  return `
  <div class="order-card">
    <div class="order-head">
      <span class="oid">#${o.order_id}</span>
      <span class="muted">🏪 ${o.merchant_name}</span>
      ${statusBadge(o.order_status)}
      <span class="time" style="margin-left:auto">${fmtTime(o.order_time)}</span>
    </div>
    <div class="order-items">${items}</div>
    <div class="muted">
      🏬 取餐：${o.business_address || "—"}<br />
      📍 送至：${o.delivery_address || "—"}${o.remark ? " · 📝 " + o.remark : ""}
    </div>
    <div class="order-foot">
      <span class="total">${fmtMoney(o.total_price)}</span>
      <span class="muted">配送费 ${fmtMoney(5)}（演示口径）</span>
      <div class="actions">${actionHtml || ""}</div>
    </div>
  </div>`;
}

/* ---- 抢单大厅 ---- */
async function loadHall() {
  const box = document.getElementById("hallList");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const orders = await API.get("/api/orders?scope=available");
  if (!orders.length) { box.innerHTML = `<div class="empty"><div class="big">🎯</div>暂时没有可抢的订单，歇一会儿~</div>`; return; }
  box.innerHTML = orders.map(o =>
    orderCard(o, `<button class="btn small" onclick="claimOrder(${o.order_id})">⚡ 立即抢单</button>`)
  ).join("");
}

async function claimOrder(orderId) {
  try {
    const data = await API.post(`/api/orders/${orderId}/claim`);
    toast(data.message);
    loadStats(); loadHall();
  } catch (e) { toast(e.message, false); loadHall(); }
}

/* ---- 配送中 ---- */
async function loadActive() {
  const box = document.getElementById("activeList");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const orders = await API.get("/api/orders?scope=active");
  const list = orders.filter(o => o.order_status === "delivering");
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="big">🚴</div>当前没有配送中的订单</div>`; return; }
  box.innerHTML = list.map(o =>
    orderCard(o, `<button class="btn small" onclick="deliverOrder(${o.order_id})">📩 我已送达</button>`)
  ).join("");
}

async function deliverOrder(orderId) {
  if (!confirm(`确认订单 #${orderId} 已送达顾客吗？`)) return;
  try {
    const data = await API.post(`/api/orders/${orderId}/deliver`);
    toast(data.message);
    loadStats(); loadActive();
  } catch (e) { toast(e.message, false); }
}

/* ---- 历史配送 ---- */
async function loadHistory() {
  const box = document.getElementById("historyList");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const orders = await API.get("/api/orders");
  const list = orders.filter(o => ["completed", "cancelled"].includes(o.order_status));
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="big">📦</div>还没有历史配送记录</div>`; return; }
  box.innerHTML = list.map(o => orderCard(o)).join("");
}

/* ================= 启动 ================= */
loadStats().then(loadHall);
