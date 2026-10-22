// 公開ページの相談ボタンに使うアフィリエイトリンクを設定する（5分以内に本番へ反映）。
//   node scripts/set-aff.js fortune "https://px.a8.net/svt/ejp?a8mat=..."   … 電話占い
//   node scripts/set-aff.js matching "<URL>"                                  … マッチングアプリ
//   node scripts/set-aff.js fortune ""                                        … 外す（ボタン非表示）
//   node scripts/set-aff.js show                                              … 今の設定を表示
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const store = require("../lib/store");

(async () => {
  const [kind, url] = process.argv.slice(2);
  const current = (await store.getMeta("affUrls")) || {};
  if (kind === "show") return console.log(current);
  if (!["fortune", "matching"].includes(kind) || url === undefined) {
    console.error('使い方: node scripts/set-aff.js fortune|matching "<URL>"  /  node scripts/set-aff.js show');
    process.exit(1);
  }
  if (url && !/^https:\/\//.test(url)) throw new Error("https:// で始まるURLを指定してください");
  await store.setMeta("affUrls", { ...current, [kind]: url });
  console.log("設定しました:", { ...current, [kind]: url });
})().catch((e) => {
  console.error("失敗:", e.message || e);
  process.exit(1);
});
