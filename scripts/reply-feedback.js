// リプの効果測定と学習（1日1回、research.js の直前に実行）。人間の入力は不要。
//   1) 送信済みリプの識別 … X公式APIで「こたが直近72時間に送ったリプ」を取り、通知したリプ（reply-log）と照合
//                           as_is（通知どおり送信）/ edited（人間が手直しして送信）/ manual（通知以外のリプ）に分類
//   2) 反応の記録       … いいね・返信数・表示回数と、元投稿の本人から返信が来たか（to:kota_0517 の検索）を
//                           renai-karte:reply-outcomes に保存。72時間は毎日更新し、それ以降は最終値として固定
//   3) 共通点の抽出     … 48時間以上たったリプが一定数たまったら、claude -p で「反応が良かった返信」の共通点・
//                           避けるべき点・人間の手直しの傾向を分析し renai-karte:meta:replyInsights へ
//   4) 次回への反映     … research.js がリプ文を作るときに replyInsights と実際に送った文を読み込む
// 費用: 1日あたり最大 50件×$0.005（自分のリプ30＋自分へのリプ20）。予算ガードは lib/xapi.js
// 使い方: node scripts/reply-feedback.js [--dry] [--analyze]   … --analyze で件数条件に関係なく分析を実行
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Redis } = require("@upstash/redis");
const xapi = require("../lib/xapi");

const DRY = process.argv.includes("--dry");
const FORCE_ANALYZE = process.argv.includes("--analyze");
const redis = Redis.fromEnv();
const USERNAME = "kota_0517";
const K = {
  log: "renai-karte:reply-log",
  outcomes: "renai-karte:reply-outcomes",
  insights: "renai-karte:meta:replyInsights",
  userId: "renai-karte:meta:xUserId",
};
const TRACK_HOURS = 72; // この時間までは毎日反応を取り直す
const MATURE_HOURS = 48; // 分析に使うのはこの時間以上たったリプだけ
const MIN_SAMPLES = 5; // 分析を始める最低件数
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");
const LOG_FILE = path.join(__dirname, "..", "logs", "reply-feedback.log");

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
// APIのリプ本文は先頭に「@相手 」が付くので外す。比較用に空白も詰める
const stripMentions = (t) => String(t || "").replace(/^(@\w+\s+)+/, "").trim();
const norm = (t) => stripMentions(t).replace(/\s+/g, "");

// 反応スコア: 元投稿の本人から返信が来た＝会話になった、を最も重く見る
const score = (o) => (o.likes || 0) + 3 * (o.replyCount || 0) + 5 * (o.opReplied ? 1 : 0);

async function ownUserId() {
  const cached = await redis.get(K.userId);
  if (cached) return String(cached);
  const u = await xapi.userByUsername(USERNAME);
  if (!u) throw new Error("こたのユーザーIDが取れません");
  await redis.set(K.userId, u.id);
  return u.id;
}

// 1) 2) 送信済みリプの識別と反応の記録
async function track() {
  const me = await ownUserId();
  const startTime = new Date(Date.now() - TRACK_HOURS * 3600000).toISOString().replace(/\.\d+Z$/, "Z");
  const mine = (await xapi.searchRecent(`from:${USERNAME} is:reply`, { maxResults: 30, startTime, sortOrder: "recency" }))
    .filter((p) => p.inReplyToUserId && p.inReplyToUserId !== me); // 自分のスレッドの続きは除外
  if (mine.length === 0) return { mine: 0, saved: 0 };

  let incoming = [];
  try {
    incoming = await xapi.searchRecent(`to:${USERNAME} is:reply -from:${USERNAME}`, { maxResults: 20, startTime, sortOrder: "recency" });
  } catch (e) {
    log("自分へのリプ取得スキップ", e.message);
  }

  const logs = (await redis.lrange(K.log, 0, -1)) || [];
  const byParent = new Map(logs.map((l) => [String(l.postId), l]));
  const prev = (await redis.hgetall(K.outcomes)) || {};

  let saved = 0;
  for (const p of mine) {
    const suggested = byParent.get(String(p.inReplyToId));
    const sent = stripMentions(p.text);
    const source = !suggested ? "manual" : norm(sent) === norm(suggested.reply) ? "as_is" : "edited";
    const answers = incoming.filter((i) => i.inReplyToId === p.id);
    const row = {
      ...(prev[p.id] || {}),
      id: p.id,
      url: `https://x.com/${USERNAME}/status/${p.id}`,
      parentId: p.inReplyToId,
      parentAuthorId: p.inReplyToUserId,
      sentAt: p.createdAt,
      text: sent,
      source,
      suggested: suggested ? suggested.reply : null,
      original: suggested ? suggested.original : (prev[p.id] || {}).original || null,
      parentLikes: suggested ? suggested.likes : null,
      likes: p.likes,
      replyCount: p.replies,
      views: p.views ?? null,
      // 一度でも本人の返信を確認できたら true のまま（検索は直近72時間しか見えないため）
      opReplied: Boolean((prev[p.id] || {}).opReplied) || answers.some((a) => a.authorId === p.inReplyToUserId),
      updatedAt: new Date().toISOString(),
    };
    row.score = score(row);
    if (DRY) log("[dry]", source, `いいね${row.likes} 返信${row.replyCount} 表示${row.views ?? "?"} 本人返信${row.opReplied ? "あり" : "なし"}`, "|", sent.slice(0, 50));
    else await redis.hset(K.outcomes, { [p.id]: row });
    saved++;
  }

  // 元投稿の文面がないリプ（manual）は分析で文脈が分からないので、元投稿を安く補完する余地はあるが、
  // 費用を増やさないため今は取らない（分析では「元投稿不明」として扱う）
  return { mine: mine.length, saved };
}

// 3) 反応が良かった返信の共通点を抽出
function analysisPrompt(rows, skipped) {
  const fmt = (o, i) =>
    `${i + 1}. [スコア${o.score} / いいね${o.likes} 返信${o.replyCount} 表示${o.views ?? "?"} 本人から返信${o.opReplied ? "あり" : "なし"} / ${o.source === "as_is" ? "AI案そのまま" : o.source === "edited" ? "人間が手直し" : "人間が自分で書いた"}]
   元投稿: ${o.original ? o.original.replace(/\n/g, " / ") : "（不明）"}
   送った返信: ${o.text}${o.source === "edited" ? `\n   AIの元の案: ${o.suggested}` : ""}`;
  return `恋愛系Xアカウント「こた」（復縁・片思いの相談をたくさん聞いてきたアラサー女性、タメ口）が、他人の投稿に送ったリプの実績です。
目的は、元投稿の本人やまわりの人が反応したくなる、自然で具体的なリプを増やすこと。数字は少ないので、1件の偶然に引っぱられすぎないこと。

## 送ったリプ（スコア順。スコア＝いいね＋返信×3＋本人から返信×5）
${rows.map(fmt).join("\n")}

## AIが提案したが人間が送らなかった返信（選ばれなかった理由を推測する材料）
${skipped.length ? skipped.map((s, i) => `${i + 1}. 元投稿: ${String(s.original || "").replace(/\n/g, " / ").slice(0, 100)}\n   提案: ${s.reply}`).join("\n") : "（なし）"}

## やること
- 反応が良かった返信と悪かった返信を比べ、文章の共通点を具体的に挙げる（長さ、元投稿のどの部分に触れたか、質問の有無、男友達視点の有無、言い回しなど）
- 「共感の繰り返し（しんどいよね/わかる等）」「定型的な励まし（大丈夫/頑張って/応援してる等）」が反応にどう影響したかも見る
- 人間が手直ししたもの・送らなかったものから、人間が嫌う傾向を読み取る
- 次の返信づくりで使える、短く具体的なルールにする（抽象的な心がけは書かない）
- 結果はAIが次の返信文を書くときにそのまま読む。運用者への依頼や作業の提案は書かない。根拠がなければその項目は空配列でよい

## 出力（JSONオブジェクトのみ。前置き不要）
{"good":["反応が良かった返信の共通点(各40字以内, 最大5)"],"avoid":["避けるべき書き方(各40字以内, 最大5)"],"editLessons":["人間の手直し・不採用から分かる好み(各40字以内, 最大3)"],"examples":[{"original":"元投稿の要約(30字)","reply":"反応が良かった実際の返信","why":"良かった理由(30字)"}],"summary":"全体の傾向を一言で(50字)"}
examples は反応が良かったものから最大3件。良いものがなければ空配列。`;
}

function runClaude(text) {
  const out = execFileSync(CLAUDE_BIN, ["-p", "--output-format", "text"], { input: text, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
}

async function analyze() {
  const all = Object.values((await redis.hgetall(K.outcomes)) || {});
  const matured = all.filter((o) => hoursSince(o.sentAt) >= MATURE_HOURS).sort((a, b) => b.score - a.score);
  const prev = await redis.get(K.insights);
  const newCount = prev ? matured.filter((o) => !prev.analyzedIds || !prev.analyzedIds.includes(o.id)).length : matured.length;
  const stale = prev && hoursSince(prev.updatedAt) > 7 * 24;
  if (!FORCE_ANALYZE && (matured.length < MIN_SAMPLES || (prev && newCount < 3 && !stale))) {
    return { skipped: true, matured: matured.length, newCount };
  }
  if (matured.length === 0) return { skipped: true, matured: 0, newCount: 0 };

  // 提案したのに送られなかったもの（提案から72時間以上たち、対応するリプがないもの）
  const sentParents = new Set(all.map((o) => String(o.parentId)));
  const logs = (await redis.lrange(K.log, 0, -1)) || [];
  const skipped = logs.filter((l) => !sentParents.has(String(l.postId)) && l.date && hoursSince(`${l.date}T00:00:00+09:00`) > TRACK_HOURS + 24).slice(0, 15);

  const rows = matured.slice(0, 40);
  const r = runClaude(analysisPrompt(rows, skipped));
  const insights = {
    good: (r.good || []).slice(0, 5),
    avoid: (r.avoid || []).slice(0, 5),
    editLessons: (r.editLessons || []).slice(0, 3),
    examples: (r.examples || []).slice(0, 3),
    summary: r.summary || "",
    basedOn: { replies: rows.length, skipped: skipped.length, avgScore: Number((rows.reduce((s, o) => s + o.score, 0) / rows.length).toFixed(2)) },
    provisional: rows.length < 15, // 15件未満は暫定（偶然の影響が大きい）
    analyzedIds: rows.map((o) => o.id),
    updatedAt: new Date().toISOString(),
  };
  if (DRY) log("[dry]分析", JSON.stringify(insights, null, 1));
  else await redis.set(K.insights, insights);
  return { skipped: false, matured: matured.length, newCount, insights };
}

(async () => {
  if (!process.env.X_BEARER_TOKEN) return log("X_BEARER_TOKEN が未設定のためスキップ");
  let t = { mine: 0, saved: 0 };
  try {
    t = await track();
  } catch (e) {
    log("リプ回収失敗", e.message); // 失敗しても分析は既存データで続ける
  }
  const a = await analyze();
  const all = Object.values((await redis.hgetall(K.outcomes)) || {});
  const by = (s) => all.filter((o) => o.source === s).length;
  log(
    `完了: 直近${TRACK_HOURS}hのリプ${t.mine}件を記録 / 累計${all.length}件（AI案そのまま${by("as_is")}・手直し${by("edited")}・自作${by("manual")}） / ` +
      (a.skipped ? `分析は保留（48h経過${a.matured}件・新規${a.newCount}件、${MIN_SAMPLES}件以上かつ新規3件以上で実行）` : `分析を更新（${a.insights.basedOn.replies}件${a.insights.provisional ? "・暫定" : ""}）`) +
      (DRY ? "（dry）" : "")
  );
})().catch((e) => {
  log("エラー:", e.message || e);
  process.exit(1);
});
