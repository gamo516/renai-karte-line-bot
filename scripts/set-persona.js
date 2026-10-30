// こたの人物設定をRedisに保存する（全AI生成が読む）。
//   node scripts/set-persona.js          … lib/persona.js の既定値を保存
//   node scripts/set-persona.js show     … 今の設定を表示
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const { Redis } = require("@upstash/redis");
const { DEFAULT, KEY } = require("../lib/persona");
const redis = Redis.fromEnv();
(async () => {
  if (process.argv[2] === "show") return console.log(JSON.stringify(await redis.get(KEY), null, 1));
  await redis.set(KEY, DEFAULT);
  console.log("保存しました:", DEFAULT.canon.length, "項目の設定 /", DEFAULT.rules.length, "個のルール");
})();
