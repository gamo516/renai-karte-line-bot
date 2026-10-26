// LINEに送るメッセージの組み立て。
// LINE内のリンクはすべて /r（計測用リダイレクト）を経由させ、誰がページを開いたかを記録する。
// URLにはLINEのユーザーIDをそのまま載せず、暗号化した値（u）と改ざん防止の署名（s）を載せる。
const crypto = require("crypto");
const questions = require("./questions");
const resultTypes = require("./resultTypes");
const { WORRIES } = require("./content");

const ACCENT = "#6a3fa0";
const ALLOWED_DEST = /^\/(t\/[a-d]|w\/(fukuen|kataomoi|aimai|togire)|aisho|guide|karte)$/;
const LETTERS = ["A", "B", "C", "D"];

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "https://renai-karte-line-bot.onrender.com").replace(/\/$/, "");
}

function sign(userId, dest) {
  return crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET || "").update(`${userId}|${dest}`).digest("hex").slice(0, 16);
}

// ユーザーIDの暗号化（AES-256-GCM。鍵はチャネルシークレットから作る）
function cipherKey() {
  return crypto.createHash("sha256").update(`renai-karte|r|${process.env.LINE_CHANNEL_SECRET || ""}`).digest();
}

function sealUserId(userId) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const enc = Buffer.concat([c.update(String(userId), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

function openUserId(token) {
  try {
    const buf = Buffer.from(String(token), "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", cipherKey(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

// 計測用リンク。dest は "/t/b" のような公開ページのパス
function trackedUrl(userId, dest) {
  return `${baseUrl()}/r?u=${encodeURIComponent(sealUserId(userId))}&d=${encodeURIComponent(dest)}&s=${sign(userId, dest)}`;
}

// /r のパラメータからユーザーIDを取り出す（不正ならnull）。
// 以前に送ったリンク（u にユーザーIDがそのまま入っている）も引き続き使えるようにする
function resolveTracked(u, dest, sig) {
  if (!u || !dest || !ALLOWED_DEST.test(dest)) return null;
  const userId = /^U[0-9a-f]{32}$/.test(u) ? u : openUserId(u);
  return userId && sig === sign(userId, dest) ? userId : null;
}

function questionMessage(index) {
  const q = questions[index];
  const lines = [`Q${index + 1}/${questions.length}. ${q.q}`, ""];
  q.choices.forEach((c, i) => lines.push(`${LETTERS[i]}. ${c[0]}`));
  return {
    type: "text",
    text: lines.join("\n"),
    quickReply: {
      items: q.choices.map((c, i) => {
        const label = `${LETTERS[i]} ${c[2]}`.slice(0, 20);
        return { type: "action", action: { type: "postback", label, data: `action=answer&q=${index}&tag=${c[1]}`, displayText: label } };
      }),
    },
  };
}

// 本文＋ボタン（1〜2個）のカード。buttons: [{label, uri}|{label, data, displayText}]
function card(altText, title, body, buttons) {
  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          ...(title ? [{ type: "text", text: title, weight: "bold", size: "lg", color: ACCENT, wrap: true }] : []),
          { type: "text", text: body, size: "sm", wrap: true, color: "#2b2340" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: buttons.map((b, i) => ({
          type: "button",
          style: i === 0 ? "primary" : "link",
          color: i === 0 ? ACCENT : undefined,
          height: "sm",
          action: b.uri
            ? { type: "uri", label: b.label, uri: b.uri }
            : { type: "postback", label: b.label, data: b.data, displayText: b.displayText || b.label },
        })),
      },
    },
  };
}

function linkCard(altText, title, body, label, url) {
  return card(altText, title, body, [{ label, uri: url }]);
}

const DIAG_NOTE = "※恋愛での自分の反応を振り返るためのヒントだよ。占いや心理検査ではないよ";

// 診断直後の結果カード。まず結果に納得してもらい、次の行動は「悩み選択」1つだけにする
function resultCard(userId, tag) {
  const t = resultTypes[tag];
  return card(`あなたは【${t.name}】`, t.name, `${t.message}\n\n${DIAG_NOTE}`, [
    { label: "今の悩みに合ったヒントを見る", data: "action=askworry&from=result", displayText: "今の悩みに合ったヒントを見る" },
  ]);
}

// リッチメニュー「私のタイプ解説」：タイプの説明＋詳しい解説ページ
function typeCard(userId, tag) {
  const t = resultTypes[tag];
  return card(`あなたは【${t.name}】`, t.name, `■どんなタイプ？\n${t.trait}\n\n■つまずきやすいこと\n${t.trouble}\n\n${DIAG_NOTE}`, [
    { label: "タイプの詳しい解説を読む", uri: trackedUrl(userId, `/t/${tag.toLowerCase()}`) },
    { label: "今の悩みに合ったヒントを見る", data: "action=askworry&from=mytype", displayText: "今の悩みに合ったヒントを見る" },
  ]);
}

function worryQuickReply() {
  return {
    items: Object.entries(WORRIES).map(([key, w]) => ({
      type: "action",
      action: { type: "postback", label: w.label, data: `action=worry&w=${key}`, displayText: w.label },
    })),
  };
}

function worryQuestion(text) {
  return {
    type: "text",
    text: text || "今いちばん気になってるのはどれ？\n\n選んでくれたら、あなたの状況に合わせたヒントを返すね。",
    quickReply: worryQuickReply(),
  };
}

// 悩み別ヒント：詳しい対処法（Web）と、相談先の案内（LINE内で返す）の2つ
function worryAnswer(userId, key) {
  const w = WORRIES[key];
  return card(`${w.label}のヒント`, `「${w.label}」のあなたへ`, w.advice, [
    { label: w.cta, uri: trackedUrl(userId, `/w/${key}`) },
    { label: "相談先の選び方を見る", data: `action=consultinfo&w=${key}`, displayText: "相談先の選び方を見る" },
  ]);
}

// 「相談先の選び方」：LINE内では売り込まず、選び方の考え方だけ伝えてWebの解説へ
function consultInfo(userId) {
  return card(
    "相談先の選び方",
    "相談先の選び方",
    "ひとりで考えてると、同じところをぐるぐるしちゃうよね。\n\n誰かに話すなら、\n・否定せずに聞いてくれるか\n・料金が先に分かるか\n・話す時間を自分で決められるか\nこの3つを見ておくと安心だよ。\n\n電話占いを使うときの選び方と、使いすぎないコツはここにまとめたよ。",
    [{ label: "相談先の選び方を読む", uri: trackedUrl(userId, "/guide") }]
  );
}

function resumeQuickReply() {
  return { items: [{ type: "action", action: { type: "postback", label: "診断の続きを見る", data: "action=resume", displayText: "診断の続きを見る" } }] };
}

// 自由入力への自動応答（個別対応はしない前提で、整理の入口へ案内する）
function freeTextReply() {
  return {
    type: "text",
    text: "メッセージありがとう🌙\n\nこのLINEは自動診断を中心に動いているから、個別のお悩みに毎回お返事することはできないんだ。\n\nでも、気持ちを整理するためのヒントはまとめてあるよ。今の状況に近いものを選んでみてね。",
    quickReply: {
      items: [
        { type: "action", action: { type: "postback", label: "お悩み別ヒント", data: "action=askworry&from=freetext", displayText: "お悩み別ヒント" } },
        { type: "action", action: { type: "postback", label: "相談先の選び方", data: "action=consultinfo&from=freetext", displayText: "相談先の選び方" } },
      ],
    },
  };
}

// 命や安全に関わる内容のときは、アフィリエイトの案内をせず公的な相談窓口だけを伝える
function crisisReply() {
  return {
    type: "text",
    text:
      "話してくれてありがとう。今とてもつらい状況なんだね。\n\n" +
      "このLINEは自動で動いていて、ちゃんとお話を聞くことができないから、すぐに話せる窓口を置いておくね。\n\n" +
      "・よりそいホットライン（24時間・無料）\n0120-279-338\n" +
      "・DV相談＋（24時間・無料）\n0120-279-889\n" +
      "・今すぐ危険がある時は 110番／119番\n\n" +
      "ひとりで抱えこまないでね。",
  };
}

// 診断中に文字が送られてきた時（診断の状態は変えずに、今の問題を出し直す）
function inDiagnosisReply(index) {
  return [{ type: "text", text: "診断の途中だよ。下のボタンから、いちばん近いものを選んでね。" }, questionMessage(index)];
}

module.exports = {
  trackedUrl,
  resolveTracked,
  questionMessage,
  card,
  linkCard,
  resultCard,
  typeCard,
  worryQuestion,
  worryQuickReply,
  worryAnswer,
  consultInfo,
  resumeQuickReply,
  freeTextReply,
  crisisReply,
  inDiagnosisReply,
};
