# asc コマンドリファレンス

## CLI 概要

`asc` は App Store Connect 分析 CLI（App Store Connect analytics CLI）です。App Store Connect API を利用して、アプリ一覧の取得・API 認証用 JWT の生成・Sales and Trends レポートのダウンロードを行います。

- **コマンド名**: `asc`（`package.json` の `bin` として登録。開発時は `pnpm dev -- <args>` で `tsx src/cli.ts` を実行）
- **バージョン**: `0.1.0`

### グローバルオプション

| オプション | 説明 |
| --- | --- |
| `--json` | JSON 出力を指定するフラグ。成功時の結果はもともと常に JSON で出力されるため、実質的な効果は**エラー出力（stderr）も JSON 形式に切り替える**ことです。ルートコマンド・各サブコマンドのどちらでも指定できます。 |
| `-V, --version` | バージョン（`0.1.0`）を表示して終了します。 |
| `-h, --help` | ヘルプを表示して終了します。 |

## コマンド一覧

| コマンド | 説明 |
| --- | --- |
| [`asc apps list`](#asc-apps-list) | App Store Connect のアプリ一覧を取得する |
| [`asc auth token`](#asc-auth-token) | App Store Connect API 用の JWT を生成する |
| [`asc reports list`](#asc-reports-list) | サポートしているレポート定義の一覧を表示する |
| [`asc reports fetch`](#asc-reports-fetch) | Sales and Trends レポート（raw）をダウンロードする |

---

## asc apps list

### 説明

App Store Connect API（`GET /v1/apps`、`limit=200`）を呼び出し、アプリの一覧を取得します。認証用の環境変数（`ASC_ISSUER_ID` / `ASC_KEY_ID` / `ASC_PRIVATE_KEY_PATH` または `ASC_PRIVATE_KEY`）が必要です。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc apps list
```

### 出力例（JSON）

```json
{
  "apps": [
    {
      "id": "1234567890",
      "name": "My App",
      "bundleId": "com.example.myapp",
      "sku": "MYAPP001",
      "primaryLocale": "ja"
    }
  ]
}
```

`name` / `bundleId` / `sku` / `primaryLocale` は API レスポンスの `attributes` に存在しない場合は省略されます。

---

## asc auth token

### 説明

環境変数の認証情報（Issuer ID・Key ID・秘密鍵）から、App Store Connect API 用の JWT（ES256 署名、audience は `appstoreconnect-v1`）を生成します。有効期限は最大 20 分です。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc auth token
```

### 出力例（JSON）

```json
{
  "issuerId": "00000000-0000-0000-0000-000000000000",
  "keyId": "ABC123DEFG",
  "token": "eyJhbGciOiJFUzI1NiIsImtpZCI6IkFCQzEyM0RFRkciLCJ0eXAiOiJKV1QifQ...",
  "tokenType": "Bearer",
  "issuedAt": "2026-06-10T00:00:00.000Z",
  "expiresAt": "2026-06-10T00:20:00.000Z"
}
```

---

## asc reports list

### 説明

この CLI がサポートしているレポート定義の一覧を表示します。静的な定義を出力するだけなので、環境変数の設定や API アクセスは不要です。現在サポートしているのは日次の Sales and Trends サマリーレポート（`sales-summary-daily`）のみです。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc reports list
```

### 出力例（JSON）

```json
{
  "reports": [
    {
      "id": "sales-summary-daily",
      "apiPath": "/v1/salesReports",
      "reportType": "SALES",
      "reportSubType": "SUMMARY",
      "frequency": "DAILY",
      "description": "Daily Sales and Trends summary report.",
      "requiresVendorNumber": true
    }
  ]
}
```

---

## asc reports fetch

### 説明

指定した日付範囲の日次 Sales and Trends サマリーレポート（raw）を App Store Connect API（`GET /v1/salesReports`）から 1 日分ずつダウンロードし、`ASC_REPORTS_DIR`（デフォルト `./reports`）配下に保存します。ファイル名は `sales-summary-<YYYY-MM-DD>.tsv.gz`（レスポンスが gzip の場合）または `.tsv` です。保存先ディレクトリは存在しなければ自動作成されます。

認証用の環境変数に加えて `ASC_VENDOR_NUMBER` が必須です。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--from <YYYY-MM-DD>` | **必須** | 取得開始日。`YYYY-MM-DD` 形式 |
| `--to <YYYY-MM-DD>` | **必須** | 取得終了日。`YYYY-MM-DD` 形式。`--from` 以降の日付であること |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

日付形式が不正な場合や `--from` > `--to` の場合は、バリデーションエラー（`VALIDATION_FAILED`、exit code 2）になります。

### 実行例

```sh
asc reports fetch --from 2026-06-01 --to 2026-06-03
```

### 出力例（JSON）

```json
{
  "report": "sales-summary-daily",
  "from": "2026-06-01",
  "to": "2026-06-03",
  "days": 3,
  "files": [
    { "date": "2026-06-01", "path": "reports/sales-summary-2026-06-01.tsv.gz", "bytes": 1024 },
    { "date": "2026-06-02", "path": "reports/sales-summary-2026-06-02.tsv.gz", "bytes": 980 },
    { "date": "2026-06-03", "path": "reports/sales-summary-2026-06-03.tsv.gz", "bytes": 1101 }
  ]
}
```

---

## 環境変数

設定例は `.env.example` を参照してください。空文字列を設定した場合は未設定として扱われます。

| 環境変数 | 必須 | 対象コマンド | 説明 |
| --- | --- | --- | --- |
| `ASC_ISSUER_ID` | 必須 | `apps list` / `auth token` / `reports fetch` | App Store Connect API の Issuer ID |
| `ASC_KEY_ID` | 必須 | `apps list` / `auth token` / `reports fetch` | API キーの Key ID |
| `ASC_PRIVATE_KEY_PATH` | 必須（`ASC_PRIVATE_KEY` とどちらか一方） | `apps list` / `auth token` / `reports fetch` | 秘密鍵（`.p8`）ファイルへのパス |
| `ASC_PRIVATE_KEY` | 必須（`ASC_PRIVATE_KEY_PATH` とどちらか一方） | `apps list` / `auth token` / `reports fetch` | 秘密鍵の内容（PKCS#8 PEM 文字列）。`ASC_PRIVATE_KEY` が設定されている場合はこちらが優先 |
| `ASC_VENDOR_NUMBER` | 必須（reports のみ） | `reports fetch` | Sales and Trends レポートの Vendor Number |
| `ASC_API_BASE_URL` | 任意 | `apps list` / `auth token` / `reports fetch` | API のベース URL。デフォルト `https://api.appstoreconnect.apple.com` |
| `ASC_REPORTS_DIR` | 任意 | `reports fetch` | レポートの保存先ディレクトリ。デフォルト `./reports` |

`reports list` は環境変数を必要としません。

---

## 出力規約

- **stdout**: コマンド成功時の **JSON の結果のみ** を出力します（1 行の JSON + 改行）。パイプや `jq` での後続処理を想定しています。
- **stderr**: 診断メッセージとエラーを出力します。
  - 通常時のエラー形式: `エラーコード: メッセージ`（`details` がある場合は整形済み JSON が続く）
  - `--json` 指定時のエラー形式: `{"ok":false,"error":{"code":"...","message":"...","details":...}}`
- **exit code**:
  - `0`: 成功
  - `2`: **設定不足**（認証用環境変数の不足 = `ASC_AUTH_NOT_CONFIGURED`、`ASC_VENDOR_NUMBER` の不足 = `ASC_REPORTS_NOT_CONFIGURED`）、入力バリデーションエラー（`VALIDATION_FAILED`）、API の 4xx エラー
  - `1`: API の 5xx エラー、その他の予期しないエラー

### 設定不足時のエラー例（exit code 2）

```
ASC_AUTH_NOT_CONFIGURED: App Store Connect authentication is not configured.
{
  "missing": [
    "ASC_ISSUER_ID",
    "ASC_KEY_ID",
    "ASC_PRIVATE_KEY_PATH"
  ],
  "hint": "Set ASC_ISSUER_ID, ASC_KEY_ID, and ASC_PRIVATE_KEY_PATH. See .env.example."
}
```
