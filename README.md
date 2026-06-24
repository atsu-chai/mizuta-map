# Mizuta Map

水たまりの位置・写真・大きさ・確認日時・天気・レビューを集める、GitHub Pages対応のNext.js MVPです。

## 機能

- APIキー不要のOpenStreetMapタイル表示
- ブラウザ現在地取得
- 水たまり投稿フォーム
- ブラウザ内保存による投稿データ表示
- `NEXT_PUBLIC_GAS_WEB_APP_URL` 設定時のGAS直接送信
- カメラ映像から水面候補を検出し、検出位置に魚を重ねる簡易WebAR

## 環境変数

`.env.example` を参考に `.env.local` またはVercelのEnvironment Variablesへ設定してください。

```bash
NEXT_PUBLIC_GAS_WEB_APP_URL=
WEATHER_API_KEY=
NEXT_PUBLIC_DEFAULT_LAT=35.681236
NEXT_PUBLIC_DEFAULT_LNG=139.767125
NEXT_PUBLIC_BASE_PATH=
```

GitHub Pagesではサーバー側API Routeが使えないため、投稿はまずブラウザのlocalStorageへ保存されます。`NEXT_PUBLIC_GAS_WEB_APP_URL` を設定した場合のみGASへも送信します。

## GAS Web Appの入出力

`POST` はJSONで次の値を受け取ります。`image.base64` がある場合はGoogle Driveへ保存し、Sheetsには公開URLまたはファイルIDを保存してください。

```json
{
  "latitude": 35.681236,
  "longitude": 139.767125,
  "size": "medium",
  "review": "歩道の一部をふさいでいます",
  "checkedAt": "2026-06-24T01:00:00.000Z",
  "weather": "未取得",
  "image": {
    "fileName": "puddle.jpg",
    "mimeType": "image/jpeg",
    "base64": "..."
  }
}
```

## 開発

```bash
npm run dev
npm run build
```

## GitHub Pages

`.github/workflows/pages.yml` が `main` ブランチへのpushで静的サイトをビルドし、GitHub Pagesへデプロイします。

GitHubリポジトリの Settings → Pages で Source を `GitHub Actions` にしてください。GASを使う場合は、Settings → Secrets and variables → Actions に次を登録してください。

- `NEXT_PUBLIC_GAS_WEB_APP_URL`
