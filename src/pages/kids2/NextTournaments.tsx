/**
 * kids2/NextTournaments.tsx
 *
 * /kids2/next-t — Próximos torneios com FieldRivaisDashboard.
 * Scout é a 5ª tab dentro do FieldRivaisDashboard.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingState from "../../ui/LoadingState";
import EmptyState from "../../ui/EmptyState";
import { usePasswordGate } from "../../hooks/usePasswordGate";
import PasswordGate from "../../ui/PasswordGate";
import FieldRivaisDashboard from "../kids/FieldRivaisDashboard";
import { buildAutoRivals, type AutoRivalPlayer } from "../../data/KIDSdataLoader";
import Kids2SubNav from "./Kids2SubNav";

export default function NextTournaments() {
  const { unlocked, unlock } = usePasswordGate();
  if (!unlocked) return <PasswordGate onUnlock={unlock} />;
  return <NextTournamentsContent />;
}

function NextTournamentsContent() {
  const [autoRivals, setAutoRivals] = useState<AutoRivalPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (autoRivals) return;
    let alive = true;
    buildAutoRivals(
      (p) => { if (alive) setProgress({ done: p.done, total: p.total }); },
      { onUpdate: (players) => { if (alive) setAutoRivals(players); } },
    )
      .then((players) => { if (alive) setAutoRivals([...players]); })
      .catch((e) => { if (alive) setError(String(e?.message || e)); });
    return () => { alive = false; };
  }, [autoRivals]);

  return (
    <>
      <Kids2SubNav />
      <div style={{ padding: "16px 20px" }}>

        {error && <EmptyState size="md" message={"Falhou: " + error} />}
        {!autoRivals && !error && (
          <>
            <LoadingState />
            {progress && (
              <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", textAlign: "center", marginTop: 8 }}>
                A carregar rivais... {progress.done}/{progress.total}
              </div>
            )}
          </>
        )}
        {autoRivals && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: "var(--fs-18)", fontWeight: 600, color: "var(--text)" }}>
                Próximos torneios
              </h1>
              <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
                {autoRivals.length.toLocaleString("pt-PT")} rivais analisados
              </span>
            </div>
            <FieldRivaisDashboard
              defaultT={21131}
              defaultEscalao="Boys 12"
              autoRivals={autoRivals}
              onSelectPlayer={(name) => { navigate("/kids2#" + encodeURIComponent(name)); }}
            />
          </>
        )}

      </div>
    </>
  );
}
