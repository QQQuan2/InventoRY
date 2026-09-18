/* ============================================================
   登录页逻辑：身份选择 / 登录 / 注册 / 找回密码
   ============================================================ */
let currentRole = "customer";
const ROLE_TEXT = { customer: "用户", merchant: "商家", rider: "骑手", admin: "管理员" };

/* ---- 身份卡片切换 ---- */
document.querySelectorAll("#roleGrid .role-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll("#roleGrid .role-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    currentRole = card.dataset.role;
    document.getElementById("btnLogin").textContent = `以「${ROLE_TEXT[currentRole]}」身份登录`;
  });
});

/* ---- 演示账号一键填入 ---- */
document.querySelectorAll(".demo-accounts code").forEach(code => {
  code.addEventListener("click", () => {
    switchPane("login");
    document.getElementById("liUsername").value = code.dataset.u;
    document.getElementById("liPassword").value = "123456";
    // 同时自动切到对应身份卡片
    const map = { alice: "customer", shop_zha: "merchant", shop_hu: "merchant", shop_guang: "merchant", bob: "rider", admin: "admin" };
    const role = map[code.dataset.u];
    if (role) document.querySelector(`#roleGrid .role-card[data-role="${role}"]`).click();
  });
});

/* ---- 面板切换 ---- */
function switchPane(name) {
  ["Login", "Register", "Forgot"].forEach(p => {
    document.getElementById("pane" + p).style.display = p.toLowerCase() === name ? "block" : "none";
  });
}

/* ---- 登录 ---- */
document.getElementById("btnLogin").addEventListener("click", async () => {
  const btn = document.getElementById("btnLogin");
  try {
    btn.disabled = true; btn.textContent = "登录中…";
    const data = await API.post("/api/auth/login", {
      username: document.getElementById("liUsername").value.trim(),
      password: document.getElementById("liPassword").value,
      role: currentRole,
    });
    STORE.token = data.token;
    STORE.user = { user_id: data.user_id, username: data.username, role: data.role };
    toast("登录成功，正在进入…");
    setTimeout(() => (location.href = `/${data.role}`), 400);
  } catch (e) {
    toast(e.message, false);
    btn.disabled = false;
    btn.textContent = `以「${ROLE_TEXT[currentRole]}」身份登录`;
  }
});

/* ---- 注册：商家身份显示店铺名输入框（身份跟随顶部卡片） ---- */
document.querySelectorAll("#roleGrid .role-card").forEach(card => {
  card.addEventListener("click", () => {
    document.getElementById("rgMerchantNameField").style.display =
      card.dataset.role === "merchant" ? "block" : "none";
  });
});

document.getElementById("btnRegister").addEventListener("click", async () => {
  const btn = document.getElementById("btnRegister");
  const role = currentRole; // 四种身份均可注册（含管理员，课程演示需要）
  try {
    btn.disabled = true; btn.textContent = "注册中…";
    await API.post("/api/auth/register", {
      username: document.getElementById("rgUsername").value.trim(),
      password: document.getElementById("rgPassword").value,
      phone: document.getElementById("rgPhone").value.trim(),
      role,
      merchant_name: document.getElementById("rgMerchantName").value.trim(),
    });
    toast("注册成功，请登录");
    switchPane("login");
    document.getElementById("liUsername").value = document.getElementById("rgUsername").value.trim();
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "注册";
  }
});

/* ---- 找回密码 ---- */
document.getElementById("btnSendCode").addEventListener("click", async () => {
  const btn = document.getElementById("btnSendCode");
  const tip = document.getElementById("fpCodeTip");
  try {
    btn.disabled = true; btn.textContent = "发送中…";
    const data = await API.post("/api/auth/forgot", {
      username: document.getElementById("fpUsername").value.trim(),
    });
    tip.style.display = "block";
    tip.textContent = `✅ 验证码：${data.reset_code}（演示环境直接显示，真实项目会通过邮件/短信发送）`;
  } catch (e) {
    tip.style.display = "none";
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "获取验证码";
  }
});

document.getElementById("btnReset").addEventListener("click", async () => {
  const btn = document.getElementById("btnReset");
  try {
    btn.disabled = true; btn.textContent = "重置中…";
    await API.post("/api/auth/reset", {
      username: document.getElementById("fpUsername").value.trim(),
      code: document.getElementById("fpCode").value.trim(),
      new_password: document.getElementById("fpNewPassword").value,
    });
    toast("密码重置成功，请用新密码登录");
    switchPane("login");
    document.getElementById("liPassword").value = "";
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false; btn.textContent = "重置密码";
  }
});

/* ---- 已登录用户直接跳转 ---- */
if (STORE.token && STORE.user) location.href = `/${STORE.user.role}`;
