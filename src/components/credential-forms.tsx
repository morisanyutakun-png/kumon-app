"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { issueStudentCredentials } from "@/lib/actions/admin-actions";

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function randomPassword(n = 8): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 生徒のログインID + PIN を発行/更新するフォーム。発行後に内容を一度だけ表示。 */
export function StudentCredentialForm({
  studentId,
  currentLoginId,
  hasPin,
}: {
  studentId: string;
  currentLoginId: string;
  hasPin: boolean;
}) {
  const [loginId, setLoginId] = useState(currentLoginId);
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ loginId: string; pin: string } | null>(null);

  function submit() {
    if (!loginId.trim()) {
      toast.warning("ログインIDを入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("loginId", loginId.trim());
    if (pin.trim()) fd.set("pin", pin.trim());
    startTransition(async () => {
      try {
        await issueStudentCredentials(studentId, fd);
        toast.success("ログイン情報を発行しました。");
        setIssued({ loginId: loginId.trim(), pin: pin.trim() });
        setPin("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "発行に失敗しました。");
      }
    });
  }

  return (
    <div className="cred-form">
      <div className="form-row">
        <label>ログインID</label>
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="例: taro" autoCapitalize="none" />
      </div>
      <div className="form-row">
        <label>PIN（あいことば）{hasPin && !pin && <span className="muted">　設定済み（空欄なら変更なし）</span>}</label>
        <div className="cred-inline">
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder={hasPin ? "変更する場合のみ入力" : "例: 1234"} inputMode="numeric" />
          <button type="button" className="btn-secondary" onClick={() => setPin(randomDigits(4))}>自動生成</button>
        </div>
      </div>
      <div>
        <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
          {pending ? "発行中…" : "ログイン情報を発行する"}
        </button>
      </div>

      {issued && (
        <div className="cred-result">
          <div className="cred-result-title">発行しました（メモして本人へお渡しください）</div>
          <div className="cred-kv"><span>ログインID</span><b>{issued.loginId}</b></div>
          {issued.pin ? (
            <div className="cred-kv"><span>PIN</span><b>{issued.pin}</b></div>
          ) : (
            <div className="cred-kv"><span>PIN</span><b className="muted">（変更なし）</b></div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            ※ PINは保存後は確認できません。控えてください。
          </div>
        </div>
      )}
    </div>
  );
}

/** パスワード再発行(保護者・スタッフ共通)。発行後に一度だけ表示。 */
export function PasswordResetForm({
  action,
  buttonLabel = "パスワードを再発行",
}: {
  action: (fd: FormData) => Promise<unknown>;
  buttonLabel?: string;
}) {
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<string | null>(null);

  function submit() {
    const pw = password.trim();
    if (!pw) {
      toast.warning("新しいパスワードを入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("password", pw);
    startTransition(async () => {
      try {
        await action(fd);
        toast.success("パスワードを再発行しました。");
        setIssued(pw);
        setPassword("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "再発行に失敗しました。");
      }
    });
  }

  return (
    <div className="cred-inline" style={{ flexWrap: "wrap" }}>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="新しいパスワード"
        style={{ minWidth: 160, height: 34, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", font: "inherit" }}
      />
      <button type="button" className="btn-secondary" style={{ padding: "6px 10px" }} onClick={() => setPassword(randomPassword())}>
        自動生成
      </button>
      <button type="button" className="btn-secondary" style={{ padding: "6px 10px" }} onClick={submit} disabled={pending}>
        {pending ? "…" : buttonLabel}
      </button>
      {issued && <span className="cred-issued">新パスワード: <b>{issued}</b></span>}
    </div>
  );
}
