require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const cron = require("node-cron");

const questions = require("./lib/questions");
const resultTypes = require("./lib/resultTypes");
const store = require("./lib/store");
const { runDailyStepBroadcast } = require("./lib/stepRunner");
const pages = require("./lib/pages");

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

// ヘルスチェック用（ホスティング先の death監視や動作確認に使う）
app.get("/", (req, res) => res.send("renai-karte-line-bot is running"));

// 公開ページ（タイプ別解説・運営者情報・プライバシーポリシー）
pages.mount(app);

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
    if (event.type === "follow") {
      return await handleFollow(event);
    }
    if (event.type === "postback") {
      return await handlePostback(event);
    }
    // message等その他のイベントは今回は未対応（必要になったら追加）
    return null;
  } catch (err) {
    console.error("[handleEvent] error", event.type, err);
    return null;
  }
}

// ---------- 友だち追加：診断スタート ----------
async function handleFollow(event) {
  const userId = event.source.userId;
  await store.upsertUser(userId, {
    registeredAt: store.todayISO(),
    questionIndex: 0,
    tagCounts: { A: 0, B: 0, C: 0, D: 0 },
    finalTag: null,
    diagnosisCompletedAt: null,
    lastStepDaySent: 0,
  });

  const intro = {
    type: "text",
    text:
      "最初に、あなたの「恋愛タイプ診断」をお届けします。\n\n" +
      "5つの質問に答えるだけで、あなたが恋愛でどんなクセを持っているか、何に悩みやすいかがわかります。\n\n" +
      "所要時間は1〜2分ほどです。",
  };
  const start = {
    type: "text",
    text:
      "それでは、恋愛タイプ診断をはじめます。\n\n" +
      "直感で答えてOKです。「これが正解」というものはないので、リラックスして答えてくださいね。",
  };
  const q1 = buildQuestionMessage(questions[0], 0);

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [intro, start, q1],
  });
}

// ---------- 診断の回答（ポストバック） ----------
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");

  if (action !== "answer") return null;

  const tag = data.get("tag");
  const user = (await store.getUser(userId)) || (await store.upsertUser(userId, {}));
  const tagCounts = Object.assign({ A: 0, B: 0, C: 0, D: 0 }, user.tagCounts);
  tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  const nextIndex = (user.questionIndex || 0) + 1;

  if (nextIndex < questions.length) {
    await store.upsertUser(userId, { tagCounts, questionIndex: nextIndex });
    const nextQ = buildQuestionMessage(questions[nextIndex], nextIndex);
    return client.replyMessage({ replyToken: event.replyToken, messages: [nextQ] });
  }

  // 全問回答済み：最終タグを確定（同数の場合はA>B>C>Dの優先順）
  const finalTag = resolveTag(tagCounts);
  await store.upsertUser(userId, {
    tagCounts,
    questionIndex: nextIndex,
    finalTag,
    diagnosisCompletedAt: store.todayISO(),
    lastStepDaySent: 0,
  });

  const endMsg = {
    type: "text",
    text:
      "お疲れさまでした、全問回答ありがとうございます。\n\n" +
      "当たっていた部分、意外だった部分、両方あるかもしれません。診断は「これが正解」ではなく、自分を知るためのきっかけです。\n\n" +
      "明日から、あなたのタイプに合わせた話を少しずつお届けしていきますね。",
  };
  const resultMsg = {
    type: "text",
    text: resultTypes.formatResultMessage(finalTag, resultTypes[finalTag]),
  };

  return client.replyMessage({ replyToken: event.replyToken, messages: [endMsg, resultMsg] });
}

function resolveTag(tagCounts) {
  const order = ["A", "B", "C", "D"];
  let best = order[0];
  for (const t of order) {
    if (tagCounts[t] > tagCounts[best]) best = t;
  }
  return best;
}

function buildQuestionMessage(question, index) {
  const letters = ["A", "B", "C", "D"];
  const lines = [`Q${index + 1}. ${question.q}`, ""];
  question.choices.forEach((choice, i) => lines.push(`${letters[i]}. ${choice[0]}`));

  return {
    type: "text",
    text: lines.join("\n"),
    quickReply: {
      items: question.choices.map((choice, i) => ({
        type: "action",
        action: {
          type: "postback",
          label: letters[i],
          data: `action=answer&tag=${choice[1]}`,
          displayText: letters[i],
        },
      })),
    },
  };
}

// 毎日9:00（サーバーのローカルタイムゾーン基準）に実行。
// クラウドにデプロイする場合、サーバーがUTCだと9:00 JST = 0:00 UTCになる点に注意。
cron.schedule("0 9 * * *", () => runDailyStepBroadcast(client));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`恋愛カルテ LINE bot listening on port ${port}`);
});
