// Expressサーバーを起動せずに、ステップ配信チェックだけを1回実行するための単体スクリプト。
// 使い方: node run-step-check.js
require("dotenv").config();
const { runDailyStepBroadcast } = require("./lib/stepRunner");

runDailyStepBroadcast()
  .then(() => {
    console.log("[run-step-check] 完了");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[run-step-check] 失敗", err);
    process.exit(1);
  });
