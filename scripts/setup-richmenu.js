// リッチメニュー（大サイズ 2500x1686・3列x2段）の画像を生成し、LINEに登録してデフォルトに設定する。
// 使い方: node scripts/setup-richmenu.js [--image-only]
// 画像生成に Playwright を使う（PLAYWRIGHT_DIR で node_modules の場所を指定可）。
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const line = require("@line/bot-sdk");

const BASE = (process.env.PUBLIC_BASE_URL || "https://renai-karte-line-bot.onrender.com").replace(/\/$/, "");
const W = 2500, H = 1686, CW = Math.round(W / 3), RH = H / 2;

// 左上から右下の順。右下（いちばん押されやすい位置）に毎日押す理由「今日のひとこと」を置く
const CELLS = [
  { label: "私のタイプ解説", sub: "診断結果をもう一度", icon: "📋", action: { type: "postback", data: "action=mytype", displayText: "私のタイプ解説" } },
  { label: "もう一度診断する", sub: "今の恋愛タイプは？", icon: "🔄", action: { type: "postback", data: "action=restart", displayText: "もう一度診断する" } },
  { label: "タイプ別相性表", sub: "あの人との相性", icon: "💞", action: { type: "uri", uri: `${BASE}/aisho` } },
  { label: "相談先の選び方", sub: "ひとりで抱えこまない", icon: "☎️", action: { type: "uri", uri: `${BASE}/guide` } },
  { label: "お悩み別ヒント", sub: "片思い・復縁・出会い", icon: "💡", action: { type: "postback", data: "action=askworry", displayText: "お悩み別ヒント" } },
  { label: "今日のひとこと", sub: "毎日タップしてね", icon: "🔮", action: { type: "postback", data: "action=hitokoto", displayText: "今日のひとこと" }, highlight: true },
];

function html() {
  const cells = CELLS.map(
    (c) => `<div class="cell${c.highlight ? " hl" : ""}"><div class="icon">${c.icon}</div><div class="label">${c.label}</div><div class="sub">${c.sub}</div></div>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;font-family:"Yu Gothic UI","Meiryo","Hiragino Sans",sans-serif;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);width:100%;height:100%;background:#e9e2f1;gap:6px;}
  .cell{background:#faf7fc;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2b2340;}
  .cell.hl{background:linear-gradient(160deg,#6a3fa0,#4b2a78);color:#fff;}
  .icon{font-size:190px;line-height:1.1;margin-bottom:24px;}
  .label{font-size:104px;font-weight:700;letter-spacing:4px;}
  .sub{font-size:62px;margin-top:18px;color:#8a7fa0;}
  .hl .sub{color:#e6d6a8;}
  </style></head><body><div class="grid">${cells}</div></body></html>`;
}

async function renderImage(out) {
  const pwDir = process.env.PLAYWRIGHT_DIR || path.join(__dirname, "..", "..", "renai-karte-x-bot", "node_modules", "playwright");
  const { chromium } = require(pwDir);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html());
  await page.screenshot({ path: out, type: "jpeg", quality: 85 });
  await browser.close();
  console.log("画像生成:", out, Math.round(fs.statSync(out).size / 1024) + "KB");
}

(async () => {
  const out = path.join(__dirname, "richmenu.jpg");
  await renderImage(out);
  if (process.argv.includes("--image-only")) return;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const api = new line.messagingApi.MessagingApiClient({ channelAccessToken: token });
  const blob = new line.messagingApi.MessagingApiBlobClient({ channelAccessToken: token });

  const areas = CELLS.map((c, i) => ({
    bounds: { x: (i % 3) * CW, y: Math.floor(i / 3) * RH, width: i % 3 === 2 ? W - 2 * CW : CW, height: RH },
    action: c.action,
  }));
  const menu = { size: { width: W, height: H }, selected: true, name: "恋愛カルテ メイン", chatBarText: "メニュー", areas };

  await api.validateRichMenuObject(menu);
  const { richMenuId } = await api.createRichMenu(menu);
  await blob.setRichMenuImage(richMenuId, new Blob([fs.readFileSync(out)], { type: "image/jpeg" }));
  await api.setDefaultRichMenu(richMenuId);
  console.log("リッチメニュー登録・デフォルト設定完了:", richMenuId);

  // 古いメニューを削除
  const { richmenus } = await api.getRichMenuList();
  for (const m of richmenus.filter((m) => m.richMenuId !== richMenuId)) {
    await api.deleteRichMenu(m.richMenuId);
    console.log("旧メニュー削除:", m.richMenuId);
  }
})().catch((e) => {
  console.error("失敗:", e.body || e.message || e);
  process.exit(1);
});
