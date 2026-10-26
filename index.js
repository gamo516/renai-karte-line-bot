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
const admin = require("./lib/admin");
const { routeText } = require("./lib/textRouter");
const { resolveTag } = require("./lib/diagnosis");

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

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken,
});

const app = express();

// ヘルスチェック用（ホスティング先の死活監視や動作確認に使う）
app.get("/", (req, res) => res.send("renai-karte-line-bot is running"));

// 公開ページ（タイプ別解説・悩み別ページ・相性表・運営者情報など）
pages.mount(app);

// Xのアイコン・ヘッダー画像（スマホから保存できるように公開）
app.use("/brand", express.static(require("path").join(__dirname, "public", "brand")));

// LINE内リンクの計測用リダイレクト。初回クリック日時を記録してから公開ページへ飛ばす
// 相談ボタン（ASPリンク）のクリック記録。ページ側の sendBeacon から呼ばれる
app.post("/c", async (req, res) => {
  const k = String(req.query.k || "").slice(0, 20);
  const p = String(req.query.p || "").slice(0, 60);
  const pos = /^(mid|end)$/.test(req.query.pos) ? req.query.pos : "end"; // 記事中盤／終盤のどちらのボタンか
  if (/^(fortune|matching)$/.test(k)) {
    try {
      const key = `renai-karte:affclicks:${store.todayISO()}`;
      await store.hincr(key, `${k}|${p}|${pos}`);
    } catch (err) {
      console.error("[c] 記録失敗", (err && err.message) || err);
    }
  }
  res.status(204).end();
});

// X投稿内のLINE誘導リンク。どの投稿から来たか(s)を数えてからLINEの友だち追加へ飛ばす
app.get("/l", async (req, res) => {
  const s = String(req.query.s || "unknown").replace(/[^\w:.-]/g, "").slice(0, 40);
  try {
    await store.hincr(`renai-karte:lineclicks:${store.todayISO()}`, s);
  } catch (err) {
    console.error("[l] 記録失敗", (err && err.message) || err);
  }
  res.redirect(302, "https://line.me/R/ti/p/@549rcswf");
});

app.get("/r", async (req, res) => {
  const { u, d, s } = req.query;
  const userId = msg.resolveTracked(u, d, s);
  if (!userId) return res.redirect(302, "/karte");
  try {
    const user = await store.getUser(userId);
    if (user) {
      if (!user.clickedAt) await store.funnel("page");
      await store.upsertUser(userId, { clickedAt: user.clickedAt || new Date().toISOString(), clicks: (user.clicks || 0) + 1 });
    }
  } catch (err) {
    console.error("[r] 記録失敗", (err && err.message) || err);
  }
  res.redirect(302, d);
});

// 会社PCのX投稿自動生成スクリプトが参考投稿を取得するためのAPI
app.get("/admin/refs", async (req, res) => {
  if (!(await admin.checkCode(req.query.code))) return res.status(403).end();
  res.json(await admin.listRefs());
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
    if (event.type === "message") return await handleMessage(event);
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
    answers: [],
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

  await store.funnel("follow");

  const intro = {
    type: "text",
    text:
      "追加ありがとう、こただよ🌙\n\n" +
      "5つの質問に答えるだけで、恋愛でのあなたの「反応のクセ」がわかる診断をつくったよ。30秒くらいで終わるから、直感で選んでね。\n\n" +
      "結果のあとに、今の悩みに合わせたヒントも返すね。さっそく1問目！",
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
    case "admin":
      return handleAdminAction(event, data.get("mode"));
    case "answer":
      return handleAnswer(event, user, data);
    case "resume":
      if (user.finalTag) return reply(event, [{ type: "text", text: "診断はもう終わってるよ。メニューの「私のタイプ解説」からいつでも見られるからね。" }]);
      return reply(event, [msg.questionMessage(Math.min(user.questionIndex || 0, questions.length - 1))]);
    case "restart":
      await store.upsertUser(userId, freshDiagnosis());
      return reply(event, [{ type: "text", text: "もう一回、今のあなたの恋のクセを答え合わせしよ。" }, msg.questionMessage(0)]);
    case "worry": {
      const key = data.get("w");
      if (!WORRIES[key]) return null;
      await store.upsertUser(userId, { worry: key });
      await store.funnel("worry");
      return reply(event, [msg.worryAnswer(userId, key)]);
    }
    case "askworry":
      await store.funnel("askworry");
      return reply(event, [msg.worryQuestion()]);
    case "consultinfo":
      await store.funnel("consultinfo");
      return reply(event, [msg.consultInfo(userId)]);
    case "mytype":
      if (!user.finalTag) {
        return reply(event, [{ type: "text", text: "まだ診断の途中みたい。続きからいこ！" }, msg.questionMessage(Math.min(user.questionIndex || 0, questions.length - 1))]);
      }
      return reply(event, [msg.typeCard(userId, user.finalTag)]);
    case "hitokoto": {
      const text = HITOKOTO[Math.floor(Math.random() * HITOKOTO.length)];
      return reply(event, [{ type: "text", text: `今日のこたから、ひとこと\n\n${text}` }]);
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
  if (!["A", "B", "C", "D"].includes(tag)) return null; // 不正な値では診断を進めない
  await store.funnel(`q${current + 1}`);
  const tagCounts = Object.assign({ A: 0, B: 0, C: 0, D: 0 }, user.tagCounts);
  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  const answers = [...(user.answers || []), tag];
  const nextIndex = current + 1;

  if (nextIndex < questions.length) {
    await store.upsertUser(userId, { tagCounts, answers, questionIndex: nextIndex });
    return reply(event, [msg.questionMessage(nextIndex)]);
  }

  // 全問回答済み：最終タグを確定
  const finalTag = resolveTag(tagCounts, answers);
  await store.upsertUser(userId, {
    tagCounts,
    answers,
    questionIndex: nextIndex,
    finalTag,
    diagnosisCompletedAt: store.todayISO(),
  });

  await store.funnel("complete");

  // 結果カードの次の行動は「今の悩みに合ったヒントを見る」1つだけ（タイプ解説はリッチメニューから）
  return reply(event, [{ type: "text", text: "おつかれさま！あなたのタイプ、出たよ。" }, msg.resultCard(userId, finalTag)]);
}

// ---------- 管理者機能（受付箱に入れるだけ。処理は会社PCでまとめて行う） ----------
async function handleAdminAction(event, mode) {
  const messages = await admin.handleAdminPostback(event, mode);
  return messages ? reply(event, messages) : null;
}

// ---------- メッセージ受信 ----------
async function handleMessage(event) {
  if (event.message.type === "text") {
    const registered = await admin.tryRegister(event.source.userId, event.message.text.trim());
    if (registered) return reply(event, [{ type: "text", text: registered }]);
  }
  const adminReply = await admin.handleAdminMessage(event, blobClient);
  if (adminReply) return reply(event, adminReply);
  if (event.message.type === "text") return handleText(event);
  return null;
}

// ---------- 文字の受信（すべてreplyなので通数0）。返し方は lib/textRouter.js ----------
async function handleText(event) {
  const userId = event.source.userId;
  const user = (await store.getUser(userId)) || (await store.upsertUser(userId, {}));
  const r = routeText(event.message.text, user, { isAdmin: await admin.isAdmin(userId) });
  if (r.event) await store.funnel(r.event);
  if (r.messages === "restart") {
    await store.upsertUser(userId, freshDiagnosis());
    return reply(event, [msg.questionMessage(0)]);
  }
  if (r.patch) await store.upsertUser(userId, r.patch);
  return r.messages ? reply(event, r.messages) : null;
}

// 未反応者への追いLINE：毎日21時（JST）
cron.schedule("0 21 * * *", () => runDailyFollowups(client).catch((e) => console.error("[followup]", e)), { timezone: "Asia/Tokyo" });
// 月1回の全体配信：毎月5日20時（JST）
cron.schedule("0 20 5 * *", () => runMonthlyBroadcast(client).catch((e) => console.error("[broadcast]", e)), { timezone: "Asia/Tokyo" });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`恋愛カルテ LINE bot listening on port ${port}`);
});
