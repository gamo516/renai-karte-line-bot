// 受付箱の自動処理（会社PCのタスクスケジューラで平日日中に30分おきに実行）。
// - 返信案がほしい → こた口調のリプ案を作ってLINEに送る
// - 参考に保存     → 投稿は型・伸びた理由を分析して参考投稿集へ、アカウントはプロフィールを分析して保存
// 中身の分析は Claude Code（claude -p）で行うので API 費用はかからない。
// 使い方: node scripts/auto-inbox.js [--dry]   … --dry は分析だけして保存・送信・削除をしない
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");
const replyNotify = require("../lib/replyNotify");
const { personaText } = require("../lib/persona");

const DRY = process.argv.includes("--dry");
const redis = Redis.fromEnv();
const INBOX_KEY = "renai-karte:inbox";
const REFS_KEY = "renai-karte:refs";
const ACCOUNTS_KEY = "renai-karte:ref-accounts";
const ADMINS_KEY = "renai-karte:admins";
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");
const LOG_FILE = path.join(__dirname, "..", "logs", "auto-inbox.log");

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(msg);
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, msg + "\n");
}

// XのリンクからAPI（fxtwitter）で中身を取る。取れなければ null
async function fetchX(url) {
  const m = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)(?:\/status\/(\d+))?/);
  if (!m) return null;
  const [, user, statusId] = m;
  const api = statusId ? `https://api.fxtwitter.com/i/status/${statusId}` : `https://api.fxtwitter.com/${user}`;
  try {
    const j = await fetch(api, { signal: AbortSignal.timeout(30000) }).then((r) => r.json());
    if (statusId && j.tweet) {
      const t = j.tweet;
      return {
        kind: "post",
        url,
        account: `${t.author.name}(@${t.author.screen_name}・フォロワー${t.author.followers})`,
        text: t.text,
        likes: t.likes,
        views: t.views,
        replies: t.replies,
        bookmarks: t.bookmarks,
        replyingTo: t.replying_to || null,
      };
    }
    if (!statusId && j.user) {
      const u = j.user;
      return { kind: "account", url, name: u.name, screen_name: u.screen_name, description: u.description, location: u.location, followers: u.followers, tweets: u.tweets, website: u.website && u.website.url };
    }
  } catch (e) {
    log("X取得失敗", url, e.message);
  }
  return null;
}

// 受付箱の1件を、Claudeに渡す材料に変換する
async function toMaterial(item, i, imgDir) {
  if (item.kind === "image") {
    if (!item.data) return { index: i, mode: item.mode, missing: "画像を取得できなかった" };
    const file = path.join(imgDir, `${String(i).padStart(2, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(item.data, "base64"));
    return { index: i, mode: item.mode, image: file };
  }
  const urls = (item.text.match(/https?:\/\/\S+/g) || []).map((u) => u.replace(/https?:\/\/(?=https?:)/, ""));
  const fetched = [];
  for (const u of urls) {
    const x = await fetchX(u);
    if (x) fetched.push(x);
  }
  return { index: i, mode: item.mode, text: item.text, fetched };
}

function buildPrompt(materials, persona = "") {
  return `あなたは恋愛アカウント運用のアシスタントです。運用中のXアカウント「こた」（@kota_0517）の運営者から届いた受付箱の${materials.length}件を処理してください。

## こたのキャラ
- 復縁・片思いの相談をたくさん聞いてきたアラサー女性。男友達から聞いた「男の本音」にも詳しい
- 口調はやわらかいタメ口（「〜だよね」「〜かも」）。説教しない、相手を否定しない、異性を攻撃しない
- こたは、別れて復縁して結婚した女性。自分の経験は下の「こたの人物設定」の範囲でだけ語ってよい。占い師・霊能者のふりはしない

${persona}

## 処理のしかた（mode ごと）
### mode=reply（返信案がほしい）
対象の投稿（他アカウントの人気投稿、またはこたの投稿に来たリプ）に、こたとして返す返信文を最終的に1つだけ決める。
- 内部で方向性の違う案を3つ書き（寄り添い／気づき・意見を添える／会話が続く一言）、次の観点でチェックして直し、いちばん良い1つを final にする:
  元投稿を正しく理解しているか／こたの自然なタメ口か／共感だけで終わらず必要に応じて気づきや意見があるか／定型文やAIっぽさがないか／相手の状況を決めつけていないか／宣伝・リンク・ハッシュタグ・「フォローして」がないか
- 60字以内。絵文字は1つまで。人がスマホで打ったような自然な文
- 出力: {"index":番号,"mode":"reply","target":"対象投稿の要約（30字以内）","drafts":["内部案1","内部案2","内部案3"],"check":"直した点・選んだ理由(60字)","final":"最終的な返信文1つ"}

### mode=ref（参考に保存）
- 投稿の場合: 本文を文字起こし（画像の場合は投稿本体のみ。リプ欄は除く）し、型と伸びた理由を分析する
  出力: {"index":番号,"mode":"ref","kind":"post","text":"本文","likes":数値またはnull,"views":数値またはnull,"account":"アカウント名","type":"型","hook":"1行目のつかみ(20字程度)","why":"伸びた理由(60字程度)"}
  type は uketori(受け取り型の短い言い切り) / cliffhanger(途中で切って続きへ) / checklist(リスト) / kiita(聞いた話・体験談) / kyokan(本音の吐き出し) / spiritual(運命・タイミング) / nitaku(二択・問いかけ) / other から選ぶ
- アカウント（プロフィール）の場合: キャラ設定と見せ方を分析する
  出力: {"index":番号,"mode":"ref","kind":"account","name":"表示名","followers":数値またはnull,"persona":"キャラ設定の要約(40字)","bioPattern":"プロフィールの型(40字)","cta":"誘導の仕方(30字)","takeaway":"こたに取り入れられる点(60字)"}

## 受付箱の中身
${materials
  .map((m) => {
    if (m.missing) return `### ${m.index}（mode=${m.mode}）\n材料なし: ${m.missing}`;
    if (m.image) return `### ${m.index}（mode=${m.mode}）\nスクショ画像: ${m.image}（Readツールで開いて内容を読むこと）`;
    return `### ${m.index}（mode=${m.mode}）\n送られた文面: ${m.text}\n取得できたXの情報: ${m.fetched.length ? JSON.stringify(m.fetched) : "なし（文面だけで判断）"}`;
  })
  .join("\n\n")}

## 出力
上の${materials.length}件それぞれについて1要素ずつ、JSON配列だけを出力する。前置き・説明・コードブロック記号は不要。
材料が足りず処理できない件は {"index":番号,"mode":"skip","reason":"理由"} とする。`;
}

function runClaude(prompt, imgDir) {
  const out = execFileSync(CLAUDE_BIN, ["-p", "--output-format", "text", "--allowedTools", "Read", "--add-dir", imgDir], {
    input: prompt,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
}

async function sendReplies(replies) {
  if (replies.length === 0) return;
  const cards = replies.filter((r) => r.postId && r.final);
  const others = replies.filter((r) => !(r.postId && r.final));
  if (cards.length) await replyNotify.send(cards.map((r) => ({ postId: r.postId, url: r.url, original: r.original || r.target, reply: r.final })), "受付箱のリプ");
  if (others.length) {
    const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
    const text = others.map((r) => `【${r.target}】${r.url ? "\n" + r.url : ""}\n\n${r.note || r.final}`).join("\n\n―――\n\n");
    for (const to of await redis.smembers(ADMINS_KEY)) await client.pushMessage({ to, messages: [{ type: "text", text: "返信文できたよ（長押しでコピー）\n\n" + text }] });
  }
}

(async () => {
  const items = await redis.lrange(INBOX_KEY, 0, -1);
  if (items.length === 0) return; // 空なら何もしない（ログも残さない）
  log(`受付箱 ${items.length}件を処理開始`);

  const imgDir = fs.mkdtempSync(path.join(os.tmpdir(), "renai-inbox-"));
  try {
    const materials = [];
    for (const [i, item] of items.entries()) materials.push(await toMaterial(item, i + 1, imgDir));

    const results = runClaude(buildPrompt(materials, await personaText()), imgDir);
    const replies = [];
    let refCount = 0;
    let accountCount = 0;
    for (const r of results) {
      const m = materials.find((x) => x.index === r.index);
      if (r.mode === "reply" && r.final) {
        const post = m && m.fetched && m.fetched.find((f) => f.kind === "post");
        const postId = post && (post.url.match(/status\/(\d+)/) || [])[1];
        replies.push({ ...r, url: post && post.url, postId, original: post && post.text });
        if (!DRY) await replyNotify.logDecision({ date: new Date().toISOString().slice(0, 10), source: "inbox", postId, url: post && post.url, original: post && post.text && post.text.slice(0, 200), reply: r.final, drafts: r.drafts, check: r.check });
      } else if (r.mode === "ref" && r.kind === "post") {
        if (!DRY) await redis.lpush(REFS_KEY, { text: r.text, likes: r.likes, views: r.views, account: r.account, type: r.type, hook: r.hook, why: r.why, savedAt: new Date().toISOString() });
        refCount++;
      } else if (r.mode === "ref" && r.kind === "account") {
        if (!DRY) await redis.lpush(ACCOUNTS_KEY, { ...r, savedAt: new Date().toISOString() });
        accountCount++;
      } else {
        log(`スキップ #${r.index}: ${r.reason || JSON.stringify(r).slice(0, 80)}`);
        // 返信案を頼まれていたものは、できなかった理由をLINEで伝える
        if (m && m.mode === "reply") replies.push({ target: "読み取れなかった投稿", url: m.fetched && m.fetched[0] && m.fetched[0].url, note: r.reason || "内容を読み取れなかったよ。スクショで送ってみて" });
      }
      if (DRY) log("[dry]", JSON.stringify(r).slice(0, 300));
    }

    if (!DRY) {
      await sendReplies(replies);
      await redis.ltrim(INBOX_KEY, items.length, -1); // 処理中に届いた新着は残す
    }
    log(`完了: 返信案${replies.length}件送信 / 参考投稿${refCount}件・アカウント${accountCount}件保存${DRY ? "（dry）" : ""}`);
  } finally {
    fs.rmSync(imgDir, { recursive: true, force: true });
  }
})().catch((e) => {
  log("エラー:", e.message || e);
  process.exit(1);
});
