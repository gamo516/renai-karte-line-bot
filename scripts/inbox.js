// 受付箱（スマホのLINEから送られたスクショ・本文）を会社PCで処理するための道具。
// Claude Code が中身を読んで分析し、結果を書き戻す。
//
//   node scripts/inbox.js export <出力フォルダ>       … 受付箱を画像/テキストとして書き出す（manifest.json 付き）
//   node scripts/inbox.js save-refs <refs.json>        … 分析済みの参考投稿を保存（[{text,likes,type,hook,why}]）
//   node scripts/inbox.js send-replies <replies.json>  … 返信案をLINEで送る（[{situation, drafts:[...]}]）
//   node scripts/inbox.js clear <件数>                 … 処理し終えた先頭N件を受付箱から消す
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const INBOX_KEY = "renai-karte:inbox";
const REFS_KEY = "renai-karte:refs";
const ADMINS_KEY = "renai-karte:admins";
const [cmd, arg] = process.argv.slice(2);

async function exportInbox(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const items = await redis.lrange(INBOX_KEY, 0, -1);
  const manifest = items.map((it, i) => {
    const base = `${String(i + 1).padStart(2, "0")}_${it.mode}`;
    let file = null;
    if (it.kind === "image" && it.data) {
      file = `${base}.jpg`;
      fs.writeFileSync(path.join(dir, file), Buffer.from(it.data, "base64"));
    } else if (it.kind === "text") {
      file = `${base}.txt`;
      fs.writeFileSync(path.join(dir, file), it.text);
    }
    return { index: i + 1, mode: it.mode, kind: it.kind, file, receivedAt: it.receivedAt, missingImage: it.kind === "image" && !it.data };
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`書き出し ${manifest.length}件 → ${dir}`);
  for (const m of manifest) console.log(`  ${m.index}. [${m.mode}] ${m.file || "(画像を取得できず)"} ${m.receivedAt}`);
}

async function saveRefs(file) {
  const refs = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const r of refs) await redis.lpush(REFS_KEY, { ...r, savedAt: new Date().toISOString() });
  console.log(`参考投稿を${refs.length}件保存（合計 ${await redis.llen(REFS_KEY)}件）`);
}

// 返信案をまとめて送る。プッシュは1回で吹き出し5つまで＝1通カウントなので、なるべくまとめる
async function sendReplies(file) {
  const replies = JSON.parse(fs.readFileSync(file, "utf8"));
  const admins = await redis.smembers(ADMINS_KEY);
  if (admins.length === 0) throw new Error("管理者が登録されていません");
  const bubbles = [];
  replies.forEach((r, i) => {
    bubbles.push({ type: "text", text: `【${i + 1}】${r.situation}\n\n${r.drafts.map((d, k) => `${k + 1}) ${d}`).join("\n\n")}` });
  });
  const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });
  for (let i = 0; i < bubbles.length; i += 5) {
    const chunk = bubbles.slice(i, i + 5);
    if (i === 0) chunk[0] = { ...chunk[0], text: `返信案です（長押しでコピー）\n\n${chunk[0].text}` };
    for (const to of admins) await client.pushMessage({ to, messages: chunk });
  }
  console.log(`返信案を${replies.length}件送信（プッシュ${Math.ceil(bubbles.length / 5)}回）`);
}

async function clear(n) {
  const count = Number(n);
  if (!count) throw new Error("件数を指定してください");
  await redis.ltrim(INBOX_KEY, count, -1);
  console.log(`先頭${count}件を削除。残り ${await redis.llen(INBOX_KEY)}件`);
}

const jobs = { export: exportInbox, "save-refs": saveRefs, "send-replies": sendReplies, clear };
if (!jobs[cmd] || !arg) {
  console.error("使い方: node scripts/inbox.js export|save-refs|send-replies|clear <引数>");
  process.exit(1);
}
jobs[cmd](arg).catch((e) => {
  console.error("失敗:", e.message || e);
  process.exit(1);
});
