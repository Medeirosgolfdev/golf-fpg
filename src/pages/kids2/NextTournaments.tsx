/**
 * kids2/NextTournaments.tsx
 *
 * /kids2/next-t - Field Rivais Dashboard.
 *
 * Reutiliza o componente FieldRivaisDashboard de pages/kids (mesma vista de
 * /kids/next-t): cross-table com linhas = inscritos no escalao do Manuel
 * num torneio futuro, colunas = torneios USKids historicos relevantes.
 *
 * Alimentado por `buildAutoRivals` do KIDSdataLoader, que hoje (2026-05) lê
 * exclusivamente os ficheiros canónicos do agregador
 * (juniors.json / juniors-tournaments*.json / tournament-catalog.json). Doral
 * 2018-2025 já está no canónico, logo o antigo `enrichWithDoralLegacy` foi
 * removido. O onSelectPlayer navega para /kids2 com o nome no hash (KIDS2Page
 * já resolve hash -> juniorId).
 */

import React, { useEffect, useState } from "react";
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
    let alive = true;
    buildAutoRivals(
      (p) => { if (alive) setProgress({ done: p.done, total: p.total }); },
      {
        onUpdate: (players) => { if (alive) setAutoRivals(players); },
      },
    )
      .then((players) => { if (alive) setAutoRivals([...players]); })
      .catch((e) => { if (alive) setError(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);

  if (error) return <EmptyState size="md" message={"Falhou: " + error} />;
  if (!autoRivals) {
    return (
      <>
        <Kids2SubNav />
        <div style={{ padding: "16px 20px" }}>
          <LoadingState />
          {progress && (
            <div style={{ fontSize: "var(--fs-12)", color: "var(--text-3)", textAlign: "center", marginTop: 8 }}>
              A carregar rivais... {progress.done}/{progress.total}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Kids2SubNav />
      <div style={{ padding: "16px 20px" }}>
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap",
      }}>
        <h1 style={{
          margin: 0,
          fontSize: "var(--fs-18)",
          fontWeight: 600,
          color: "var(--text)",
        }}>
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
        onSelectPlayer={(name) => {
          navigate("/kids2#" + encodeURIComponent(name));
        }}
      />
      </div>
    </>
  );
}
