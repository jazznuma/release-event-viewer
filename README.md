# リリースイベント

リリースイベント情報を複数の公式ページから集約するWebアプリの初期版です。カレンダーで日付を選び、その日の予定を確認できます。

## 起動

Node.js 18以降が必要です。

```sh
npm start
```

ブラウザで `http://localhost:4173` を開きます。

ローカル起動中は情報源を6時間ごとに確認します。画面右上の「今すぐ更新」から手動更新もできます。

## GitHub Actionsで定期取得

`.github/workflows/refresh-events.yml` が日本時間の毎日 2:17、8:17、14:17、20:17 に情報源を取得します。手動実行はGitHubの **Actions → Refresh release events → Run workflow** から行えます。結果は `data/events.json` に保存し、変更があれば `main` にコミットして、GitHub Pagesも更新します。

初回はリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。設定後、Actionsの **Refresh release events** を開いて **Run workflow** を押すと、取得と公開をすぐに実行できます。

## 初期版に含まれるもの

- 店舗別フィルター、フリーワード検索
- 月間カレンダーと選択日の予定一覧（起動時は今日を選択）
- レスポンシブ画面
- 公式ページへのリンク
- 起動時と定期実行での公式ページ取得、取得状況の表示

初回取得前または公式サイトに接続できない場合は、2026年9月29日の公式掲載情報を使ったスナップショットを表示します。取得結果は `data/events.json` に保存します。

## 取得対象

| Source ID | 対象 | 公式情報源 |
| --- | --- | --- |
| `tower-shibuya` | タワーレコード渋谷 | https://towershibuya.jp/ |
| `tower-all` | タワーレコード全店 | https://tower.jp/STORE/EVENT |
| `hmv-shibuya` | HMV渋谷 | https://www.hmv.co.jp/store/event/sitemap/ |
| `hmv-other` | HMVその他の店舗 | https://www.hmv.co.jp/store/event/sitemap/ |
| `vv-shibuya` | ヴィレッジヴァンガード渋谷本店 | https://www.village-v.co.jp/event/ |

HMVは同じ公式イベント一覧を取得し、店舗名から「HMV 渋谷」と「HMV その他の店舗」に振り分けます。

## 次に実装する部分

1. 各情報源のHTML構造に合わせた解析ルールを実データで調整し、日時・会場の抽出精度を上げる。
2. 変更・掲載終了の検出を追加する。
3. 実際の取得結果を確認し、各情報源のHTML構造に合わせて抽出ルールを調整する。
4. 公式ページ側の利用条件、アクセス頻度、取得許可を確認し、過剰なアクセスを避ける。

初期データモデル案: `id`, `sourceId`, `title`, `artist`, `venue`, `date`, `time`, `kind`, `url`, `firstSeenAt`, `lastSeenAt`, `contentHash`, `status`。
