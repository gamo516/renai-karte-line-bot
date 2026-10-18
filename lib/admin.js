// 運営者（管理者）だけが使う受付箱。スマホのLINEからスクショ・本文を送ってためておき、
// 会社PCの Claude Code が出社時にまとめて処理する（API費用はかからない）。
// - 参考に保存: バズ投稿 → 分析して参考投稿集へ（X投稿の自動生成で見本に使う）
// - 返信案:     自分の投稿へのリプ → こた口調の返信案をLINEにまとめて送り返す
// 一般の友だちには一切影響しない（管理者登録した userId だけが対象）。
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const ADMINS_KEY = "renai-karte:admins";
const INBOX_KEY = "renai-karte:inbox";
const REFS_KEY = "renai-karte:refs";
const ADMIN_CODE_KEY = "renai-karte:meta:adminCode";
const pendingKey = (userId) => `renai-karte:admin-pending:${userId}`;
const INBOX_TTL_DAYS = 30;

async function adminCode() {
  return process.env.ADMIN_CODE || (await redis.get(ADMIN_CODE_KEY));
}

async function isAdmin(userId) {
  return Boolean(await redis.sismember(ADMINS_KEY, userId));
}

// 「管理 <コード>」で管理者登録
async function tryRegister(userId, text) {
  const m = text.match(/^管理\s+(\S+)$/);
  if (!m) return null;
  const code = await adminCode();
  if (!code || m[1] !== String(code)) return "コードが違います。";
  await redis.sadd(ADMINS_KEY, userId);
  return "管理者として登録しました。\n\nバズ投稿や、自分の投稿に来たリプのスクショ（または本文）を送ってください。送ったあとに「参考に保存」か「返信案がほしい」を選ぶと、受付箱にたまります。\n\n出社時にまとめて処理します。";
}

function chooseMenu() {
  return {
    type: "text",
    text: "これをどうしますか？",
    quickReply: {
      items: [
        { type: "action", action: { type: "postback", label: "参考に保存", data: "action=admin&mode=ref", displayText: "参考に保存" } },
        { type: "action", action: { type: "postback", label: "返信案がほしい", data: "action=admin&mode=reply", displayText: "返信案がほしい" } },
      ],
    },
  };
}

async function inboxCount() {
  return redis.llen(INBOX_KEY);
}

// LINEの画像は一定期間で消えるため、受け取った時点で本体を保存しておく
async function downloadImage(blobClient, messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("base64");
}

// 管理者が送った画像・テキスト。管理者でなければ null を返す（通常処理へ）
async function handleAdminMessage(event, blobClient) {
  const userId = event.source.userId;
  if (!(await isAdmin(userId))) return null;
  const m = event.message;

  if (m.type === "image") {
    let data = null;
    try {
      data = await downloadImage(blobClient, m.id);
    } catch (err) {
      console.error("[admin] 画像の取得失敗", (err && err.message) || err);
    }
    await redis.set(pendingKey(userId), { kind: "image", messageId: m.id, data }, { ex: 60 * 60 });
    return [chooseMenu()];
  }
  if (m.type === "text") {
    const text = m.text.trim();
    if (text === "受付箱") return [{ type: "text", text: `受付箱：未処理 ${await inboxCount()}件\n参考投稿：${await redis.llen(REFS_KEY)}件` }];
    if (text.length < 15) return null; // 短い文字はキーワード応答など通常処理へ
    await redis.set(pendingKey(userId), { kind: "text", text }, { ex: 60 * 60 });
    return [chooseMenu()];
  }
  return null;
}

// 「参考に保存」「返信案がほしい」が押されたとき → 受付箱に入れる
async function handleAdminPostback(event, mode) {
  const userId = event.source.userId;
  if (!(await isAdmin(userId))) return null;
  const item = await redis.get(pendingKey(userId));
  if (!item) return [{ type: "text", text: "対象が見つかりません。もう一度スクショか本文を送ってください。" }];
  await redis.del(pendingKey(userId));

  const entry = { ...item, mode: mode === "reply" ? "reply" : "ref", userId, receivedAt: new Date().toISOString() };
  await redis.rpush(INBOX_KEY, entry);
  await redis.expire(INBOX_KEY, INBOX_TTL_DAYS * 86400);
  const label = entry.mode === "reply" ? "返信案" : "参考";
  return [{ type: "text", text: `受付箱に入れました（${label}）\n未処理：${await inboxCount()}件\n\n出社時にまとめて処理します。` }];
}

// X投稿の自動生成スクリプト（会社PC）が参考投稿を取りに来るためのAPI
async function listRefs(limit = 50) {
  return redis.lrange(REFS_KEY, 0, limit - 1);
}

async function checkCode(code) {
  const expected = await adminCode();
  return Boolean(expected && code === String(expected));
}

module.exports = { tryRegister, handleAdminMessage, handleAdminPostback, listRefs, isAdmin, checkCode };
