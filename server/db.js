/* 数据访问层：封装 SQLite 的建表、种子与增删改查。
   后续若换成远程 Postgres，只需重写本文件，路由层（server.js）无需改动。 */
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(path.join(__dirname, "data.sqlite"));

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS attractions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    city        TEXT NOT NULL,
    province    TEXT NOT NULL,
    category    TEXT NOT NULL,
    lng         REAL NOT NULL,
    lat         REAL NOT NULL,
    rating      REAL NOT NULL DEFAULT 4.5,
    popularity  INTEGER NOT NULL DEFAULT 0,
    summary     TEXT NOT NULL DEFAULT '',
    highlights  TEXT NOT NULL DEFAULT '[]',
    visit_time  TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname      TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    INTEGER NOT NULL,
    favorites     TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// ---------- 行 → 前端对象 ----------
function rowToAttraction(r) {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    province: r.province,
    category: r.category,
    coordinates: [r.lng, r.lat],
    rating: r.rating,
    popularity: r.popularity,
    summary: r.summary,
    highlights: JSON.parse(r.highlights || "[]"),
    visitTime: r.visit_time,
  };
}

function rowToUser(r) {
  return {
    id: r.id,
    username: r.username,
    nickname: r.nickname,
    role: r.role,
    createdAt: r.created_at,
    favorites: JSON.parse(r.favorites || "[]"),
  };
}

// ---------- 密码散列（scrypt）----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const test = crypto.scryptSync(password, salt, 32).toString("hex");
  return hash === test;
}

// ---------- 景点 ----------
function listAttractions() {
  return db.prepare("SELECT * FROM attractions ORDER BY rowid").all().map(rowToAttraction);
}

function getAttraction(id) {
  const r = db.prepare("SELECT * FROM attractions WHERE id = ?").get(id);
  return r ? rowToAttraction(r) : null;
}

function insertAttraction(item) {
  db.prepare(`
    INSERT INTO attractions (id, name, city, province, category, lng, lat, rating, popularity, summary, highlights, visit_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.name, item.city, item.province, item.category,
    item.coordinates[0], item.coordinates[1], item.rating, item.popularity,
    item.summary, JSON.stringify(item.highlights), item.visitTime,
  );
  return getAttraction(item.id);
}

function updateAttraction(id, item) {
  db.prepare(`
    UPDATE attractions SET
      name = ?, city = ?, province = ?, category = ?, lng = ?, lat = ?,
      rating = ?, popularity = ?, summary = ?, highlights = ?, visit_time = ?
    WHERE id = ?
  `).run(
    item.name, item.city, item.province, item.category,
    item.coordinates[0], item.coordinates[1], item.rating, item.popularity,
    item.summary, JSON.stringify(item.highlights), item.visitTime, id,
  );
  return getAttraction(id);
}

function deleteAttraction(id) {
  return db.prepare("DELETE FROM attractions WHERE id = ?").run(id).changes > 0;
}

function resetAttractions() {
  db.prepare("DELETE FROM attractions").run();
  seedAttractions();
  return listAttractions();
}

// ---------- 用户 ----------
function findUserByUsername(username) {
  const r = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  return r ? rowToUser(r) : null;
}

function findUserById(id) {
  const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return r ? rowToUser(r) : null;
}

function createUser({ username, password, nickname }) {
  const id = "u" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const nick = (nickname || "").trim() || username;
  const now = Date.now();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, nickname, role, created_at, favorites)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, hashPassword(password), nick, "user", now, "[]");
  return { id, username, nickname: nick, role: "user", createdAt: now, favorites: [] };
}

// 校验用户名密码，成功返回用户对象（不含密码散列），失败返回 null。
function verifyCredentials(username, password) {
  const r = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!r) return null;
  if (!verifyPassword(password, r.password_hash)) return null;
  return rowToUser(r);
}

function setFavorites(userId, favorites) {
  db.prepare("UPDATE users SET favorites = ? WHERE id = ?").run(JSON.stringify(favorites), userId);
  return favorites;
}

// ---------- 会话 ----------
function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, Date.now());
  return token;
}

function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function findUserByToken(token) {
  const s = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  if (!s) return null;
  return findUserById(s.user_id);
}

// ---------- 种子 ----------
// 景点默认数据直接读取前端的 js/attractions.js，保证前后端共用同一份数据源。
function seedAttractions() {
  const count = Number(db.prepare("SELECT COUNT(*) AS c FROM attractions").get().c);
  if (count > 0) return;
  global.window = global.window || {};
  require(path.join(__dirname, "..", "js", "attractions.js"));
  const seed = global.window.CHINA_ATTRACTIONS || [];
  const insert = db.prepare(`
    INSERT INTO attractions (id, name, city, province, category, lng, lat, rating, popularity, summary, highlights, visit_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of seed) {
    insert.run(
      item.id, item.name, item.city, item.province, item.category,
      item.coordinates[0], item.coordinates[1], item.rating, item.popularity,
      item.summary, JSON.stringify(item.highlights), item.visitTime,
    );
  }
}

function seedAdmin() {
  if (findUserByUsername("admin")) return;
  db.prepare(`
    INSERT INTO users (id, username, password_hash, nickname, role, created_at, favorites)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("admin", "admin", hashPassword("admin123"), "管理员", "admin", Date.now(), "[]");
}

seedAttractions();
seedAdmin();

module.exports = {
  listAttractions,
  getAttraction,
  insertAttraction,
  updateAttraction,
  deleteAttraction,
  resetAttractions,
  findUserByUsername,
  createUser,
  verifyCredentials,
  setFavorites,
  createSession,
  deleteSession,
  findUserByToken,
};
