/* ============================================================
   商家端：接单/拒单 · 菜品管理（实拍图上传） · 评价回复
   ============================================================ */
if (!guard("merchant")) throw new Error("redirecting");

document.getElementById("topbar").innerHTML = renderTopbar();
bindTabs("#mainTabs");
window._onTabChange = tab => {
  if (tab === "tabOrders") loadOrders();
  if (tab === "tabDishes") loadDishes();
  if (tab === "tabComments") loadComments();
};

let myMerchantId = null;

/* ================= 店铺概览 ================= */
async function loadStats() {
  const me = await API.get("/api/me");
  myMerchantId = me.merchant_id;
  const [orders, dishes] = await Promise.all([API.get("/api/orders"), API.get(`/api/dishes?merchant_id=${myMerchantId}`)]);
  const pending = orders.filter(o => o.order_status === "pending_accept").length;
  const active = orders.filter(o => ["accepted", "delivering"].includes(o.order_status)).length;
  document.getElementById("statCards").innerHTML = `
    <div class="stat-card"><div class="num">${pending}</div><div class="label">待接单</div></div>
    <div class="stat-card"><div class="num">${active}</div><div class="label">进行中</div></div>
    <div class="stat-card"><div class="num">${dishes.length}</div><div class="label">在售菜品</div></div>
    <div class="stat-card"><div class="num">${orders.length}</div><div class="label">累计订单</div></div>`;
}

/* ================= 订单管理 ================= */
let orderScope = "active";

document.querySelectorAll("#orderScopeTabs .tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#orderScopeTabs .tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    orderScope = btn.dataset.scope;
    loadOrders();
  });
});

async function loadOrders() {
  const box = document.getElementById("orderList");
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const orders = await API.get("/api/orders");
  const list = orderScope === "active"
    ? orders.filter(o => ["pending_accept", "accepted", "delivering", "delivered"].includes(o.order_status))
    : orders;
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="big">🧾</div>暂无订单</div>`; return; }
  box.innerHTML = list.map(o => {
    const items = o.details.map(d => `${d.emoji} ${d.dish_name} × ${d.quantity}`).join("，");
    let actions = "";
    if (o.order_status === "pending_accept") {
      actions = `
        <button class="btn small" onclick="acceptOrder(${o.order_id})">✅ 接单</button>
        <button class="btn danger small" onclick="openReject(${o.order_id})">拒单</button>`;
    }
    return `
    <div class="order-card">
      <div class="order-head">
        <span class="oid">#${o.order_id}</span>
        <span class="muted">👤 ${o.customer_name}（${o.customer_phone || "无手机号"}）</span>
        ${statusBadge(o.order_status)}
        <span class="time" style="margin-left:auto">${fmtTime(o.order_time)}</span>
      </div>
      <div class="order-items">${items}</div>
      <div class="muted">📍 ${o.delivery_address || "—"}${o.remark ? " · 📝 " + o.remark : ""}${o.need_cutlery ? " · 🥢 需要餐具" : ""}${o.rider_name ? " · 🛵 骑手 " + o.rider_name : ""}</div>
      ${o.order_status === "cancelled" && o.cancel_reason ? `<div class="muted" style="margin-top:6px">✂️ ${o.cancel_reason}</div>` : ""}
      ${o.comment ? `<div style="margin-top:8px;padding:8px 10px;background:#fffbeb;border-radius:10px;font-size:13px">
          <b style="color:#b45309">顾客评价：</b>${starBar(o.comment.score)} ${o.comment.comment_content || ""}</div>` : ""}
      <div class="order-foot">
        <span class="total">${fmtMoney(o.total_price)}</span>
        <div class="actions">${actions}</div>
      </div>
    </div>`;
  }).join("");
}

async function acceptOrder(orderId) {
  try {
    const data = await API.post(`/api/orders/${orderId}/accept`);
    toast(data.message);
    loadOrders(); loadStats();
  } catch (e) { toast(e.message, false); }
}

let rejectOrderId = null;
function openReject(orderId) {
  rejectOrderId = orderId;
  document.getElementById("rejectOrderId").textContent = `#${orderId}`;
  showModal("rejectModal");
}
document.getElementById("btnConfirmReject").addEventListener("click", async () => {
  try {
    await API.post(`/api/orders/${rejectOrderId}/reject`, {
      reason: document.getElementById("rejectReason").value.trim(),
    });
    closeModal("rejectModal");
    toast("已拒单，库存已退回");
    loadOrders(); loadStats();
  } catch (e) { toast(e.message, false); }
});

/* ================= 菜品管理 ================= */
async function loadDishes() {
  const box = document.getElementById("dishList");
  if (!myMerchantId) await loadStats();
  const dishes = await API.get(`/api/dishes?merchant_id=${myMerchantId}`);
  if (!dishes.length) { box.innerHTML = `<div class="empty"><div class="big">🍜</div>还没有菜品，点右上角新增</div>`; return; }
  box.innerHTML = dishes.map(d => `
    <div class="dish-manage-card">
      ${dishVisual(d, 64)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">${d.dish_name}</div>
        <div class="muted" style="margin:3px 0">${d.category || "其他"} · 库存 ${d.stock}${d.stock === 0 ? "（已下架）" : ""}</div>
        <div style="color:var(--danger);font-weight:700">${fmtMoney(d.price)}</div>
      </div>
      <div class="ops">
        <button class="btn small" onclick="openDishModal(${d.dish_id})">编辑</button>
        <button class="btn ghost small" onclick="pickImage(${d.dish_id})">📷 ${d.dish_image_url ? "换图" : "传实拍"}</button>
        ${d.dish_image_url ? `<button class="btn ghost small" onclick="removeImage(${d.dish_id})">删图</button>` : ""}
        <button class="btn danger small" onclick="deleteDish(${d.dish_id}, '${d.dish_name}')">删除</button>
      </div>
    </div>`).join("");
}

/* ---- 图片上传（隐藏 file input，选完自动传） ---- */
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/png,image/jpeg,image/gif,image/webp";
fileInput.style.display = "none";
document.body.appendChild(fileInput);
let uploadDishId = null;

function pickImage(dishId) { uploadDishId = dishId; fileInput.click(); }

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || uploadDishId == null) return;
  const fd = new FormData();
  fd.append("file", file);
  try {
    toast("上传中…");
    const data = await API.upload(`/api/dishes/${uploadDishId}/image`, fd);
    toast(data.message);
    loadDishes();
  } catch (e) {
    toast(e.message, false);
  } finally {
    fileInput.value = "";
  }
});

async function removeImage(dishId) {
  try {
    await API.del(`/api/dishes/${dishId}/image`);
    toast("已删除实拍图，改用 emoji 展示");
    loadDishes();
  } catch (e) { toast(e.message, false); }
}

/* ---- 新增 / 编辑菜品 ---- */
function openDishModal(dishId) {
  const isEdit = dishId != null;
  document.getElementById("dishModalTitle").textContent = isEdit ? "编辑菜品" : "新增菜品";
  document.getElementById("dmDishId").value = isEdit ? dishId : "";
  const dish = isEdit ? null : { name: "", price: "", stock: 50, category: "主食", emoji: "🍽️" };
  if (isEdit) {
    API.get(`/api/dishes?merchant_id=${myMerchantId}`).then(list => {
      const d = list.find(x => x.dish_id === dishId);
      if (!d) return;
      document.getElementById("dmName").value = d.dish_name;
      document.getElementById("dmPrice").value = d.price;
      document.getElementById("dmStock").value = d.stock;
      document.getElementById("dmCategory").value = d.category || "其他";
      const sel = document.getElementById("dmEmoji");
      [...sel.options].forEach(o => { if (o.value === d.emoji) sel.value = o.value; });
    });
  } else {
    document.getElementById("dmName").value = dish.name;
    document.getElementById("dmPrice").value = dish.price;
    document.getElementById("dmStock").value = dish.stock;
    document.getElementById("dmCategory").value = dish.category;
    document.getElementById("dmEmoji").value = dish.emoji;
  }
  showModal("dishModal");
}

document.getElementById("btnSaveDish").addEventListener("click", async () => {
  const btn = document.getElementById("btnSaveDish");
  const body = {
    dish_name: document.getElementById("dmName").value.trim(),
    price: document.getElementById("dmPrice").value,
    stock: document.getElementById("dmStock").value,
    category: document.getElementById("dmCategory").value,
    emoji: document.getElementById("dmEmoji").value,
  };
  const dishId = document.getElementById("dmDishId").value;
  try {
    btn.disabled = true; btn.textContent = "保存中…";
    const data = dishId
      ? await API.put(`/api/dishes/${dishId}`, body)
      : await API.post("/api/dishes", body);
    closeModal("dishModal");
    toast(data.message);
    loadDishes(); loadStats();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "保存";
  }
});

async function deleteDish(dishId, name) {
  if (!confirm(`确定删除菜品「${name}」吗？`)) return;
  try {
    const data = await API.del(`/api/dishes/${dishId}`);
    toast(data.message);
    loadDishes(); loadStats();
  } catch (e) { toast(e.message, false); }
}

/* ================= 评价管理 ================= */
async function loadComments() {
  const box = document.getElementById("commentList");
  if (!myMerchantId) await loadStats();
  box.innerHTML = `<div class="empty">加载中…</div>`;
  const list = await API.get(`/api/merchants/${myMerchantId}/comments`);
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="big">⭐</div>还没有收到评价</div>`; return; }
  box.innerHTML = list.map(c => `
    <div class="comment-item">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <b>${c.customer_name}</b>
        <span style="color:#f59e0b">${starBar(c.score)}</span>
        <span class="muted" style="margin-left:auto">订单 #${c.order_id} · ${fmtTime(c.comment_time)}</span>
      </div>
      <div style="margin-top:6px;font-size:14px">${c.comment_content || "（未填写内容）"}</div>
      ${c.reply_content
        ? `<div style="margin-top:8px;padding:8px 12px;background:var(--primary-light);border-radius:10px;font-size:13px">
             <b>商家回复：</b>${c.reply_content}</div>`
        : `<div class="reply-box">
             <input id="reply-${c.comment_id}" placeholder="回复顾客…" />
             <button class="btn small" onclick="replyComment(${c.comment_id})">回复</button>
           </div>`}
    </div>`).join("");
}

async function replyComment(commentId) {
  const content = document.getElementById(`reply-${commentId}`).value.trim();
  if (!content) { toast("回复内容不能为空", false); return; }
  try {
    await API.post(`/api/comments/${commentId}/reply`, { content });
    toast("回复成功");
    loadComments();
  } catch (e) { toast(e.message, false); }
}

/* ================= 弹窗工具 ================= */
function showModal(id) { document.getElementById(id).classList.add("show"); }
function closeModal(id) { document.getElementById(id).classList.remove("show"); }
document.querySelectorAll(".modal-mask").forEach(m =>
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("show"); }));

/* ================= 启动 ================= */
loadStats().then(() => loadOrders());
