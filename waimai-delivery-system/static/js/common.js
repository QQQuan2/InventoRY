/* ============================================================
   外卖配送系统 · 前端公共工具（token 管理 / 请求封装 / 通用 UI）
   ============================================================ */

const STORE = {
  get token() { return localStorage.getItem("waimai_token") || ""; },
  set token(v) { v ? localStorage.setItem("waimai_token", v) : localStorage.removeItem("waimai_token"); },
  get user() { try { return JSON.parse(localStorage.getItem("waimai_user") || "null"); } catch { return null; } },
  set user(v) { v ? localStorage.setItem("waimai_user", JSON.stringify(v)) : localStorage.removeItem("waimai_user"); },
};

const STATUS_LABELS = {
  pending_accept: "待商家接单",
  accepted: "商家已接单",
  delivering: "配送中",
  delivered: "已送达",
  completed: "已完成",
  cancelled: "已取消",
};
const STATUS_FLOW = ["pending_accept", "accepted", "delivering", "delivered", "completed"];
const ROLE_LABELS = { customer: "顾客", rider: "骑手", merchant: "商家", admin: "管理员" };

/** 统一请求封装：自动带 token，401 自动回登录页 */
const API = {
  async request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (STORE.token) headers["Authorization"] = "Bearer " + STORE.token;

    const res = await fetch(path, {
      ...opts,
      headers,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* 非 JSON 响应 */ }

    if (res.status === 401 && STORE.token && !path.startsWith("/api/auth/login")) {
      STORE.token = ""; STORE.user = "";
      location.href = "/";
      throw new Error(data.detail || "登录已失效，请重新登录");
    }
    if (!res.ok) throw new Error(data.detail || data.error || `请求失败（${res.status}）`);
    return data;
  },
  get(p) { return this.request(p); },
  post(p, body) { return this.request(p, { method: "POST", body }); },
  put(p, body) { return this.request(p, { method: "PUT", body }); },
  del(p) { return this.request(p, { method: "DELETE" }); },
  /** multipart 文件上传 */
  upload(path, formData) { return this.request(path, { method: "POST", body: formData }); },
};

/** 页面守卫：未登录或身份不符则回登录页 */
function guard(role) {
  if (!STORE.user || STORE.user.role !== role) { location.href = "/"; return false; }
  return true;
}

async function logout() {
  try { await API.post("/api/auth/logout"); } catch { /* 忽略 */ }
  STORE.token = ""; STORE.user = "";
  location.href = "/";
}

/* ---------- 通用 UI ---------- */
let _toastTimer = null;
function toast(msg, ok = true) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = "show" + (ok ? "" : " err");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => (el.className = ""), 2600);
}

function statusBadge(s) {
  return `<span class="badge ${s}">${STATUS_LABELS[s] || s}</span>`;
}

function fmtMoney(n) { return "¥" + Number(n || 0).toFixed(2); }
function fmtTime(s) { return s ? String(s).replace("T", " ").slice(0, 16) : "—"; }

/** 订单状态时间线（cancelled 单不显示） */
function timeline(status) {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx < 0) return "";
  return `<div class="timeline">` + STATUS_FLOW.map((s, i) =>
    `<div class="tl-step ${i <= idx ? "done" : ""}">
       <div class="dot"></div><div class="tl-label">${STATUS_LABELS[s]}</div>
     </div>`).join("") + `</div>`;
}

/** 菜品图片：有实拍图用图，否则用 emoji */
function dishVisual(d, size = 56) {
  if (d.dish_image_url) {
    return `<img src="${d.dish_image_url}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:10px"
                  onerror="this.outerHTML='<div style=&quot;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${size * 0.6}px&quot;>${d.emoji || "🍽️"}</div>'">`;
  }
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
          font-size:${size * 0.55}px;background:var(--primary-light);border-radius:10px">${d.emoji || "🍽️"}</div>`;
}

/** 顶部导航 */
function renderTopbar(active) {
  const u = STORE.user || {};
  return `
  <div class="topbar">
    <div class="logo">🍔 校园外卖<span>配送系统</span></div>
    <div class="spacer"></div>
    <div class="user-chip">
      <span class="role-tag">${ROLE_LABELS[u.role] || ""}</span>
      <span>${u.username || ""}</span>
      <button class="btn ghost small" onclick="logout()">退出</button>
    </div>
  </div>`;
}

/** 把 Tab 切换逻辑绑定到容器（data-tab -> data-panel） */
function bindTabs(containerSel) {
  document.querySelectorAll(`${containerSel} .tab-btn`).forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(`${containerSel} .tab-btn`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(`${containerSel} .tab-panel`).forEach(p => (p.style.display = "none"));
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.style.display = "block";
      if (typeof window._onTabChange === "function") window._onTabChange(btn.dataset.tab);
    });
  });
}

function starBar(score) {
  return "★".repeat(score) + "☆".repeat(5 - score);
}

/** 简单 HTML 转义（防止注入 / 撑爆 textarea） */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
