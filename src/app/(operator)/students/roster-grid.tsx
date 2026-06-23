"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addStudentWithGuardian,
  deleteGuardian,
  deleteStudent,
  resetGuardianPassword,
} from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";
import { PasswordResetForm } from "@/components/credential-forms";

export const GRADES = ["小1", "小2", "小3", "小4", "小5", "小6", "中1", "中2", "中3"];

export interface RosterRow {
  id: string;
  name: string;
  grade: string;
  loginId: string | null;
  active: boolean;
  hasPin: boolean;
  /** 管理者のみ渡される平文PIN。 */
  pin?: string | null;
  guardian?: {
    id: string;
    name: string;
    email: string;
    /** 管理者のみ渡される平文パスワード。 */
    pw?: string | null;
  };
}

function genPin() {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function genId() {
  return "st" + Math.floor(1000 + Math.random() * 9000);
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

const gBorder = "2px solid #cfe6f4"; // 生徒 / 保護者 の区切り

export function RosterGrid({ rows }: { rows: RosterRow[] }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("小1");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPassword, setGPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{
    studentName: string;
    loginId: string;
    pin: string;
    guardian?: { name: string; email: string; password: string | null };
  } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoginId(genId());
    setPin(genPin());
    setGPassword(genPassword());
  }, []);

  function add() {
    if (!name.trim()) {
      toast.warning("生徒の氏名を入力してください。");
      nameRef.current?.focus();
      return;
    }
    if ((gName.trim() && !gEmail.trim()) || (!gName.trim() && gEmail.trim())) {
      toast.warning("保護者は氏名とメールアドレスの両方を入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("grade", grade);
    fd.set("loginId", loginId.trim());
    fd.set("pin", pin.trim());
    fd.set("gName", gName.trim());
    fd.set("gEmail", gEmail.trim());
    fd.set("gPassword", gPassword.trim());
    startTransition(async () => {
      try {
        const res = await addStudentWithGuardian(fd);
        toast.success(
          `追加：${res.studentName}（ID: ${res.loginId} / PIN: ${res.pin}）` +
            (res.guardian ? ` ＋ 保護者 ${res.guardian.name}` : ""),
        );
        setIssued(res);
        setName("");
        setGName("");
        setGEmail("");
        setLoginId(genId());
        setPin(genPin());
        setGPassword(genPassword());
        nameRef.current?.focus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "追加に失敗しました。");
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <div>
      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table className="record-table" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th colSpan={4} style={{ background: "#eaf5fb", color: "#14365a" }}>
                生徒
              </th>
              <th colSpan={3} style={{ background: "#eaf5fb", color: "#14365a", borderLeft: gBorder }}>
                保護者
              </th>
              <th className="right" style={{ width: 150 }}>操作</th>
            </tr>
            <tr>
              <th style={{ width: "16%" }}>氏名</th>
              <th style={{ width: 84 }}>学年</th>
              <th>ログインID</th>
              <th>PIN</th>
              <th style={{ borderLeft: gBorder }}>氏名</th>
              <th>メールアドレス</th>
              <th>初期パスワード</th>
              <th className="right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/students/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link>
                  {!s.active && (
                    <span className="badge" style={{ marginLeft: 8, background: "#f1f5f9", color: "#64748b" }}>停止中</span>
                  )}
                </td>
                <td>{s.grade || "—"}</td>
                <td className="muted">{s.loginId || "—"}</td>
                <td>
                  {s.pin ? (
                    <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" }}>{s.pin}</code>
                  ) : (
                    <span className="muted">{s.hasPin ? "設定済み" : "未設定"}</span>
                  )}
                </td>

                {s.guardian ? (
                  <>
                    <td style={{ borderLeft: gBorder, fontWeight: 600 }}>{s.guardian.name}</td>
                    <td className="muted">{s.guardian.email}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.guardian.pw ? (
                          <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" }}>{s.guardian.pw}</code>
                        ) : (
                          <span className="muted">設定済み</span>
                        )}
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <PasswordResetForm action={resetGuardianPassword.bind(null, s.guardian.id)} />
                          <ActionButton
                            action={deleteGuardian.bind(null, s.guardian.id)}
                            variant="destructive"
                            confirm={`保護者「${s.guardian.name}」を削除しますか?（生徒との紐づけも解除されます）`}
                            successMessage="削除しました。"
                          >
                            保護者削除
                          </ActionButton>
                        </span>
                      </div>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="muted" style={{ borderLeft: gBorder }}>
                    （保護者なし）
                  </td>
                )}

                <td className="right">
                  <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                    <Link href={`/students/${s.id}/edit`} className="db-badge">編集</Link>
                    <ActionButton
                      action={deleteStudent.bind(null, s.id)}
                      variant="destructive"
                      confirm={`生徒「${s.name}」と関連する割当・提出を削除しますか?`}
                      successMessage="削除しました。"
                    >
                      削除
                    </ActionButton>
                  </span>
                </td>
              </tr>
            ))}

            {/* 追加行 — 1行で 生徒 ＋ 保護者(任意) を登録 */}
            <tr style={{ background: "#f3f9fc" }}>
              <td>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="生徒 氏名"
                  style={cellInput}
                />
              </td>
              <td>
                <select value={grade} onChange={(e) => setGrade(e.target.value)} style={cellInput}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td>
                <input value={loginId} onChange={(e) => setLoginId(e.target.value)} onKeyDown={onKeyDown} style={cellInput} />
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={onKeyDown} inputMode="numeric" style={cellInput} />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: "0 8px", whiteSpace: "nowrap" }}
                    onClick={() => { setLoginId(genId()); setPin(genPin()); }}
                    title="ID/PINを再生成"
                  >
                    再生成
                  </button>
                </div>
              </td>
              <td style={{ borderLeft: gBorder }}>
                <input value={gName} onChange={(e) => setGName(e.target.value)} onKeyDown={onKeyDown} placeholder="保護者 氏名（任意）" style={cellInput} />
              </td>
              <td>
                <input value={gEmail} onChange={(e) => setGEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="parent@example.com" type="email" autoCapitalize="none" style={cellInput} />
              </td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={gPassword} onChange={(e) => setGPassword(e.target.value)} onKeyDown={onKeyDown} style={cellInput} />
                  <button type="button" className="btn-secondary" style={{ padding: "0 8px", whiteSpace: "nowrap" }} onClick={() => setGPassword(genPassword())}>再生成</button>
                </div>
              </td>
              <td className="right">
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
          直近の発行 → 生徒 <b>{issued.studentName}</b>：ID <b>{issued.loginId}</b> / PIN <b>{issued.pin}</b>
          {issued.guardian &&
            (issued.guardian.password
              ? <> ／ 保護者 <b>{issued.guardian.name}</b>：<b>{issued.guardian.email}</b> / PW <b>{issued.guardian.password}</b></>
              : <> ／ 保護者 <b>{issued.guardian.name}</b>（既存アカウントに紐づけ）</>)}
          （控えてお渡しください）
        </p>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        1行で生徒（左）と保護者（右）をまとめて登録できます。保護者は任意。氏名を入れてEnterでも追加できます。
      </p>
    </div>
  );
}
