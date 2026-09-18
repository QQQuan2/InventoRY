/* ============================================================
   管理员后台：数据看板（Chart.js 可视化）+ 全量订单 / 用户数据
   ============================================================ */
if (!guard("admin")) throw new Error("redirecting");

document.getElementById("topbar").innerHTML = renderTopbar();
bindTabs("#dataTabs");
window._onTabChange = tab => {
  if (tab === "tabOrders") loadOrders();
  if (tab === "tabUsers") loadUsers();
};

const charts = [];

/* ================= 统计卡片 ================= */
function renderCards(cards) {
  document.getElementById("statCards").innerHTML = `
    <div class="stat-card"><div class="num">${cards.users}</div><div class="label">注册用户</div></div>
    <div class="stat-card"><div class="num">${cards.merchants}</div><div class="label">入驻商家</div></div>
    <div class="stat-card"><div class="num">${cards.riders}</div><div class="label">骑手</div></div>
    <div class="stat-card"><div class="num">${cards.orders}</div><div class="label">累计订单</div></div>
    <div class="stat-card"><div class="num">${cards.today_orders}</div><div class="label">今日订单</div></div>
    <div class="stat-card"><div class="num">¥${cards.revenue}</div><div class="label">累计营收</div></div>`;
}

/* ================= 图表 ================= */
function makeChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  charts.push(new Chart(el, cfg));
}

function renderCharts(stats) {
  Chart.defaults.font.family = '"PingFang SC","Microsoft YaHei",sans-serif';

  // 近 7 天：订单量（柱）+ 营收（线，右轴）
  const days = stats.weekly.map(w => (w.day || "").slice(5));
  makeChart("chartWeekly", {
    data: {
      labels: days,
      datasets: [
        {
          type: "bar", label: "订单量", data: stats.weekly.map(w => w.orders),
          backgroundColor: "rgba(255,122,26,.75)", borderRadius: 8, yAxisID: "y",
        },
        {
          type: "line", label: "营收(元)", data: stats.weekly.map(w => w.revenue),
          borderColor: "#1d4ed8", backgroundColor: "rgba(29,78,216,.12)",
          tension: .35, fill: true, yAxisID: "y1",
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "单" } },
        y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "元" } },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });

  // 订单状态分布（环形）
  const STATUS_COLORS = {
    pending_accept: "#f59e0b", accepted: "#3b82f6", delivering: "#8b5cf6",
    delivered: "#10b981", completed: "#16a34a", cancelled: "#9ca3af",
  };
  makeChart("chartStatus", {
    type: "doughnut",
    data: {
      labels: stats.status_dist.map(s => STATUS_LABELS[s.status] || s.status),
      datasets: [{
        data: stats.status_dist.map(s => s.n),
        backgroundColor: stats.status_dist.map(s => STATUS_COLORS[s.status] || "#ccc"),
        borderWidth: 2, borderColor: "#fff",
      }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "58%" },
  });

  // 商家营收排行（横向条形）
  makeChart("chartMerchant", {
    type: "bar",
    data: {
      labels: stats.merchant_rank.map(m => m.merchant_name),
      datasets: [{
        label: "营收(元)", data: stats.merchant_rank.map(m => m.revenue),
        backgroundColor: ["#ff7a1a", "#ffa94d", "#ffd8a8"].slice(0, stats.merchant_rank.length),
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y", maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });

  // 用户角色分布（饼图）
  const roleLabels = { customer: "顾客", rider: "骑手", merchant: "商家", admin: "管理员" };
  makeChart("chartRoles", {
    type: "pie",
    data: {
      labels: Object.keys(stats.role_dist).map(r => roleLabels[r] || r),
      datasets: [{
        data: Object.values(stats.role_dist),
        backgroundColor: ["#ff7a1a", "#8b5cf6", "#3b82f6", "#10b981"],
        borderWidth: 2, borderColor: "#fff",
      }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
  });

  // Top 菜品榜单
  const medal = ["🥇", "🥈", "🥉", "4", "5"];
  document.getElementById("topDishes").innerHTML = (stats.top_dishes || []).map((d, i) => `
    <div class="rank-row">
      <div class="rank-idx">${medal[i] || i + 1}</div>
      <div style="flex:1">${d.dish_name}</div>
      <div style="color:var(--primary-dark);font-weight:700">${d.sold} 份</div>
    </div>`).join("") || `<div class="empty">暂无销量数据</div>`;
}

/* ================= 数据表 ================= */
async function loadOrders() {
  const box = document.getElementById("allOrders");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const orders = await API.get("/api/orders");
  if (!orders.length) { box.innerHTML = `<div class="empty">暂无订单</div>`; return; }
  box.innerHTML = `
    <table class="list">
      <thead><tr>
        <th>订单号</th><th>顾客</th><th>商家</th><th>骑手</th>
        <th>金额</th><th>状态</th><th>下单时间</th><th>评价</th>
      </tr></thead>
      <tbody>` + orders.map(o => `
        <tr>
          <td><b>#${o.order_id}</b></td>
          <td>${o.customer_name}</td>
          <td>${o.merchant_name}</td>
          <td>${o.rider_name || "—"}</td>
          <td>${fmtMoney(o.total_price)}</td>
          <td>${statusBadge(o.order_status)}</td>
          <td class="muted">${fmtTime(o.order_time)}</td>
          <td>${o.comment ? starBar(o.comment.score) : "—"}</td>
        </tr>`).join("") + `</tbody>
    </table>`;
}

async function loadUsers() {
  const box = document.getElementById("userTable");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const users = await API.get("/api/admin/users");
  const roleLabels = { customer: "顾客", rider: "骑手", merchant: "商家", admin: "管理员" };
  box.innerHTML = `
    <table class="list">
      <thead><tr><th>ID</th><th>用户名</th><th>身份</th><th>手机号</th><th>注册时间</th></tr></thead>
      <tbody>` + users.map(u => `
        <tr>
          <td>${u.user_id}</td>
          <td><b>${u.username}</b></td>
          <td><span class="role-tag">${roleLabels[u.role] || u.role}</span></td>
          <td class="muted">${u.phone || "—"}</td>
          <td class="muted">${fmtTime(u.created_at)}</td>
        </tr>`).join("") + `</tbody>
    </table>`;
}

/* ================= 启动 ================= */
(async () => {
  const stats = await API.get("/api/admin/stats");
  renderCards(stats.cards);
  renderCharts(stats);
  loadOrders();
})();
