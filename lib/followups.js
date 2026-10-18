// 未反応者への追いLINE（毎日21時）と、月1回の全体配信。
// どちらもプッシュ＝無料プランの月200通にカウントされるため、送る前に残り通数を確認する。
const line = require("@line/bot-sdk");
const store = require("./store");
const questions = require("./questions");
const msg = require("./messages");
const { FOLLOWUPS, MONTHLY } = require("./content");

// この日以降に登録した人だけを追いLINEの対象にする（旧14日間配信の利用者は対象外）
const FOLLOWUP_START = "2026-10-18";
// 追いLINE用に残しておく通数（全体配信はこれを割り込まないときだけ送る）
const RESERVE_FOR_FOLLOWUPS = 40;

function createClient() {
  return new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
}

async function remainingQuota(c) {
  try {
    const quota = await c.getMessageQuota();
    if (quota.type !== "limited") return Infinity;
    const used = await c.getMessageQuotaConsumption();
    return quota.value - used.totalUsage;
  } catch (err) {
    console.error("[quota] 取得失敗", (err && err.message) || err);
    return 0; // 分からないときは送らない
  }
}

// 1通目は起点から1日後、2通目は1通目から2日以上あけて（起点から3日後以降）
function isDue(step, sinceStart, user, today) {
  if (step >= 2) return false;
  if (step === 0) return sinceStart >= 1;
  return sinceStart >= 3 && (!user.lastFollowupAt || store.daysBetween(user.lastFollowupAt, today) >= 2);
}

// その人に今日送るべき追いLINEを返す（不要なら null）
function pickFollowup(user, today) {
  const f = Object.assign({ incomplete: 0, unclicked: 0 }, user.followups);

  // 診断を途中でやめた人
  if (!user.finalTag) {
    const step = f.incomplete;
    if (!isDue(step, store.daysBetween(user.registeredAt, today), user, today)) return null;
    const remaining = questions.length - (user.questionIndex || 0);
    return {
      kind: "incomplete",
      messages: [
        { type: "text", text: FOLLOWUPS.incomplete[step](remaining), quickReply: msg.resumeQuickReply() },
      ],
    };
  }

  // 結果は見たが、ページも悩みも反応なしの人
  if (user.clickedAt || user.worry) return null;
  const step = f.unclicked;
  if (!isDue(step, store.daysBetween(user.diagnosisCompletedAt, today), user, today)) return null;
  if (step === 0) {
    return {
      kind: "unclicked",
      messages: [
        msg.linkCard(
          "あなたのタイプがつまずきやすいこと",
          null,
          FOLLOWUPS.unclicked[user.finalTag][0],
          "解説ページを見る",
          msg.trackedUrl(user.userId, `/t/${user.finalTag.toLowerCase()}`)
        ),
      ],
    };
  }
  return { kind: "unclicked", messages: [msg.worryQuestion(FOLLOWUPS.askWorry)] };
}

async function runDailyFollowups(client) {
  const c = client || createClient();
  const today = store.todayISO();
  const users = (await store.allUsers()).filter((u) => !u.blocked && u.registeredAt >= FOLLOWUP_START);
  let remaining = await remainingQuota(c);
  console.log(`[followup] ${today} 対象候補 ${users.length} 件 / 残り通数 ${remaining}`);

  for (const user of users) {
    const plan = pickFollowup(user, today);
    if (!plan) continue;
    if (remaining < 1) {
      console.log("[followup] 残り通数がないため中断");
      break;
    }
    try {
      await c.pushMessage({ to: user.userId, messages: plan.messages });
      const f = Object.assign({ incomplete: 0, unclicked: 0 }, user.followups);
      f[plan.kind] += 1;
      await store.upsertUser(user.userId, { followups: f, lastFollowupAt: today });
      remaining -= 1;
      console.log(`[followup] ${plan.kind}#${f[plan.kind]} 送信: ${user.userId}`);
    } catch (err) {
      console.error(`[followup] 送信失敗: ${user.userId}`, (err && err.message) || err);
    }
  }
}

// 月1回の全体配信。友だち全員分の通数を使うので、追いLINE用の枠を残せないときはスキップ
async function runMonthlyBroadcast(client) {
  const c = client || createClient();
  const month = store.todayISO().slice(0, 7);
  if ((await store.getMeta("lastBroadcastMonth")) === month) return console.log("[broadcast] 今月は送信済み");

  const audience = (await store.allUsers()).filter((u) => !u.blocked).length;
  const remaining = await remainingQuota(c);
  if (remaining - audience < RESERVE_FOR_FOLLOWUPS) {
    return console.log(`[broadcast] スキップ（残り${remaining}通 / 必要${audience}通 / 予備${RESERVE_FOR_FOLLOWUPS}通）`);
  }

  const index = Number((await store.getMeta("broadcastIndex")) || 0);
  const item = MONTHLY[index % MONTHLY.length];
  await c.broadcast({ messages: [{ type: "text", text: item.text }] });
  await store.setMeta("broadcastIndex", index + 1);
  await store.setMeta("lastBroadcastMonth", month);
  console.log(`[broadcast] 送信完了 #${index + 1}（約${audience}通）`);
}

module.exports = { runDailyFollowups, runMonthlyBroadcast, pickFollowup, createClient };
