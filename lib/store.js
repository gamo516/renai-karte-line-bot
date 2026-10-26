// Upstash Redis（無料枠）での永続化。
// Renderの無料プランはディスクが一時的なため、再起動・再デプロイでも消えない
// 外部ストレージにユーザーデータ（診断状況・タグ・配信進捗）を保存する。
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const ALL_USERS_KEY = "renai-karte:users";

function userKey(userId) {
  return `renai-karte:user:${userId}`;
}

function defaultUser(userId) {
  return {
    userId,
    registeredAt: todayISO(),
    questionIndex: 0,
    tagCounts: { A: 0, B: 0, C: 0, D: 0 },
    finalTag: null,
    diagnosisCompletedAt: null,
    worry: null,
    clickedAt: null,
    followups: { incomplete: 0, unclicked: 0 },
    blocked: false,
  };
}

async function getUser(userId) {
  const data = await redis.get(userKey(userId));
  return data || null;
}

async function upsertUser(userId, patch) {
  const current = (await getUser(userId)) || defaultUser(userId);
  const updated = Object.assign(current, patch);
  await redis.set(userKey(userId), updated);
  await redis.sadd(ALL_USERS_KEY, userId);
  return updated;
}

async function allUsers() {
  const userIds = await redis.smembers(ALL_USERS_KEY);
  if (!userIds || userIds.length === 0) return [];
  const keys = userIds.map(userKey);
  const results = await redis.mget(...keys);
  return results.filter(Boolean);
}

// 日本時間の今日(YYYY-MM-DD)。Renderのサーバー時刻はUTCなのでJSTに補正する
function todayISO() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// ユーザー以外の値（全体配信の送信履歴など）
async function getMeta(key) {
  return (await redis.get(`renai-karte:meta:${key}`)) || null;
}

// 日別の集計用カウンター（90日で消える）
async function hincr(key, field) {
  await redis.hincrby(key, field, 1);
  await redis.expire(key, 90 * 86400);
}

// ファネル計測（日別の件数。個人は特定しない）: follow / q1〜q5 / complete / askworry / worry / page / consultinfo / freetext / crisis
async function funnel(event) {
  try {
    await hincr(`renai-karte:funnel:${todayISO()}`, event);
  } catch (err) {
    console.error("[funnel] 記録失敗", event, (err && err.message) || err);
  }
}

async function hgetall(key) {
  return (await redis.hgetall(key)) || {};
}

async function setMeta(key, value) {
  await redis.set(`renai-karte:meta:${key}`, value);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

module.exports = { getUser, upsertUser, allUsers, todayISO, daysBetween, getMeta, setMeta, hincr, hgetall, funnel };
