/**
 * AdmissionsTab.tsx — renderer da tab "Inscrições" num torneio.
 *
 * Usa o componente partilhado `ScorecardLeaderboard` (mesma tabela das
 * classificações) com `showScorecard={false}` — oculta os buracos e
 * mostra apenas prefix do jogador + colunas específicas de inscrições
 * em postScorecardCells.
 *
 * Colunas finais: # | Jogador | ESC | FED | CLUBE | HCP | TEE | ± | Tot | VAC | Registo | Status
 * (o ± e Tot ficam com "–" — são columns estruturais do ScorecardLeaderboard)
 */

import React, { useMemo, useState } from "react";
import type { FpgAdmissions, FpgAdmissionPlayer } from "../data/nacional2026Loader";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill } from "./PillBadge";
import { useFedCountries, CountryFlag } from "./InscricoesComponents";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";

interface Props {
  admissions: FpgAdmissions;
  playersDB?: PlayersDB;
  date?: string | null;
  fpgUrl?: string;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
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

export default function AdmissionsTab({
  admissions, playersDB, date, fpgUrl,
  tournamentEscalao, tournamentSex,
}: Props) {
  const [q, setQ] = useState("");
  const fedCountries = useFedCountries();

  const players = admissions.players || [];
  const confirmedCount = admissions.totalInscritos ?? players.filter(p => p.status === "confirmed").length;
  const reservasCount = admissions.reservas ?? players.filter(p => p.status === "reserva").length;
  const term = norm(q);

  const teeName = teeNameFor(tournamentEscalao, tournamentSex);

  // Enriquecer clube a partir de playersDB (scraper nem sempre captura)
  const enriched = useMemo(() => players.map(p => {
    if (p.clube) return p;
    if (!p.fed || !playersDB) return p;
    const bd = playersDB[p.fed] as any;
    if (!bd) return p;
    const club = typeof bd.club === "string" ? bd.club : bd.club?.short;
    return { ...p, clube: club || p.clube };
  }), [players, playersDB]);

  const filtered = useMemo(() => {
    if (!term) return enriched;
    return enriched.filter(p =>
      norm(p.nome || "").includes(term) ||
      (p.fed || "").includes(term) ||
      norm(p.clube || "").includes(term)
    );
  }, [enriched, term]);

  // Construir rows para o ScorecardLeaderboard
  const rows: ScorecardRow[] = useMemo(() => {
    return filtered.map((p: FpgAdmissionPlayer, i) => {
      const manuel = p.fed === MANUEL_FED;
      const isReserva = p.status === "reserva";
      return {
        key: `${p.fed ?? p.nome}-${i}`,
        pos: p.pos ?? i + 1,
        gross: 0,
        toPar: null,  // ±Par e Tot ficam vazios para admissions
        scores: [],
        isManuel: manuel,
        rowBg: !manuel && isReserva ? "color-mix(in srgb, var(--color-warn) 10%, transparent)" : undefined,
        nameContent: (
          <>
            <CountryFlag fed={p.fed} fedCountries={fedCountries} />
            <TournPName
              name={p.nome || "–"}
              fed={p.fed || undefined}
              playersDB={playersDB}
              highlight={manuel}
            />
          </>
        ),
        prefixCells: (() => {
          const bd = p.fed && playersDB ? (playersDB[p.fed] as any) : undefined;
          const dob: string | undefined = bd?.dob;
          const dobYear = dob ? dob.slice(0, 4) : "";
          // Escalão histórico: calculado a partir da dob + data do torneio (preferido);
          // se não houver dob ou data, cai para o escalão do torneio.
          const escHist = escalaoAtDate(dob, date || undefined) || tournamentEscalao || null;
          const age = ageAtDate(dob, date || undefined);
          return (
            <>
              <td className="lb-esc">
                {escHist ? <EscPill esc={escHist} /> : <span className="muted">–</span>}
              </td>
              <td className="lb-fed">{p.fed || "–"}</td>
              <td className="lb-club" title={p.clube || ""}>{p.clube || "–"}</td>
              <td className="lb-hcp">{fmtHcp(p.hcp)}</td>
              <td className="lb-tee"><TeeDot teeName={teeName} /></td>
              <td className="fs-11 mono muted" title={dob ? `${dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px" }}>
                {dobYear ? (age != null ? `${dobYear} (${age})` : dobYear) : "–"}
              </td>
            </>
          );
        })(),
        postScorecardCells: (
          <>
            <td className="lb-hcp" style={{ fontWeight: 600 }}>{fmtHcp(p.vac)}</td>
            <td className="fs-11 muted" style={{ whiteSpace: "nowrap", padding: "6px 8px" }}>
              {p.dataInscricao || "–"}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "center" }}>
              {isReserva
                ? <span style={{
                    background: "var(--color-warn)", color: "#fff",
                    fontSize: 10, padding: "1px 6px", borderRadius: 10,
                  }}>reserva</span>
                : <span className="muted fs-10">✓</span>}
            </td>
          </>
        ),
      };
    });
  }, [filtered, playersDB, fedCountries, tournamentEscalao, teeName]);

  if (admissions.error) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">Não foi possível carregar inscrições: {admissions.error}</span>
    </div>;
  }
  if (players.length === 0) {
    return <div className="detail-toolbar" style={{ padding: 16 }}>
      <span className="muted">Ainda não há inscritos registados.</span>
    </div>;
  }

  const effDate = date ?? admissions.date ?? null;

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
      <th className="lb-hcp">VAC</th>
      <th style={{ padding: "7px 8px" }}>Registo</th>
      <th style={{ padding: "7px 8px" }}>Status</th>
    </>
  );

  const filterBar = (
    <div className="detail-toolbar">
      <input className="input" value={q} onChange={e => setQ(e.target.value)}
        placeholder="Nome, clube, nº fed..." style={{ maxWidth: 240 }} />
      <span className="muted fs-12">
        {confirmedCount} confirmados{reservasCount > 0 && ` · ${reservasCount} reservas`}
      </span>
      {admissions.status && <span className="chip" title="Estado FPG">{admissions.status}</span>}
      <div className="ml-auto gap-8 flex-wrap" style={{ display: "flex", alignItems: "center" }}>
        {effDate && <span className="muted fs-12">Início: {effDate}</span>}
        {fpgUrl && (
          <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
            className="fs-11" style={{ color: "var(--chart-2)" }}>
            scoring.fpg.pt ↗
          </a>
        )}
      </div>
    </div>
  );

  return (
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={postScorecardHeaderCells}
      postScorecardColCount={3}
      showScorecard={false}
      filterBar={filterBar}
      sortable
    />
  );
}
