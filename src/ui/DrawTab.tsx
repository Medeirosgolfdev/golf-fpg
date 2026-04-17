/**
 * DrawTab.tsx — renderer da tab "Draw R{n}" num torneio.
 *
 * Usa o componente `ScorecardLeaderboard` (mesma tabela das classificações)
 * com `showScorecard={false}`. Cada linha é um jogador; em vez dos scores
 * mostra Hora e Buraco de saída.
 *
 * Colunas: # | Jogador | ESC | FED | CLUBE | HCP | TEE | Nasc. | ± | Tot | Hora | Buraco
 *
 * ⚠ REGRA do projecto: TODAS as colunas do cabeçalho têm de ser ordenáveis.
 * Usa `useSort` + `SortableHdr` nas colunas custom.
 */

import React, { useMemo } from "react";
import type { FpgDraw } from "../data/nacional2026Loader";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill } from "./PillBadge";
import { useFedCountries, CountryFlag } from "./InscricoesComponents";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { formatPlayerName } from "../utils/playerUtils";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";

interface Props {
  draw: FpgDraw;
  roundNum?: number;
  playersDB?: PlayersDB;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
  /** Data do torneio (YYYY-MM-DD) — usada para calcular escalão histórico. */
  tournamentDate?: string | null;
}

type SortKey = "pos" | "nome" | "esc" | "fed" | "clube" | "hcp" | "nasc" | "hora" | "buraco";

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
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc");

  const nameToFed = useMemo(() => {
    const m = new Map<string, string>();
    if (!playersDB) return m;
    for (const [fed, bd] of Object.entries(playersDB)) {
      const nm = (bd as any)?.name as string | undefined;
      if (nm) m.set(norm(nm), fed);
    }
    return m;
  }, [playersDB]);

  // Achatar flights + enriquecer com dados do playersDB
  const flat = useMemo(() => {
    const out: Array<{
      pos: number;
      teeTime: string;
      startHole: number | null;
      tee: string | null;
      nome: string;
      clube: string;
      fed: string | null;
      hcp: number | null;
      dob?: string;
      dobYear: number | null;
      escHist: string | null;
    }> = [];
    let idx = 0;
    for (const g of (draw.groups || [])) {
      for (const p of g.players) {
        idx++;
        const nomeFormatted = formatPlayerName(p.nome || "");
        const fed = nameToFed.get(norm(p.nome)) || nameToFed.get(norm(nomeFormatted)) || null;
        const bd = fed && playersDB ? (playersDB[fed] as any) : undefined;
        const hcp = bd?.hcpExact ?? bd?.hcp ?? null;
        const dob: string | undefined = bd?.dob;
        const dobYear = dob ? parseInt(dob.slice(0, 4), 10) : null;
        const escHist = escalaoAtDate(dob, effDate || undefined) || tournamentEscalao || null;
        out.push({
          pos: idx,
          teeTime: g.teeTime,
          startHole: g.startHole,
          tee: g.tee,
          nome: nomeFormatted,
          clube: p.clube || "",
          fed,
          hcp,
          dob,
          dobYear,
          escHist,
        });
      }
    }
    return out;
  }, [draw, nameToFed, playersDB, effDate, tournamentEscalao]);

  // Ordenar por sortKey
  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...flat].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":    v = a.pos - b.pos; break;
        case "nome":   v = a.nome.localeCompare(b.nome, "pt"); break;
        case "esc":    v = (a.escHist || "").localeCompare(b.escHist || "", "pt"); break;
        case "fed":    v = (a.fed || "").localeCompare(b.fed || ""); break;
        case "clube":  v = a.clube.localeCompare(b.clube, "pt"); break;
        case "hcp":    v = (a.hcp ?? INF) - (b.hcp ?? INF); break;
        case "nasc":   v = (a.dobYear ?? INF) - (b.dobYear ?? INF); break;
        case "hora":   v = a.teeTime.localeCompare(b.teeTime); break;
        case "buraco": v = (a.startHole ?? INF) - (b.startHole ?? INF); break;
      }
      return mult * v;
    });
  }, [flat, sortKey, sortDir]);

  const rows: ScorecardRow[] = useMemo(() => {
    return sorted.map(p => {
      const manuel = p.fed === MANUEL_FED;
      const age = ageAtDate(p.dob, effDate || undefined);
      return {
        key: `${p.pos}-${p.fed ?? p.nome}`,
        pos: p.pos,
        gross: 0,
        toPar: null,
        scores: [],
        isManuel: manuel,
        sortPos: p.pos,
        sortName: p.nome,
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
        prefixCells: (
          <>
            <td className="lb-esc">
              {p.escHist ? <EscPill esc={p.escHist} /> : <span className="muted">–</span>}
            </td>
            <td className="lb-fed">{p.fed || "–"}</td>
            <td className="lb-club" title={p.clube}>{p.clube || "–"}</td>
            <td className="lb-hcp">{p.hcp != null ? fmtHcp(p.hcp) : "–"}</td>
            <td className="lb-tee"><TeeDot teeName={p.tee || teeName} /></td>
            <td className="fs-11 mono muted" title={p.dob ? `${p.dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px" }}>
              {p.dobYear != null ? (age != null ? `${p.dobYear} (${age})` : String(p.dobYear)) : "–"}
            </td>
          </>
        ),
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
  }, [sorted, playersDB, fedCountries, teeName, effDate]);

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
      <SortableHdr k="esc"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">ESC.</SortableHdr>
      <SortableHdr k="fed"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">FED</SortableHdr>
      <SortableHdr k="clube" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">CLUBE</SortableHdr>
      <SortableHdr k="hcp"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>
      <th className="lb-tee">TEE</th>
      <SortableHdr k="nasc"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Nasc.</SortableHdr>
    </>
  );
  const postScorecardHeaderCells = (
    <>
      <SortableHdr k="hora"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Hora</SortableHdr>
      <SortableHdr k="buraco" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} style={{ padding: "7px 8px", textAlign: "center" }}>Buraco</SortableHdr>
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
      // Sorting da pos e nome: delegamos a useSort externo
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
  );
}
