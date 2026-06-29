/**
 * Auth.js (NextAuth v5) 設定。
 *
 * 認証は2系統を1つの Credentials プロバイダで扱う:
 *   - kind="staff": email + password (管理者・運営者・保護者)
 *   - kind="student": loginId + pin   (メールを持たない生徒)
 *
 * セッション(JWT)には principal 情報を載せる:
 *   id, role, organizationId, name, studentId(生徒principalのみ)
 */
import { and, eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { db } from "@/db";
import { students, users } from "@/db/schema";
import type { UserRole } from "@/db/schema";

export interface Principal {
  id: string;
  name: string;
  role: UserRole;
  organizationId: string;
  /** role=student のとき該当 student.id。それ以外は undefined。 */
  studentId?: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "ID（メール または ログインID）" },
        password: { label: "パスワード", type: "password" },
      },
      // 全アカウント共通の1フォーム。まず職員/保護者(メール)、次に生徒(ログインID)で照合し、
      // ログイン後はロールで画面分岐する。
      authorize: async (raw) => {
        const identifier = String(raw?.identifier ?? "").trim();
        const password = String(raw?.password ?? "");
        if (!identifier || !password) return null;

        // 1) 職員・保護者・(メールを持つ)生徒 (メール + パスワード)
        //    status=pending(yuta-eng 決済の仮アカウント・パスワード未設定)は
        //    ログイン不可。role=student の場合は紐づく students.id を studentId に載せる。
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, identifier.toLowerCase()))
          .limit(1);
        if (
          user &&
          user.status === "active" &&
          user.passwordHash &&
          (await bcrypt.compare(password, user.passwordHash))
        ) {
          let studentId: string | undefined;
          if (user.role === "student") {
            const [linked] = await db
              .select({ id: students.id })
              .from(students)
              .where(eq(students.userId, user.id))
              .limit(1);
            studentId = linked?.id;
          }
          const principal: Principal = {
            id: user.id,
            name: user.name,
            role: user.role,
            organizationId: user.organizationId,
            studentId,
          };
          return principal;
        }

        // 2) 生徒 (ログインID + あいことば/PIN)
        const [student] = await db
          .select()
          .from(students)
          .where(and(eq(students.loginId, identifier), eq(students.active, true)))
          .limit(1);
        if (student?.pinHash && (await bcrypt.compare(password, student.pinHash))) {
          const principal: Principal = {
            id: student.id,
            name: student.name,
            role: "student",
            organizationId: student.organizationId,
            studentId: student.id,
          };
          return principal;
        }

        return null;
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        const p = user as unknown as Principal;
        token.role = p.role;
        token.organizationId = p.organizationId;
        token.studentId = p.studentId;
        token.name = p.name;
        token.sub = p.id;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = String(token.sub);
        session.user.role = token.role as UserRole;
        session.user.organizationId = String(token.organizationId);
        session.user.studentId = token.studentId as string | undefined;
        session.user.name = String(token.name ?? "");
      }
      return session;
    },
  },
});
