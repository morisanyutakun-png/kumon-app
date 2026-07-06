# まなび教室 — 塾管理システム (Next.js版)

公文式のような反復学習型の小学生向け学習教室を、個人事業主が在宅で運営するための
塾管理システムです。課題の配布・答案画像の提出・採点・返却までを **すべてアプリ内で完結** させます
(Google Classroom は使用しません)。

既存 PHP アプリ (`../iplus-sysのコピー2`) の画面構成・採点管理の考え方・DBスキーマを
参考に、新規に再設計しています。**既存データの移行は行いません。**

## アーキテクチャ

| 項目 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| DB | Neon PostgreSQL (本番) / ローカルは Docker Postgres |
| ORM | Drizzle ORM (Neon serverless / postgres.js のデュアルドライバ) |
| 認証 | Auth.js (NextAuth v5) Credentials |
| ファイル保存 | Vercel Blob (未設定時はローカル `./.uploads` にフォールバック) |
| UI | Tailwind CSS v4 + shadcn/ui |
| デプロイ | Vercel |
| E2E | Playwright |

### DB ドライバ (デュアル)

`src/db/index.ts` は接続先に応じて自動でドライバを切り替えます:

- **Neon / Vercel** (接続文字列が `*.neon.tech` / `VERCEL` 環境 / `DB_DRIVER=neon`):
  `@neondatabase/serverless` の Pool + `drizzle-orm/neon-serverless`。WebSocket 経由で
  サーバーレスでも安定し、トランザクションも使えます。
- **ローカル** (Docker Postgres など TCP 直結): `postgres.js`。

アプリ側のクエリ API は同一なので、コードはそのままで両環境に対応します。

フロントエンドとバックエンドは単一の Next.js プロジェクトに同居 (Server Components +
Server Actions + Route Handlers)。マイクロサービス化はしていません。

### マルチテナント設計

すべての業務テーブルに `organization_id` を持たせ、クエリは必ず
`organizationId` でフィルタします (`src/lib/queries.ts` / `src/lib/access.ts`)。
将来、複数の個人事業主・教室へ提供する際に organization 単位でデータを分離できます。

## ユーザー種別 (ロール)

- **管理者 (admin)**
- **採点者・運営者 (operator)**
- **生徒 (student)** — メール無しでも `loginID + PIN` でログイン可
- **保護者 (parent)** — 配下の生徒の課題・結果を確認・代理提出可

生徒はメールアドレスを持たない場合を考慮し、保護者アカウントに紐づけられます
(`guardian_students`)。

## 提出物のステートマシン

```
未提出 ──(生徒/保護者:提出)──▶ 提出済み ──(運営:採点開始)──▶ 採点中
                                                              ├─(返却)─▶ 返却済み ─(確認)─▶ 完了
                                                              └─(再提出依頼)─▶ 再提出依頼 ─(再提出)─▶ 提出済み
```

許可される遷移は `src/lib/submission-state.ts` の `ALLOWED_TRANSITIONS` のみ。
`assertTransition()` を通さない状態変更はできず、ロール (生徒側/運営側) も検証するため
**不正な状態変更を防止** します。各遷移は `submission_events` に監査ログとして残ります。

## ファイル管理 / 権限

- 答案画像・課題ファイルは **Neon には保存せず Vercel Blob へ保存**。DB には URL とメタのみ。
- 答案画像は公開 URL を直接使わず、必ず認証付きルート
  `GET /api/files/submission/[imageId]` 経由で配信します。
  org 一致 + 本人/担当保護者/同org運営者の権限確認を通すため、
  **他の生徒からは閲覧できません**。

## セットアップ (ローカル開発)

### 1. 依存インストール

```bash
npm install
```

### 2. データベースを起動 (Docker)

```bash
docker run -d --name kumon-pg \
  -e POSTGRES_USER=kumon -e POSTGRES_PASSWORD=kumon -e POSTGRES_DB=kumon \
  -p 5433:5432 postgres:16-alpine
```

> ホストの 5432 が既存 Postgres で埋まっている場合があるため **5433** を使っています。
> 別ポートにする場合は `.env` の `DATABASE_URL` を合わせてください。

### 3. 環境変数

```bash
cp .env.example .env
# AUTH_SECRET を生成して設定: openssl rand -base64 32
```

### 4. スキーマ適用 & シード

```bash
set -a && . ./.env && set +a   # .env を環境に読み込む
npm run db:push                # スキーマを DB に反映 (drizzle-kit)
npm run db:seed                # デモ組織・ユーザー・課題を投入
```

> `db:push` が対話待ちになる環境では、代わりに
> `npm run db:generate` で SQL を生成し `drizzle/0000_*.sql` を psql で流してください。

### 5. 開発サーバー

```bash
npm run dev
# http://localhost:3000
```

### デモ用ログイン情報 (シード)

| 種別 | ログイン | パスワード/PIN |
| --- | --- | --- |
| 管理者 | `admin@example.com` | `password123` |
| 運営・採点者 | `operator@example.com` | `password123` |
| 保護者 | `parent@example.com` | `password123` |
| 生徒 | ログインID `taro` | PIN `1234` |

## 基本フロー (最初に作った範囲)

1. 管理者/運営者が **生徒** と **教材** を登録 (`/students`, `/materials`)
2. 生徒に **課題を割り当てる** (`/assignments`) → 提出物が「未提出」で作成される
3. 生徒/保護者が **答案画像を提出** (`/home` → `/submissions/[id]`)
4. 運営者の **未採点一覧** に「提出済み」で表示 (`/dashboard`, `/grading`)
5. 運営者が **採点・コメント入力・ミス分類** (`/grading/[id]`)
6. **採点結果を返却** または **再提出を依頼**
7. 生徒/保護者が **結果・コメントを確認** し「完了」にする

AI採点・OCR・決済・チャット・高度な分析は対象外です。

## 学習進度の自動前進エンジン

既存 PHP `app/domain.php` の「進度・範囲計算」の考え方を `src/lib/progress.ts` に
小学生向けに作り直して移植しています。合格(OK)で返却すると、割当の進度を1つ前進させ、
**次の範囲の提出物(未提出)を自動生成**します。

- トラック種別: `chapter`(章/単元ごと) / `number`(番号ごと) / `manual`(手入力)
  - ※ 公文式固有の「eトレ」「教材ミックス」は本アプリでは採用していません。
- 合格で `progressIndex += unitsPerSession`、不合格・再提出依頼では据え置き
- 完了時: `delete`(割当完了) または `review_loop`(総復習を反復)
- 今回/次回/復習範囲のラベル算出、`X/Y 回目` 表示

`manual` 教材は自動前進せず、運営者が都度割り当てます。

## Excel風 一括採点

`/grading/batch` で、提出済みの答案を表形式でまとめて採点できます
(既存 PHP の添削入力画面の操作感を参考)。各行に得点・満点・合否・コメントを入力し、
操作(返却/再提出依頼)を選んで「まとめて保存」で一括処理します。
合格で返却した行は学習進度が自動で1つ進みます。

## 成績・学習履歴

- 運営者: 生徒一覧から生徒名 → `生徒詳細`(提出履歴・採点履歴・合格率などの統計)。
- 生徒・保護者: ヘッダー「履歴」→ `/history` で過去の採点結果を確認。
  保護者は紐づく複数の生徒分をまとめて閲覧できます。

## デモ(ゲスト)モード ― DB・ログイン設定なしで即デプロイ

`DATABASE_URL` を設定せずにデプロイすると、自動的に**デモモード**で起動します
(明示する場合は環境変数 `DEMO_MODE=1`)。

- **DB不要**: PGlite（サーバー内蔵のメモリ内Postgres）を自動で立ち上げ、スキーマ作成と
  サンプルデータ投入まで自動で行います。外部DBは不要です。
- **ログイン不要**: `/login` の「ゲストで入る」(運営/生徒/保護者) を選ぶだけで利用できます。
- データは一時的（インスタンス内のみ・再起動でリセット）。お試し・デモ用です。

**本番への復帰**は、Vercel に `DATABASE_URL`(Neon) と `AUTH_SECRET` を設定するだけ。
自動的に通常モード（Neon + ログイン認証）に切り替わります（コード変更不要）。

> 注意: デモモードのローカル確認は `npm run build && npm run start`（本番相当）で行ってください。
> `next dev`（Turbopack）では PGlite の WASM 読み込みが不安定なため、ローカル開発は
> Docker Postgres（`DATABASE_URL` 設定）を使うことを推奨します。
> スキーマ変更時はデモ用DDLを `npm run demo:ddl` で再生成してください。

## デプロイ (Vercel + Neon + Vercel Blob)

1. **Neon**: プロジェクト作成 → **Pooled connection** 文字列を取得。
2. **Vercel**: GitHub 連携でこのリポジトリをインポート。Environment Variables に設定:
   - `DATABASE_URL` = Neon の pooled 接続文字列 (`?sslmode=require`)
   - `AUTH_SECRET` = `openssl rand -base64 32`
   - `AUTH_URL` = `https://<your-app>.vercel.app`
   - `BLOB_READ_WRITE_TOKEN` = Vercel Storage → Blob で発行したトークン
3. **マイグレーション適用** (ローカルから Neon に対して実行):
   ```bash
   DATABASE_URL="<NeonのURL>" npm run db:migrate   # drizzle/ のSQLを適用
   DATABASE_URL="<NeonのURL>" npm run db:seed       # 初回のみ (任意)
   ```
4. デプロイ。以降はコードを push するたび Vercel が自動ビルド & デプロイします。

> スキーマを変更したら `npm run db:generate` で `drizzle/` に SQL を生成し、
> コミット → `npm run db:migrate` で各環境へ適用します。

## テスト

```bash
npm run test:unit   # 進度エンジンの単体テスト (純関数)
npm run e2e         # Playwright E2E (dev サーバーを自動起動)
npm run e2e:ui      # Playwright UI モード
```

E2E は主要フロー (生徒/教材登録 → 課題割当 → 答案提出 → 採点・返却 → 確認・完了) と
認証ガードを検証します。ローカル DB にシードが入っている前提です。
`scripts/advance-db-test.ts` は章ごと教材の自動前進を実 DB で検証します。

## 主要ディレクトリ

| パス | 役割 |
| --- | --- |
| `src/db/schema.ts` | Drizzle スキーマ (全テーブル / enum / relations) |
| `src/db/seed.ts` | デモデータ投入 |
| `src/auth.ts` | Auth.js 設定 (staff/parent と student の2系統ログイン) |
| `src/lib/submission-state.ts` | 提出物ステートマシン (許可遷移表) |
| `src/lib/progress.ts` | 学習進度エンジン (純関数 / domain.php 移植) |
| `src/lib/progress-db.ts` | 進度エンジンと DB 行の橋渡し |
| `src/lib/access.ts` | セッション取得・ロール/テナント/生徒アクセス制御 |
| `src/lib/queries.ts` | org スコープの読み取りクエリ |
| `src/lib/blob.ts` | ファイル保存 (Vercel Blob / ローカル) |
| `src/lib/actions/*` | Server Actions (認証・提出/採点・管理CRUD) |
| `src/app/(operator)/*` | 管理者・運営者向け画面 |
| `src/app/(student)/*` | 生徒・保護者向け画面 |
| `src/app/api/files/*` | 認証付きファイル配信ルート |
| `e2e/*` | Playwright E2E テスト |
| `scripts/*` | 進度エンジンのテストスクリプト |
| `drizzle/*` | 生成済みマイグレーション SQL |

## npm スクリプト

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run db:push` | スキーマを DB に反映 (開発用) |
| `npm run db:generate` | マイグレーション SQL を生成 |
| `npm run db:migrate` | `drizzle/` のマイグレーションを適用 (本番向け) |
| `npm run db:seed` | デモデータ投入 |
| `npm run db:studio` | Drizzle Studio (DB GUI) |
| `npm run test:unit` | 進度エンジン単体テスト |
| `npm run e2e` | Playwright E2E |

## yuta-eng（申込・決済サイト）からのアカウント発行連携

決済は **yuta-eng** 側で完了し、本アプリは **アカウント発行（ログインできるようにする）** だけを担当する。

### 連携の流れ（st~ ログインID + PIN 方式：運営作成の生徒と同一形式）
1. ユーザーは決済成功後 `/{このアプリ}/setup?session_id=cs_xxx` に戻る。
2. `/setup` がサーバー側で yuta-eng の照会API（`GET /api/provision/session`、ヘッダ `x-nobit-secret`）を呼び、`paid:true` を確認。
3. 確認できたら **冪等にアカウントを発行**：`students` 行に **`loginId`（st~）＋ PIN（`pinHash`/`pinPlain`）** を発行（`active`）し、契約は `subscriptions`（`stripeSessionId` 一意）に保存して `subscriptions.studentId` で紐付け。`/setup` は **ログインID（st~）＋ PIN** を画面表示し「ログインする」ボタンを出す。
4. **メール送信は `/setup` と Webhook（`POST /api/provision`）の両方**で行う。送るのは **顧客＝ログインID＋PIN＋ログインURL**、**運営者（admin/operator）＝発行通知**。Webhook が来なくても `/setup` で確実に送られる。
5. 生徒は **既存の生徒ログイン（loginID + PIN）**でログイン（`auth.ts` の students 経路）。運営は **生徒管理 `/students`** で各生徒の st~ と PIN（管理者表示）を確認・伝達でき、手動作成の生徒と同じ表示になる。

### アカウント方式（既存認証に準拠）
- 認証は **NextAuth v5（JWT）＋ Credentials ＋ bcryptjs**。生徒は `students.loginId + pinHash`（`auth.ts` の生徒ログイン経路）で照合。運営作成の生徒と完全に同一方式。
- 発行は `students` のみ（`users` 行は作らない）。`pinPlain` は運営が生徒管理で確認・伝達する用途（既存の手動作成生徒と同方針）。

### 冪等性・エッジケース
- 冪等キーは **`subscriptions.stripeSessionId`（一意）**。同じ Stripe Checkout Session は再作成せず、同じ保護者メールでも別 Session なら別生徒を発行する。`onConflictDoUpdate(stripeSessionId)` で契約を upsert し、`subscriptions.studentId` が空のときだけ **条件付きUPDATE**で生徒を1件だけ紐付ける。
- **Webhook と `/setup` が同時に来ても 500 にしない／生徒を二重作成しない**（負けた側は自分の生徒を破棄して相手の資格情報を返す）。
- 既に発行済みの再来は再作成せず、既存の st~/PIN を返して案内。
- 照会APIが 402/404/エラーならログイン情報を出さずエラーと問い合わせ導線を表示（`/setup` は想定外例外でも 500 にせず復旧UI＋ `app/setup/error.tsx`）。
- **メール送信は try/catch で必ず分離**。`/setup` では送信失敗時もログインID/PINを画面表示する。Webhook では顧客メール送信に失敗した場合 5xx を返し、yuta-eng / Stripe の再試行に乗せる。送信元は要 Resend ドメイン認証（`SETUP_EMAIL_FROM`）。

### 必要な環境変数（Vercel / `.env`）
| 変数 | 用途 |
| --- | --- |
| `NOBIT_REGISTER_SECRET` | yuta-eng と同じ共有シークレット（照会API・Webhook 両方） |
| `YUTA_ENG_BASE_URL` | 照会APIのベースURL（既定 `https://yuta-eng.com`） |
| `NOBIT_PROVISION_ORG_ID` | 発行先 organization の UUID（中高部のテナント） |
| `RESEND_API_KEY` | メール送信（未設定なら送信スキップ。session_id フローは設定可） |
| `SETUP_EMAIL_FROM` | 送信元（Resend で検証済みドメイン推奨） |
| `AUTH_URL` | メール内リンクの絶対URLの生成に使用 |

### マイグレーション
スキーマ追加（`account_status` enum、`users.status`、`subscriptions` / `subscription_subjects` / `setup_tokens`）は `drizzle/0006_stripe_provisioning.sql`。同じメールで複数購入できるようにする制約変更は `drizzle/0010_mighty_alex_power.sql`。本番反映:
```
npm run db:migrate      # もしくは npm run db:push
```

### 購入科目の教材割り当て
決済時の購入科目（`subscriptions` / `subscription_subjects`）を、その生徒への教材割り当てに反映できる。

- **対応表**: `src/lib/subject-map.ts` の `YUTA_SUBJECT_LABEL`（yuta-eng 科目ID → `materials.subject` ラベル。例 `physics→物理`, `math-2bc→数学IIBC`）。中高部教材は、この表のラベルに合わせて `subject` を付けて登録すると自動でマッチする（運用に応じて編集可）。
- **手動（既定・推奨）**: 運営の生徒画面 `/grades/[studentId]` に「購入科目」と **「購入科目の教材を割り当て」** ボタンを表示。押すと購入科目に一致する教科の教材を一括割り当て（既割り当てはスキップ。assignment と初回 submission を対で作成）。
- **自動（任意・既定OFF）**: `PROVISION_AUTO_ASSIGN=1` を設定すると、アカウント発行時（`maybeAutoAssign`）に同じロジックで自動割り当て（失敗しても発行は継続）。手動・自動は共通コア `src/lib/assign-purchased.ts` を再利用。
- **前提**: いずれも、割り当て先の中高部教材が `materials` に登録済みであること（未登録なら「該当教材なし」と表示）。
