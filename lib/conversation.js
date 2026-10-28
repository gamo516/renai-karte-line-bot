// 会話の続き：こた（の投稿・リプ）に来た返信へ、こたとして返す文をAIが1つに確定し、
// 「返信画面を開く」付きでLINEに届ける。送信は人間がXで行う（自動返信はしない）。
// 入力は reply-feedback.js が既に取得している「こたへのリプ」をそのまま使う（追加のAPI費用なし）。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Redis } = require("@upstash/redis");
const replyNotify = require("./replyNotify");

const redis = Redis.fromEnv();
const NOTIFIED = "renai-karte:convo-notified";
const MAX_PER_DAY = 5;
const MAX_TURNS = 2; // 同じ相手との往復がこれ以上なら、返すとしても会話を自然に締める
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE || "", ".local", "bin", "claude.exe");

// こたの投稿の本文（リプ先）を取る。手元にあればそれを使い、なければ無料の公開APIで補う
async function postText(id, known) {
  if (known.has(id)) return known.get(id);
  try {
    const j = await fetch(`https://api.fxtwitter.com/i/status/${id}`, { signal: AbortSignal.timeout(20000) }).then((r) => r.json());
    return (j.tweet && j.tweet.text) || null;
  } catch (e) {
    return null;
  }
}

function prompt(items, recent, insights) {
  return `あなたはXアカウント「こた」（@kota_0517）の中の人です。こたに届いた返信に、こたとして返す文を決めてください。

## こた
- 復縁・片思いの相談をたくさん聞いてきたアラサー女性。やわらかいタメ口。説教しない、否定しない、決めつけない
- こた自身の恋愛体験や相談実績は作らない。占い師のふりはしない
- 会話の中でLINE・診断・サービスの宣伝やリンクは絶対に出さない（興味がある人はプロフィールから自分で来る）

## 決め方
1. 返すべきか判断する。返さない（reply:false）: 宣伝・業者・スパム・攻撃的・性的・意味のない内容。命や安全に関わる深刻な内容は reply:false にして crisis:true
2. 返す場合は、内部で案を3つ書き、「相手の言葉をちゃんと受け止めているか／自然なタメ口か／決めつけていないか／AIっぽい定型文でないか／最近の返信と似ていないか」でチェックして1つに確定
3. 往復がすでに${MAX_TURNS}回以上の相手には、質問で引き延ばさず、あたたかく会話を締める一言にする
4. 60字以内。人がスマホで打ったような自然な文。絵文字は1つまで
${insights ? `\n## これまでの反応から分かっている傾向（参考）\n${insights}\n` : ""}
## 最近こたが送った返信（似た言い回しを避ける）
${recent.length ? recent.map((r) => "- " + r).join("\n") : "（まだなし）"}

## 返信が来た会話（${items.length}件）
${items.map((it, i) => `T${i + 1}. [こたとの往復${it.turns}回]\nこたの投稿: ${String(it.kotaText || "（取得できず）").replace(/\n/g, " / ")}\n相手の返信: ${it.text.replace(/\n/g, " / ")}`).join("\n\n")}

## 出力（JSON配列のみ。前置き不要）
{"id":"T番号","reply":true/false,"crisis":true/false,"drafts":["内部案1","内部案2","内部案3"],"check":"直した点・選んだ理由(50字)","final":"最終的な返信文（reply:falseなら空）"}`;
}

// incoming: こたへのリプ（searchRecent の結果）、mine: こたが送ったリプ（同）、me: こたのユーザーID
async function notifyConversations({ incoming, mine, me, dry, log }) {
  const answeredIds = new Set(mine.map((p) => p.inReplyToId).filter(Boolean)); // こたが既に返したもの
  const targets = [];
  for (const p of incoming) {
    if (p.authorId === me || answeredIds.has(p.id)) continue;
    if (await redis.sismember(NOTIFIED, p.id)) continue;
    targets.push(p);
  }
  if (targets.length === 0) return 0;

  const known = new Map(mine.map((p) => [p.id, p.text]));
  const items = [];
  for (const p of targets.slice(0, MAX_PER_DAY * 2)) {
    const turns = mine.filter((m) => m.conversationId === p.conversationId && m.inReplyToUserId === p.authorId).length;
    items.push({ ...p, turns, kotaText: p.inReplyToId ? await postText(p.inReplyToId, known) : null });
  }

  const insights = ((await redis.get("renai-karte:meta:replyInsights")) || {}).summary || "";
  const out = execFileSync(CLAUDE_BIN, ["-p", "--output-format", "text"], {
    input: prompt(items, await replyNotify.recentReplies(), insights),
    encoding: "utf8",
    timeout: 8 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const results = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));

  const picks = [];
  for (const r of results) {
    const it = items[Number(String(r.id).slice(1)) - 1];
    if (!it) continue;
    if (r.crisis) log && log("会話: 深刻な内容のため返信案を作らず（", it.url, "）");
    if (r.reply && r.final) picks.push({ it, r });
  }
  const chosen = picks.slice(0, MAX_PER_DAY);

  if (dry) {
    chosen.forEach(({ it, r }) => log && log("[dry]会話", it.url, "|", it.text.slice(0, 40).replace(/\n/g, " "), "→", r.final, "| チェック:", r.check));
    if (chosen.length) await replyNotify.validate(chosen.map(({ it, r }) => ({ postId: it.id, url: it.url, original: it.text, reply: r.final })), "会話の続き");
    return chosen.length;
  }

  await replyNotify.send(chosen.map(({ it, r }) => ({ postId: it.id, url: it.url, original: it.text, reply: r.final })), "会話の続き");
  for (const { it, r } of chosen) {
    await replyNotify.logDecision({ date: new Date().toISOString().slice(0, 10), source: "conversation", postId: it.id, url: it.url, original: it.text.slice(0, 200), reply: r.final, drafts: r.drafts, check: r.check });
  }
  // 判断したものはすべて既読にする（返さないと決めたものも、毎日同じ判断をしないように）
  for (const it of items) await redis.sadd(NOTIFIED, it.id);
  await redis.expire(NOTIFIED, 30 * 86400);
  return chosen.length;
}

module.exports = { notifyConversations };
