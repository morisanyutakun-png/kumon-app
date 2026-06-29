"use client";

/**
 * /setup の最終セーフティネット。Server Component / Action で想定外の例外が
 * 起きても、生の500ではなく復旧可能なエラーUI(再試行)を出す。
 */
export default function SetupError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="auth">
      <div className="auth-box">
        <h1 className="auth-h1">アカウント設定</h1>
        <p className="auth-error" role="alert">
          一時的なエラーが発生しました。
        </p>
        <p className="auth-help">
          お手数ですが、もう一度お試しください。続く場合は、決済完了メールのリンクから開き直すか、
          <a href="https://yuta-eng.com/contact"> サポート窓口</a> までご連絡ください。
        </p>
        <button type="button" className="auth-submit" onClick={() => reset()}>
          再試行
        </button>
      </div>
    </div>
  );
}
