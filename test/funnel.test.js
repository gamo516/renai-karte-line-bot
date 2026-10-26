// LINEファネルのテスト（LINEやRedisには送信しない）。実行: npm test
require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("node:assert");
const questions = require("../lib/questions");
const resultTypes = require("../lib/resultTypes");
const msg = require("../lib/messages");
const { resolveTag } = require("../lib/diagnosis");
const { routeText, AUTO_REPLY_INTERVAL_MS } = require("../lib/textRouter");
const { pickFollowup } = require("../lib/followups");
const { WORRIES } = require("../lib/content");

const UID = "U" + "0123456789abcdef".repeat(2);

test("各設問にA〜Dが1つずつ、ボタン文字は20文字以内", () => {
  questions.forEach((q, i) => {
    assert.deepStrictEqual(q.choices.map((c) => c[1]).sort(), ["A", "B", "C", "D"], `Q${i + 1}`);
    msg.questionMessage(i).quickReply.items.forEach((it, j) => {
      assert.ok(it.action.label.length <= 20, it.action.label);
      assert.ok(it.action.label.startsWith("ABCD"[j] + " "));
      assert.ok(it.action.data.endsWith(`tag=${q.choices[j][1]}`), "ボタンと内部タイプの対応");
    });
  });
});

test("判定：最多のタイプ、同点は後の設問で選んだ方", () => {
  assert.strictEqual(resolveTag({ A: 3, B: 1, C: 1, D: 0 }, ["A", "B", "A", "C", "A"]), "A");
  assert.strictEqual(resolveTag({ A: 2, B: 2, C: 1, D: 0 }, ["A", "B", "C", "A", "B"]), "B");
  assert.strictEqual(resolveTag({ A: 2, B: 2, C: 1, D: 0 }, ["B", "A", "C", "B", "A"]), "A");
  assert.strictEqual(resolveTag({ A: 2, B: 1, C: 2, D: 0 }, ["C", "A", "C", "A", "B"]), "A"); // 最後のBは同点外
});

test("計測リンクにユーザーIDが平文で出ない／正しく復元できる／改ざんは拒否", () => {
  const url = new URL(msg.trackedUrl(UID, "/w/fukuen"));
  assert.ok(!url.href.includes(UID));
  const { u, d, s } = Object.fromEntries(url.searchParams);
  assert.strictEqual(msg.resolveTracked(u, d, s), UID);
  assert.strictEqual(msg.resolveTracked(u, "/w/kataomoi", s), null);
  assert.strictEqual(msg.resolveTracked(u, "/evil", s), null);
  assert.strictEqual(msg.resolveTracked(u.slice(0, -2) + "AA", d, s), null);
});

test("以前に送ったリンク（ユーザーIDそのまま）も使える", () => {
  const legacySig = new URL(msg.trackedUrl(UID, "/t/a")).searchParams.get("s");
  assert.strictEqual(msg.resolveTracked(UID, "/t/a", legacySig), UID);
});

test("結果カードの行動は「悩みのヒント」1つだけ", () => {
  for (const tag of Object.keys(resultTypes)) {
    const btns = msg.resultCard(UID, tag).contents.footer.contents;
    assert.strictEqual(btns.length, 1);
    assert.strictEqual(btns[0].action.type, "postback");
    assert.ok(btns[0].action.data.startsWith("action=askworry"));
  }
});

test("悩み別ヒント：悩みごとのボタン文言＋相談先の選び方（postback）", () => {
  for (const key of Object.keys(WORRIES)) {
    const btns = msg.worryAnswer(UID, key).contents.footer.contents;
    assert.strictEqual(btns[0].action.label, WORRIES[key].cta);
    assert.ok(btns[0].action.label.length <= 20);
    assert.strictEqual(btns[1].action.type, "postback");
  }
});

test("文字の受信：危機 → 診断中 → キーワード → 自由入力（間隔制限）", () => {
  const now = Date.now();
  const done = { userId: UID, finalTag: "A", questionIndex: 5 };
  assert.strictEqual(routeText("もう死にたい", done, { now }).event, "crisis");
  assert.ok(!JSON.stringify(routeText("消えたい", done, { now }).messages).includes("ココナラ"));
  const mid = routeText("えっと", { userId: UID, finalTag: null, questionIndex: 2 }, { now });
  assert.strictEqual(mid.messages[1].text.startsWith("Q3/5"), true);
  assert.strictEqual(mid.patch, null, "診断の状態は変えない");
  assert.strictEqual(routeText("診断", done, { now }).messages, "restart");
  assert.strictEqual(routeText("相性", done, { now }).messages[0].type, "flex");
  const free = routeText("元彼から連絡が来ない", done, { now });
  assert.strictEqual(free.event, "freetext");
  const again = routeText("ねえ", { ...done, lastAutoReplyAt: new Date(now - 60000).toISOString() }, { now });
  assert.strictEqual(again.messages, null, "連続で自動応答しない");
  const later = routeText("ねえ", { ...done, lastAutoReplyAt: new Date(now - AUTO_REPLY_INTERVAL_MS - 1).toISOString() }, { now });
  assert.strictEqual(later.event, "freetext");
  assert.strictEqual(routeText("メモ", done, { now, isAdmin: true }).messages, null);
});

test("追いLINE：診断途中→再開、結果のみ→悩み選択→解説、反応済み・上限は送らない", () => {
  const today = "2026-10-30";
  const inc = pickFollowup({ userId: UID, registeredAt: "2026-10-29", questionIndex: 3, finalTag: null }, today);
  assert.ok(inc.messages[0].text.includes("あと2問"));
  const r1 = pickFollowup({ userId: UID, registeredAt: "2026-10-28", finalTag: "B", diagnosisCompletedAt: "2026-10-29" }, today);
  assert.ok(r1.messages[0].text.includes("平気なふりのがまんタイプ"));
  assert.ok(r1.messages[0].quickReply);
  const r2 = pickFollowup({ userId: UID, finalTag: "B", diagnosisCompletedAt: "2026-10-27", followups: { unclicked: 1 }, lastFollowupAt: "2026-10-28" }, today);
  assert.strictEqual(r2.messages[0].type, "flex");
  assert.strictEqual(pickFollowup({ userId: UID, finalTag: "B", diagnosisCompletedAt: "2026-10-27", worry: "fukuen" }, today), null);
  assert.strictEqual(pickFollowup({ userId: UID, finalTag: "B", diagnosisCompletedAt: "2026-10-20", followups: { unclicked: 2 } }, today), null);
  assert.strictEqual(pickFollowup({ userId: UID, finalTag: "B", diagnosisCompletedAt: "2026-10-27", followups: { unclicked: 1 }, lastFollowupAt: "2026-10-29" }, today), null, "2通目は1通目から2日以上あける");
});
