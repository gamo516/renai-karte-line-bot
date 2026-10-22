// 公開Webページ（タイプ別解説・運営者情報・プライバシーポリシー）。
// LINE内ではアフィリエイトリンクを貼れないため、診断結果→このページ→外部サービス の導線にする。
// アフィリエイトリンクは環境変数で差し込む（未設定なら相談ブロック自体を表示しない）。

const SITE_NAME = "恋愛カルテ｜恋の答え合わせ";
const X_URL = "https://x.com/kota_0517";
const LINE_ADD_URL = "https://line.me/R/ti/p/@549rcswf";

// タイプ別ページの中身。キーはLINE診断のタグ(A〜D)を小文字にしたもの
const TYPES = {
  "a": {
    "tag": "A",
    "name": "想いがあふれる一途タイプ",
    "catch": "好きになったら、まっすぐ全力。愛情が深いぶん、不安も大きくなりやすい人",
    "sections": [
      [
        "どんなタイプ？",
        "好きな人ができると、その人のことで頭がいっぱいになるタイプです。彼の小さな変化にもすぐ気づける感受性と、まっすぐな愛情を持っています。その一方で、彼の反応ひとつで気持ちが大きく揺れやすいのも特徴です。"
      ],
      [
        "わかっていても、やってしまうこと",
        "返信がいつもより遅いだけで不安になり、「忙しい？」と送ろうか何度も文面を打っては消す。彼のストーリーやSNSを何度も見返してしまう。不安を打ち消したくて連絡を重ねた結果、彼が少し距離を取り、さらに不安になる。そんな「追うほど遠ざかる」流れに入りやすいタイプです。"
      ],
      [
        "恋のクセとの付き合い方",
        "あなたの不安は、愛情が深い証拠です。消そうとしなくて大丈夫。大切なのは、不安を感じたときに「すぐ行動する」のではなく、ひと呼吸おくこと。送りたくなったら、まず下書きに保存して1時間置いてみてください。1時間後も送りたい内容だけを送るようにすると、関係の温度が安定しやすくなります。"
      ],
      [
        "今日からできること",
        "不安になったときに、彼以外で気持ちを向けられる場所を1つ持つことです。友達、趣味、そして客観的に話を聞いてくれる人。気持ちの逃がし先があるだけで、彼への連絡は「不安だから」ではなく「話したいから」に変わっていきます。"
      ]
    ],
    "consult": "fortune",
    "consultLead": "不安で動いてしまいそうなときは、送る前に第三者の目を借りるのもひとつの方法です。恋愛相談に強い電話占いなら、今の彼の気持ちやタイミングについて、客観的な見立てを聞けます。初回は無料で話せるところもあります。"
  },
  "b": {
    "tag": "B",
    "name": "平気なふりのがまんタイプ",
    "catch": "相手を困らせたくなくて、本音をしまいこんでしまう、やさしい人",
    "sections": [
      [
        "どんなタイプ？",
        "相手の気持ちを優先して、いつも物わかりのいい自分でいようとするタイプです。わがままを言わない、重いと思われたくない。そんなやさしさと気づかいが、あなたの魅力です。"
      ],
      [
        "わかっていても、やってしまうこと",
        "本当は寂しいのに「全然大丈夫だよ」と笑ってしまう。気になることがあっても、見なかったことにしてやり過ごす。けれど翌朝、また彼のSNSを開いている。がまんを重ねた結果、ある日ぷつっと気持ちが切れてしまったり、彼から「何を考えているかわからない」と言われてしまったりすることもあります。"
      ],
      [
        "恋のクセとの付き合い方",
        "本音を全部ぶつける必要はありません。まずは小さな本音から練習してみてください。「ちょっと寂しかった」「それ、少し気になってた」くらいの短い言葉で十分です。小さく伝えて受け止めてもらえる経験が増えると、がまんしなくても関係は壊れないと実感できるようになります。"
      ],
      [
        "今日からできること",
        "がまんしていることを1つだけ書き出してみてください。書き出すだけで、自分が本当は何を求めているのかが見えてきます。そして、その本音を安心して話せる相手を持つこと。彼に言えない気持ちを外に出せる場所があると、心がずっと軽くなります。"
      ]
    ],
    "consult": "fortune",
    "consultLead": "彼にも友達にも言えない本音は、利害関係のない第三者になら話しやすいものです。恋愛相談に強い電話占いで、しまいこんでいた気持ちを言葉にしてみるのもひとつの方法です。初回は無料で話せるところもあります。"
  },
  "c": {
    "tag": "C",
    "name": "ひとりで抱える強がりタイプ",
    "catch": "自分の足で立てるしっかり者。だからこそ、弱さを見せるのが少し苦手な人",
    "sections": [
      [
        "どんなタイプ？",
        "自立していて、感情に振り回されずに自分の生活を守れるタイプです。人に頼るより、自分でなんとかしようとする強さを持っています。"
      ],
      [
        "わかっていても、やってしまうこと",
        "彼の態度が少し冷たくなった気がすると、傷つく前に自分から距離を置いてしまう。「別にもういいし」と冷めたふりをするけれど、本当はまだ気持ちが残っている。相手から見ると「もう気持ちがないのかな」と映ってしまい、すれ違ったまま終わってしまうことがあります。"
      ],
      [
        "恋のクセとの付き合い方",
        "先に引くのは、自分を守るための大切な力です。ただ、引く前に一度だけ「本当はどうしたい？」と自分に聞いてみてください。終わらせたいのか、本当は戻りたいのか。その答えがわかるだけで、距離の取り方が変わります。"
      ],
      [
        "今日からできること",
        "強がらなくていい相手を1人持つことです。弱音を吐ける場所があると、彼の前でも少しだけ素直になれます。自分ひとりで抱えてきた気持ちを、一度誰かに話してみてください。"
      ]
    ],
    "consult": "fortune",
    "consultLead": "ひとりで抱えてきた気持ちは、誰かに話すことで初めて整理できることがあります。恋愛相談に強い電話占いで、本当はどうしたいのかを一緒に整理してみるのもひとつの方法です。初回は無料で話せるところもあります。"
  },
  "d": {
    "tag": "D",
    "name": "考えすぎる分析タイプ",
    "catch": "状況をよく見て冷静に考えられる人。でも、考えているうちに動けなくなることも",
    "sections": [
      [
        "どんなタイプ？",
        "感情だけで動かず、状況をよく観察して考えられる慎重なタイプです。彼の言葉や行動から、いろいろなことに気づける力を持っています。"
      ],
      [
        "わかっていても、やってしまうこと",
        "彼のLINEの文面、返信の間隔、最近の様子。いろいろな材料を集めて分析し、答えが出るまで動けない。「たぶんこういうことだと思う」と仮説は立てられるのに、確信が持てないまま時間だけが過ぎて、動くタイミングを逃してしまうことがあります。"
      ],
      [
        "恋のクセとの付き合い方",
        "恋愛は、どれだけ分析しても答えが出ないことがあります。彼自身も、自分の気持ちがはっきりしていないことがあるからです。「答えが出てから動く」のではなく、「小さく動いて反応を見る」に切り替えてみてください。短いLINEを1通送ってみるだけでも、考えるより多くのことが分かります。"
      ],
      [
        "今日からできること",
        "考えた仮説を、一度誰かに聞いてもらうことです。自分の中だけで回していると、同じところをぐるぐるしがち。外からの視点が入ると、迷っていたことにあっさり答えが出ることもあります。"
      ]
    ],
    "consult": "fortune",
    "consultLead": "考えても答えが出ないときは、恋愛相談に強い電話占いで、プロの見立てを聞いてみるのもひとつの方法です。彼の気持ちや動くタイミングについて、自分では気づけなかった視点がもらえます。初回は無料で話せるところもあります。"
  }
};

const CONSULT_LABEL = {
  fortune: "恋愛相談できる電話占いを見てみる",
  matching: "価値観で出会えるマッチングアプリを見てみる",
};

// アフィリエイトリンクは Redis（renai-karte:meta:affUrls = {fortune, matching}）から読む。
// 会社PCから書き換えれば、再デプロイなしで5分以内に反映される。環境変数があればそちらを優先。
let affUrls = {};
async function refreshAffUrls() {
  try {
    const store = require("./store");
    affUrls = (await store.getMeta("affUrls")) || {};
  } catch (err) {
    console.error("[pages] アフィリンクの読み込み失敗", (err && err.message) || err);
  }
}
refreshAffUrls();
setInterval(refreshAffUrls, 5 * 60 * 1000).unref();

function affiliateUrl(kind) {
  if (kind === "fortune") return process.env.AFF_URL_FORTUNE || affUrls.fortune || "";
  if (kind === "matching") return process.env.AFF_URL_MATCHING || affUrls.matching || "";
  return "";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function layout({ title, description, body, isPromo }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<style>
  :root { --ink:#2b2340; --sub:#6b6280; --bg:#faf7fc; --card:#fff; --accent:#6a3fa0; --gold:#b8955a; --line:#e9e2f1; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif; color:var(--ink); background:var(--bg); line-height:1.85; font-size:16px; }
  .wrap { max-width:640px; margin:0 auto; padding:24px 18px 48px; }
  .promo { font-size:12px; color:var(--sub); margin-bottom:12px; }
  header.site { font-size:13px; letter-spacing:.08em; color:var(--accent); font-weight:700; margin-bottom:20px; }
  header.site a { color:inherit; text-decoration:none; }
  h1 { font-size:24px; line-height:1.45; margin:0 0 8px; }
  .catch { color:var(--gold); font-weight:700; margin:0 0 28px; }
  h2 { font-size:18px; margin:32px 0 8px; padding-left:10px; border-left:4px solid var(--accent); }
  p { margin:0 0 12px; }
  .consult { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-top:36px; }
  .consult h2 { margin-top:0; }
  .btn { display:block; text-align:center; background:var(--accent); color:#fff; text-decoration:none; font-weight:700; padding:14px 16px; border-radius:999px; margin-top:12px; }
  .note { font-size:12px; color:var(--sub); margin-top:10px; }
  .types a { display:block; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:10px; color:var(--ink); text-decoration:none; }
  footer { margin-top:48px; padding-top:16px; border-top:1px solid var(--line); font-size:12px; color:var(--sub); }
  footer a { color:var(--sub); margin-right:14px; }
</style>
</head>
<body>
<div class="wrap">
${isPromo ? '<div class="promo">※本ページはプロモーションを含みます</div>' : ""}
<header class="site"><a href="/karte">${esc(SITE_NAME)}</a></header>
${body}
<section class="consult" style="text-align:center">
  <p style="margin:0"><strong>5つの質問・30秒でわかる</strong><br>あなたの恋愛タイプ診断（無料）</p>
  <a class="btn" href="${LINE_ADD_URL}" style="background:#06C755">LINEで診断してみる</a>
</section>
<footer>
  <a href="/karte">タイプ一覧</a><a href="/about">運営者情報</a><a href="/privacy">プライバシーポリシー</a><a href="${X_URL}">X</a>
  <p style="margin-top:10px">© 恋愛カルテ編集部</p>
</footer>
</div>
</body>
</html>`;
}

// 相談先への案内ブロック（アフィリエイトリンク未設定なら空）
function consultBlock(kind, lead) {
  const url = affiliateUrl(kind);
  if (!url) return "";
  return `<section class="consult">
  <h2>ひとりで抱えこまないで</h2>
  <p>${esc(lead)}</p>
  <a class="btn" href="${esc(url)}" rel="sponsored noopener" target="_blank">${esc(CONSULT_LABEL[kind])}</a>
  <p class="note">※外部サービスのページに移動します。料金・条件は移動先でご確認ください。</p>
</section>`;
}

function sectionsHtml(sections) {
  return sections.map(([h, p]) => `<h2>${esc(h)}</h2>\n<p>${esc(p)}</p>`).join("\n");
}

function typePage(key) {
  const t = TYPES[key];
  if (!t) return null;
  const body = `<h1>${esc(t.name)}</h1>
<p class="catch">${esc(t.catch)}</p>
${sectionsHtml(t.sections)}
${consultBlock(t.consult, t.consultLead)}
<p style="margin-top:28px"><a href="/aisho">▶ タイプ別の相性表も見る</a></p>
<p class="note">※この診断は、恋愛の傾向を楽しむためのコンテンツです。</p>`;
  return layout({
    title: `${t.name}｜${SITE_NAME}`,
    description: `恋愛タイプ診断「${t.name}」の解説。${t.catch}。恋のクセと、今日からできること。`,
    body,
    isPromo: Boolean(affiliateUrl(t.consult)),
  });
}

// 悩み別ページ（LINEで悩みを選んだ人の誘導先）
const WORRY_PAGES = {
  "fukuen": {
    "title": "復縁したいと思ったら、連絡する前に考えたいこと",
    "sections": [
      [
        "すぐに連絡したくなる気持ちは自然なこと",
        "別れた直後や、ふと思い出した夜ほど、連絡したい気持ちは強くなります。その気持ちを否定する必要はありません。ただ、焦って送ったメッセージは、前と同じ結果を招きやすいのも事実です。"
      ],
      [
        "別れた理由を、自分の言葉で説明できる？",
        "「なんとなく合わなくなった」ではなく、何がきっかけで、どんなすれ違いがあったのか。自分の言葉で説明できるようになると、復縁したい理由が「寂しさ」なのか「この人とやり直したい」なのかも見えてきます。"
      ],
      [
        "同じことが起きたら、どうする？",
        "復縁がうまくいく人は、別れの原因になった出来事に対して「次はこうする」が決まっています。ここが決まっていれば、連絡するときの言葉も自然と変わってきます。"
      ],
      [
        "ひとりで抱えこまない",
        "復縁の悩みは、周りに話すと「やめておきなよ」と言われがちで、相談しにくいものです。否定せずに話を聞いてくれる第三者に一度話してみると、自分の本当の気持ちが整理できます。"
      ]
    ],
    "lead": "復縁の悩みは、恋愛相談に強い電話占いで、今の状況を否定せずに聞いてもらうのもひとつの方法です。初回は無料で話せるところもあります。"
  },
  "kataomoi": {
    "title": "片思いがつらいときに、まず整理したい3つのこと",
    "sections": [
      [
        "不安の正体は「想像」かもしれない",
        "片思い中は、相手の何気ない一言や返信の速さで気持ちが大きく揺れます。でも、その不安の多くは「たぶんこう思われてる」という想像から生まれています。相手に実際に言われたこと・してもらったこと（事実）と、自分の想像を分けて書き出してみてください。"
      ],
      [
        "脈ありサインは「速さ」より「中身」",
        "返信が早いかどうかより、①会話を終わらせない質問があるか ②前に話したことを覚えているか ③相手から話題を振ってくるか、の3つを見てみてください。どれかがあるなら、焦る必要はありません。"
      ],
      [
        "小さく確かめる行動をひとつ",
        "気持ちを確かめるために、いきなり告白する必要はありません。相手が答えやすい質問をひとつ送る、共通の話題で短く誘ってみる。小さな行動の反応から、関係の距離感が少しずつ見えてきます。"
      ],
      [
        "それでも分からないときは",
        "自分ひとりで考え続けると、同じところをぐるぐる回ってしまいがちです。客観的な見立てを借りると、次の一歩が決めやすくなります。"
      ]
    ],
    "lead": "相手の気持ちがどうしても気になるときは、恋愛相談に強い電話占いで、今の状況を話してみるのもひとつの方法です。初回は無料で話せるところもあります。"
  },
  "aimai": {
    "title": "付き合っていない「曖昧な関係」から抜け出したいとき",
    "sections": [
      [
        "いちばん心がすり減る関係",
        "会うし連絡も取る。でも付き合ってはいない。曖昧な関係は、期待と不安が交互にやってくるので、心がすり減りやすい関係です。「このままでいいのかな」と感じているなら、それは大切なサインです。"
      ],
      [
        "見るべきは「先の予定」を誰が出すか",
        "彼が次の約束を自分から出してくれるか、それともいつもあなたから誘っているか。誘うのがいつも自分なら、一度だけ誘うのをやめて、彼から来るか待ってみてください。関係の温度が見えてきます。"
      ],
      [
        "「どうしたいか」を先に決める",
        "彼がどう思っているかより先に、あなたがこの関係をどうしたいかを決めておくことが大切です。付き合いたいのか、このままでいいのか。自分の答えが決まっていると、彼の曖昧な態度に振り回されにくくなります。"
      ],
      [
        "ひとりで判断がつかないときは",
        "曖昧な関係は、当事者ほど冷静に見られないものです。外からの視点で「この関係は前に進みそうか」を見てもらうと、迷いが晴れることがあります。"
      ]
    ],
    "lead": "曖昧な関係のまま進むべきか迷うときは、恋愛相談に強い電話占いで、彼の気持ちと関係の行方について見立てを聞いてみるのもひとつの方法です。初回は無料で話せるところもあります。"
  },
  "togire": {
    "title": "急に連絡が途絶えたときに、やってはいけないこと",
    "sections": [
      [
        "理由を探し続けてしまうのは自然なこと",
        "昨日まで普通にやりとりしていたのに、急に返信が来なくなる。何がいけなかったのか、何度も会話を読み返してしまうのは、誰にでもある反応です。"
      ],
      [
        "焦って何通も送らない",
        "途絶えたあとにいちばん避けたいのは、不安から何通もメッセージを送ってしまうことです。送るなら1通だけ。返事を求めない、軽くて短い内容にしましょう。"
      ],
      [
        "待つ間に、自分の毎日に戻る",
        "連絡を待つ時間を、彼のことを考え続ける時間にしないことが大切です。自分の予定や好きなことに時間を使っていると、心に余裕が生まれ、次に連絡が来たときにも自然に返せます。"
      ],
      [
        "それでも気持ちが落ち着かないときは",
        "連絡が途絶えた理由は、本人に聞かない限り分からないことがほとんどです。ひとりで考え込んで苦しくなる前に、誰かに話して気持ちを整理しましょう。"
      ]
    ],
    "lead": "連絡が途絶えた理由や、これから連絡が来るのかが気になるときは、恋愛相談に強い電話占いで見立てを聞いてみるのもひとつの方法です。初回は無料で話せるところもあります。"
  }
};

const WORRY_CONSULT = {"fukuen":"fortune","kataomoi":"fortune","aimai":"fortune","togire":"fortune"};

function worryPage(key) {
  const w = WORRY_PAGES[key];
  if (!w) return null;
  const kind = WORRY_CONSULT[key];
  return layout({
    title: `${w.title}｜${SITE_NAME}`,
    description: w.sections[0][1].slice(0, 100),
    body: `<h1>${esc(w.title)}</h1>
${sectionsHtml(w.sections)}
${consultBlock(kind, w.lead)}
<p style="margin-top:28px"><a href="/karte">▶ 4つの恋愛タイプを見る</a></p>`,
    isPromo: Boolean(affiliateUrl(kind)),
  });
}

function aishoPage() {
  const { COMPATIBILITY } = require("./content");
  const name = (tag) => TYPES[tag.toLowerCase()].name;
  const rows = Object.entries(COMPATIBILITY)
    .map(
      ([tag, c]) => `<h2>${esc(name(tag))}</h2>
<p><strong>相性がいい：</strong>${esc(name(c.good))}<br>${esc(c.goodNote)}</p>
<p><strong>気をつけたい：</strong>${esc(name(c.care))}<br>${esc(c.careNote)}</p>`
    )
    .join("\n");
  return layout({
    title: `タイプ別相性表｜${SITE_NAME}`,
    description: "4つの恋愛タイプ同士の相性をまとめました。",
    body: `<h1>タイプ別相性表</h1>
<p class="catch">相性は「合う・合わない」ではなく、すれ違いやすいポイントを知るためのもの</p>
${rows}
<p style="margin-top:28px">相性が気をつけたい組み合わせでも、お互いのクセを知っていれば大丈夫。<a href="/karte">各タイプの解説</a>もあわせて読んでみてください。</p>`,
  });
}

function guidePage() {
  return layout({
    title: `恋愛相談できるサービスの選び方｜${SITE_NAME}`,
    description: "ひとりで抱えこまずに、恋愛の悩みを相談できるサービスの選び方をまとめました。",
    body: `<h1>恋愛相談できるサービスの選び方</h1>
<p class="catch">友達には話しにくい悩みこそ、第三者に話すと整理できる</p>
${sectionsHtml([
  ["なぜ第三者に話すといいの？", "友達や家族は、あなたのことを大切に思っているからこそ「やめておきなよ」「気にしすぎだよ」と言いがちです。利害関係のない第三者なら、否定せずに話を聞いてもらえて、客観的な見立ても得られます。"],
  ["電話占いを選ぶときのポイント", "①恋愛相談が得意な鑑定師が多いか ②初回の無料特典があるか（いきなり有料だと試しにくい）③1分あたりの料金と、通話時間の上限を自分で決められるか ④口コミやレビューが見られるか。この4つを確認しておくと安心です。"],
  ["使いすぎないためのコツ", "話す前に「何を聞きたいか」を1〜2個メモしておくと、短い時間でも満足度が上がります。最初は無料特典の範囲で試して、合うと思えたら続ける、くらいの距離感がおすすめです。"],
  ["新しい出会いを探したいなら", "今の恋の相談より新しい出会いを求めているなら、価値観やプロフィールを見てから話せるマッチングアプリも選択肢です。年齢確認や通報機能など、安全対策がしっかりしているサービスを選びましょう。"],
])}
${consultBlock("fortune", "恋愛相談に強い電話占いはこちら。初回は無料で話せるところもあります。")}
${consultBlock("matching", "価値観で相手を探せるマッチングアプリはこちら。")}`,
    isPromo: Boolean(affiliateUrl("fortune") || affiliateUrl("matching")),
  });
}

function indexPage() {
  const list = Object.entries(TYPES)
    .map(([k, t]) => `<a href="/t/${k}"><strong>${esc(t.name)}</strong><br><span style="color:#6b6280;font-size:14px">${esc(t.catch)}</span></a>`)
    .join("\n");
  return layout({
    title: SITE_NAME,
    description: "5つの質問でわかる恋愛タイプ診断。あなたの恋のクセを答え合わせ。",
    body: `<h1>恋の答え合わせ、してみませんか</h1>
<p>恋愛がうまくいかないのは、性格のせいではなく「恋のクセ」のせいかもしれません。恋愛カルテでは、5つの質問でわかる恋愛タイプ診断をLINEで無料配信しています。</p>
<h2>4つの恋のクセタイプ</h2>
<div class="types">${list}</div>`,
  });
}

function aboutPage() {
  return layout({
    title: `運営者情報｜${SITE_NAME}`,
    description: "恋愛カルテの運営者情報",
    body: `<h1>運営者情報</h1>
<h2>メディア名</h2><p>${esc(SITE_NAME)}</p>
<h2>運営</h2><p>恋愛カルテ編集部</p>
<h2>運営目的</h2><p>恋愛に悩む方が、自分の「恋のクセ」に気づき、次の一歩を自分で選べるようにすること。恋愛タイプ診断と、タイプ別の恋愛のヒントを発信しています。</p>
<h2>発信チャネル</h2><p>X（<a href="${X_URL}">@kota_0517</a>）／LINE公式アカウント／本サイト</p>
<h2>お問い合わせ</h2><p>X（<a href="${X_URL}">@kota_0517</a>）のDM、またはLINE公式アカウントのトークよりご連絡ください。</p>
<h2>広告について</h2><p>本サイトの一部ページには、アフィリエイトプログラムを利用した広告（プロモーション）が含まれます。紹介するサービスは、読者の悩みに合うかどうかを基準に編集部が選んでいます。</p>`,
  });
}

function privacyPage() {
  return layout({
    title: `プライバシーポリシー｜${SITE_NAME}`,
    description: "恋愛カルテのプライバシーポリシー",
    body: `<h1>プライバシーポリシー</h1>
<p>恋愛カルテ編集部（以下「当メディア」）は、利用者の個人情報を以下のとおり取り扱います。</p>
<h2>1. 取得する情報</h2><p>LINE公式アカウントでは、LINEのユーザー識別子、友だち追加日、恋愛タイプ診断の回答内容、選択した悩みのカテゴリ、配信メッセージ内のリンクのクリック有無を取得します。氏名・住所・電話番号などは取得しません。本サイトでは、アクセス解析のためにアクセス日時・閲覧ページ等の情報を取得する場合があります。</p>
<h2>2. 利用目的</h2><p>診断結果の表示、タイプに合わせたメッセージの配信、サービス改善のための統計分析に利用します。</p>
<h2>3. 第三者提供</h2><p>法令に基づく場合を除き、本人の同意なく第三者に提供しません。</p>
<h2>4. アフィリエイトプログラムについて</h2><p>当メディアは、アフィリエイトプログラムを利用して商品・サービスを紹介しています。リンク先での購入・登録等の情報は、各広告主・ASPのプライバシーポリシーに基づいて取り扱われます。</p>
<h2>5. 情報の削除</h2><p>LINE公式アカウントをブロックまたは削除いただいた場合、配信を停止します。データの削除をご希望の場合はお問い合わせください。</p>
<h2>6. お問い合わせ</h2><p>X（<a href="${X_URL}">@kota_0517</a>）のDM、またはLINE公式アカウントのトークよりご連絡ください。</p>
<h2>7. 改定</h2><p>本ポリシーは必要に応じて改定し、本ページに掲載した時点で効力を生じます。</p>
<p style="margin-top:24px;color:#6b6280">制定日：2026年10月16日</p>`,
  });
}

// タグ(A〜D) → 公開ページURL
function typePageUrl(tag) {
  const base = (process.env.PUBLIC_BASE_URL || "https://renai-karte-line-bot.onrender.com").replace(/\/$/, "");
  return `${base}/t/${String(tag).toLowerCase()}`;
}

function mount(app) {
  app.get("/karte", (req, res) => res.type("html").send(indexPage()));
  app.get("/about", (req, res) => res.type("html").send(aboutPage()));
  app.get("/privacy", (req, res) => res.type("html").send(privacyPage()));
  app.get("/aisho", (req, res) => res.type("html").send(aishoPage()));
  app.get("/guide", (req, res) => res.type("html").send(guidePage()));
  app.get("/w/:key", (req, res) => {
    const html = worryPage(req.params.key.toLowerCase());
    if (!html) return res.status(404).type("html").send(indexPage());
    res.type("html").send(html);
  });
  app.get("/t/:key", (req, res) => {
    const html = typePage(req.params.key.toLowerCase());
    if (!html) return res.status(404).type("html").send(indexPage());
    res.type("html").send(html);
  });
}

module.exports = { mount, typePageUrl, TYPES };
