// X公式API（従量課金）の薄いクライアント。費用をプログラム側でも管理する（Developer Console側の上限と二重）。
// 料金（2026-10時点の公式ページ）: 投稿1件の読み取り $0.005 / ユーザー1件 $0.010。同じUTC日に同じものを再取得しても課金されない。
// 予算: 環境変数 X_MONTHLY_BUDGET_USD（既定 20ドル≒3,000円）。月の推定額がこれを超えそうなら呼び出し前に止める。
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const PRICE = { post: 0.005, user: 0.01 };
const MONTHLY_BUDGET = Number(process.env.X_MONTHLY_BUDGET_USD || 20);
const DAILY_BUDGET = Number(process.env.X_DAILY_BUDGET_USD || MONTHLY_BUDGET / 20);

const monthKey = () => `renai-karte:xapi:cost:${new Date().toISOString().slice(0, 7)}`;
const dayKey = () => `renai-karte:xapi:cost:${new Date().toISOString().slice(0, 10)}`;

const userCostKey = () => `renai-karte:xapi:usercost:${new Date().toISOString().slice(0, 7)}`;

// X側の実際の読み取り件数（/2/usage/tweets）で月の推定額を補正する。
// 同じUTC日の再取得は課金されないので、プログラム側の数え方は多めになりがちなため
async function syncActual() {
  try {
    const res = await fetch("https://api.x.com/2/usage/tweets", { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const posts = Number((await res.json()).data.project_usage || 0);
    const users = Number((await redis.get(userCostKey())) || 0);
    const month = posts * PRICE.post + users;
    await redis.set(monthKey(), month, { ex: 40 * 86400 });
    return { posts, month };
  } catch (e) {
    return null;
  }
}

async function spent() {
  const [m, d] = await Promise.all([redis.get(monthKey()), redis.get(dayKey())]);
  return { month: Number(m || 0), day: Number(d || 0) };
}

async function record(usd) {
  await redis.incrbyfloat(monthKey(), usd);
  await redis.expire(monthKey(), 40 * 86400);
  await redis.incrbyfloat(dayKey(), usd);
  await redis.expire(dayKey(), 3 * 86400);
}

class BudgetExceeded extends Error {}

// 呼び出し前に「最大でいくらかかるか」で予算を確認し、呼び出し後に実際の件数で記録する
async function guard(maxUsd) {
  const s = await spent();
  if (s.month + maxUsd > MONTHLY_BUDGET) throw new BudgetExceeded(`月の予算超過見込み（使用$${s.month.toFixed(3)} + 最大$${maxUsd} > $${MONTHLY_BUDGET}）`);
  if (s.day + maxUsd > DAILY_BUDGET) throw new BudgetExceeded(`日の予算超過見込み（使用$${s.day.toFixed(3)} + 最大$${maxUsd} > $${DAILY_BUDGET.toFixed(2)}）`);
}

async function call(path, params) {
  if (!process.env.X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN が .env にありません");
  const res = await fetch(`https://api.x.com/2/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`X API ${res.status} ${path}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

// 直近7日の検索。返ってきた投稿数で課金される。再試行はしない（失敗は呼び出し元でログに残すだけ）
async function searchRecent(query, { maxResults = 10, startTime } = {}) {
  const n = Math.max(10, Math.min(100, maxResults)); // APIの下限は10
  await guard(n * PRICE.post);
  const params = { query, max_results: String(n), sort_order: "relevancy", "tweet.fields": "public_metrics,created_at,author_id,lang" };
  if (startTime) params.start_time = startTime;
  const j = await call("tweets/search/recent", params);
  const posts = (j.data || []).map((t) => ({
    id: t.id,
    url: `https://x.com/i/status/${t.id}`,
    authorId: t.author_id,
    text: t.text,
    createdAt: t.created_at,
    likes: t.public_metrics.like_count,
    replies: t.public_metrics.reply_count,
    reposts: t.public_metrics.retweet_count,
    quotes: t.public_metrics.quote_count,
    bookmarks: t.public_metrics.bookmark_count,
    views: t.public_metrics.impression_count,
  }));
  await record(posts.length * PRICE.post);
  return posts;
}

// ユーザー情報（フォロワー数など）。1件 $0.01 なので最小限だけ使う
async function usersByIds(ids) {
  const uniq = [...new Set(ids)].slice(0, 100);
  if (uniq.length === 0) return {};
  await guard(uniq.length * PRICE.user);
  const j = await call("users", { ids: uniq.join(","), "user.fields": "public_metrics,username" });
  await record((j.data || []).length * PRICE.user);
  await redis.incrbyfloat(userCostKey(), (j.data || []).length * PRICE.user);
  await redis.expire(userCostKey(), 40 * 86400);
  return Object.fromEntries((j.data || []).map((u) => [u.id, { username: u.username, followers: u.public_metrics.followers_count }]));
}

async function userByUsername(username) {
  await guard(PRICE.user);
  const j = await call(`users/by/username/${username}`, { "user.fields": "public_metrics" });
  await record(PRICE.user);
  await redis.incrbyfloat(userCostKey(), PRICE.user);
  await redis.expire(userCostKey(), 40 * 86400);
  return j.data ? { id: j.data.id, followers: j.data.public_metrics.followers_count, following: j.data.public_metrics.following_count, posts: j.data.public_metrics.tweet_count } : null;
}

module.exports = { syncActual, searchRecent, usersByIds, userByUsername, spent, BudgetExceeded, MONTHLY_BUDGET, PRICE };
