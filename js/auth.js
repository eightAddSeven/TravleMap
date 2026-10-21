/* 用户账号服务：注册、登录、会话与收藏，改为调用后端 REST API。
   会话凭据（token）保存在 localStorage，随请求以 Authorization 头携带。 */
window.AUTH = (function () {
  "use strict";

  const API_BASE = window.API_BASE || "http://localhost:3000/api";
  const TOKEN_KEY = "yunchina.token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败，请确认后端服务已启动");
    return data;
  }

  async function register({ username, password, nickname }) {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, nickname }),
    });
    setToken(data.token);
    return data.user;
  }

  async function login(username, password) {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    return data.user;
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (err) {
      /* 后端登出失败也照常清除本地凭据 */
    }
    setToken(null);
  }

  // 返回当前登录用户；未登录或会话失效时返回 null（不抛错）。
  async function getCurrentUser() {
    if (!getToken()) return null;
    try {
      const data = await request("/auth/me");
      return data.user;
    } catch (err) {
      return null;
    }
  }

  async function toggleFavorite(attractionId) {
    const data = await request("/auth/favorites/" + encodeURIComponent(attractionId), { method: "POST" });
    return data.favorites;
  }

  return { register, login, logout, getCurrentUser, toggleFavorite };
})();
