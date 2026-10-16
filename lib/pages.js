// 公開Webページ（タイプ別解説・運営者情報・プライバシーポリシー）。
// LINE内ではアフィリエイトリンクを貼れないため、診断結果→このページ→外部サービス の導線にする。
// アフィリエイトリンクは環境変数で差し込む（未設定なら相談ブロック自体を表示しない）。

const SITE_NAME = "恋愛カルテ｜恋の答え合わせ";
const X_URL = "https://x.com/renai_koikota";

// タイプ別ページの中身。キーはLINE診断のタグ(A〜D)を小文字にしたもの
const TYPES = {
  a: {
    tag: "A",
    name: "想い出のこす追想（ついそう）タイプ",
    catch: "一度好きになった人を、大切に想い続けられる人",
    sections: [
      ["どんなタイプ？", "好きになった人への気持ちが長く続き、思い出を大切にするタイプです。関係が終わっても、その時間をなかったことにしない誠実さを持っています。過去の関係の中に「安心できる場所」を見つけやすいのも特徴です。"],
      ["恋愛で起きやすいこと", "新しい出会いがあっても、つい元恋人と比べてしまう。区切りをつけたいのに、ふとした瞬間に思い出して気持ちが戻ってしまう。一人の夜に考え込んで、答えの出ないループに入りやすい傾向があります。"],
      ["恋のクセとの付き合い方", "気持ちを無理に「忘れる」必要はありません。大切なのは、その気持ちを言葉にして整理すること。①何があったのか ②そのとき自分はどう感じたのか ③今の自分は本当はどうしたいのか、の順に書き出すと、ぐるぐるしていた気持ちに輪郭が出てきます。"],
      ["今日からできること", "復縁したいのか、前に進みたいのか。今すぐ決めなくて大丈夫です。ただ「自分で決める」ために、状況を客観的に見てくれる人に一度話してみることをおすすめします。友達には話しにくい内容ほど、第三者のほうが整理しやすいこともあります。"],
    ],
    consult: "fortune",
    consultLead: "ひとりで考え続けて苦しくなったら、恋愛相談に強い電話占いで「今の状況」を話してみるのもひとつの方法です。初回は無料で話せるところもあります。",
  },
  b: {
    tag: "B",
    name: "本音さぐりのぞみタイプ",
    catch: "相手の気持ちに、誰よりも敏感な人",
    sections: [
      ["どんなタイプ？", "相手の言葉や態度から気持ちを読み取る観察力が高いタイプです。小さな変化にも気づける優しさがある一方で、確信が持てないと不安がふくらみやすい面もあります。"],
      ["恋愛で起きやすいこと", "LINEの返信の速さや言い回しに一喜一憂してしまう。「どう思われているんだろう」と考えすぎて、自分の気持ちを伝えるタイミングを逃してしまう。答えの出ない自問自答を、夜中まで繰り返してしまうことも。"],
      ["恋のクセとの付き合い方", "相手の気持ちは、推測だけでは分かりません。「返信が遅い＝脈なし」のような決めつけをいったん脇に置き、事実（何を言われた・何をしてくれた）と、想像（たぶんこう思ってる）を分けて書き出してみてください。不安の多くは想像のほうから来ています。"],
      ["今日からできること", "小さく確かめる行動をひとつ。たとえば相手が答えやすい質問をひとつ送ってみる。それでも気持ちが整理できないときは、第三者の視点を借りると、自分では見えなかった関係の見立てが手に入ります。"],
    ],
    consult: "fortune",
    consultLead: "相手の気持ちがどうしても気になるときは、恋愛相談に強い電話占いで客観的な見立てを聞いてみるのもひとつの方法です。初回は無料で話せるところもあります。",
  },
  c: {
    tag: "C",
    name: "一歩手前スタンバイタイプ",
    catch: "準備はできている。あとは、きっかけだけの人",
    sections: [
      ["どんなタイプ？", "恋愛したい気持ちも、相手を大切にする準備もできているタイプです。ただ、最初の一歩のきっかけを外に求めがちで、「いい人がいれば」と待つ時間が長くなりやすい傾向があります。"],
      ["恋愛で起きやすいこと", "「出会いがない」と感じているけれど、振り返ると出会いの場に行く回数そのものが少ない。条件や失敗したときのことを考えすぎて、動く前に疲れてしまうこともあります。"],
      ["恋のクセとの付き合い方", "出会いは「待つ」より「作る」ものです。ただし、いきなり大きく動く必要はありません。行動のハードルを下げることが鍵。「今月は1回だけ新しい場所に行く」くらいの小さな目標から始めると、無理なく続きます。"],
      ["今日からできること", "自分に合った出会い方を選ぶこと。人がたくさん集まる場が苦手なら、事前に相手の価値観が分かる方法のほうが向いています。まずは「どんな人と、どんな関係になりたいか」を3つ書き出してみてください。"],
    ],
    consult: "matching",
    consultLead: "価値観の合う人と、自分のペースで出会いたい人には、プロフィールで相手を知ってから話せるマッチングアプリも選択肢のひとつです。",
  },
  d: {
    tag: "D",
    name: "じぶん磨きみつめタイプ",
    catch: "恋愛の中でも、自分らしさを大切にしたい人",
    sections: [
      ["どんなタイプ？", "恋愛そのものよりも、その中での自分のあり方を大事にするタイプです。関係の「質」に敏感で、ただ付き合っているだけでは満たされないと感じやすいのが特徴です。"],
      ["恋愛で起きやすいこと", "相手に合わせすぎて、気づいたら疲れている。恋愛はしているのに、なぜか満たされない。相手の反応で自分の価値が上下するように感じてしまうこともあります。"],
      ["恋のクセとの付き合い方", "相手との関係を変える前に、自分との関係を整えることが、恋愛の質を上げるいちばんの近道です。「相手のため」にしていることの中に、本当は無理していることがないか、一度見直してみてください。"],
      ["今日からできること", "自分を大切にする小さな習慣をひとつ持つこと。好きな飲み物をゆっくり飲む時間、5分だけ日記を書く時間など、相手に関係なく自分が満たされる時間をつくると、恋愛でも振り回されにくくなります。"],
    ],
    consult: "fortune",
    consultLead: "自分の気持ちや恋愛の傾向をもっと深く知りたいときは、恋愛相談に強い電話占いで話しながら整理してみるのもひとつの方法です。",
  },
};

const CONSULT_LABEL = {
  fortune: "恋愛相談できる電話占いを見てみる",
  matching: "価値観で出会えるマッチングアプリを見てみる",
};

function affiliateUrl(kind) {
  if (kind === "fortune") return process.env.AFF_URL_FORTUNE || "";
  if (kind === "matching") return process.env.AFF_URL_MATCHING || "";
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
<footer>
  <a href="/karte">タイプ一覧</a><a href="/about">運営者情報</a><a href="/privacy">プライバシーポリシー</a><a href="${X_URL}">X</a>
  <p style="margin-top:10px">© 恋愛カルテ編集部</p>
</footer>
</div>
</body>
</html>`;
}

function typePage(key) {
  const t = TYPES[key];
  if (!t) return null;
  const url = affiliateUrl(t.consult);
  const sections = t.sections.map(([h, p]) => `<h2>${esc(h)}</h2>\n<p>${esc(p)}</p>`).join("\n");
  const consult = url
    ? `<section class="consult">
  <h2>ひとりで抱えこまないで</h2>
  <p>${esc(t.consultLead)}</p>
  <a class="btn" href="${esc(url)}" rel="sponsored noopener" target="_blank">${esc(CONSULT_LABEL[t.consult])}</a>
  <p class="note">※外部サービスのページに移動します。料金・条件は移動先でご確認ください。</p>
</section>`
    : "";
  const body = `<h1>${esc(t.name)}</h1>
<p class="catch">${esc(t.catch)}</p>
${sections}
${consult}`;
  return layout({
    title: `${t.name}｜${SITE_NAME}`,
    description: `恋愛タイプ診断「${t.name}」の解説。${t.catch}。恋のクセと、今日からできること。`,
    body,
    isPromo: Boolean(url),
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
<h2>4つの恋愛タイプ</h2>
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
<h2>発信チャネル</h2><p>X（<a href="${X_URL}">@renai_koikota</a>）／LINE公式アカウント／本サイト</p>
<h2>お問い合わせ</h2><p>X（<a href="${X_URL}">@renai_koikota</a>）のDM、またはLINE公式アカウントのトークよりご連絡ください。</p>
<h2>広告について</h2><p>本サイトの一部ページには、アフィリエイトプログラムを利用した広告（プロモーション）が含まれます。紹介するサービスは、読者の悩みに合うかどうかを基準に編集部が選んでいます。</p>`,
  });
}

function privacyPage() {
  return layout({
    title: `プライバシーポリシー｜${SITE_NAME}`,
    description: "恋愛カルテのプライバシーポリシー",
    body: `<h1>プライバシーポリシー</h1>
<p>恋愛カルテ編集部（以下「当メディア」）は、利用者の個人情報を以下のとおり取り扱います。</p>
<h2>1. 取得する情報</h2><p>LINE公式アカウントでは、LINEのユーザー識別子、友だち追加日、恋愛タイプ診断の回答内容を取得します。氏名・住所・電話番号などは取得しません。本サイトでは、アクセス解析のためにアクセス日時・閲覧ページ等の情報を取得する場合があります。</p>
<h2>2. 利用目的</h2><p>診断結果の表示、タイプに合わせたメッセージの配信、サービス改善のための統計分析に利用します。</p>
<h2>3. 第三者提供</h2><p>法令に基づく場合を除き、本人の同意なく第三者に提供しません。</p>
<h2>4. アフィリエイトプログラムについて</h2><p>当メディアは、アフィリエイトプログラムを利用して商品・サービスを紹介しています。リンク先での購入・登録等の情報は、各広告主・ASPのプライバシーポリシーに基づいて取り扱われます。</p>
<h2>5. 情報の削除</h2><p>LINE公式アカウントをブロックまたは削除いただいた場合、配信を停止します。データの削除をご希望の場合はお問い合わせください。</p>
<h2>6. お問い合わせ</h2><p>X（<a href="${X_URL}">@renai_koikota</a>）のDM、またはLINE公式アカウントのトークよりご連絡ください。</p>
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
  app.get("/t/:key", (req, res) => {
    const html = typePage(req.params.key.toLowerCase());
    if (!html) return res.status(404).type("html").send(indexPage());
    res.type("html").send(html);
  });
}

module.exports = { mount, typePageUrl, TYPES };
