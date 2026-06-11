# asc コマンドリファレンス

日本語 | [English](./commands.en.md)

## CLI 概要

`asc` は App Store Connect 分析 CLI（App Store Connect analytics CLI）です。App Store Connect API を利用して、アプリ一覧の取得・API 認証用 JWT の生成・Sales and Trends レポートのダウンロード・App Analytics レポート（Analytics Reports API）のダウンロードを行います。

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
| [`asc analytics request ensure`](#asc-analytics-request-ensure) | App Analytics のレポート生成リクエストを作成する（冪等） |
| [`asc analytics request list`](#asc-analytics-request-list) | レポート生成リクエストの一覧を取得する |
| [`asc analytics reports`](#asc-analytics-reports) | 利用可能な App Analytics レポートの一覧を取得する |
| [`asc analytics fetch`](#asc-analytics-fetch) | App Analytics レポートのファイルをダウンロードする |

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

## asc analytics request ensure

### 説明

App Analytics（Analytics Reports API）のレポート生成リクエストを作成します（`POST /v1/analyticsReportRequests`）。同じ `accessType` の**アクティブな**リクエストが既に存在する場合は作成せず既存のものを返す**冪等**なコマンドで、何度実行しても安全です。`stoppedDueToInactivity` で停止したリクエストは既存とみなさず、新しいリクエストを作成します（Apple の仕様では停止したリクエストは再開できず、新規作成が必要なため）。

`ONGOING`（デフォルト）を登録すると、Apple が日次・週次・月次のレポートを継続的に生成します（初回のデータ生成まで最大 48 時間）。過去の履歴データを一括生成したい場合は `--access-type ONE_TIME_SNAPSHOT` を使用します。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--app <appId>` | -（`ASC_APP_ID` 未設定時は必須） | 対象アプリの App Store Connect ID。`asc apps list` で確認できます |
| `--access-type <type>` | - | `ONGOING`（デフォルト）または `ONE_TIME_SNAPSHOT` |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc analytics request ensure --app 1234567890
```

### 出力例（JSON）

```json
{
  "request": {
    "id": "f8f99a6a-0000-0000-0000-000000000000",
    "accessType": "ONGOING",
    "stoppedDueToInactivity": false
  },
  "created": true
}
```

---

## asc analytics request list

### 説明

アプリに紐づくレポート生成リクエストの一覧を取得します（`GET /v1/apps/{id}/analyticsReportRequests`）。

`stoppedDueToInactivity` が `true` の場合、レポートが長期間ダウンロードされなかったため Apple が生成を停止しています。`asc analytics request ensure` の再実行で復旧できます。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--app <appId>` | -（`ASC_APP_ID` 未設定時は必須） | 対象アプリの App Store Connect ID |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc analytics request list --app 1234567890
```

### 出力例（JSON）

```json
{
  "requests": [
    {
      "id": "f8f99a6a-0000-0000-0000-000000000000",
      "accessType": "ONGOING",
      "stoppedDueToInactivity": false
    }
  ]
}
```

---

## asc analytics reports

### 説明

レポート生成リクエストで利用可能なレポートの一覧（名前・カテゴリ）を取得します（`GET /v1/analyticsReportRequests/{id}/reports`）。`asc analytics fetch` の `--report` に渡す正確なレポート名はこのコマンドで確認します。複数のリクエストが存在する場合はアクティブな（停止していない）ものを優先します。

指定した `--access-type` のリクエストが存在しない場合は `ASC_ANALYTICS_REQUEST_NOT_FOUND`（exit code 2）になります。先に `asc analytics request ensure` を実行してください。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--app <appId>` | -（`ASC_APP_ID` 未設定時は必須） | 対象アプリの App Store Connect ID |
| `--access-type <type>` | - | 参照するリクエストの種類。`ONGOING`（デフォルト）または `ONE_TIME_SNAPSHOT` |
| `--category <category>` | - | カテゴリで絞り込み（例: `APP_STORE_ENGAGEMENT`） |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc analytics reports --app 1234567890
```

### 出力例（JSON）

```json
{
  "requestId": "f8f99a6a-0000-0000-0000-000000000000",
  "accessType": "ONGOING",
  "stoppedDueToInactivity": false,
  "reports": [
    {
      "id": "r-1",
      "name": "App Store Discovery and Engagement Standard",
      "category": "APP_STORE_ENGAGEMENT"
    },
    {
      "id": "r-2",
      "name": "App Downloads Standard",
      "category": "APP_STORE_COMMERCE"
    }
  ]
}
```

---

## asc analytics fetch

### 説明

指定したレポートのインスタンス（日付ごとの生成物）を日付範囲で絞り込み、各インスタンスのセグメントファイルをダウンロードして `ASC_REPORTS_DIR`（デフォルト `./reports`）配下に保存します。内部では「`--access-type` のリクエスト解決（アクティブ優先） → レポート名の照合 → インスタンス一覧（`filter[granularity]`）→ セグメント URL の取得 → ダウンロード」を順に実行します。`ONE_TIME_SNAPSHOT` で生成した履歴データは `--access-type ONE_TIME_SNAPSHOT` で取得します。

gzip 圧縮されたセグメントは**解凍して**保存します。ファイル名は `analytics-<レポート名スラッグ>-<granularity>-<処理日>-<連番>.tsv` です（例: `analytics-app-store-discovery-and-engagement-standard-daily-2026-06-01-1.tsv`）。

日付範囲内にインスタンスが 1 件もない場合はエラーにならず、`files: []` で正常終了します（stderr に警告を出力）。レポート名が見つからない場合は、利用可能なレポート名の一覧を `details.available` に含むエラー（`ASC_ANALYTICS_REPORT_NOT_FOUND`）になります。

### オプション

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `--app <appId>` | -（`ASC_APP_ID` 未設定時は必須） | 対象アプリの App Store Connect ID |
| `--report <name>` | **必須** | レポート名（例: `"App Store Discovery and Engagement Standard"`）。`asc analytics reports` で確認 |
| `--access-type <type>` | - | 参照するリクエストの種類。`ONGOING`（デフォルト）または `ONE_TIME_SNAPSHOT` |
| `--granularity <granularity>` | - | `DAILY`（デフォルト）/ `WEEKLY` / `MONTHLY` |
| `--from <YYYY-MM-DD>` | **必須** | 取得開始日（processingDate の下限） |
| `--to <YYYY-MM-DD>` | **必須** | 取得終了日。`--from` 以降の日付であること |
| `--json` | - | エラー出力を JSON 形式にする（結果は常に JSON） |

### 実行例

```sh
asc analytics fetch --app 1234567890 \
  --report "App Store Discovery and Engagement Standard" \
  --from 2026-06-01 --to 2026-06-07
```

### 出力例（JSON）

```json
{
  "report": "App Store Discovery and Engagement Standard",
  "category": "APP_STORE_ENGAGEMENT",
  "granularity": "DAILY",
  "from": "2026-06-01",
  "to": "2026-06-07",
  "instances": 7,
  "stoppedDueToInactivity": false,
  "files": [
    {
      "date": "2026-06-01",
      "path": "reports/analytics-app-store-discovery-and-engagement-standard-daily-2026-06-01-1.tsv",
      "bytes": 20480
    }
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
| `ASC_API_BASE_URL` | 任意 | `apps list` / `auth token` / `reports fetch` / `analytics` 系 | API のベース URL。デフォルト `https://api.appstoreconnect.apple.com` |
| `ASC_REPORTS_DIR` | 任意 | `reports fetch` / `analytics fetch` | レポートの保存先ディレクトリ。デフォルト `./reports` |
| `ASC_APP_ID` | 任意 | `analytics` 系 | `--app` 省略時に使われるデフォルトのアプリ ID |

認証用の環境変数（`ASC_ISSUER_ID` / `ASC_KEY_ID` / 秘密鍵）は `analytics` 系コマンドでも必須です。`reports list` は環境変数を必要としません。

---

## 出力規約

- **stdout**: コマンド成功時の **JSON の結果のみ** を出力します（1 行の JSON + 改行）。パイプや `jq` での後続処理を想定しています。
- **stderr**: 診断メッセージとエラーを出力します。
  - 通常時のエラー形式: `エラーコード: メッセージ`（`details` がある場合は整形済み JSON が続く）
  - `--json` 指定時のエラー形式: `{"ok":false,"error":{"code":"...","message":"...","details":...}}`
- **exit code**:
  - `0`: 成功
  - `2`: **設定不足**（認証用環境変数の不足 = `ASC_AUTH_NOT_CONFIGURED`、`ASC_VENDOR_NUMBER` の不足 = `ASC_REPORTS_NOT_CONFIGURED`、アプリ ID の不足 = `ASC_APP_ID_REQUIRED`）、入力バリデーションエラー（`VALIDATION_FAILED`）、前提条件の不足（ONGOING リクエスト未作成 = `ASC_ANALYTICS_REQUEST_NOT_FOUND`、レポート名不一致 = `ASC_ANALYTICS_REPORT_NOT_FOUND`）、API の 4xx エラー
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
