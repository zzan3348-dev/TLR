import { FormEvent, useEffect, useRef, useState } from "react";

type DirectorateAccessModalProps = {
  open: boolean;
  onClose: () => void;
  onAuthorized: () => void;
};

export function DirectorateAccessModal({ open, onClose, onAuthorized }: DirectorateAccessModalProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // The modal is remounted logically for each hidden-stamp activation.
      /* eslint-disable react-hooks/set-state-in-effect */
      setCode("");
      setStatus("idle");
      /* eslint-enable react-hooks/set-state-in-effect */
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch("/api/admin/bootstrap-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      onAuthorized();
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="directorate-modal-backdrop" role="presentation">
      <section className="directorate-modal" role="dialog" aria-modal="true" aria-labelledby="directorate-title">
        <div className="directorate-modal__seal" aria-hidden="true">DIRECTORATE</div>
        <p className="directorate-modal__eyebrow">THE LONG REVOLUTION</p>
        <h2 id="directorate-title">DIRECTORATE CONTROL NETWORK</h2>
        <div className="directorate-modal__rule" />
        <p className="directorate-modal__classification">보안 등급: 미확인</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="directorate-code">관리 코드 입력</label>
          <input ref={inputRef} id="directorate-code" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" maxLength={128} />
          {status === "error" ? <p className="directorate-modal__error">인증 코드가 올바르지 않습니다</p> : null}
          <div className="directorate-modal__actions">
            <button type="submit" disabled={status === "submitting" || !code}>{status === "submitting" ? "접속 중" : "관제망 접속"}</button>
            <button type="button" onClick={onClose}>취소</button>
          </div>
        </form>
      </section>
    </div>
  );
}
