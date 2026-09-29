# リリースイベント

タワーレコード、HMV、ヴィレッジヴァンガードの公式イベント情報を集約して、日付ごとに確認するWebアプリです。

## 公開ページ

https://jazznuma.github.io/release-event-viewer/

## 画面の使い方

- カレンダーで日付を選び、その日のイベントを一覧表示します。起動時は今日が選択されています。
- 前日・翌日ボタン、または「今日へ」ボタンで日付を移動できます。
- 店舗・情報源で絞り込み、出演者名やイベント名を検索できます。
- 「首都圏のみ」は初期状態でオンです。東京・神奈川・埼玉・千葉のイベントを表示し、オフにすると地域を問わず表示します。店舗・会場名から地域を判定するため、場所を特定できないイベントは初期表示に含まれない場合があります。
- イベント名を押すと公式情報を開きます。開催日時や内容は変更されることがあるため、来店前にリンク先をご確認ください。

## 取得対象

| Source ID | 対象 | 公式情報源 |
| --- | --- | --- |
| `tower-shibuya` | タワーレコード渋谷店 | https://towershibuya.jp/events |
| `tower-all` | タワーレコード全店 | https://tower.jp/STORE/EVENT |
| `hmv-shibuya` | HMV渋谷 | https://www.hmv.co.jp/store/event/sitemap/ |
| `hmv-other` | HMV渋谷以外 | https://www.hmv.co.jp/store/event/sitemap/ |
| `vv-all` | ヴィレッジヴァンガード全店 | https://www.village-v.co.jp/event/ |

HMVは同じ公式イベント一覧から取得し、店舗名をもとに渋谷とその他の店舗へ分類します。ヴィレッジヴァンガードは全店を対象にし、一覧では店舗・会場名を表示します。

## データ更新と公開

GitHub Actionsが毎日4回、日本時間の **03:17、09:17、15:17、21:17** に各公式情報源からイベント情報を取得します。取得後はPages用サイトを毎回ビルドして公開します。イベントデータに差分がある場合は `data/events.json` を `main` ブランチへコミットします。

画面上部に最後に取得した日時を表示します。情報源ごとに取得に失敗した場合は、一部取得できなかったことも表示します。

### Actionsを手動実行する

GitHubリポジトリの **Actions → Refresh release events → Run workflow** を選びます。実行が成功すると、取得データとGitHub Pagesが更新されます。

### GitHub Pagesの初回設定

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。以降は対象ファイルの `main` へのpush、定期実行、またはActionsの手動実行でビルド・公開します。

## ローカルで起動する

Node.js 18以降が必要です。

```sh
npm start
```

ブラウザで http://localhost:4173 を開きます。起動後にイベント情報を取得し、その後は6時間ごとに更新します。ローカル画面では「今すぐ更新」ボタンから手動取得もできます。

GitHub Pages用ファイルをローカルで生成する場合:

```sh
npm run build:pages
```

生成先は `site/` です。ローカルサーバーでは `data/events.json` を、取得に失敗して保存データがない場合は `data/seed-events.json` を表示します。

## 主なファイル

- `app.js` — カレンダー、フィルター、一覧表示
- `ingest.mjs` — 公式ページからの取得とイベント解析
- `refresh-events.mjs` — 取得データの更新
- `server.mjs` — ローカルWebサーバー
- `build-pages.mjs` — GitHub Pages向け静的ファイルの生成
- `data/events.json` — 直近の取得結果
- `data/seed-events.json` — 初期表示用データ
- `.github/workflows/refresh-events.yml` — 定期取得とPagesのビルド・公開
