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
import { kidsUrl } from "../../ui/KidsLink";

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
      <Kids2SubNav>
        {autoRivals && (
          <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
            {autoRivals.length.toLocaleString("pt-PT")} rivais
          </span>
        )}
        {!autoRivals && !error && progress && (
          <span style={{ fontSize: "var(--fs-12)", color: "var(--text-3)" }}>
            A carregar... {progress.done}/{progress.total}
          </span>
        )}
      </Kids2SubNav>
      <div style={{ padding: "12px 20px" }}>
        {error && <EmptyState size="md" message={"Falhou: " + error} />}
        {!autoRivals && !error && <LoadingState />}
        {autoRivals && (
          <FieldRivaisDashboard
            syncUrl
            defaultT={21131}
            defaultEscalao="Boys 12"
            autoRivals={autoRivals}
            onSelectPlayer={(name) => { navigate(kidsUrl({ name })); }}
          />
        )}
      </div>
    </>
  );
}
