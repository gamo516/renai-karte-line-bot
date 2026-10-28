# こた／恋愛カルテ 運用・復旧マニュアル

## 全体の流れ
X（@kota_0517）→ LINE（こたの恋愛カルテ・診断）→ 解説ページ（Render）→ ココナラ電話占い（A8）

## 自動で動くもの
| いつ | 何 | どこ |
|---|---|---|
| 毎朝10:00 | X投稿の生成・予約（昼12:15・夜21:00、4日先まで） | 会社PC `Desktop/renai-karte-x-bot/weekly-batch.js`（タスク RenaiKarte_X_WeeklyBatch） |
| 平日9〜19時 30分おき | 受付箱の処理（スマホから送ったリンク・スクショ） | 会社PC `scripts/auto-inbox.js`（タスク RenaiKarte_AutoInbox） |
| 毎日18:30 | 実績取得（＋月曜は週次レポート）→ 送ったリプの反応回収・分析 → 競合リサーチ・リプ候補のLINE通知 | 会社PC `run-daily.cmd`（タスク RenaiKarte_Daily） |
| 毎日21:00 | 反応がない人への追いLINE | Render（サーバー） |
| 毎月5日20:00 | 月1回の全体配信 | Render（サーバー） |

タスクは conhost --headless で画面を出さずに実行（黒い画面を閉じて処理が止まる事故の防止。2026-10-28）。
PCが止まっていた時間の分は、次に起動したときに1回だけ実行される（StartWhenAvailable）。同じ処理の二重実行はロックや重複除外で防いでいる。失敗しても自動で何度も再試行はしない。

## 人間がやること
- 毎日：LINEに届く「今日のリプ候補」を開いて、案をコピーしてXでリプ（5分）
- 週1回：A8の成果をLINEで `成果 発生数 確定数`（累計）と送る
- 月曜：LINEに届く週次レポートを見る

## リプ品質の自動改善（scripts/reply-feedback.js）
1. こたが直近72時間に送ったリプをX APIで回収し、LINEで通知した案と照合（AI案そのまま／手直し／自作を自動判定）
2. いいね・返信数・表示回数・元投稿の本人から返信が来たかを renai-karte:reply-outcomes に記録（72時間は毎日更新）
3. 48時間たったリプが5件以上・新規3件以上たまると、claude -p が反応の良いリプの共通点・避ける書き方・手直しの傾向を分析 → renai-karte:meta:replyInsights（15件未満は暫定扱い）
4. research.js がリプ文を作るとき、その分析結果と実際に送った文（言い回しの重複防止）を読み込む
- 人間の作業は増えない（いつも通り通知からリプするだけ）。手直しして送った場合も自動で拾い、好みとして学習する
- 結果は月曜の週次レポートの「リプ」行に出る
- 費用: 1日最大 約$0.25（通常は数件分で $0.05前後）

## 費用の管理（X API）
- Developer Console側：支出上限（月15〜20ドル）＋前払いクレジット（なくなれば止まる）
- プログラム側：`lib/xapi.js` が推定費用をRedisに記録し、月 `X_MONTHLY_BUDGET_USD`（既定20ドル）・日（月の1/25）を超えそうなら呼び出し前に停止
- 確認：週次レポートの「X API費用」、または `node -e "require('dotenv').config();require('./lib/xapi').spent().then(console.log)"`

## ログの場所
- `renai-karte-line-bot/logs/`：reply-feedback.log / research.log / metrics.log / auto-inbox.log / daily-stdout.log
- `renai-karte-x-bot/logs/`：batch.log / task-stdout.log

## よくある不具合と直し方
| 症状 | 原因 | 直し方 |
|---|---|---|
| ログに `fetch failed` | PCがオフライン・スリープ | 何もしなくてよい（次回に再実行） |
| `X API 401/403` | Bearer Tokenの失効・権限 | Developer ConsoleでBearer Tokenを再発行し `.env` の `X_BEARER_TOKEN` を更新 |
| `X API 402` / 予算超過のログ | クレジット切れ・上限到達 | クレジットを追加購入するか翌月を待つ（人間が判断） |
| 投稿が予約されていない | 生成途中でPCが止まった | `cd Desktop/renai-karte-x-bot && node weekly-batch.js` を手動実行 |
| `claude` のエラー | Claude Codeのログイン切れ | ターミナルで `claude` を起動してログインし直す |
| LINEが届かない | 通数上限（月200通）・トークン失効 | LINE公式アカウントの管理画面で残り通数を確認 |
| 相談ボタンが出ない | アフィリンク未設定 | `node scripts/set-aff.js show` で確認、`set-aff.js fortune "<URL>"` で設定 |

## 手動での実行
```
cd Desktop/renai-karte-line-bot
node scripts/research.js --dry     # リサーチを試す（保存・送信しない。X APIは課金される）
node scripts/reply-feedback.js --dry  # 送ったリプの回収を試す（保存しない）
node scripts/reply-feedback.js --analyze  # 件数条件に関係なく分析を実行
node scripts/metrics.js            # 実績取得（月曜なら週次レポートも）
node scripts/metrics.js --report   # 週次レポートを今すぐ送る
node scripts/auto-inbox.js --dry   # 受付箱の処理を試す
```

## LINE導線（2026-10-26 改修）
友だち追加 → あいさつ＋Q1 → 5問（ボタンに短い意味つき）→ 結果カード（ボタンは「今の悩みに合ったヒントを見る」1つ）→ 悩み4択 → 悩み別ヒント（悩みごとのWebボタン＋「相談先の選び方を見る」）→ Web解説ページ（記事中盤のひとこと＋終盤の相談ブロック）→ ココナラ電話占い
- ここまで全部 reply（通数0）。プッシュは追いLINE（最大2通）と月1配信だけ
- タイプ解説はリッチメニュー「私のタイプ解説」から
- 自由入力：診断中なら今の問題を出し直す／命や安全に関わる言葉は公的窓口だけ案内（アフィリエイトなし）／それ以外は6時間に1回だけ「お悩み別ヒント・相談先の選び方」を案内
- 計測：日別の renai-karte:funnel:YYYY-MM-DD（follow / q1〜q5 / complete / askworry / worry / page / consultinfo / freetext / crisis）、相談ボタンは renai-karte:affclicks（ページ｜mid/end）。週次レポートに表示
- 計測リンク /r のURLにはLINEユーザーIDを載せない（暗号化）。古いリンクも有効
- アフィリンク：A8の「商品リンク作成」で生成したものをそのまま使う（A8規約で生成後の書き換えは禁止）。成果対象は categories/3?service_kind=1（電話占い）か categories/2?service_kind=1（悩み相談・恋愛相談）の配下。遷移先を変える時はA8で作り直して set-aff.js で設定。初回クーポンの表記は、A8経由での適用を確認するまで載せない（lib/pages.js の CONSULT_SERVICE.fortune.offer）
- テスト：npm test

## 会話の続き（2026-10-28 追加）
- 毎日18:30の reply-feedback.js の中で、こた（の投稿・リプ）に来た返信を確認し、返すべきものだけAIが返信文を1つに確定 → 「会話の続き」としてLINEに通知（返信画面を開くボタン付き）
- 宣伝・攻撃的・意味のない返信には返さない。深刻な内容は返信案を作らずログだけ。同じ相手と2往復以上なら会話を締める一言にする
- 判断済みの返信は renai-karte:convo-notified に記録（30日）。費用は既存の取得分を使うので追加なし
- いいね返し・フォローは規約上自動化しない（手動）
