"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="staff">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="staff">運営・保護者</TabsTrigger>
            <TabsTrigger value="student">生徒</TabsTrigger>
          </TabsList>

          <TabsContent value="staff">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="kind" value="staff" />
              <div className="space-y-2">
                <Label htmlFor="staff-email">メールアドレス</Label>
                <Input
                  id="staff-email"
                  name="identifier"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-password">パスワード</Label>
                <Input
                  id="staff-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {state.error && (
                <p className="text-sm text-rose-600">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "ログイン中..." : "ログイン"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="student">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="kind" value="student" />
              <div className="space-y-2">
                <Label htmlFor="student-id">ログインID</Label>
                <Input
                  id="student-id"
                  name="identifier"
                  autoComplete="username"
                  placeholder="taro"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-pin">あいことば (PIN)</Label>
                <Input
                  id="student-pin"
                  name="password"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  required
                />
              </div>
              {state.error && (
                <p className="text-sm text-rose-600">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "ログイン中..." : "ログイン"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
