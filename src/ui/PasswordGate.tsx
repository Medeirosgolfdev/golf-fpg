/**
 * src/ui/PasswordGate.tsx
 *
 * Componente partilhado de password gate — substitui as 3 cópias
 * em CalendarioPage, BJGTAnalysisPage e TorneioPage.
 *
 * Usa as classes unificadas .pw-* de App.css.
 */

import { useState } from "react";
import { CAL_PASSWORD, unlockCalendar } from "../utils/authConstants";

type Props = {
  onUnlock: () => void;
};

export default function PasswordGate({ onUnlock }: Props) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const check = () => {
    if (pw === CAL_PASSWORD) {
      unlockCalendar();
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 1500);
    }
  };

  return (
    <div className="pw-gate">
      <div className="pw-icon">🔒</div>
      <div className="pw-title">Acesso restrito</div>
      <div className="pw-sub">Este separador requer password</div>
      <div className="pw-row">
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && check()}
          placeholder="Password…"
          autoFocus
          className={`pw-input${error ? " pw-input-error" : ""}`}
        />
        <button onClick={check} className="pw-btn">Entrar</button>
      </div>
      {error && <div className="pw-error">Password incorrecta</div>}
    </div>
  );
}
