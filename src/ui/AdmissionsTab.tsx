/**
 * AdmissionsTab.tsx — renderer da tab "Inscrições" num torneio.
 *
 * Usa o componente partilhado `ScorecardLeaderboard` (mesma tabela das
 * classificações) com `showScorecard={false}` — oculta os buracos e
 * mostra apenas prefix do jogador + colunas específicas em postScorecardCells.
 *
 * Colunas: # | Jogador | ESC | FED | CLUBE | HCP | TEE | Nasc. | ± | Tot | VAC | Registo | Status
 *
 * ⚠ REGRA do projecto: TODAS as colunas do cabeçalho têm de ser ordenáveis.
 * Usa `useSort` + `SortableHdr` nas colunas custom (ScorecardLeaderboard só
 * sabe ordenar pos/name/gross/toPar por ele próprio).
 */

import React, { useMemo, useState } from "react";
import type { FpgAdmissions, FpgAdmissionPlayer } from "../data/nacional2026Loader";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { formatPlayerName } from "../utils/playerUtils";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill } from "./PillBadge";
import { useFedCountries, CountryFlag } from "./InscricoesComponents";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";

interface Props {
  admissions: FpgAdmissions;
  playersDB?: PlayersDB;
  date?: string | null;
  fpgUrl?: string;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
}

type SortKey = "pos" | "nome" | "esc" | "fed" | "clube" | "hcp" | "nasc" | "vac" | "registo" | "status";

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
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc");

  const players = admissions.players || [];
  const confirmedCount = admissions.totalInscritos ?? players.filter(p => p.status === "confirmed").length;
  const reservasCount = admissions.reservas ?? players.filter(p => p.status === "reserva").length;
  const term = norm(q);
  const teeName = teeNameFor(tournamentEscalao, tournamentSex);

  // Enriquecer clube a partir de playersDB (scraper nem sempre captura)
  const enriched = useMemo(() => players.map(p => {
    const bd = p.fed && playersDB ? (playersDB[p.fed] as any) : undefined;
    const nomeFormatted = formatPlayerName(p.nome || "");
    const dob: string | undefined = bd?.dob;
    const dobYear = dob ? parseInt(dob.slice(0, 4), 10) : null;
    let clube = p.clube;
    if (!clube && bd) {
      const club = typeof bd.club === "string" ? bd.club : bd.club?.short;
      clube = club || clube;
    }
    const escHist = escalaoAtDate(dob, date || undefined) || tournamentEscalao || null;
    return {
      ...p,
      _nomeFormatted: nomeFormatted,
      _clube: clube || "",
      _dob: dob,
      _dobYear: dobYear,
      _escHist: escHist,
    };
  }), [players, playersDB, date, tournamentEscalao]);

  const filtered = useMemo(() => {
    if (!term) return enriched;
    return enriched.filter(p =>
      norm(p._nomeFormatted).includes(term) ||
      (p.fed || "").includes(term) ||
      norm(p._clube).includes(term)
    );
  }, [enriched, term]);

  // Ordenar: confirmed antes de reservas, depois pela sortKey
  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // Confirmed sempre antes de reservas
      if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
      let v = 0;
      switch (sortKey) {
        case "pos":     v = (a.pos ?? INF) - (b.pos ?? INF); break;
        case "nome":    v = a._nomeFormatted.localeCompare(b._nomeFormatted, "pt"); break;
        case "esc":     v = (a._escHist || "").localeCompare(b._escHist || "", "pt"); break;
        case "fed":     v = (a.fed || "").localeCompare(b.fed || ""); break;
        case "clube":   v = a._clube.localeCompare(b._clube, "pt"); break;
        case "hcp":     v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "nasc":    v = (a._dobYear ?? INF) - (b._dobYear ?? INF); break;
        case "vac":     v = (a.vac ?? INF) - (b.vac ?? INF); break;
        case "registo": v = (a.dataInscricao || "").localeCompare(b.dataInscricao || ""); break;
        case "status":  v = a.status.localeCompare(b.status); break;
      }
      return mult * v;
    });
  }, [filtered, sortKey, sortDir]);

  const rows: ScorecardRow[] = useMemo(() => {
    return sorted.map((p, i) => {
      const manuel = p.fed === MANUEL_FED;
      const isReserva = p.status === "reserva";
      const age = ageAtDate(p._dob, date || undefined);
      return {
        key: `${p.fed ?? p.nome}-${i}`,
        pos: p.pos ?? i + 1,
        gross: 0,
        toPar: null,
        scores: [],
        isManuel: manuel,
        sortPos: p.pos ?? i + 1,
        sortName: p._nomeFormatted,
        rowBg: !manuel && isReserva ? "color-mix(in srgb, var(--color-warn) 10%, transparent)" : undefined,
        nameContent: (
          <>
            <CountryFlag fed={p.fed} fedCountries={fedCountries} />
            <TournPName
              name={p._nomeFormatted || "–"}
              fed={p.fed || undefined}
              playersDB={playersDB}
              highlight={manuel}
            />
          </>
        ),
        prefixCells: (
          <>
            <td className="lb-esc">
              {p._escHist ? <EscPill esc={p._escHist} /> : <span className="muted">–</span>}
            </td>
            <td className="lb-fed">{p.fed || "–"}</td>
            <td className="lb-club" title={p._clube}>{p._clube || "–"}</td>
            <td className="lb-hcp">{fmtHcp(p.hcp)}</td>
            <td className="lb-tee"><TeeDot teeName={teeName} /></td>
            <td className="fs-11 mono muted" title={p._dob ? `${p._dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px" }}>
              {p._dobYear != null ? (age != null ? `${p._dobYear} (${age})` : String(p._dobYear)) : "–"}
            </td>
          </>
        ),
        postScorecardCells: (
          <>
            <td className="lb-hcp" style={{ fontWeight: 600 }}>{fmtHcp(p.vac)}</td>
            <td className="fs-11 muted" style={{ whiteSpace: "nowrap", padding: "6px 8px" }}>
              {p.dataInscricao || "–"}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "center" }}>
              {isReserva
                ? <span style={{ background: "var(--color-warn)", color: "#fff", fontSize: 10, padding: "1px 6px", borderRadius: 10 }}>reserva</span>
                : <span className="muted fs-10">✓</span>}
            </td>
          </>
        ),
      };
    });
  }, [sorted, playersDB, fedCountries, teeName, date]);

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
      <SortableHdr k="esc"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">ESC.</SortableHdr>
      <SortableHdr k="fed"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">FED</SortableHdr>
      <SortableHdr k="clube"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>
      <th className="lb-tee">TEE</th>
      <SortableHdr k="nasc"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</SortableHdr>
    </>
  );
  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="vac"     sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">VAC</SortableHdr>
      <SortableHdr k="registo" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px" }}>Registo</SortableHdr>
      <SortableHdr k="status"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px" }}>Status</SortableHdr>
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
      // Sorting da pos e nome: delegamos a useSort externo
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
  );
}
