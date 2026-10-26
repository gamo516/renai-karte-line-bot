// 競合リサーチAI（1日1回）。X公式APIで投稿を集め、Claude（claude -p）で分析・選定する。
//   A バズ分析（30件）   … 伸びた投稿の型・フック・感情訴求を分析し参考投稿集へ。小規模アカウントの伸びも拾う
//   B リプ候補（35件）   … 投稿から12時間以内の投稿から、こたが自然に返せる3〜5件を選び、返信案2つ付きでLINEへ
//   C リアルな悩み（15件）… 一般ユーザーの悩みを分類だけして保存（本文・ユーザー情報は保存しない）→投稿テーマへ
// 安全装置: 予算ガード（lib/xapi.js）／二重起動ロック／再試行なし／取得済みIDの重複除外
// 使い方: node scripts/research.js [--dry]   … --dry はX APIは呼ぶが、保存・LINE送信・既読登録をしない
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");
const xapi = require("../lib/xapi");
const replyNotify = require("../lib/replyNotify");
// --only=B などで一部のグループだけ実行（テスト用。費用を抑えるため）
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);

const DRY = process.argv.includes("--dry");
const redis = Redis.fromEnv();
const K = {
  refs: "renai-karte:refs",
  worries: "renai-karte:worries",
  seen: (d) => `renai-karte:research-seen:${d}`,
  lock: "renai-karte:research-lock",
  admins: "renai-karte:admins",
  log: "renai-karte:research-log",
};
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");
const LOG_FILE = path.join(__dirname, "..", "logs", "research.log");
const BASE = "lang:ja -is:retweet -is:reply";

// グループごとの検索（max_results の合計 = 1日の上限 80件）
const GROUPS = {
  A: [
    { q: `(復縁 OR 未練 OR 元彼 OR 元カレ) min_likes:50 ${BASE}`, n: 10 },
    { q: `(片思い OR 脈あり OR 男性心理) min_likes:50 ${BASE}`, n: 10 },
    { q: `(失恋 OR 既読無視 OR 冷却期間) min_likes:30 ${BASE}`, n: 10 },
  ],
  B: [
    { q: `(復縁 OR 元彼 OR 元カレ OR 未練) min_likes:5 -has:links ${BASE}`, n: 15, fresh: true },
    { q: `(片思い OR 脈あり OR 好きな人) min_likes:5 -has:links ${BASE}`, n: 10, fresh: true },
    { q: `(失恋 OR 既読無視 OR 連絡こない) min_likes:5 -has:links ${BASE}`, n: 10, fresh: true },
  ],
  C: [{ q: `(元彼 OR 復縁 OR 片思い OR 既読無視) (どうしたら OR わからない OR 辛い OR 連絡していい OR 諦め) -has:links ${BASE}`, n: 15 }],
};
const FRESH_HOURS = 12;
const AUTHOR_LOOKUPS = 10; // A群でフォロワー数を調べる上限（1件$0.01）

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
// 反応の勢い: 1時間あたりの反応数（いいね + 返信×3 + 引用×3 + 保存×2）
const velocity = (p) => (p.likes + p.replies * 3 + p.quotes * 3 + (p.bookmarks || 0) * 2) / Math.max(1, hoursSince(p.createdAt));

async function collect(group, today) {
  const out = new Map();
  for (const s of GROUPS[group]) {
    const startTime = s.fresh ? new Date(Date.now() - FRESH_HOURS * 3600000).toISOString().replace(/\.\d+Z$/, "Z") : undefined;
    try {
      for (const p of await xapi.searchRecent(s.q, { maxResults: s.n, startTime })) out.set(p.id, p);
    } catch (e) {
      log(`検索失敗[${group}]`, e.message);
      if (e instanceof xapi.BudgetExceeded) throw e; // 予算超過見込みなら全体を止める
    }
  }
  // 過去に処理済みの投稿は除外（Aは同じ投稿を何度も参考にしない）
  const list = [...out.values()];
  const seen = await Promise.all(list.map((p) => redis.sismember(K.seen(group), p.id)));
  return list.filter((_, i) => !seen[i]);
}

// reply-feedback.js が実績から抽出した「反応が良かったリプの傾向」をプロンプト用の文章にする
function insightsText(ins) {
  const lines = [`実績から分かったこと（実際に送ったリプ${ins.basedOn.replies}件の反応から${ins.provisional ? "。件数が少ないので参考程度" : ""}）:`];
  if (ins.summary) lines.push(`- 傾向: ${ins.summary}`);
  for (const g of ins.good || []) lines.push(`- 反応が良い: ${g}`);
  for (const a of ins.avoid || []) lines.push(`- 避ける: ${a}`);
  for (const e of ins.editLessons || []) lines.push(`- 運用者の好み: ${e}`);
  for (const x of ins.examples || []) lines.push(`- 反応が良かった実例（言い回しはそのまま真似しない）: 元投稿「${x.original}」→「${x.reply}」（${x.why}）`);
  return lines.join("\n");
}

function prompt({ A, B, C, recent = [], insights = null }) {
  const fmt = (p, i, tag) =>
    `${tag}${i + 1}. [投稿${hoursSince(p.createdAt).toFixed(1)}時間前 / いいね${p.likes} 返信${p.replies} 引用${p.quotes} 保存${p.bookmarks ?? "?"} 表示${p.views ?? "?"}${p.followers != null ? ` / 投稿者フォロワー${p.followers}` : ""} / 勢い${velocity(p).toFixed(1)}/h] ${p.text.replace(/\n/g, " / ")}`;
  return `あなたは恋愛系Xアカウント「こた」（@kota_0517）の運用チームです。今日集めたXの投稿を3つの作業で処理してください。

## こた
- 復縁・片思いの相談をたくさん聞いてきたアラサー女性。男友達から聞いた「男の本音」にも詳しい
- 口調はやわらかいタメ口。説教しない、相手を否定しない、異性を攻撃しない、相手の心理を根拠なく断定しない
- こた自身の恋愛体験や相談実績を作らない。占い師・霊能者のふりはしない

## 作業A：バズ投稿の分析（${A.length}件）
伸びた理由を分析する。いいね数だけでなく、投稿者のフォロワーが少ないのに伸びている投稿（フォロワーに対していいねが多い）を重視する。
宣伝・業者（占いアプリ・note・LINEへの誘導が主目的）や炎上ネタは usable:false。
type: uketori / cliffhanger / checklist / kiita / kyokan / spiritual / nitaku / other
category: empathy（共感型）/ practical（実用型）/ conversation（会話型）
${A.map((p, i) => fmt(p, i, "A")).join("\n")}

## 作業B：リプ候補の選定（候補${B.length}件から最大5件）
フォロワー0のこたが、新しい人と接点を作るためのリプ先を選ぶ。
選ぶ基準: ターゲット（復縁・片思いで悩む20〜30代女性）との一致／新しさ／勢い／こたが自然に価値ある一言を返せるか／返信がプロフィール訪問につながりそうか
除外: 広告・業者・炎上・誹謗中傷・未成年に見える・性的・暴力・自傷を含む・恋愛と無関係。有望なものがなければ0件でよい
選んだ投稿ごとに、返信文を最終的に1つだけ決める。
返信文のルール（最優先）:
 - 元投稿の具体的な言葉・状況（出来事、期間、相手の言動、本人の行動など）に必ず1つ触れる。どの投稿にも使い回せる文はNG
 - 共感の言葉は入れても冒頭の短い一言まで。「しんどいよね」「わかる」「つらいよね」「切ないね」などを重ねない
 - 定型の励まし・締め（「大丈夫だよ」「頑張って」「応援してる」「無理しないでね」「自分を大事にしてね」「〜な証拠だよ」）で終わらせない
 - 代わりに、こたならではの一言を添える: 具体的な気づき／男友達から聞いた男性側の見え方（伝聞として）／相手が答えやすい具体的な質問 のどれか1つ
 - 説教・断定・決めつけはしない。60字以内、人がスマホで打ったような自然なタメ口
手順:
 1) 方向性の違う返信案を内部で3つ書く（具体に触れた気づき／男性側の見え方／具体的な質問）
 2) 各案を厳しくチェックする: 元投稿の具体的な内容に触れているか／他の投稿にも使い回せる文になっていないか／共感の繰り返しや定型の励ましがないか／こたの自然なタメ口か／AIっぽさ（整いすぎ、決まり文句）がないか／相手の状況を勝手に決めつけていないか／宣伝・LINE誘導・リンク・ハッシュタグ・「フォローして」がないか／下の「最近こたが送った返信」と言い回しや締め方が似ていないか${insights ? "／下の「実績から分かったこと」に沿っているか" : ""}
 3) 問題があれば直し、いちばん良い1つを final にする
${insights ? insightsText(insights) + "\n" : ""}最近こたが送った返信（似た言い回し・同じ締め方を避ける）:
${recent.length ? recent.map((r) => "- " + r).join("\n") : "（まだなし）"}
${B.map((p, i) => fmt(p, i, "B")).join("\n")}

## 作業C：リアルな悩みの分類（${C.length}件）
一般ユーザーの恋愛の悩みを、個人が特定できない形に抽象化して分類する。固有名詞・具体的な個人情報・センシティブな詳細は書かない。
恋愛の悩みでないもの、宣伝は除外。
${C.map((p, i) => `C${i + 1}. ${p.text.replace(/\n/g, " / ")}`).join("\n")}

## 出力（JSON配列のみ。前置き不要）
作業A: {"id":"A番号","usable":true/false,"type":"型","category":"empathy|practical|conversation","hook":"冒頭フックの手法(20字)","structure":"文章構成(30字)","emotion":"刺さる感情(20字)","why":"読者が反応する理由(60字)"}
作業B（選んだものだけ）: {"id":"B番号","priority":1〜5,"reason":"選定理由(40字)","drafts":["内部案1","内部案2","内部案3"],"check":"チェックで直した点・選んだ理由(60字)","final":"最終的な返信文1つ"}
作業C: {"id":"C番号","usable":true/false,"category":"悩みの分類(例: 連絡していいか迷う/別れの理由が分からない/既読無視/行動できない/相手の未練を知りたい/その他)","worry":"抽象化した悩み(40字)","postIdea":"こたの投稿テーマ案(40字)"}`;
}

function runClaude(text) {
  const out = execFileSync(CLAUDE_BIN, ["-p", "--output-format", "text"], { input: text, encoding: "utf8", timeout: 12 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
}

async function notify(picks) {
  await replyNotify.send(picks.map(({ p, a }) => ({ postId: p.id, url: p.url, original: p.text, reply: a.final })));
}

(async () => {
  if (!process.env.X_BEARER_TOKEN) return log("X_BEARER_TOKEN が未設定のためリサーチはスキップ");
  // 二重起動防止（30分で自動解除）
  if (!DRY && !(await redis.set(K.lock, Date.now(), { nx: true, ex: 1800 }))) return log("別の実行中のためスキップ");
  try {
    const today = new Date().toISOString().slice(0, 10);
    const actual = await xapi.syncActual();
    if (actual) log(`X側の実績: 今月${actual.posts}件読み取り（約${actual.month.toFixed(3)}）`);
    const run = (g) => ONLY.length === 0 || ONLY.includes(g);
    const A = run("A") ? await collect("A", today) : [];
    const B = run("B") ? await collect("B", today) : [];
    const C = run("C") ? await collect("C", today) : [];
    log(`取得 A${A.length} B${B.length} C${C.length}（新規のみ）`);

    // A群: いいね上位＋勢い上位のうち、投稿者のフォロワー数を少数だけ調べて「小規模なのに伸びた」を判定
    const lookup = [...A].sort((x, y) => y.likes - x.likes).slice(0, AUTHOR_LOOKUPS).map((p) => p.authorId);
    try {
      const users = await xapi.usersByIds(lookup);
      for (const p of A) if (users[p.authorId]) p.followers = users[p.authorId].followers;
    } catch (e) {
      log("フォロワー取得スキップ", e.message);
    }
    const Asel = [...A].sort((x, y) => velocity(y) - velocity(x)).slice(0, 30);
    const Bsel = [...B].filter((p) => hoursSince(p.createdAt) <= FRESH_HOURS).sort((x, y) => velocity(y) - velocity(x)).slice(0, 35);
    const Csel = C.slice(0, 15);
    if (Asel.length + Bsel.length + Csel.length === 0) return log("新規の投稿なし。終了");

    const insights = await redis.get("renai-karte:meta:replyInsights");
    const results = runClaude(prompt({ A: Asel, B: Bsel, C: Csel, recent: await replyNotify.recentReplies(), insights }));
    const get = (id) => results.find((r) => r.id === id);

    // A → 参考投稿集
    let refCount = 0;
    for (const [i, p] of Asel.entries()) {
      const a = get(`A${i + 1}`);
      if (!a || a.usable === false) continue;
      const entry = { text: p.text, likes: p.likes, views: p.views, followers: p.followers ?? null, velocity: Number(velocity(p).toFixed(1)), type: a.type, category: a.category, hook: a.hook, structure: a.structure, emotion: a.emotion, why: a.why, source: "research", savedAt: new Date().toISOString() };
      if (DRY) log("[dry]A", JSON.stringify(entry).slice(0, 180));
      else await redis.lpush(K.refs, entry);
      refCount++;
    }
    if (!DRY) await redis.ltrim(K.refs, 0, 299);

    // C → 悩み（抽象化したものだけ保存。元の本文・ユーザー情報は保存しない）
    let worryCount = 0;
    for (const [i] of Csel.entries()) {
      const c = get(`C${i + 1}`);
      if (!c || c.usable === false) continue;
      const entry = { category: c.category, worry: c.worry, postIdea: c.postIdea, date: today };
      if (DRY) log("[dry]C", JSON.stringify(entry));
      else await redis.lpush(K.worries, entry);
      worryCount++;
    }
    if (!DRY) await redis.ltrim(K.worries, 0, 499);

    // B → リプ候補（優先度順に最大5件。1通にまとめて送る）
    const picks = results
      .filter((r) => /^B\d+$/.test(r.id) && typeof r.final === "string" && r.final.trim())
      .map((a) => ({ a, p: Bsel[Number(a.id.slice(1)) - 1] }))
      .filter((x) => x.p)
      .sort((x, y) => x.a.priority - y.a.priority)
      .slice(0, 5);
    if (DRY) {
      picks.forEach(({ p, a }) => log("[dry]B", a.priority, p.url, "|", p.text.slice(0, 40).replace(/\n/g, " "), "→", a.final, "| 内部案:", (a.drafts || []).join(" / "), "| チェック:", a.check));
      if (picks.length) await replyNotify.validate(picks.map(({ p, a }) => ({ postId: p.id, url: p.url, original: p.text, reply: a.final })));
    } else {
      await notify(picks);
      for (const { p, a } of picks) {
        await replyNotify.logDecision({ date: today, postId: p.id, url: p.url, original: p.text.slice(0, 200), reply: a.final, drafts: a.drafts, check: a.check, reason: a.reason, priority: a.priority, likes: p.likes, ageHours: Number(hoursSince(p.createdAt).toFixed(1)) });
      }
    }

    // 処理済みIDを記録（同じ投稿を翌日以降また分析・推薦しない。30日で消える）
    if (!DRY) {
      for (const [g, list] of [["A", A], ["B", B], ["C", C]]) {
        if (list.length) {
          await redis.sadd(K.seen(g), ...list.map((p) => p.id));
          await redis.expire(K.seen(g), 30 * 86400);
        }
      }
      await redis.lpush(K.log, { date: today, A: A.length, B: B.length, C: C.length, refs: refCount, worries: worryCount, replies: picks.length, spent: await xapi.spent() });
      await redis.ltrim(K.log, 0, 89);
    }
    const s = await xapi.spent();
    log(`完了: 参考${refCount} / 悩み${worryCount} / リプ候補${picks.length}件送信 / X API推定 今日$${s.day.toFixed(3)} 今月$${s.month.toFixed(3)}${DRY ? "（dry）" : ""}`);
  } finally {
    if (!DRY) await redis.del(K.lock);
  }
})().catch(async (e) => {
  log("エラー:", e.message || e);
  process.exit(1);
});
