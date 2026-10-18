// 追いLINE・月1配信を手動で1回実行する。
// 使い方: node run-followups.js            … 追いLINE
//         node run-followups.js broadcast  … 月1回の全体配信
require("dotenv").config();
const { runDailyFollowups, runMonthlyBroadcast } = require("./lib/followups");

const job = process.argv[2] === "broadcast" ? runMonthlyBroadcast : runDailyFollowups;
job()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[run-followups] 失敗", err);
    process.exit(1);
  });
