// リプ通知（LINE）。AIが確定した返信文1つと、Xの返信画面を「返信文入力済み」で開くリンクだけを送る。
// 返信画面は X公式の Web Intent（https://x.com/intent/tweet?in_reply_to=投稿ID&text=本文）を使う。
// 送信は必ず人間がXの画面で行う（自動返信はしない）。
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const ACCENT = "#6a3fa0";
const NUM = ["①", "②", "③", "④", "⑤"];

// openExternalBrowser=1 は LINE の仕様。LINE内ブラウザ（Xにログインしていない）ではなく、
// スマホの標準ブラウザ／Xアプリで開かせるために付ける
function intentUrl(postId, text) {
  return `https://x.com/intent/tweet?in_reply_to=${encodeURIComponent(postId)}&text=${encodeURIComponent(text)}&openExternalBrowser=1`;
}

// 元投稿の表示用（長いものは省略）
function excerpt(text, max = 90) {
  const t = String(text || "").replace(/https?:\/\/\S+/g, "").replace(/\s+\n/g, "\n").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// items: [{ postId, url, original, reply }]
function buildMessage(items, title = "本日のリプ") {
  const bubbles = items.slice(0, 5).map((it, i) => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: `【こた｜${title}${NUM[i]}】`, weight: "bold", color: ACCENT, size: "sm" },
        { type: "text", text: "元投稿：", size: "xs", color: "#8a7fa0" },
        { type: "text", text: excerpt(it.original), size: "sm", wrap: true, color: "#2b2340" },
        { type: "text", text: "返信：", size: "xs", color: "#8a7fa0" },
        { type: "text", text: it.reply, size: "sm", wrap: true, weight: "bold", color: "#2b2340" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: ACCENT, height: "sm", action: { type: "uri", label: "返信画面を開く", uri: intentUrl(it.postId, it.reply) } },
        // 予備（Xの返信画面に文章が入らなかった時だけ使う）
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "button", style: "link", height: "sm", action: { type: "uri", label: "元投稿", uri: it.url } },
            { type: "button", style: "link", height: "sm", action: { type: "clipboard", label: "返信文コピー", clipboardText: it.reply } },
          ],
        },
      ],
    },
  }));
  return { type: "flex", altText: `こた｜${title} ${bubbles.length}件`, contents: { type: "carousel", contents: bubbles } };
}

async function send(items, title) {
  if (!items.length) return;
  const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
  const message = buildMessage(items, title);
  for (const to of await redis.smembers("renai-karte:admins")) await client.pushMessage({ to, messages: [message] }); // カルーセル1つ＝1通
}

async function validate(items, title) {
  const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
  await client.validatePush({ messages: [buildMessage(items, title)] });
}

// AIの判断ログ（通知には出さず内部に保存）と、似た返信の繰り返し防止用の直近返信
async function logDecision(entry) {
  await redis.lpush("renai-karte:reply-log", entry);
  await redis.ltrim("renai-karte:reply-log", 0, 299);
}

// 実際にXで送った文（reply-feedback.js が回収、手直し後の文を含む）を優先し、足りない分を提案ログで補う
async function recentReplies(n = 30) {
  const sent = Object.values((await redis.hgetall("renai-karte:reply-outcomes")) || {})
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
    .map((o) => o.text);
  const suggested = ((await redis.lrange("renai-karte:reply-log", 0, n - 1)) || []).map((r) => r.reply);
  return [...new Set([...sent, ...suggested].filter(Boolean))].slice(0, n);
}

module.exports = { intentUrl, buildMessage, send, validate, logDecision, recentReplies };
