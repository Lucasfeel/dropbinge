import { useState } from "react";

import { useAuth } from "../hooks/useAuth";

type GateStep = "choose" | "login" | "register";

type AlertGateOverlayProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onAuthed: () => Promise<void> | void;
};

export const AlertGateOverlay = ({
  title,
  subtitle,
  onClose,
  onAuthed,
}: AlertGateOverlayProps) => {
  const { login, register } = useAuth();
  const [step, setStep] = useState<GateStep>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      await onAuthed();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Email already registered") || message.includes("409")) {
        setError("이미 가입된 이메일입니다. 로그인해 주세요.");
      } else {
        setError("요청에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <button className="dialog-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="dialog-panel" role="dialog" aria-modal="true">
        <h3 className="dialog-title">{title}</h3>
        {subtitle ? <p className="dialog-subtitle muted">{subtitle}</p> : null}
        {step === "choose" ? (
          <>
            <p>알림을 받으려면 계정이 필요합니다.</p>
            <div className="dialog-actions">
              <button className="button" type="button" onClick={() => setStep("login")}>
                로그인
              </button>
              <button className="button secondary" type="button" onClick={() => setStep("register")}>
                이메일로 시작
              </button>
            </div>
            <p className="muted">이메일 알림은 계정에 연결됩니다.</p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="alert-gate-email">이메일</label>
              <input
                id="alert-gate-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label htmlFor="alert-gate-password">
                {step === "register" ? "비밀번호(필수)" : "비밀번호"}
              </label>
              <input
                id="alert-gate-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete={step === "register" ? "new-password" : "current-password"}
              />
            </div>
            {error ? <p className="dialog-error">{error}</p> : null}
            <div className="dialog-actions">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "처리 중..." : step === "login" ? "로그인" : "계정 만들기"}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setStep("choose");
                  setError(null);
                }}
                disabled={loading}
              >
                뒤로
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
