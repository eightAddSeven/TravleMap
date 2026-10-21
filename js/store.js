/* 景点数据服务：通过 REST API 读写后端数据库，替代原来的 localStorage。
   需先启动 server 目录下的 Node 后端（默认 http://localhost:3000）。 */
window.ATTRACTION_STORE = (function () {
  "use strict";

  window.API_BASE = window.API_BASE || "http://localhost:3000/api";
  const TOKEN_KEY = "yunchina.token";

  async function request(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(window.API_BASE + path, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败，请确认后端服务已启动");
    return data;
  }

  return {
    list: () => request("/attractions"),
    create: (item) => request("/attractions", { method: "POST", body: JSON.stringify(item) }),
    update: (id, item) => request("/attractions/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(item) }),
    remove: (id) => request("/attractions/" + encodeURIComponent(id), { method: "DELETE" }),
    reset: () => request("/attractions/reset", { method: "POST" }),
  };
})();
