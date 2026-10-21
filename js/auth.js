/* 用户账号服务：注册、登录、会话与收藏，基于 localStorage 持久化。
   注意：这是课程演示用的纯前端方案，密码散列并非加密学安全，不应用于生产环境。 */
window.AUTH = (function () {
  "use strict";

  const USERS_KEY = "yunchina.users";
  const SESSION_KEY = "yunchina.session";
  const ADMIN_USERNAME = "admin";
  const ADMIN_PASSWORD = "admin123";

  // 简单字符串散列（djb2 变体），仅避免明文存储，供课程演示。
  function hashPassword(password) {
    const salted = `yunchina::${password}`;
    let hash = 5381;
    for (let i = 0; i < salted.length; i++) {
      hash = ((hash << 5) + hash + salted.charCodeAt(i)) >>> 0;
    }
    return "h" + hash.toString(36) + "." + salted.length.toString(36);
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() {
    return readJSON(USERS_KEY, []);
  }

  function saveUsers(users) {
    writeJSON(USERS_KEY, users);
  }

  function findUser(username) {
    return getUsers().find((u) => u.username === username) || null;
  }

  // 首次加载时确保存在管理员账号。
  function seedAdmin() {
    const users = getUsers();
    if (users.some((u) => u.username === ADMIN_USERNAME)) return;
    users.push({
      id: "admin",
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      nickname: "管理员",
      role: "admin",
      createdAt: Date.now(),
      favorites: [],
    });
    saveUsers(users);
  }

  function register({ username, password, nickname }) {
    const name = String(username || "").trim();
    if (!name) throw new Error("请输入用户名");
    if (name.length < 3 || name.length > 20) throw new Error("用户名需为 3–20 个字符");
    if (String(password || "").length < 6) throw new Error("密码至少需要 6 位");
    if (findUser(name)) throw new Error("该用户名已被注册");

    const users = getUsers();
    const user = {
      id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      username: name,
      passwordHash: hashPassword(password),
      nickname: (nickname || "").trim() || name,
      role: "user",
      createdAt: Date.now(),
      favorites: [],
    };
    users.push(user);
    saveUsers(users);
    return user;
  }

  function login(username, password) {
    const user = findUser(String(username || "").trim());
    if (!user || user.passwordHash !== hashPassword(String(password || ""))) {
      throw new Error("用户名或密码错误");
    }
    writeJSON(SESSION_KEY, user.id);
    return user;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUser() {
    const id = readJSON(SESSION_KEY, null);
    if (!id) return null;
    return getUsers().find((u) => u.id === id) || null;
  }

  // 切换收藏状态，返回更新后的收藏 id 列表。
  function toggleFavorite(userId, attractionId) {
    const users = getUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return [];
    const index = user.favorites.indexOf(attractionId);
    if (index >= 0) user.favorites.splice(index, 1);
    else user.favorites.push(attractionId);
    saveUsers(users);
    return user.favorites.slice();
  }

  seedAdmin();

  return {
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    getUsers,
    saveUsers,
    register,
    login,
    logout,
    getCurrentUser,
    toggleFavorite,
  };
})();
