// 実績の自動取得（1日1回）と週次レポート（月曜のみLINEに1通）。人間の数値入力は不要。
// - こたのX投稿: Buffer API（無料）の表示回数・反応・リプ・リポスト・クリック
//   ※保存数とプロフィールクリックはBufferで取れないため「取得不可」
// - Xのフォロワー数: X公式API（1日1回・$0.01）。トークンがなければ記録しない
// - LINE: 友だち数（LINE Insight API）・診断完了数・解説ページ到達数・相談ボタンのクリック数・X投稿からのLINEリンククリック
// - ASP成果: A8に自動取得手段がないため、LINEで「成果 発生数 確定数」と週1回入力されたものを使う
// - 投稿タイプ別の成績から、翌日以降の投稿生成で使う配分（renai-karte:meta:postWeights）を更新
// 使い方: node scripts/metrics.js [--report]   … --report で曜日に関係なく週次レポートを送る
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");
const xapi = require("../lib/xapi");

const redis = Redis.fromEnv();
const LOG_FILE = path.join(__dirname, "..", "logs", "metrics.log");
const FORCE_REPORT = process.argv.includes("--report");
const DEFAULT_WEIGHTS = { empathy: 0.4, practical: 0.3, conversation: 0.3 };
const jstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

async function buffer(query, variables) {
  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.BUFFER_API_KEY}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  if (j.errors) throw new Error("Buffer: " + JSON.stringify(j.errors).slice(0, 200));
  return j.data;
}

// こたの投稿の実績をBufferから取り、投稿生成時に記録したタイプ情報と結合して保存
async function collectPostMetrics() {
  const org = (await buffer(`{account{organizations{id}}}`)).account.organizations[0].id;
  const d = await buffer(`query($i:PostsInput!){posts(input:$i){edges{node{id text sentAt externalLink metrics{type value}}}}}`, { i: { organizationId: org, filter: { status: ["sent"] } } });
  const posts = d.posts.edges.map((e) => e.node).filter((p) => p.sentAt);
  let saved = 0;
  for (const p of posts) {
    const meta = (await redis.hget("renai-karte:xposts", p.id)) || {};
    const m = Object.fromEntries((p.metrics || []).map((x) => [x.type, x.value]));
    const row = {
      id: p.id,
      url: p.externalLink,
      sentAt: p.sentAt,
      slot: meta.slot || (new Date(p.sentAt).getUTCHours() === 12 ? "evening" : "unknown"),
      type: meta.type || "unknown",
      category: meta.category || "unknown",
      cta: Boolean(meta.cta),
      impressions: m.impressions ?? null,
      reactions: m.reactions ?? null,
      comments: m.comments ?? null,
      reposts: m.reposts ?? null,
      clicks: m.clicks ?? null,
      bookmarks: "取得不可",
      profileClicks: "取得不可",
      text: (p.text || "").slice(0, 80),
      updatedAt: new Date().toISOString(),
    };
    await redis.hset("renai-karte:xpost-metrics", { [p.id]: row });
    saved++;
  }
  return posts.length ? saved : 0;
}

// タイプ別の成績から配分を更新（投稿から24時間以上たったものだけ。各カテゴリ3本未満なら既定値のまま）
async function updateWeights() {
  const all = Object.values((await redis.hgetall("renai-karte:xpost-metrics")) || {});
  const matured = all.filter((r) => r.category !== "unknown" && r.impressions != null && Date.now() - new Date(r.sentAt).getTime() > 24 * 3600000);
  const score = (r) => r.impressions + 5 * ((r.reactions || 0) + 2 * (r.comments || 0) + 2 * (r.reposts || 0) + (r.clicks || 0));
  const stats = {};
  for (const c of Object.keys(DEFAULT_WEIGHTS)) {
    const rows = matured.filter((r) => r.category === c);
    stats[c] = { n: rows.length, avg: rows.length ? rows.reduce((s, r) => s + score(r), 0) / rows.length : 0 };
  }
  const enough = Object.values(stats).every((s) => s.n >= 3);
  let weights = DEFAULT_WEIGHTS;
  if (enough) {
    const total = Object.values(stats).reduce((s, x) => s + x.avg, 0) || 1;
    const raw = Object.fromEntries(Object.entries(stats).map(([c, s]) => [c, Math.max(0.2, s.avg / total)]));
    const sum = Object.values(raw).reduce((a, b) => a + b, 0);
    weights = Object.fromEntries(Object.entries(raw).map(([c, w]) => [c, Number((w / sum).toFixed(2))]));
  }
  await redis.set("renai-karte:meta:postWeights", { weights, stats, basedOn: enough ? "実績" : "既定値（実績が各3本未満）", updatedAt: new Date().toISOString() });
  return { weights, stats, enough };
}

async function snapshotFollowers(today) {
  if (!process.env.X_BEARER_TOKEN) return null;
  try {
    const u = await xapi.userByUsername("kota_0517");
    if (u) await redis.hset("renai-karte:x-followers", { [today]: u.followers });
    return u && u.followers;
  } catch (e) {
    log("フォロワー取得失敗", e.message);
    return null;
  }
}

async function lineFunnel(days) {
  const insight = new line.insight.InsightClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
  const yesterday = jstDate(new Date(Date.now() - 86400000)).replace(/-/g, "");
  let friends = null;
  try {
    const r = await insight.getNumberOfFollowers(yesterday);
    friends = r.status === "ready" ? r.followers : null;
  } catch (e) {
    log("LINE友だち数の取得失敗", e.message);
  }
  const ids = await redis.smembers("renai-karte:users");
  const users = ids.length ? (await redis.mget(...ids.map((id) => `renai-karte:user:${id}`))).filter(Boolean) : [];
  const since = jstDate(new Date(Date.now() - days * 86400000));
  const recent = users.filter((u) => u.registeredAt >= since);
  const sumHash = async (prefix) => {
    let total = 0;
    const by = {};
    for (let i = 0; i < days; i++) {
      const h = (await redis.hgetall(`${prefix}:${jstDate(new Date(Date.now() - i * 86400000))}`)) || {};
      for (const [k, v] of Object.entries(h)) {
        by[k] = (by[k] || 0) + Number(v);
        total += Number(v);
      }
    }
    return { total, by };
  };
  return {
    friends,
    newUsers: recent.length,
    diagnosed: recent.filter((u) => u.finalTag).length,
    reachedPage: recent.filter((u) => u.clickedAt).length,
    affClicks: await sumHash("renai-karte:affclicks"),
    lineClicksFromX: await sumHash("renai-karte:lineclicks"),
  };
}

async function weeklyReport(weightsInfo) {
  const all = Object.values((await redis.hgetall("renai-karte:xpost-metrics")) || {});
  const weekAgo = Date.now() - 7 * 86400000;
  const week = all.filter((r) => new Date(r.sentAt).getTime() >= weekAgo);
  const imp = week.reduce((s, r) => s + (r.impressions || 0), 0);
  const eng = week.reduce((s, r) => s + (r.reactions || 0) + (r.comments || 0) + (r.reposts || 0), 0);
  const top = [...week].sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0];
  const followers = (await redis.hgetall("renai-karte:x-followers")) || {};
  const fDates = Object.keys(followers).sort();
  const fNow = fDates.length ? followers[fDates[fDates.length - 1]] : "未取得";
  const fWeekAgo = fDates.filter((d) => d <= jstDate(new Date(weekAgo))).pop();
  const funnel = await lineFunnel(7);
  const asp = (await redis.lrange("renai-karte:asp-results", 0, 0))[0];
  const research = await redis.lrange("renai-karte:research-log", 0, 6);
  const replies = research.reduce((s, r) => s + (r.replies || 0), 0);
  // 実際に送ったリプの反応（reply-feedback.js が記録）
  const sentWeek = Object.values((await redis.hgetall("renai-karte:reply-outcomes")) || {}).filter((o) => new Date(o.sentAt).getTime() >= weekAgo);
  const avgLikes = sentWeek.length ? (sentWeek.reduce((s, o) => s + (o.likes || 0), 0) / sentWeek.length).toFixed(1) : "-";
  const opRate = sentWeek.length ? Math.round((sentWeek.filter((o) => o.opReplied).length / sentWeek.length) * 100) : 0;
  const bestReply = [...sentWeek].sort((a, b) => b.score - a.score)[0];
  const ins = await redis.get("renai-karte:meta:replyInsights");
  const cost = await xapi.spent();
  const w = weightsInfo.weights;

  const text = [
    "【こた 週次レポート】直近7日",
    "",
    "■X",
    `投稿${week.length}本／表示合計${imp}／反応合計${eng}`,
    `フォロワー：${fNow}${typeof fNow === "number" ? "人" : ""}${fWeekAgo ? `（7日前 ${followers[fWeekAgo]}人）` : ""}`,
    top ? `一番見られた投稿：${top.impressions}表示「${top.text.slice(0, 20)}…」` : "",
    `リプ：通知${replies}件／実際に送信${sentWeek.length}件（AI案そのまま${sentWeek.filter((o) => o.source === "as_is").length}・手直し${sentWeek.filter((o) => o.source === "edited").length}・自作${sentWeek.filter((o) => o.source === "manual").length}）`,
    sentWeek.length ? `リプの反応：平均いいね${avgLikes}／相手から返信${opRate}%` : null,
    bestReply && bestReply.score > 0 ? `一番反応があったリプ：「${bestReply.text.slice(0, 30)}…」` : null,
    ins ? `リプ文の学習：${ins.summary || "更新済み"}（${ins.basedOn.replies}件から${ins.provisional ? "・暫定" : ""}）` : "リプ文の学習：送信リプが48時間経過で5件たまると開始",
    "",
    "■LINE・サイト",
    `友だち数：${funnel.friends ?? "取得中"}人／新規${funnel.newUsers}人`,
    `診断完了：${funnel.diagnosed}人／解説ページ到達：${funnel.reachedPage}人`,
    `X投稿のLINEリンククリック：${funnel.lineClicksFromX.total}回`,
    `相談ボタン（ココナラ）クリック：${funnel.affClicks.total}回`,
    `ASP成果（最終入力）：${asp ? `発生${asp.pending}・確定${asp.confirmed}（${asp.date}入力）` : "未入力（LINEで「成果 発生数 確定数」）"}`,
    "",
    "■投稿の配分（次週）",
    `共感${Math.round(w.empathy * 100)}%・実用${Math.round(w.practical * 100)}%・会話${Math.round(w.conversation * 100)}%（${weightsInfo.enough ? "実績から自動調整" : "実績不足のため既定値"}）`,
    "",
    `■X API費用：今月 約$${cost.month.toFixed(2)}（約${Math.round(cost.month * 150)}円）／上限$${xapi.MONTHLY_BUDGET}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
  for (const to of await redis.smembers("renai-karte:admins")) await client.pushMessage({ to, messages: [{ type: "text", text }] });
  return text;
}

(async () => {
  const today = jstDate();
  const n = await collectPostMetrics();
  const followers = await snapshotFollowers(today);
  const weightsInfo = await updateWeights();
  log(`投稿実績${n}件更新 / フォロワー${followers ?? "未取得"} / 配分 ${JSON.stringify(weightsInfo.weights)}（${weightsInfo.enough ? "実績" : "既定値"}）`);

  // 週次レポートは月曜（JST）の最初の実行で1回だけ
  const isMonday = new Date(Date.now() + 9 * 3600000).getUTCDay() === 1;
  const sentKey = `renai-karte:meta:weeklyReport:${today}`;
  if (FORCE_REPORT || (isMonday && !(await redis.get(sentKey)))) {
    const text = await weeklyReport(weightsInfo);
    await redis.set(sentKey, 1, { ex: 3 * 86400 });
    log("週次レポート送信\n" + text);
  }
})().catch((e) => {
  log("エラー:", e.message || e);
  process.exit(1);
});
