// リサーチ部隊：X公式API（従量課金）で伸びている復縁・片思いの投稿を集め、
//   1) 型と伸びた理由を分析して参考投稿集に保存（毎朝のこたの投稿生成で見本に使う）
//   2) 投稿から間もないものを「リプ候補」として、こた口調のリプ案付きでLINEに送る
// 1日の読み込みは最大 QUERIES×MAX_PER_QUERY 件（約0.75円/件）。同じ日の再取得は課金されない。
// 使い方: node scripts/research.js [--dry]   … --dry は保存・送信しない
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

const DRY = process.argv.includes("--dry");
const redis = Redis.fromEnv();
const REFS_KEY = "renai-karte:refs";
const SEEN_KEY = "renai-karte:research-seen";
const ADMINS_KEY = "renai-karte:admins";
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");
const LOG_FILE = path.join(__dirname, "..", "logs", "research.log");

// 検索キーワード（いいね100以上・日本語・RTと返信は除く）
const QUERIES = ["復縁", "片思い", "元彼", "元カレ", "脈あり"].map((k) => `${k} lang:ja min_likes:100 -is:retweet -is:reply`);
const MAX_PER_QUERY = 20;
const MAX_NEW_REFS = 10; // 1日に参考投稿集へ追加する上限
const REPLY_CANDIDATES = 5; // 1日に送るリプ候補の数
const FRESH_HOURS = 12; // リプ候補にする「投稿から間もない」の基準

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

async function search(query) {
  const params = new URLSearchParams({
    query,
    max_results: String(MAX_PER_QUERY),
    sort_order: "relevancy",
    "tweet.fields": "public_metrics,created_at",
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return (j.data || []).map((t) => ({
    id: t.id,
    url: `https://x.com/i/status/${t.id}`,
    text: t.text,
    createdAt: t.created_at,
    likes: t.public_metrics.like_count,
    replies: t.public_metrics.reply_count,
    retweets: t.public_metrics.retweet_count,
    views: t.public_metrics.impression_count,
  }));
}

function runClaude(prompt) {
  const out = execFileSync(CLAUDE_BIN, ["-p", "--output-format", "text"], { input: prompt, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
}

function buildPrompt(refs, candidates) {
  return `あなたは恋愛アカウント運用のアシスタントです。Xアカウント「こた」（復縁・片思い向け）の運用のため、Xで伸びている投稿を処理してください。

## こたのキャラ
- 復縁・片思いの相談をたくさん聞いてきたアラサー女性。男友達から聞いた「男の本音」にも詳しい
- 口調はやわらかいタメ口。説教しない、相手を否定しない、異性を攻撃しない。こた自身の恋愛体験は作らない

## 作業1：参考投稿の分析（${refs.length}件）
各投稿の型と伸びた理由を分析する。
type は uketori(受け取り型の短い言い切り) / cliffhanger(途中で切って続きへ) / checklist(リスト) / kiita(聞いた話・体験談) / kyokan(本音の吐き出し) / spiritual(運命・タイミング) / nitaku(二択・問いかけ) / other
宣伝・業者っぽい投稿（占いアプリやnoteへの露骨な誘導だけのもの）は usable:false にする。
${refs.map((r, i) => `R${i + 1}. [いいね${r.likes}/表示${r.views}] ${r.text.replace(/\n/g, " / ")}`).join("\n")}

## 作業2：リプ案（${candidates.length}件）
各投稿に、こたとして返すリプ案を3つ（共感／会話が続く問いかけ／短い気の利いたひとこと）。各60字以内。宣伝・リンク・ハッシュタグ禁止。業者・宣伝投稿にはリプしないので skip:true。
${candidates.map((c, i) => `C${i + 1}. [いいね${c.likes}] ${c.text.replace(/\n/g, " / ")}`).join("\n")}

## 出力
JSON配列のみ。前置き不要。
作業1は {"id":"R番号","usable":true/false,"type":"型","hook":"1行目のつかみ(20字程度)","why":"伸びた理由(60字程度)"}
作業2は {"id":"C番号","skip":true/false,"target":"投稿の要約(30字以内)","drafts":["案1","案2","案3"]}`;
}

(async () => {
  if (!process.env.X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN が .env にありません");

  const found = new Map();
  for (const q of QUERIES) {
    try {
      for (const t of await search(q)) found.set(t.id, t);
    } catch (e) {
      log("検索失敗", q, e.message);
    }
  }
  log(`取得 ${found.size}件（重複除外後）`);
  if (found.size === 0) return;

  // まだ見ていない投稿だけを対象にする
  const ids = [...found.keys()];
  const seenFlags = await Promise.all(ids.map((id) => redis.sismember(SEEN_KEY, id)));
  const fresh = ids.filter((_, i) => !seenFlags[i]).map((id) => found.get(id));
  const byLikes = [...fresh].sort((a, b) => b.likes - a.likes);

  const refs = byLikes.slice(0, MAX_NEW_REFS);
  const cutoff = Date.now() - FRESH_HOURS * 3600 * 1000;
  const candidates = byLikes.filter((t) => new Date(t.createdAt).getTime() >= cutoff).slice(0, REPLY_CANDIDATES);
  log(`新規 ${fresh.length}件 → 参考候補 ${refs.length}件 / リプ候補 ${candidates.length}件`);
  if (refs.length === 0 && candidates.length === 0) return;

  const results = runClaude(buildPrompt(refs, candidates));
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));

  let saved = 0;
  for (const [i, r] of refs.entries()) {
    const a = byId[`R${i + 1}`];
    if (!a || a.usable === false) continue;
    const entry = { text: r.text, likes: r.likes, views: r.views, account: r.url, type: a.type, hook: a.hook, why: a.why, savedAt: new Date().toISOString(), source: "research" };
    if (DRY) log("[dry] 参考", JSON.stringify(entry).slice(0, 200));
    else await redis.lpush(REFS_KEY, entry);
    saved++;
  }
  if (!DRY) await redis.ltrim(REFS_KEY, 0, 299); // 参考投稿集は最新300件まで

  const replies = candidates
    .map((c, i) => ({ c, a: byId[`C${i + 1}`] }))
    .filter(({ a }) => a && !a.skip && Array.isArray(a.drafts));
  if (replies.length) {
    const bubbles = replies.map(({ c, a }, i) => ({
      type: "text",
      text: `${i === 0 ? "今日のリプ候補だよ（長押しでコピー）\n\n" : ""}【${a.target}】いいね${c.likes}\n${c.url}\n\n${a.drafts.map((d, k) => `${k + 1}) ${d}`).join("\n\n")}`,
    }));
    if (DRY) log("[dry] リプ候補", JSON.stringify(bubbles).slice(0, 400));
    else {
      const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
      for (const to of await redis.smembers(ADMINS_KEY)) await client.pushMessage({ to, messages: bubbles.slice(0, 5) });
    }
  }

  if (!DRY) {
    for (const t of fresh) await redis.sadd(SEEN_KEY, t.id);
  }
  log(`完了: 参考投稿${saved}件保存 / リプ候補${replies.length}件送信${DRY ? "（dry）" : ""}`);
})().catch((e) => {
  log("エラー:", e.message || e);
  process.exit(1);
});
