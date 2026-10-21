/* 景点数据持久化：首次运行从静态数据初始化，之后读本地存储，供管理员新增、编辑与删除。 */
window.ATTRACTION_STORE = (function () {
  "use strict";

  const KEY = "yunchina.attractions";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (err) {
      /* 忽略损坏的数据，回退到默认景点 */
    }
    const defaults = (window.CHINA_ATTRACTIONS || []).map((item) => ({ ...item }));
    save(defaults);
    return defaults;
  }

  function save(attractions) {
    localStorage.setItem(KEY, JSON.stringify(attractions));
  }

  function reset() {
    localStorage.removeItem(KEY);
    return load();
  }

  return { load, save, reset };
})();
