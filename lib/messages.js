// LINEに送るメッセージの組み立て。
// LINE内のリンクはすべて /r（計測用リダイレクト）を経由させ、誰がページを開いたかを記録する。
const crypto = require("crypto");
const questions = require("./questions");
const resultTypes = require("./resultTypes");
const { WORRIES } = require("./content");

const ACCENT = "#6a3fa0";
const ALLOWED_DEST = /^\/(t\/[a-d]|w\/(fukuen|kataomoi|aimai|togire)|aisho|guide|karte)$/;

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "https://renai-karte-line-bot.onrender.com").replace(/\/$/, "");
}

function sign(userId, dest) {
  return crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET || "").update(`${userId}|${dest}`).digest("hex").slice(0, 16);
}

// 計測用リンク。dest は "/t/b" のような公開ページのパス
function trackedUrl(userId, dest) {
  return `${baseUrl()}/r?u=${encodeURIComponent(userId)}&d=${encodeURIComponent(dest)}&s=${sign(userId, dest)}`;
}

function verifyTracked(userId, dest, sig) {
  return Boolean(userId && dest && ALLOWED_DEST.test(dest) && sig === sign(userId, dest));
}

function questionMessage(index) {
  const q = questions[index];
  const letters = ["A", "B", "C", "D"];
  const lines = [`Q${index + 1}/${questions.length}. ${q.q}`, ""];
  q.choices.forEach((c, i) => lines.push(`${letters[i]}. ${c[0]}`));
  return {
    type: "text",
    text: lines.join("\n"),
    quickReply: {
      items: q.choices.map((c, i) => ({
        type: "action",
        action: { type: "postback", label: letters[i], data: `action=answer&q=${index}&tag=${c[1]}`, displayText: letters[i] },
      })),
    },
  };
}

// ボタン1つのカード（本文＋リンクボタン）
function linkCard(altText, title, body, label, url) {
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
        contents: [{ type: "button", style: "primary", color: ACCENT, action: { type: "uri", label, uri: url } }],
      },
    },
  };
}

function resultCard(userId, tag) {
  const t = resultTypes[tag];
  return linkCard(
    `あなたは【${t.name}】`,
    t.name,
    `■どんなタイプ？\n${t.trait}\n\n■つまずきやすいこと\n${t.trouble}\n\n※恋愛の傾向を楽しむための診断だよ`,
    "恋のクセ解説を受け取る",
    trackedUrl(userId, `/t/${tag.toLowerCase()}`)
  );
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
    text: text || "最後にひとつだけ聞かせて。\n\n今いちばん気になってるのはどれ？選んでくれたら、あなた向けのヒント返すね。",
    quickReply: worryQuickReply(),
  };
}

function worryAnswer(userId, key) {
  const w = WORRIES[key];
  return linkCard(`${w.label}のヒント`, `「${w.label}」のあなたへ`, w.advice, "続きを読む", trackedUrl(userId, `/w/${key}`));
}

function resumeQuickReply() {
  return { items: [{ type: "action", action: { type: "postback", label: "診断を再開する", data: "action=resume", displayText: "診断を再開する" } }] };
}

module.exports = {
  trackedUrl,
  verifyTracked,
  questionMessage,
  linkCard,
  resultCard,
  worryQuestion,
  worryQuickReply,
  worryAnswer,
  resumeQuickReply,
};
