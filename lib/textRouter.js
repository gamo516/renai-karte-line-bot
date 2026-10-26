// 友だちから文字が送られてきた時の返し方を決める（LINEへの送信はしない。index.js が reply する）。
// 優先順: 命や安全に関わる内容 → 診断中 → キーワード → それ以外（自動応答は6時間に1回まで）
const questions = require("./questions");
const msg = require("./messages");
const { CRISIS_PATTERN } = require("./content");

const AUTO_REPLY_INTERVAL_MS = 6 * 3600 * 1000;

// 戻り値: { messages: [...]|null, patch: ユーザーに保存する値|null, event: 計測名|null }
function routeText(text, user, { isAdmin = false, now = Date.now() } = {}) {
  const t = String(text || "").trim();
  const userId = user.userId;

  // 命や安全に関わる内容：アフィリエイトの案内はせず、公的窓口だけ（回数制限なし）
  if (CRISIS_PATTERN.test(t)) return { messages: [msg.crisisReply()], patch: null, event: "crisis" };

  if (/相性/.test(t)) {
    return {
      messages: [msg.linkCard("タイプ別相性表", "タイプ別相性表", "4つのタイプ同士の相性、まとめてみたよ。", "相性表を見る", msg.trackedUrl(userId, "/aisho"))],
      patch: null,
      event: null,
    };
  }
  if (/^(カルテ|診断|再診断)$/.test(t)) return { messages: "restart", patch: null, event: null };

  // 診断の途中（1問以上答えて、まだ結果が出ていない）：状態は変えずに今の問題を出し直す
  const idx = user.questionIndex || 0;
  if (!user.finalTag && idx > 0 && idx < questions.length) return { messages: msg.inDiagnosisReply(idx), patch: null, event: null };

  // 管理者のメモ書きなどには自動応答しない
  if (isAdmin) return { messages: null, patch: null, event: null };

  // それ以外の自由入力：整理の入口へ案内。連投で何度も同じ案内が出ないように間隔をあける
  const last = user.lastAutoReplyAt ? new Date(user.lastAutoReplyAt).getTime() : 0;
  if (now - last < AUTO_REPLY_INTERVAL_MS) return { messages: null, patch: null, event: "freetext_skip" };
  return { messages: [msg.freeTextReply()], patch: { lastAutoReplyAt: new Date(now).toISOString() }, event: "freetext" };
}

module.exports = { routeText, AUTO_REPLY_INTERVAL_MS };
