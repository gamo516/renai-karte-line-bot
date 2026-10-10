// 超シンプルなJSONファイルでの永続化（友だち数が少ない初期フェーズ向け）。
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "users.json");

function loadAll() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "{}");
  } catch (e) {
    console.error("[store] failed to parse users.json, starting fresh", e);
    return {};
  }
}

function saveAll(all) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), "utf8");
}

function getUser(userId) {
  const all = loadAll();
  return all[userId] || null;
}

function upsertUser(userId, patch) {
  const all = loadAll();
  const current = all[userId] || {
    userId,
    registeredAt: todayISO(),
    questionIndex: 0,
    tagCounts: { A: 0, B: 0, C: 0, D: 0 },
    finalTag: null,
    diagnosisCompletedAt: null,
    lastStepDaySent: 0,
  };
  all[userId] = Object.assign(current, patch);
  saveAll(all);
  return all[userId];
}

function allUsers() {
  return Object.values(loadAll());
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

module.exports = { getUser, upsertUser, allUsers, todayISO, daysBetween };
