const line = require("@line/bot-sdk");
const stepMessages = require("./stepMessages");
const store = require("./store");

function createClient() {
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}

async function runDailyStepBroadcast(client) {
  const c = client || createClient();
  const today = store.todayISO();
  const users = await store.allUsers();
  console.log(`[cron] ${today} ステップ配信チェック開始。対象候補 ${users.length} 件`);

  for (const user of users) {
    if (!user.finalTag || !user.diagnosisCompletedAt) continue;
    const daysSince = store.daysBetween(user.diagnosisCompletedAt, today);
    if (daysSince < 1 || daysSince > 14) continue;
    if ((user.lastStepDaySent || 0) >= daysSince) continue;

    const content = stepMessages[daysSince];
    const text = typeof content === "string" ? content : content[user.finalTag];
    if (!text) continue;

    try {
      await c.pushMessage({ to: user.userId, messages: [{ type: "text", text }] });
      await store.upsertUser(user.userId, { lastStepDaySent: daysSince });
      console.log(`[cron] Day${daysSince} 送信完了: ${user.userId} (タグ${user.finalTag})`);
    } catch (err) {
      console.error(`[cron] Day${daysSince} 送信失敗: ${user.userId}`, (err && err.message) || err);
    }
  }
}

module.exports = { runDailyStepBroadcast, createClient };
