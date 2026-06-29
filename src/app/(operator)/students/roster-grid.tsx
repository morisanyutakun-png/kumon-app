"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addGuardianToStudent,
  addStudentWithGuardian,
  deleteGuardian,
  deleteStudent,
  inlineUpdateGuardian,
  inlineUpdateStudent,
} from "@/lib/actions/admin-actions";

/**
 * IME変換確定のEnterでは送信しない(「文字確定」と「登録」のEnterを分ける)。
 * 変換中(composing)や keyCode 229 のときは何もしない。
 */
function isImeEnter(e: React.KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
}
import { ActionButton } from "@/components/action-button";

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

const gBorder = "2px solid #cfe6f4"; // 生徒 / 保護者 の区切り

/** 既存行: 氏名・学年・認証情報をその場で編集できる行。 */
function EditableRow({ s, admin }: { s: RosterRow; admin: boolean }) {
  const [name, setName] = useState(s.name);
  const [grade, setGrade] = useState(s.grade || "小1");
  const [loginId, setLoginId] = useState(s.loginId ?? "");
  const [pin, setPin] = useState(s.pin ?? "");
  const [gName, setGName] = useState(s.guardian?.name ?? "");
  const [email, setEmail] = useState(s.guardian?.email ?? "");
  const [pw, setPw] = useState(s.guardian ? (s.guardian.pw ?? "") : genPassword());
  const [savingS, startS] = useTransition();
  const [savingG, startG] = useTransition();

  const sDirty =
    name !== s.name ||
    grade !== (s.grade || "小1") ||
    loginId !== (s.loginId ?? "") ||
    pin !== (s.pin ?? "");
  const gDirty =
    !!s.guardian &&
    (gName !== (s.guardian.name ?? "") ||
      email !== (s.guardian.email ?? "") ||
      pw !== (s.guardian.pw ?? ""));

  function saveStudent() {
    if (!name.trim()) {
      toast.warning("氏名を入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("grade", grade);
    fd.set("loginId", loginId.trim());
    fd.set("pin", pin.trim());
    startS(async () => {
      try {
        await inlineUpdateStudent(s.id, fd);
        toast.success(`保存：${name.trim()}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }
  function saveGuardian() {
    if (!s.guardian) return;
    const fd = new FormData();
    fd.set("name", gName.trim());
    fd.set("email", email.trim());
    fd.set("password", pw.trim());
    startG(async () => {
      try {
        await inlineUpdateGuardian(s.guardian!.id, fd);
        toast.success(`保存：${gName.trim() || s.guardian!.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存に失敗しました。");
      }
    });
  }
  /** 保護者なしの生徒に、後から保護者を追加して紐づける。 */
  function addGuardian() {
    if (!gName.trim() || !email.trim()) {
      toast.warning("保護者は氏名とメールアドレスの両方を入力してください。");
      return;
    }
    const fd = new FormData();
    fd.set("name", gName.trim());
    fd.set("email", email.trim());
    fd.set("password", pw.trim());
    startG(async () => {
      try {
        const res = await addGuardianToStudent(s.id, fd);
        toast.success(
          `保護者を追加：${res.name}（${res.email}）` +
            (res.password ? ` / 初期PW ${res.password}` : "（既存アカウントに紐づけ）"),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "追加に失敗しました。");
      }
    });
  }

  return (
    <tr>
      {/* ── 生徒(左)で完結 ── */}
      <td>
        {admin ? (
          <input value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <Link href={`/grades/${s.id}`} className="cell-pad" style={{ fontWeight: 600 }}>{s.name}</Link>
        )}
      </td>
      <td>
        {admin ? (
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        ) : (
          <span className="cell-pad">{s.grade || "—"}</span>
        )}
      </td>
      <td>
        {admin ? (
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        ) : (
          <span className="cell-pad muted">{s.loginId || "—"}</span>
        )}
      </td>
      <td>
        {admin ? (
          <input className="code" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" />
        ) : (
          <span className="cell-pad muted">{s.hasPin ? "設定済" : "未設定"}</span>
        )}
      </td>
      <td className="right">
        <span className="row-actions">
          {admin && (
            <button type="button" className="btn-primary gbtn" disabled={!sDirty || savingS} onClick={saveStudent}>
              {savingS ? "保存中" : "保存"}
            </button>
          )}
          <Link href={`/grades/${s.id}`} className="btn-secondary gbtn">成績</Link>
          <ActionButton
            action={deleteStudent.bind(null, s.id)}
            variant="destructive"
            className="gbtn"
            confirm={`生徒「${s.name}」と関連する割当・提出を削除しますか?`}
            successMessage="削除しました。"
          >
            削除
          </ActionButton>
        </span>
      </td>

      {/* ── 保護者(右)で完結 ── */}
      {s.guardian ? (
        <>
          <td style={{ borderLeft: gBorder }}>
            {admin ? (
              <input value={gName} onChange={(e) => setGName(e.target.value)} />
            ) : (
              <span className="cell-pad" style={{ fontWeight: 600 }}>{s.guardian.name}</span>
            )}
          </td>
          <td>
            {admin ? (
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" />
            ) : (
              <span className="cell-pad muted">{s.guardian.email}</span>
            )}
          </td>
          <td>
            {admin ? (
              <div className="input-with-btn">
                <input className="code" value={pw} onChange={(e) => setPw(e.target.value)} />
                <button type="button" className="btn-secondary gbtn" onClick={() => setPw(genPassword())} title="パスワードを生成">自動</button>
              </div>
            ) : (
              <span className="cell-pad muted">設定済</span>
            )}
          </td>
          <td className="right">
            <span className="row-actions">
              {admin && (
                <button type="button" className="btn-primary gbtn" disabled={!gDirty || savingG} onClick={saveGuardian}>
                  {savingG ? "保存中" : "保存"}
                </button>
              )}
              <ActionButton
                action={deleteGuardian.bind(null, s.guardian.id)}
                variant="destructive"
                className="gbtn"
                confirm={`保護者「${s.guardian.name}」を削除しますか?（生徒との紐づけも解除されます）`}
                successMessage="削除しました。"
              >
                削除
              </ActionButton>
            </span>
          </td>
        </>
      ) : admin ? (
        <>
          {/* 保護者なし: 後から追加できる入力欄 */}
          <td style={{ borderLeft: gBorder }}>
            <input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="保護者 氏名" />
          </td>
          <td>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" type="email" autoCapitalize="none" />
          </td>
          <td>
            <div className="input-with-btn">
              <input className="code" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" className="btn-secondary gbtn" onClick={() => setPw(genPassword())} title="パスワードを生成">自動</button>
            </div>
          </td>
          <td className="right">
            <button type="button" className="btn-primary gbtn" disabled={savingG || !gName.trim() || !email.trim()} onClick={addGuardian}>
              {savingG ? "追加中" : "＋ 保護者を追加"}
            </button>
          </td>
        </>
      ) : (
        <td colSpan={4} style={{ borderLeft: gBorder }}>
          <span className="cell-pad muted">（保護者なし）</span>
        </td>
      )}
    </tr>
  );
}

export function RosterGrid({ rows, admin }: { rows: RosterRow[]; admin: boolean }) {
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
    if (e.key !== "Enter") return;
    if (isImeEnter(e)) return; // 変換確定のEnterでは登録しない
    e.preventDefault();
    add();
  }

  return (
    <div className="roster">
      <div className="grid-scroll" style={{ border: "1px solid #dde2e7" }}>
        <table className="record-table" style={{ minWidth: 1240 }}>
          <thead>
            <tr>
              <th colSpan={5} style={{ background: "#eaf5fb", color: "#14365a" }}>生徒</th>
              <th colSpan={4} style={{ background: "#eaf5fb", color: "#14365a", borderLeft: gBorder }}>保護者</th>
            </tr>
            <tr>
              <th style={{ width: "14%" }}>氏名</th>
              <th style={{ width: 76 }}>学年</th>
              <th style={{ width: 124 }}>ログインID</th>
              <th style={{ width: 96 }}>PIN</th>
              <th className="right" style={{ width: 188 }}>操作</th>
              <th style={{ width: "14%", borderLeft: gBorder }}>氏名</th>
              <th>メールアドレス</th>
              <th style={{ width: 168 }}>初期パスワード</th>
              <th className="right" style={{ width: 128 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <EditableRow key={s.id} s={s} admin={admin} />
            ))}

            {/* 追加行 — 1行で 生徒 ＋ 保護者(任意) を登録 */}
            <tr style={{ background: "#f3f9fc" }}>
              <td>
                <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKeyDown} placeholder="生徒 氏名" />
              </td>
              <td>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td>
                <input value={loginId} onChange={(e) => setLoginId(e.target.value)} onKeyDown={onKeyDown} />
              </td>
              <td>
                <input className="code" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={onKeyDown} inputMode="numeric" />
              </td>
              <td className="right">
                <button type="button" className="btn-secondary add-btn" onClick={() => { setLoginId(genId()); setPin(genPin()); }} title="ID/PINを再生成">
                  ID再生成
                </button>
              </td>
              <td style={{ borderLeft: gBorder }}>
                <input value={gName} onChange={(e) => setGName(e.target.value)} onKeyDown={onKeyDown} placeholder="保護者 氏名（任意）" />
              </td>
              <td>
                <input value={gEmail} onChange={(e) => setGEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="parent@example.com" type="email" autoCapitalize="none" />
              </td>
              <td>
                <input className="code" value={gPassword} onChange={(e) => setGPassword(e.target.value)} onKeyDown={onKeyDown} />
              </td>
              <td className="right">
                <button type="button" className="btn-primary add-btn" onClick={add} disabled={pending}>
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
        氏名・学年・ログインID・PIN・メール・パスワードはすべて表内で編集でき、変更すると各側の「保存」が有効になります（管理者のみ）。
      </p>
    </div>
  );
}
