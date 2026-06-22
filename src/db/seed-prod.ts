/**
 * 本番用シード。テストデータ(山田太郎など)は作らず、組織1つと管理者アカウント、
 * 既定のミス分類だけを用意する。生徒・保護者は管理者が画面から発行する。
 *
 * 実行: `set -a && . ./.env && set +a && npm run db:seed:prod`
 * (DATABASE_URL が本番(Neon)を指していること)
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "./index";
import { mistakeTags, organizations, users } from "./schema";

const ORG_NAME = process.env.SEED_ORG_NAME ?? "まなび教室";
const ADMIN_EMAIL = "morisan.yutakun@gmail.com";
const ADMIN_PASSWORD = "yutamori0829";
const ADMIN_NAME = "運営者";

async function main() {
  // 組織
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, ORG_NAME))
    .limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values({ name: ORG_NAME }).returning();
    console.log("組織を作成:", org.name);
  } else {
    console.log("組織は既存:", org.name);
  }

  // 管理者アカウント (email+password)。既存なら role/パスワードを更新。
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);
  if (!existing) {
    await db.insert(users).values({
      organizationId: org.id,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      passwordHash,
    });
    console.log("管理者を作成:", ADMIN_EMAIL);
  } else {
    await db
      .update(users)
      .set({ role: "admin", passwordHash, organizationId: org.id })
      .where(eq(users.id, existing.id));
    console.log("管理者を更新:", ADMIN_EMAIL);
  }

  // 既定のミス分類 (設定値。テストデータではない)
  const defs: [string, string][] = [
    ["計算ミス", "#ef4444"],
    ["読み間違い", "#f59e0b"],
    ["途中式なし", "#3b82f6"],
    ["未記入", "#64748b"],
  ];
  for (let i = 0; i < defs.length; i++) {
    const [t] = await db
      .select()
      .from(mistakeTags)
      .where(eq(mistakeTags.name, defs[i][0]))
      .limit(1);
    if (!t) {
      await db.insert(mistakeTags).values({
        organizationId: org.id,
        name: defs[i][0],
        color: defs[i][1],
        sortOrder: i,
      });
    }
  }

  console.log("\n本番シード完了。ログイン:");
  console.log(`  管理者: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
