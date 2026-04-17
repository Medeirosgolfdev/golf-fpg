/**
 * DrawTab.tsx — renderer da tab "Draw R{n}" num torneio.
 *
 * Usa o componente `ScorecardLeaderboard` (mesma tabela das classificações)
 * com `showScorecard={false}`. Cada linha é um jogador; em vez dos scores
 * mostra Hora e Buraco de saída.
 *
 * Colunas: # | Jogador | ESC | FED | CLUBE | HCP | TEE | ± | Tot | Hora | Buraco
 */

import React, { useMemo } from "react";
import type { FpgDraw } from "../data/nacional2026Loader";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill } from "./PillBadge";
import { useFedCountries, CountryFlag } from "./InscricoesComponents";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";

interface Props {
  draw: FpgDraw;
  roundNum?: number;
  playersDB?: PlayersDB;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
  /** Data do torneio (YYYY-MM-DD) — usada para calcular escalão histórico. */
  tournamentDate?: string | null;
}

function teeNameFor(escalao?: string, sex?: "M" | "F"): string | undefined {
  if (!escalao) return undefined;
  const n = norm(escalao);
  if (/sub\s*10/.test(n)) return "Verdes";
  if (/sub\s*12/.test(n)) return "Vermelhas";
  if (/sub\s*14/.test(n)) return sex === "F" ? "Vermelhas" : "Amarelas";
  if (/sub\s*16/.test(n) || /sub\s*18/.test(n)) return sex === "F" ? "Azuis" : "Brancas";
  return undefined;
}

export default function DrawTab({
  draw, roundNum, playersDB,
  tournamentEscalao, tournamentSex, tournamentDate,
}: Props) {
  const effDate = tournamentDate || draw.date || null;
  const fedCountries = useFedCountries();
  const teeName = teeNameFor(tournamentEscalao, tournamentSex);

  const nameToFed = useMemo(() => {
    const m = new Map<string, string>();
    if (!playersDB) return m;
    for (const [fed, bd] of Object.entries(playersDB)) {
      const nm = (bd as any)?.name as string | undefined;
      if (nm) m.set(norm(nm), fed);
    }
    return m;
  }, [playersDB]);

  // Achatar flights em linhas
  const flat = useMemo(() => {
    const out: Array<{
      pos: number;
      teeTime: string;
      startHole: number | null;
      tee: string | null;
      nome: string;
      clube: string | null;
      fed: string | null;
    }> = [];
    let idx = 0;
    for (const g of (draw.groups || [])) {
      for (const p of g.players) {
        idx++;
        out.push({
          pos: idx,
          teeTime: g.teeTime,
          startHole: g.startHole,
          tee: g.tee,
          nome: p.nome,
          clube: p.clube,
          fed: nameToFed.get(norm(p.nome)) || null,
        });
      }
    }
    return out;
  }, [draw, nameToFed]);

  const rows: ScorecardRow[] = useMemo(() => {
    return flat.map(p => {
      const manuel = p.fed === MANUEL_FED;
      const bd = p.fed && playersDB ? (playersDB[p.fed] as any) : undefined;
      const hcp = bd?.hcpExact ?? bd?.hcp ?? null;
      return {
        key: `${p.pos}-${p.fed ?? p.nome}`,
        pos: p.pos,
        gross: 0,
        toPar: null,
        scores: [],
        isManuel: manuel,
        nameContent: (
          <>
            <CountryFlag fed={p.fed} fedCountries={fedCountries} />
            <TournPName
              name={p.nome}
              fed={p.fed || undefined}
              playersDB={playersDB}
              highlight={manuel}
            />
          </>
        ),
        prefixCells: (() => {
          const dob: string | undefined = bd?.dob;
          const dobYear = dob ? dob.slice(0, 4) : "";
          const escHist = escalaoAtDate(dob, effDate || undefined) || tournamentEscalao || null;
          const age = ageAtDate(dob, effDate || undefined);
          return (
            <>
              <td className="lb-esc">
                {escHist ? <EscPill esc={escHist} /> : <span className="muted">–</span>}
              </td>
              <td className="lb-fed">{p.fed || "–"}</td>
              <td className="lb-club" title={p.clube || ""}>{p.clube || "–"}</td>
              <td className="lb-hcp">{hcp != null ? fmtHcp(hcp) : "–"}</td>
              <td className="lb-tee"><TeeDot teeName={p.tee || teeName} /></td>
              <td className="fs-11 mono muted" title={dob ? `${dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px" }}>
                {dobYear ? (age != null ? `${dobYear} (${age})` : dobYear) : "–"}
              </td>
            </>
          );
        })(),
        postScorecardCells: (
          <>
            <td className="fs-12 fw-700 mono" style={{ padding: "6px 8px", whiteSpace: "nowrap", textAlign: "center" }}>
              {p.teeTime}
            </td>
            <td className="fs-12 fw-600" style={{ padding: "6px 8px", textAlign: "center" }}>
              T{p.startHole ?? "?"}
            </td>
          </>
        ),
      };
    });
  }, [flat, playersDB, fedCountries, tournamentEscalao, teeName, effDate]);

  if (draw.error) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">Erro a carregar draw: {draw.error}</span>
    </div>;
  }
  if ((draw.groups || []).length === 0) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">{draw.note || "Draw ainda não publicado."}{roundNum ? ` (Ronda ${roundNum})` : ""}</span>
    </div>;
  }

  const prefixHeaderCells = (
    <>
      <th className="lb-esc">ESC.</th>
      <th className="lb-fed">FED</th>
      <th className="lb-club">CLUBE</th>
      <th className="lb-hcp">HCP</th>
      <th className="lb-tee">TEE</th>
      <th style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</th>
    </>
  );
  const postScorecardHeaderCells = (
    <>
      <th style={{ padding: "7px 8px", textAlign: "center" }}>Hora</th>
      <th style={{ padding: "7px 8px", textAlign: "center" }}>Buraco</th>
    </>
  );

  const total = flat.length;
  const filterBar = (
    <div className="detail-toolbar">
      <span className="fw-700 fs-14">Draw{roundNum ? ` — Ronda ${roundNum}` : ""}</span>
      <span className="muted fs-12">{(draw.groups || []).length} flights · {total} jogadores</span>
      {draw.date && <span className="muted fs-12">· {draw.date}</span>}
    </div>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={2}
      showScorecard={false}
      filterBar={filterBar}
      sortable
    />
  );
}
