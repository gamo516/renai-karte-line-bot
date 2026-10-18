// 運営者（管理者）だけが使う機能。スマホのLINEから操作する。
// - バズ投稿のスクショ/本文を送る → 分析して参考投稿集に保存（X投稿の自動生成で見本に使う）
// - 自分の投稿に来たリプのスクショを送る → こた口調の返信案を3つ返す
// 一般の友だちには一切影響しない（管理者登録した userId だけが対象）。
const Anthropic = require("@anthropic-ai/sdk");
const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");
const { z } = require("zod");
const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();
const ADMINS_KEY = "renai-karte:admins";
const REFS_KEY = "renai-karte:refs";
const pendingKey = (userId) => `renai-karte:admin-pending:${userId}`;
const MODEL = "claude-opus-5";

const POST_TYPE_KEYS = ["nitaku", "checklist", "watashidake", "kiita", "aruaru", "other"];

const PERSONA = `「こた」：恋愛相談をたくさん聞いてきたアラサー女性。読者の少し先輩・仲のいい友達のような存在。
口調はやわらかいタメ口（「〜だよね」「〜かも」「〜しよ」）。説教しない、上から目線にしない、相手や異性を攻撃しない。
こた自身の具体的な恋愛体験は作らない。企業名・サービス名・URL・LINEへの誘導は書かない。`;

let anthropic = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

async function isAdmin(userId) {
  return Boolean(await redis.sismember(ADMINS_KEY, userId));
}

// 「管理 <コード>」で管理者登録
async function tryRegister(userId, text) {
  const m = text.match(/^管理\s+(\S+)$/);
  if (!m) return null;
  if (!process.env.ADMIN_CODE || m[1] !== process.env.ADMIN_CODE) return "コードが違います。";
  await redis.sadd(ADMINS_KEY, userId);
  return "管理者として登録しました。\n\nバズ投稿のスクショや本文、自分の投稿に来たリプのスクショを送ってください。送ったあとに「参考に保存」か「返信案を作る」を選べます。";
}

async function setPending(userId, item) {
  await redis.set(pendingKey(userId), item, { ex: 60 * 60 });
}

async function takePending(userId) {
  const item = await redis.get(pendingKey(userId));
  if (item) await redis.del(pendingKey(userId));
  return item;
}

function chooseMenu() {
  return {
    type: "text",
    text: "これをどうしますか？",
    quickReply: {
      items: [
        { type: "action", action: { type: "postback", label: "参考に保存", data: "action=admin&mode=ref", displayText: "参考に保存" } },
        { type: "action", action: { type: "postback", label: "返信案を作る", data: "action=admin&mode=reply", displayText: "返信案を作る" } },
      ],
    },
  };
}

// pending（画像 or テキスト）を Claude に渡す content に変換
async function toContent(item, blobClient) {
  if (item.kind === "text") return [{ type: "text", text: `【対象のテキスト】\n${item.text}` }];
  const stream = await blobClient.getMessageContent(item.messageId);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const data = Buffer.concat(chunks).toString("base64");
  return [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }];
}

const RefSchema = z.object({
  text: z.string().describe("投稿本文の文字起こし（改行はそのまま）"),
  likes: z.number().nullable().describe("いいね数。読み取れなければ null"),
  type: z.enum(POST_TYPE_KEYS).describe("型: nitaku=二択・判定 / checklist=保存用リスト / watashidake=私だけ？ / kiita=聞いた話・セリフ / aruaru=あるある・落差 / other=その他"),
  hook: z.string().describe("1行目のつかみが何をしているか（20字程度）"),
  why: z.string().describe("伸びた理由の分析（60字程度）"),
});

async function analyzeReference(content) {
  const res = await client().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: zodOutputFormat(RefSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...content,
          {
            type: "text",
            text: "これはX（旧Twitter）で伸びている恋愛系の投稿（のスクショまたは本文）です。恋愛系アカウントの投稿づくりの参考にするため、本文を文字起こしし、型・1行目のつかみ・伸びた理由を分析してください。スクショにリプ欄なども写っていれば、メインの投稿だけを対象にしてください。",
          },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("分析できませんでした");
  return res.parsed_output;
}

const ReplySchema = z.object({
  situation: z.string().describe("どんなリプが来ているかの要約（30字程度）"),
  drafts: z.array(z.string()).describe("こたとしての返信案3つ。それぞれ60字以内、方向性を変える"),
});

async function draftReplies(content) {
  const res = await client().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: zodOutputFormat(ReplySchema) },
    system: `あなたはXアカウント「こた｜恋の答え合わせ」の中の人です。\n${PERSONA}`,
    messages: [
      {
        role: "user",
        content: [
          ...content,
          {
            type: "text",
            text: "こたの投稿に来たリプライ（のスクショまたは本文）です。こたとして返す返信案を3つ作ってください。\n- 1つ目: 共感して寄り添う\n- 2つ目: 相手にもう一言返したくなる質問で終える（会話を続ける）\n- 3つ目: 短く気の利いたひとこと\nどれも60字以内。相手を否定しない。絵文字は使っても1つまで。",
          },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("返信案を作れませんでした");
  return res.parsed_output;
}

// 管理者が送った画像・テキストを受け付ける。管理者でなければ null を返す（通常処理へ）
async function handleAdminMessage(event) {
  const userId = event.source.userId;
  if (!(await isAdmin(userId))) return null;
  const m = event.message;
  if (m.type === "image") {
    await setPending(userId, { kind: "image", messageId: m.id });
    return [chooseMenu()];
  }
  if (m.type === "text") {
    const text = m.text.trim();
    if (text === "参考一覧") return [await refsSummary()];
    if (text.length < 15) return null; // 短い文字はキーワード応答など通常処理へ
    await setPending(userId, { kind: "text", text });
    return [chooseMenu()];
  }
  return null;
}

// 「参考に保存」「返信案を作る」が押されたとき
async function handleAdminPostback(event, mode, blobClient) {
  const userId = event.source.userId;
  if (!(await isAdmin(userId))) return null;
  if (!client()) return [{ type: "text", text: "AIの設定（ANTHROPIC_API_KEY）がまだのため使えません。" }];
  const item = await takePending(userId);
  if (!item) return [{ type: "text", text: "対象が見つかりません。もう一度スクショか本文を送ってください。" }];

  const content = await toContent(item, blobClient);
  if (mode === "ref") {
    const ref = await analyzeReference(content);
    await redis.lpush(REFS_KEY, { ...ref, savedAt: new Date().toISOString() });
    const count = await redis.llen(REFS_KEY);
    return [
      {
        type: "text",
        text: `参考に保存しました（${count}件目）\n\n■型：${ref.type}\n■つかみ：${ref.hook}\n■伸びた理由：${ref.why}${ref.likes != null ? `\n■いいね：${ref.likes}` : ""}`,
      },
    ];
  }
  const r = await draftReplies(content);
  return [
    { type: "text", text: `返信案です（長押しでコピー）\n状況：${r.situation}` },
    ...r.drafts.slice(0, 3).map((d) => ({ type: "text", text: d })),
  ];
}

async function refsSummary() {
  const count = await redis.llen(REFS_KEY);
  const latest = await redis.lrange(REFS_KEY, 0, 4);
  const lines = latest.map((r, i) => `${i + 1}. [${r.type}] ${String(r.text).replace(/\n/g, " ").slice(0, 30)}…`);
  return { type: "text", text: `参考投稿：${count}件\n\n最新5件\n${lines.join("\n") || "なし"}` };
}

// X投稿の自動生成スクリプト（会社PC）が参考投稿を取りに来るためのAPI
async function listRefs(limit = 50) {
  return redis.lrange(REFS_KEY, 0, limit - 1);
}

module.exports = { tryRegister, handleAdminMessage, handleAdminPostback, listRefs, isAdmin };
