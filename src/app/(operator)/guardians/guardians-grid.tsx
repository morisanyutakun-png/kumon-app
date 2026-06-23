"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteGuardian, quickAddGuardian, resetGuardianPassword } from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { PasswordResetForm } from "@/components/credential-forms";

export interface GuardianRow {
  id: string;
  name: string;
  email: string;
  children: string[];
  /** 管理者のみ渡される初期パスワード(平文)。 */
  pw?: string | null;
}

function genPassword(n = 8) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const cellInput: React.CSSProperties = {
  width: "100%",
  height: 38,
  border: "1px solid #cdd4db",
  padding: "0 10px",
  font: "inherit",
  fontSize: 14,
  background: "#fff",
};

export function GuardiansGrid({ parents }: { parents: GuardianRow[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPassword(genPassword()), []);

  function add() {
    if (!name.trim() || !email.trim()) {
      toast.warning("氏名とメールアドレスを入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("email", email.trim());
    fd.set("password", password.trim());
    startTransition(async () => {
      try {
        const res = await quickAddGuardian(fd);
        toast.success(`追加：${res.name}（${res.email} / PW: ${res.password}）`);
        setIssued(res);
        setName("");
        setEmail("");
        setPassword(genPassword());
        nameRef.current?.focus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <div>
      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table className="record-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: "24%" }}>氏名</th>
              <th>メールアドレス</th>
              <th>初期パスワード</th>
              <th>担当生徒 / 再発行</th>
              <th className="right" style={{ width: 90 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {parents.map((g) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td className="muted">{g.email}</td>
                <td>
                  {g.pw ? (
                    <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" }}>{g.pw}</code>
                  ) : (
                    <span className="muted">設定済み</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{g.children.length > 0 ? g.children.join("、") : "（未紐づけ）"}</span>
                    <PasswordResetForm action={resetGuardianPassword.bind(null, g.id)} />
                  </div>
                </td>
                <td className="right">
                  <ActionButton
                    action={deleteGuardian.bind(null, g.id)}
                    variant="destructive"
                    confirm={`保護者「${g.name}」を削除しますか?（生徒との紐づけも解除されます）`}
                    successMessage="削除しました。"
                  >
                    削除
                  </ActionButton>
                </td>
              </tr>
            ))}

            <tr style={{ background: "#f3f9fc" }}>
              <td>
                <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="保護者 氏名" style={cellInput} />
              </td>
              <td>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" type="email" autoCapitalize="none" style={cellInput} />
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={password} onChange={(e) => setPassword(e.target.value)} style={cellInput} />
                  <button type="button" className="btn-secondary" style={{ padding: "0 10px", whiteSpace: "nowrap" }} onClick={() => setPassword(genPassword())}>再生成</button>
                </div>
              </td>
              <td colSpan={2}>
                <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={add} disabled={pending}>
                  {pending ? "追加中…" : "＋ 追加"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {issued && (
        <p className="hint" style={{ marginTop: 10 }}>
          直近の発行 → <b>{issued.name}</b>：メール <b>{issued.email}</b> / パスワード <b>{issued.password}</b>（控えてお渡しください）
        </p>
      )}
    </div>
  );
}
