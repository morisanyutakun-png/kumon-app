"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteStudent, quickAddStudent } from "@/lib/actions/admin-actions";
import { ActionButton } from "@/components/action-button";

export const GRADES = ["小1", "小2", "小3", "小4", "小5", "小6", "中1", "中2", "中3"];

export interface StudentRow {
  id: string;
  name: string;
  grade: string;
  loginId: string | null;
  active: boolean;
  hasPin: boolean;
  /** 管理者のみ渡される平文PIN。 */
  pin?: string | null;
}

function genPin() {
  let s = "";
  for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10);
  return s;
}
function genId() {
  return "st" + Math.floor(1000 + Math.random() * 9000);
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

export function StudentsGrid({ students }: { students: StudentRow[] }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("小1");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ name: string; loginId: string; pin: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // 初期表示で ID/PIN を自動割当(編集可)
  useEffect(() => {
    setLoginId(genId());
    setPin(genPin());
  }, []);

  function add() {
    if (!name.trim()) {
      toast.warning("氏名を入力してください。");
      nameRef.current?.focus();
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("grade", grade);
    fd.set("loginId", loginId.trim());
    fd.set("pin", pin.trim());
    startTransition(async () => {
      try {
        const res = await quickAddStudent(fd);
        toast.success(`追加しました：${res.name}（ID: ${res.loginId} / PIN: ${res.pin}）`);
        setIssued(res);
        // 次の入力へ。ID/PINは新しく自動割当。
        setName("");
        setLoginId(genId());
        setPin(genPin());
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
        <table className="record-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ width: "30%" }}>氏名</th>
              <th style={{ width: 110 }}>学年</th>
              <th>ログインID</th>
              <th>PIN（あいことば）</th>
              <th className="right" style={{ width: 150 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
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

            {/* 追加行 (スプレッドシート風) */}
            <tr style={{ background: "#f3f9fc" }}>
              <td>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="氏名を入力"
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
                    style={{ padding: "0 10px", whiteSpace: "nowrap" }}
                    onClick={() => { setLoginId(genId()); setPin(genPin()); }}
                    title="ID/PINを再生成"
                  >
                    再生成
                  </button>
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
          直近の発行 → <b>{issued.name}</b>：ログインID <b>{issued.loginId}</b> / PIN <b>{issued.pin}</b>（控えて本人へお渡しください。PINは後から確認できません）
        </p>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        氏名を入れてEnter、または「＋ 追加」で登録できます。ログインID・PINは自動割当（手入力で変更も可）。
      </p>
    </div>
  );
}
