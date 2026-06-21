import { redirect } from "next/navigation";

import { getPrincipal } from "@/lib/access";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const p = await getPrincipal();
  if (p) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">まなび教室</h1>
          <p className="mt-1 text-sm text-slate-500">
            課題・提出・採点・返却の管理システム
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
