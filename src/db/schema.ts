/**
 * Drizzle schema — KUMON式 反復学習 塾管理システム.
 *
 * 既存 PHP アプリ (iplus-sys) の students / materials / units / assignments /
 * results 構造を参考に、Google Classroom 依存を排し「アプリ内で完結する
 * 課題配布 → 答案提出 → 採点 → 返却」フローへ再設計したもの。
 *
 * マルチテナント: 業務テーブルはすべて organizationId を持ち、クエリは
 * 必ず org 境界でフィルタする (src/lib/tenant.ts のヘルパー経由)。
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// =============================================================================
// Enums
// =============================================================================

/** ロール: 管理者 / 採点者・運営者 / 生徒 / 保護者 */
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "operator",
  "student",
  "parent",
]);

/**
 * 教材の進め方。小学生向けの反復学習に必要な3種類:
 *   chapter 章(単元)ごと / number 番号ごと / manual 手入力。
 * (公文式固有の「eトレ」等は本アプリでは不要のため採用しない)
 */
export const progressTypeEnum = pgEnum("progress_type", [
  "chapter", // 章(単元)ごと
  "number", // 番号ごと (例: 1〜1200)
  "manual", // 手入力 (範囲を毎回指定)
]);

/** 教材完了時の動作。 */
export const completionActionEnum = pgEnum("completion_action", [
  "delete", // 完了で割当終了
  "review_loop", // 総復習を反復
]);

/**
 * 提出物の状態。不正遷移は src/lib/submission-state.ts の許可遷移表で防止する。
 *   not_submitted     未提出
 *   submitted         提出済み
 *   grading           採点中
 *   returned          返却済み
 *   resubmit_required 再提出依頼
 *   done              完了
 */
export const submissionStatusEnum = pgEnum("submission_status", [
  "not_submitted",
  "submitted",
  "grading",
  "returned",
  "resubmit_required",
  "done",
]);

/** 採点結果 (合否)。 */
export const gradingResultEnum = pgEnum("grading_result", ["ok", "ng"]);

/** 教材に紐づくファイル種別。 */
export const materialFileKindEnum = pgEnum("material_file_kind", [
  "assignment", // 課題本体 (PDF など)
  "answer_key", // 解答
  "other",
]);

// =============================================================================
// テナント & ユーザー
// =============================================================================

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * ログイン可能なアカウント (管理者・運営者・保護者、および任意で生徒)。
 * email+password が基本。生徒でメールを持たない場合は students 側の
 * loginId/pin でログインするため users 行は不要。
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull().default(""),
    role: userRoleEnum("role").notNull(),
    passwordHash: text("password_hash").notNull(),
    // 管理者のみが閲覧できる平文パスワード(本人へ伝達する用途)。認証は passwordHash を使用。
    pwPlain: varchar("pw_plain", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/**
 * 生徒。メールを持たない子どもを想定し users とは独立。
 *  - userId: 生徒自身がログインする場合の users への参照 (任意)。
 *  - loginId/pinHash: メール無し生徒向けの簡易ログイン資格情報 (任意)。
 */
export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    grade: varchar("grade", { length: 64 }).notNull().default(""),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    loginId: varchar("login_id", { length: 64 }),
    pinHash: text("pin_hash"),
    // 管理者のみが閲覧できる平文PIN (本人へ伝達する用途)。認証は pinHash を使用。
    pinPlain: varchar("pin_plain", { length: 16 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("students_login_id_unique").on(t.loginId)],
);

/** 保護者(users.role=parent) と生徒の多対多リンク。 */
export const guardianStudents = pgTable(
  "guardian_students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    relation: varchar("relation", { length: 32 }).notNull().default("parent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("guardian_students_unique").on(t.guardianUserId, t.studentId),
  ],
);

// =============================================================================
// 教材 & 単元
// =============================================================================

export const materials = pgTable("materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 64 }).notNull().default(""),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  progressType: progressTypeEnum("progress_type").notNull().default("manual"),
  numberStart: integer("number_start"),
  numberEnd: integer("number_end"),
  completionAction: completionActionEnum("completion_action")
    .notNull()
    .default("delete"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  title: varchar("title", { length: 255 }).notNull().default(""),
  rangeText: varchar("range_text", { length: 255 }).notNull().default(""),
});

/** 課題ファイル。実体は Vercel Blob、ここには URL とメタのみ保存。 */
export const materialFiles = pgTable("material_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  kind: materialFileKindEnum("kind").notNull().default("assignment"),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull().default(""),
  contentType: varchar("content_type", { length: 128 }).notNull().default(""),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// 割当 (課題配布)
// =============================================================================

/**
 * 生徒への課題割当。既存 PHP の assignments(進度モデル) を継承。
 * MVP では progressIndex / unitsPerSession は保持のみで自動前進はしない。
 */
export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 255 }).notNull().default(""),
  rangeText: varchar("range_text", { length: 255 }).notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }),
  // 進度モデル (将来の自動前進用に保持)
  progressIndex: integer("progress_index").notNull().default(0),
  unitsPerSession: integer("units_per_session").notNull().default(1),
  pointer: integer("pointer").notNull().default(1),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  assignedById: uuid("assigned_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// 提出 & 採点
// =============================================================================

/**
 * 提出物の状態を保持する 1 レコード。割当ごとに 1 つ作られ、状態を
 * 未提出 → 提出済み → 採点中 → 返却済み/再提出依頼 → 完了 と遷移させる。
 * 再提出は attemptCount を増やしつつ同じ行の状態を回す。
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: submissionStatusEnum("status").notNull().default("not_submitted"),
    // 反復学習の「1回ぶん(セッション)」。割当ごとに合格のたび次セッションが生成される。
    sessionNo: integer("session_no").notNull().default(1),
    // このセッションの実施範囲ラベル (進度エンジンが算出 / 手入力教材は割当の範囲)。
    rangeText: varchar("range_text", { length: 255 }).notNull().default(""),
    attemptCount: integer("attempt_count").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    // 採点中の下書き (タブレット/デスクトップで採点 → 一旦保存)。返却で確定し消える。
    draftScore: numeric("draft_score", { precision: 10, scale: 2 }),
    draftMaxScore: numeric("draft_max_score", { precision: 10, scale: 2 }),
    draftResult: varchar("draft_result", { length: 8 }),
    draftComment: text("draft_comment").notNull().default(""),
    draftNextRange: varchar("draft_next_range", { length: 255 }).notNull().default(""),
    draftGraderId: uuid("draft_grader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("submissions_assignment_idx").on(t.assignmentId)],
);

/** 生徒・保護者のダッシュボードに届くお知らせ (返却通知など)。 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 32 }).notNull().default("returned"),
    title: varchar("title", { length: 255 }).notNull().default(""),
    body: text("body").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_student_idx").on(t.studentId, t.readAt)],
);

/** 答案画像。実体は Vercel Blob、DB には URL とメタのみ。閲覧は権限確認必須。 */
export const submissionImages = pgTable("submission_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  attemptNo: integer("attempt_no").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull().default(""),
  contentType: varchar("content_type", { length: 128 }).notNull().default(""),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 採点結果。再採点ごとに行を追加し、attemptNo で版を区別する (履歴保持)。 */
export const gradings = pgTable("gradings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  attemptNo: integer("attempt_no").notNull().default(1),
  graderId: uuid("grader_id").references(() => users.id, { onDelete: "set null" }),
  score: numeric("score", { precision: 10, scale: 2 }),
  maxScore: numeric("max_score", { precision: 10, scale: 2 }),
  result: gradingResultEnum("result"),
  comment: text("comment").notNull().default(""),
  requiresResubmit: boolean("requires_resubmit").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** ミス分類マスタ。 */
export const mistakeTags = pgTable("mistake_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("#64748b"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** 採点とミス分類の紐づけ。 */
export const gradingMistakes = pgTable(
  "grading_mistakes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gradingId: uuid("grading_id")
      .notNull()
      .references(() => gradings.id, { onDelete: "cascade" }),
    mistakeTagId: uuid("mistake_tag_id")
      .notNull()
      .references(() => mistakeTags.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("grading_mistakes_unique").on(t.gradingId, t.mistakeTagId),
  ],
);

/** 状態遷移の監査ログ (不正遷移検知・履歴)。 */
export const submissionEvents = pgTable("submission_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  fromStatus: submissionStatusEnum("from_status"),
  toStatus: submissionStatusEnum("to_status").notNull(),
  byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// Relations
// =============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  students: many(students),
  materials: many(materials),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  guardianLinks: many(guardianStudents),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [students.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [students.userId], references: [users.id] }),
  guardianLinks: many(guardianStudents),
  assignments: many(assignments),
}));

export const guardianStudentsRelations = relations(
  guardianStudents,
  ({ one }) => ({
    guardian: one(users, {
      fields: [guardianStudents.guardianUserId],
      references: [users.id],
    }),
    student: one(students, {
      fields: [guardianStudents.studentId],
      references: [students.id],
    }),
  }),
);

export const materialsRelations = relations(materials, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [materials.organizationId],
    references: [organizations.id],
  }),
  units: many(units),
  files: many(materialFiles),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  material: one(materials, {
    fields: [units.materialId],
    references: [materials.id],
  }),
}));

export const materialFilesRelations = relations(materialFiles, ({ one }) => ({
  material: one(materials, {
    fields: [materialFiles.materialId],
    references: [materials.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [assignments.organizationId],
    references: [organizations.id],
  }),
  student: one(students, {
    fields: [assignments.studentId],
    references: [students.id],
  }),
  material: one(materials, {
    fields: [assignments.materialId],
    references: [materials.id],
  }),
  submission: one(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [submissions.organizationId],
    references: [organizations.id],
  }),
  assignment: one(assignments, {
    fields: [submissions.assignmentId],
    references: [assignments.id],
  }),
  student: one(students, {
    fields: [submissions.studentId],
    references: [students.id],
  }),
  images: many(submissionImages),
  gradings: many(gradings),
  events: many(submissionEvents),
}));

export const submissionImagesRelations = relations(
  submissionImages,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionImages.submissionId],
      references: [submissions.id],
    }),
  }),
);

export const gradingsRelations = relations(gradings, ({ one, many }) => ({
  submission: one(submissions, {
    fields: [gradings.submissionId],
    references: [submissions.id],
  }),
  grader: one(users, { fields: [gradings.graderId], references: [users.id] }),
  mistakes: many(gradingMistakes),
}));

export const gradingMistakesRelations = relations(
  gradingMistakes,
  ({ one }) => ({
    grading: one(gradings, {
      fields: [gradingMistakes.gradingId],
      references: [gradings.id],
    }),
    mistakeTag: one(mistakeTags, {
      fields: [gradingMistakes.mistakeTagId],
      references: [mistakeTags.id],
    }),
  }),
);

// 型エクスポート (アプリ全体で再利用)
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type MaterialFile = typeof materialFiles.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SubmissionImage = typeof submissionImages.$inferSelect;
export type Grading = typeof gradings.$inferSelect;
export type MistakeTag = typeof mistakeTags.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];

// sql import kept for future raw default expressions
void sql;
