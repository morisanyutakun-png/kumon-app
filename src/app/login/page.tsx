import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { enterAsGuest } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

const GUESTS: { role: "operator" | "student" | "parent"; label: string; desc: string }[] = [
  { role: "operator", label: "運営・採点者として入る", desc: "課題登録・採点・返却・一括採点" },
  { role: "student", label: "生徒として入る", desc: "課題確認・答案提出・結果確認" },
  { role: "parent", label: "保護者として入る", desc: "お子さまの課題・成績の確認" },
];

export default async function LoginPage() {
  const demo = isDemoMode();
  const p = await getPrincipal();
  // デモ時はロール切替のため、ログイン済みでも選択画面を表示する。
  if (p && !demo) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">まなび教室</h1>
          <p className="mt-1 text-sm text-slate-500">
            課題・提出・採点・返却の管理システム
          </p>
        </div>

        {demo ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700">
                現在は<strong>デモモード</strong>です。ログイン設定なしで、ゲストとして
                お試しいただけます。データは一時的なもので、再起動でリセットされます。
              </div>
              <div className="space-y-2">
                {GUESTS.map((g) => (
                  <form key={g.role} action={enterAsGuest.bind(null, g.role)}>
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-auto w-full flex-col items-start gap-0.5 py-3 text-left"
                    >
                      <span className="font-medium">{g.label}</span>
                      <span className="text-xs font-normal text-slate-500">
                        {g.desc}
                      </span>
                    </Button>
                  </form>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
