/* 云游中国 REST API 后端：Express + SQLite，与前端通过 JSON 通信。
   运行：node server.js（默认 http://localhost:3000） */
const express = require("express");
const store = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 跨域：前端用 python -m http.server 跑在 8000 端口，允许其调用本服务。
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- 鉴权辅助 ----------
function getAuthUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return store.findUserByToken(header.slice(7));
}

function requireUser(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "请先登录" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    res.status(403).json({ error: "需要管理员权限" });
    return null;
  }
  return user;
}

// ---------- 景点校验 ----------
function validateAttraction(body) {
  const name = String(body.name || "").trim();
  const city = String(body.city || "").trim();
  const province = String(body.province || "").trim();
  const category = String(body.category || "");
  const lng = Number(body.coordinates && body.coordinates[0]);
  const lat = Number(body.coordinates && body.coordinates[1]);
  const rating = Number(body.rating);
  const popularity = Number(body.popularity);

  if (!name || !city || !province) return { error: "请填写景点名称、城市与省份" };
  if (!Number.isFinite(lng) || lng < 70 || lng > 140) return { error: "经度需为 70–140 之间的数字" };
  if (!Number.isFinite(lat) || lat < 15 || lat > 56) return { error: "纬度需为 15–56 之间的数字" };
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return { error: "评分需为 0–5 之间的数字" };
  if (!Number.isFinite(popularity) || popularity < 0 || popularity > 100) return { error: "热度需为 0–100 之间的数字" };

  return {
    value: {
      name,
      city,
      province,
      category,
      coordinates: [lng, lat],
      rating,
      popularity,
      summary: String(body.summary || "").trim(),
      highlights: Array.isArray(body.highlights) ? body.highlights : [],
      visitTime: String(body.visitTime || "").trim() || "约 2–3 小时",
    },
  };
}

// ---------- 景点接口 ----------
app.get("/api/attractions", (req, res) => {
  res.json(store.listAttractions());
});

app.post("/api/attractions", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { error, value } = validateAttraction(req.body);
  if (error) return res.status(400).json({ error });
  const id = String(req.body.id || "").trim() || ("att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  res.status(201).json(store.insertAttraction({ id, ...value }));
});

app.post("/api/attractions/reset", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(store.resetAttractions());
});

app.put("/api/attractions/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!store.getAttraction(req.params.id)) return res.status(404).json({ error: "景点不存在" });
  const { error, value } = validateAttraction(req.body);
  if (error) return res.status(400).json({ error });
  res.json(store.updateAttraction(req.params.id, value));
});

app.delete("/api/attractions/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!store.deleteAttraction(req.params.id)) return res.status(404).json({ error: "景点不存在" });
  res.json({ ok: true });
});

// ---------- 账号接口 ----------
app.post("/api/auth/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const nickname = String(req.body.nickname || "").trim();
  if (!username) return res.status(400).json({ error: "请输入用户名" });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: "用户名需为 3–20 个字符" });
  if (password.length < 6) return res.status(400).json({ error: "密码至少需要 6 位" });
  if (store.findUserByUsername(username)) return res.status(409).json({ error: "该用户名已被注册" });

  const user = store.createUser({ username, password, nickname });
  const token = store.createSession(user.id);
  res.status(201).json({ token, user });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = store.verifyCredentials(username, password);
  if (!user) return res.status(401).json({ error: "用户名或密码错误" });
  const token = store.createSession(user.id);
  res.json({ token, user });
});

app.post("/api/auth/logout", (req, res) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) store.deleteSession(header.slice(7));
  res.json({ ok: true });
});

// 修改密码：需提供当前密码校验，新密码至少 6 位。
app.put("/api/auth/password", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!store.verifyCredentials(user.username, currentPassword)) {
    return res.status(401).json({ error: "当前密码不正确" });
  }
  if (newPassword.length < 6) return res.status(400).json({ error: "新密码至少需要 6 位" });
  store.updatePassword(user.id, newPassword);
  res.json({ ok: true });
});

// 绑定 / 更新邮箱与手机号。
app.put("/api/auth/bindings", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const email = String(req.body.email || "").trim();
  const phone = String(req.body.phone || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: "手机号格式不正确（需为 11 位大陆手机号）" });
  }
  res.json({ user: store.updateBindings(user.id, { email, phone }) });
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  res.json({ user });
});

app.post("/api/auth/favorites/:attractionId", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const attraction = store.getAttraction(req.params.attractionId);
  if (!attraction) return res.status(404).json({ error: "景点不存在" });

  const favorites = user.favorites.slice();
  const index = favorites.indexOf(attraction.id);
  if (index >= 0) favorites.splice(index, 1);
  else favorites.push(attraction.id);
  store.setFavorites(user.id, favorites);
  res.json({ favorites });
});

// 统一兜底错误处理，避免未捕获异常导致进程退出。
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`云游中国后端已启动：http://localhost:${PORT}`);
  console.log(`景点列表：GET  http://localhost:${PORT}/api/attractions`);
  console.log(`管理员账号：admin / admin123`);
});
