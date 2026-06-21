/**
 * デモ(ゲスト)モード。
 *
 * DATABASE_URL が無い、または DEMO_MODE=1 のとき有効。
 * - DB: PGlite (メモリ内Postgres) を自動でスキーマ作成+シード (src/db/index.ts)。
 * - 認証: ログイン不要。/login の「ゲストで入る」でロールを選ぶとcookieにロールを保存し、
 *   getPrincipal() が固定のデモ principal を返す (src/lib/access.ts)。
 *
 * 本番復帰: DATABASE_URL と AUTH_SECRET を設定すれば自動的に通常モードへ戻る。
 */
import type { Principal } from "@/auth";
import type { UserRole } from "@/db/schema";

/** デモで使う固定 UUID (PGlite シードと一致させる)。 */
export const DEMO = {
  orgId: "00000000-0000-0000-0000-0000000000a0",
  adminUserId: "00000000-0000-0000-0000-0000000000a1",
  operatorUserId: "00000000-0000-0000-0000-0000000000a2",
  parentUserId: "00000000-0000-0000-0000-0000000000a3",
  studentTaroId: "00000000-0000-0000-0000-0000000000b1",
  studentHanakoId: "00000000-0000-0000-0000-0000000000b2",
} as const;

export const DEMO_COOKIE = "demo_role";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !process.env.DATABASE_URL;
}

/** cookie のロール文字列から デモ principal を作る。未対応値は operator。 */
export function demoPrincipal(role: string | undefined): Principal {
  switch (role) {
    case "student":
      return {
        id: DEMO.studentTaroId,
        name: "ゲスト生徒 (山田 太郎)",
        role: "student",
        organizationId: DEMO.orgId,
        studentId: DEMO.studentTaroId,
      };
    case "parent":
      return {
        id: DEMO.parentUserId,
        name: "ゲスト保護者",
        role: "parent",
        organizationId: DEMO.orgId,
      };
    case "admin":
      return {
        id: DEMO.adminUserId,
        name: "ゲスト管理者",
        role: "admin",
        organizationId: DEMO.orgId,
      };
    default:
      return {
        id: DEMO.operatorUserId,
        name: "ゲスト運営者",
        role: "operator",
        organizationId: DEMO.orgId,
      };
  }
}

export const DEMO_ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  operator: "運営・採点者",
  student: "生徒",
  parent: "保護者",
};

/** PGlite に投入するデモデータ (DEMO_DDL の後に実行)。 */
export const DEMO_SEED = `
INSERT INTO organizations (id, name) VALUES ('${DEMO.orgId}', 'デモ学習教室');

INSERT INTO users (id, organization_id, email, name, role, password_hash) VALUES
  ('${DEMO.adminUserId}', '${DEMO.orgId}', 'admin@demo.local', 'デモ管理者', 'admin', ''),
  ('${DEMO.operatorUserId}', '${DEMO.orgId}', 'operator@demo.local', 'デモ運営者', 'operator', ''),
  ('${DEMO.parentUserId}', '${DEMO.orgId}', 'parent@demo.local', 'デモ保護者', 'parent', '');

INSERT INTO students (id, organization_id, name, grade, login_id) VALUES
  ('${DEMO.studentTaroId}', '${DEMO.orgId}', '山田 太郎', '小3', 'taro'),
  ('${DEMO.studentHanakoId}', '${DEMO.orgId}', '鈴木 花子', '小5', null);

INSERT INTO guardian_students (organization_id, guardian_user_id, student_id) VALUES
  ('${DEMO.orgId}', '${DEMO.parentUserId}', '${DEMO.studentTaroId}'),
  ('${DEMO.orgId}', '${DEMO.parentUserId}', '${DEMO.studentHanakoId}');

INSERT INTO mistake_tags (organization_id, name, color, sort_order) VALUES
  ('${DEMO.orgId}', '計算ミス', '#ef4444', 0),
  ('${DEMO.orgId}', '読み間違い', '#f59e0b', 1),
  ('${DEMO.orgId}', '途中式なし', '#3b82f6', 2);

INSERT INTO materials (id, organization_id, subject, name, description, progress_type, completion_action, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '${DEMO.orgId}', '数学', 'たし算プリント A', '1桁＋1桁の反復練習', 'manual', 'delete', 0),
  ('00000000-0000-0000-0000-0000000000c2', '${DEMO.orgId}', '数学', 'けいさんドリル B', '章ごとに進み、合格で次の単元へ自動前進', 'chapter', 'review_loop', 1);

INSERT INTO units (organization_id, material_id, sort_order, title, range_text) VALUES
  ('${DEMO.orgId}', '00000000-0000-0000-0000-0000000000c2', 0, 'B-1', 'たし算'),
  ('${DEMO.orgId}', '00000000-0000-0000-0000-0000000000c2', 1, 'B-2', 'ひき算'),
  ('${DEMO.orgId}', '00000000-0000-0000-0000-0000000000c2', 2, 'B-3', 'かけ算');

INSERT INTO assignments (id, organization_id, student_id, material_id, title, range_text, instructions, assigned_by_id) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '${DEMO.orgId}', '${DEMO.studentTaroId}', '00000000-0000-0000-0000-0000000000c1', 'たし算プリント A-1', 'A-1 (1〜10)', '答案を写真に撮って提出してください。', '${DEMO.operatorUserId}'),
  ('00000000-0000-0000-0000-0000000000d2', '${DEMO.orgId}', '${DEMO.studentHanakoId}', '00000000-0000-0000-0000-0000000000c2', 'けいさんドリル B', 'B-1', '答案を写真に撮って提出してください。', '${DEMO.operatorUserId}');

INSERT INTO submissions (organization_id, assignment_id, student_id, status, session_no, range_text) VALUES
  ('${DEMO.orgId}', '00000000-0000-0000-0000-0000000000d1', '${DEMO.studentTaroId}', 'not_submitted', 1, 'A-1 (1〜10)'),
  ('${DEMO.orgId}', '00000000-0000-0000-0000-0000000000d2', '${DEMO.studentHanakoId}', 'not_submitted', 1, 'B-1');
`;
