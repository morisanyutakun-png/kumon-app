/**
 * 開発用シードデータ。
 *   実行: `set -a && . ./.env && set +a && npm run db:seed`
 *
 * デモ組織1つ、各ロールのアカウント、生徒、教材、課題割当、未提出の提出物を作成。
 * 既存データは消さず、メール/loginId が重複する場合はスキップする。
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "./index";
import {
  assignments,
  guardianStudents,
  materials,
  mistakeTags,
  organizations,
  students,
  submissions,
  units,
  users,
} from "./schema";

const PASSWORD = "password123";
const STUDENT_PIN = "1234";

async function main() {
  console.log("シード開始...");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const pinHash = await bcrypt.hash(STUDENT_PIN, 10);

  // --- 組織 ---
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, "さくら学習教室"))
    .limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "さくら学習教室" })
      .returning();
    console.log("組織を作成:", org.name);
  }
  const organizationId = org.id;

  // --- ユーザー (管理者/運営/保護者) ---
  async function ensureUser(
    email: string,
    name: string,
    role: "admin" | "operator" | "parent",
  ) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return existing;
    const [u] = await db
      .insert(users)
      .values({ organizationId, email, name, role, passwordHash })
      .returning();
    console.log(`ユーザー作成: ${email} (${role})`);
    return u;
  }

  await ensureUser("admin@example.com", "管理者 太郎", "admin");
  const operator = await ensureUser("operator@example.com", "採点 花子", "operator");
  const parent = await ensureUser("parent@example.com", "保護者 一郎", "parent");

  // --- 生徒 ---
  async function ensureStudent(
    name: string,
    grade: string,
    loginId?: string,
  ) {
    const [existing] = await db
      .select()
      .from(students)
      .where(eq(students.name, name))
      .limit(1);
    if (existing) return existing;
    const [s] = await db
      .insert(students)
      .values({
        organizationId,
        name,
        grade,
        loginId: loginId ?? null,
        pinHash: loginId ? pinHash : null,
      })
      .returning();
    console.log(`生徒作成: ${name}${loginId ? ` (loginId=${loginId})` : ""}`);
    return s;
  }

  const taro = await ensureStudent("山田 太郎", "小3", "taro");
  const hanako = await ensureStudent("鈴木 花子", "小5");

  // --- 保護者 ↔ 生徒 紐づけ ---
  for (const child of [taro, hanako]) {
    const [link] = await db
      .select()
      .from(guardianStudents)
      .where(eq(guardianStudents.studentId, child.id))
      .limit(1);
    if (!link) {
      await db.insert(guardianStudents).values({
        organizationId,
        guardianUserId: parent.id,
        studentId: child.id,
      });
      console.log(`保護者紐づけ: ${parent.name} → ${child.name}`);
    }
  }

  // --- ミス分類 ---
  const tagDefs = [
    { name: "計算ミス", color: "#ef4444" },
    { name: "読み間違い", color: "#f59e0b" },
    { name: "途中式なし", color: "#3b82f6" },
    { name: "未記入", color: "#64748b" },
  ];
  for (let i = 0; i < tagDefs.length; i++) {
    const [existing] = await db
      .select()
      .from(mistakeTags)
      .where(eq(mistakeTags.name, tagDefs[i].name))
      .limit(1);
    if (!existing) {
      await db.insert(mistakeTags).values({
        organizationId,
        name: tagDefs[i].name,
        color: tagDefs[i].color,
        sortOrder: i,
      });
    }
  }

  // --- 教材 + 単元 ---
  let [material] = await db
    .select()
    .from(materials)
    .where(eq(materials.name, "たし算プリント A"))
    .limit(1);
  if (!material) {
    [material] = await db
      .insert(materials)
      .values({
        organizationId,
        subject: "数学",
        name: "たし算プリント A",
        description: "1桁＋1桁の反復練習",
        progressType: "manual",
        completionAction: "delete",
        sortOrder: 0,
      })
      .returning();
    await db.insert(units).values([
      { organizationId, materialId: material.id, sortOrder: 0, title: "A-1", rangeText: "1〜10" },
      { organizationId, materialId: material.id, sortOrder: 1, title: "A-2", rangeText: "11〜20" },
      { organizationId, materialId: material.id, sortOrder: 2, title: "A-3", rangeText: "21〜30" },
    ]);
    console.log("教材作成: たし算プリント A (+単元3)");
  }

  // --- 課題割当 + 提出物(未提出) ---
  const [existingAssign] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.studentId, taro.id))
    .limit(1);
  if (!existingAssign) {
    const [assign] = await db
      .insert(assignments)
      .values({
        organizationId,
        studentId: taro.id,
        materialId: material.id,
        title: "たし算プリント A-1",
        rangeText: "A-1 (1〜10)",
        instructions: "答案を写真に撮って提出してください。",
        assignedById: operator.id,
      })
      .returning();
    await db.insert(submissions).values({
      organizationId,
      assignmentId: assign.id,
      studentId: taro.id,
      status: "not_submitted",
      sessionNo: 1,
      rangeText: "A-1 (1〜10)",
    });
    console.log("課題割当 + 提出物(未提出) を作成: 山田 太郎");
  }

  // --- 自動進度デモ: 章ごと教材 (合格で次の単元へ自動前進) ---
  let [chapterMaterial] = await db
    .select()
    .from(materials)
    .where(eq(materials.name, "けいさんドリル B"))
    .limit(1);
  if (!chapterMaterial) {
    [chapterMaterial] = await db
      .insert(materials)
      .values({
        organizationId,
        subject: "数学",
        name: "けいさんドリル B",
        description: "章ごとに進み、合格すると次の単元へ自動で進みます。",
        progressType: "chapter",
        completionAction: "review_loop",
        sortOrder: 1,
      })
      .returning();
    await db.insert(units).values([
      { organizationId, materialId: chapterMaterial.id, sortOrder: 0, title: "B-1", rangeText: "たし算" },
      { organizationId, materialId: chapterMaterial.id, sortOrder: 1, title: "B-2", rangeText: "ひき算" },
      { organizationId, materialId: chapterMaterial.id, sortOrder: 2, title: "B-3", rangeText: "かけ算" },
    ]);
    const [assignB] = await db
      .insert(assignments)
      .values({
        organizationId,
        studentId: hanako.id,
        materialId: chapterMaterial.id,
        title: "けいさんドリル B",
        rangeText: "B-1",
        instructions: "答案を写真に撮って提出してください。",
        progressIndex: 0,
        unitsPerSession: 1,
        pointer: 1,
        assignedById: operator.id,
      })
      .returning();
    await db.insert(submissions).values({
      organizationId,
      assignmentId: assignB.id,
      studentId: hanako.id,
      status: "not_submitted",
      sessionNo: 1,
      rangeText: "B-1",
    });
    console.log("自動進度デモ教材+課題を作成: けいさんドリル B → 鈴木 花子");
  }

  console.log("\nシード完了。ログイン情報:");
  console.log("  管理者:   admin@example.com    / " + PASSWORD);
  console.log("  運営/採点: operator@example.com / " + PASSWORD);
  console.log("  保護者:   parent@example.com   / " + PASSWORD);
  console.log("  生徒:     loginId=taro         / PIN " + STUDENT_PIN);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
