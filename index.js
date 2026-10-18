require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const cron = require("node-cron");

const questions = require("./lib/questions");
const store = require("./lib/store");
const pages = require("./lib/pages");
const msg = require("./lib/messages");
const { WORRIES, HITOKOTO } = require("./lib/content");
const { runDailyFollowups, runMonthlyBroadcast } = require("./lib/followups");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!config.channelAccessToken || !config.channelSecret) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET が .env に設定されていません。");
  process.exit(1);
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const app = express();

// ヘルスチェック用（ホスティング先の死活監視や動作確認に使う）
app.get("/", (req, res) => res.send("renai-karte-line-bot is running"));

// 公開ページ（タイプ別解説・悩み別ページ・相性表・運営者情報など）
pages.mount(app);

// LINE内リンクの計測用リダイレクト。初回クリック日時を記録してから公開ページへ飛ばす
app.get("/r", async (req, res) => {
  const { u, d, s } = req.query;
  if (!msg.verifyTracked(u, d, s)) return res.redirect(302, "/karte");
  try {
    const user = await store.getUser(u);
    if (user) {
      await store.upsertUser(u, { clickedAt: user.clickedAt || new Date().toISOString(), clicks: (user.clicks || 0) + 1 });
    }
  } catch (err) {
    console.error("[r] 記録失敗", (err && err.message) || err);
  }
  res.redirect(302, d);
});

app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all((req.body.events || []).map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error("[webhook] error handling events", err);
      res.status(200).end(); // LINEには常に200を返す（再送ループを防ぐ）
    });
});

async function handleEvent(event) {
  try {
    if (event.type === "follow") return await handleFollow(event);
    if (event.type === "unfollow") return await store.upsertUser(event.source.userId, { blocked: true });
    if (event.type === "postback") return await handlePostback(event);
    if (event.type === "message" && event.message.type === "text") return await handleText(event);
    return null;
  } catch (err) {
    console.error("[handleEvent] error", event.type, err);
    return null;
  }
}

function reply(event, messages) {
  return client.replyMessage({ replyToken: event.replyToken, messages });
}

function freshDiagnosis() {
  return {
    questionIndex: 0,
    tagCounts: { A: 0, B: 0, C: 0, D: 0 },
    finalTag: null,
    diagnosisCompletedAt: null,
  };
}

// ---------- 友だち追加：あいさつ→そのまま1問目（すべてreplyなので通数0） ----------
async function handleFollow(event) {
  const userId = event.source.userId;
  const existing = await store.getUser(userId);
  await store.upsertUser(userId, {
    ...freshDiagnosis(),
    registeredAt: existing ? existing.registeredAt : store.todayISO(),
    blocked: false,
  });

  const intro = {
    type: "text",
    text:
      "友だち追加ありがとうございます、恋愛カルテです。\n\n" +
      "5つの質問・30秒で、あなたの恋愛タイプと「恋のクセ」がわかります。\n\n" +
      "診断を終えた方には、タイプ別の「恋のクセ解説」をプレゼントしています。\n\n" +
      "直感で答えてOKです。さっそく1問目からどうぞ。",
  };
  return reply(event, [intro, msg.questionMessage(0)]);
}

// ---------- ボタン操作（診断回答・悩み選択・リッチメニュー） ----------
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");
  const user = (await store.getUser(userId)) || (await store.upsertUser(userId, {}));

  switch (action) {
    case "answer":
      return handleAnswer(event, user, data);
    case "resume":
      if (user.finalTag) return reply(event, [{ type: "text", text: "診断はもう完了しています。メニューの「私のタイプ解説」から結果を見られます。" }]);
      return reply(event, [msg.questionMessage(Math.min(user.questionIndex || 0, questions.length - 1))]);
    case "restart":
      await store.upsertUser(userId, freshDiagnosis());
      return reply(event, [{ type: "text", text: "もう一度、今のあなたの恋愛タイプを答え合わせしましょう。" }, msg.questionMessage(0)]);
    case "worry": {
      const key = data.get("w");
      if (!WORRIES[key]) return null;
      await store.upsertUser(userId, { worry: key });
      return reply(event, [msg.worryAnswer(userId, key)]);
    }
    case "askworry":
      return reply(event, [msg.worryQuestion("今いちばん気になっている恋愛の悩みはどれですか？")]);
    case "mytype":
      if (!user.finalTag) {
        return reply(event, [{ type: "text", text: "まだ診断が終わっていないようです。続きからどうぞ。" }, msg.questionMessage(Math.min(user.questionIndex || 0, questions.length - 1))]);
      }
      return reply(event, [msg.resultCard(userId, user.finalTag)]);
    case "hitokoto": {
      const text = HITOKOTO[Math.floor(Math.random() * HITOKOTO.length)];
      return reply(event, [{ type: "text", text: `今日のひとこと\n\n${text}` }]);
    }
    default:
      return null;
  }
}

async function handleAnswer(event, user, data) {
  const userId = user.userId;
  const current = user.questionIndex || 0;
  const q = data.get("q");
  // 古いボタンの二度押しなどで、別の問題への回答が来たら無視する
  if (user.finalTag || (q !== null && Number(q) !== current)) return null;

  const tag = data.get("tag");
  const tagCounts = Object.assign({ A: 0, B: 0, C: 0, D: 0 }, user.tagCounts);
  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  const nextIndex = current + 1;

  if (nextIndex < questions.length) {
    await store.upsertUser(userId, { tagCounts, questionIndex: nextIndex });
    return reply(event, [msg.questionMessage(nextIndex)]);
  }

  // 全問回答済み：最終タグを確定（同数の場合はA>B>C>Dの優先順）
  const finalTag = resolveTag(tagCounts);
  await store.upsertUser(userId, {
    tagCounts,
    questionIndex: nextIndex,
    finalTag,
    diagnosisCompletedAt: store.todayISO(),
  });

  return reply(event, [
    { type: "text", text: "お疲れさまでした！あなたの恋愛タイプが出ました。" },
    msg.resultCard(userId, finalTag),
    msg.worryQuestion(),
  ]);
}

function resolveTag(tagCounts) {
  const order = ["A", "B", "C", "D"];
  let best = order[0];
  for (const t of order) {
    if (tagCounts[t] > tagCounts[best]) best = t;
  }
  return best;
}

// ---------- キーワード応答（通数0） ----------
async function handleText(event) {
  const text = (event.message.text || "").trim();
  const userId = event.source.userId;
  if (/相性/.test(text)) {
    return reply(event, [msg.linkCard("タイプ別相性表", "タイプ別相性表", "4つの恋愛タイプ同士の相性をまとめました。", "相性表を見る", msg.trackedUrl(userId, "/aisho"))]);
  }
  if (/^(カルテ|診断|再診断)$/.test(text)) {
    await store.upsertUser(userId, freshDiagnosis());
    return reply(event, [msg.questionMessage(0)]);
  }
  return null; // それ以外は個別の相談として、手動対応用に残す
}

// 未反応者への追いLINE：毎日21時（JST）
cron.schedule("0 21 * * *", () => runDailyFollowups(client).catch((e) => console.error("[followup]", e)), { timezone: "Asia/Tokyo" });
// 月1回の全体配信：毎月5日20時（JST）
cron.schedule("0 20 5 * *", () => runMonthlyBroadcast(client).catch((e) => console.error("[broadcast]", e)), { timezone: "Asia/Tokyo" });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`恋愛カルテ LINE bot listening on port ${port}`);
});
