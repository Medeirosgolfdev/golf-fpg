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

import { useMemo, useState } from "react";
import type { FpgAdmissions } from "../data/nacional2026Loader";
import { norm, fmtHcp, ageAtDate, escalaoAtDate } from "../utils/format";
import { formatPlayerName } from "../utils/playerUtils";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill, YearPill } from "./PillBadge";
import { useFedCountries, useFedBirthdates, useFedGenders } from "./InscricoesComponents";
import { parseSubNumber, teeNameFor, type TeeRule } from "../utils/teeRegulation";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import { displayFed } from "../utils/fedKeys";

interface Props {
  admissions: FpgAdmissions;
  playersDB?: PlayersDB;
  date?: string | null;
  fpgUrl?: string;
  tournamentEscalao?: string;
  tournamentSex?: "M" | "F";
  /** Esconde VAC/Registo/Status — fontes sem esses dados (ex.: NextCaddy/España). */
  hidePostCols?: boolean;
  /** Regra de "área de partida" por escalão+sexo (ver src/utils/teeRegulation.ts).
   *  Quando presente, o tee é calculado POR JOGADOR (do escalão dele à data + sexo)
   *  e mostrado como quadradinho de cor. Usado por torneios multi-escalão cujo
   *  regulamento define os tees (ex.: Miramar Open U25). */
  teeRule?: TeeRule;
}

type SortKey = "pos" | "nome" | "esc" | "fed" | "clube" | "hcp" | "nasc" | "vac" | "registo" | "status";


export default function AdmissionsTab({
  admissions, playersDB, date, fpgUrl,
  tournamentEscalao, tournamentSex, hidePostCols, teeRule,
}: Props) {
  const [q, setQ] = useState("");
  const fedCountries = useFedCountries();
  const fedBirthdates = useFedBirthdates();
  const fedGenders = useFedGenders();
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc");

  const players = admissions.players || [];
  const confirmedCount = admissions.totalInscritos ?? players.filter(p => p.status === "confirmed").length;
  const reservasCount = admissions.reservas ?? players.filter(p => p.status === "reserva").length;
  const desistentesCount = players.filter(p => p.status === "desistente").length;
  const term = norm(q);
  const teeName = teeNameFor(tournamentEscalao, tournamentSex);

  // Enriquecer clube a partir de playersDB (scraper nem sempre captura)
  const enriched = useMemo(() => players.map(p => {
    const bd = p.fed && playersDB ? (playersDB[p.fed] as any) : undefined;
    const nomeFormatted = formatPlayerName(p.nome || "");
    // Dob: override do jogador (NextCaddy) → playersDB (curado) → federados.json (FPG)
    // A ficha RFEG (_rfeg) entra por ultimo, mas e a unica fonte de dob/sexo
    // para quem nao tem federado portugues — sem ela os internacionais ficam
    // sem escalao e sem marcacao calculada pelo regulamento.
    const dob: string | undefined =
      p.dob || bd?.dob || (p.fed ? fedBirthdates.get(p.fed) : undefined) || (p as any)._rfeg?.dob;
    const dobYear = dob ? parseInt(dob.slice(0, 4), 10) : null;
    let clube = p.clube;
    if (!clube && bd) {
      const club = typeof bd.club === "string" ? bd.club : bd.club?.short;
      clube = club || clube;
    }
    // Escalão: calculado da dob (autoritativo). NÃO cair em `tournamentEscalao`
    // porque torneios combinados (Regional Sub 14-24, Sub 10+12) misturam vários
    // escalões — o genérico engana.
    const escHist = p.escalao || escalaoAtDate(dob, date || undefined) || null;
    // Tee por REGULAMENTO (escalão do jogador + sexo) — só quando o torneio
    // traz uma `teeRule`. Sexo: override do jogador → playersDB → federados.json.
    const sex: "M" | "F" | undefined =
      ((p as any).sex as "M" | "F" | undefined) ||
      (bd?.sex as "M" | "F" | undefined) ||
      (p.fed ? fedGenders.get(p.fed) : undefined) ||
      ((p as any)._rfeg?.sex as "M" | "F" | undefined) ||
      tournamentSex;
    const ruleTee = teeRule ? teeRule(parseSubNumber(escHist), sex) : undefined;
    return {
      ...p,
      _nomeFormatted: nomeFormatted,
      _clube: clube || "",
      _dob: dob,
      _dobYear: dobYear,
      _escHist: escHist,
      _ruleTee: ruleTee,
    };
  }), [players, playersDB, fedBirthdates, fedGenders, date, teeRule, tournamentSex]);

  const filtered = useMemo(() => {
    if (!term) return enriched;
    return enriched.filter(p =>
      norm(p._nomeFormatted).includes(term) ||
      (p.fed || "").includes(term) ||
      norm(p._clube).includes(term)
    );
  }, [enriched, term]);

  // Ordenar: confirmed e reservas misturam-se conforme a sortKey escolhida.
  // Só `pos` e `status` fazem separação explícita (faz sentido para a ordem natural
  // da inscrição). As restantes colunas (hcp, vac, nome, nasc, ...) ordenam a lista
  // toda junta — o estado reserva/confirmed continua distinguível pelo pill da última
  // coluna ("Status").
  const sorted = useMemo(() => {
    const INF = 9999;
    const mult = sortDir === "asc" ? 1 : -1;
    // Posição absoluta: confirmed 1..N, reservas N+1.., desistentes por último.
    const nConf = filtered.filter(p => p.status === "confirmed").length;
    const nRes = filtered.filter(p => p.status === "reserva").length;
    const absPos = (p: typeof filtered[number]) =>
      p.status === "confirmed" ? (p.pos ?? INF)
        : p.status === "reserva" ? nConf + (p.pos ?? INF)
        : nConf + nRes + (p.pos ?? INF);
    return [...filtered].sort((a, b) => {
      let v = 0;
      switch (sortKey) {
        case "pos":     v = absPos(a) - absPos(b); break;
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
    // Posição contínua: confirmed 1..N, reservas N+1..N+M. Mostra números únicos
    // mesmo quando confirmed e reservas aparecem misturadas por sort custom.
    const nConf = sorted.filter(p => p.status === "confirmed").length;
    const nRes = sorted.filter(p => p.status === "reserva").length;
    return sorted.map((p, i) => {
      const manuel = p.fed === MANUEL_FED;
      const isReserva = p.status === "reserva";
      const isDesist = p.status === "desistente";
      const desinscritoEm = (p as any).desinscritoEm as string | undefined;
      const age = ageAtDate(p._dob, date || undefined);
      // Desistentes não ocupam número de posição (a inscrição foi anulada);
      // confirmed 1..N, reservas N+1.., desistentes fora da numeração.
      const numPos = isDesist ? null : isReserva ? nConf + (p.pos ?? i + 1) : (p.pos ?? i + 1);
      const nameNode = (
        // A bandeira é desenhada pelo TournPName (lookup country via playersDB).
        // NÃO adicionar CountryFlag aqui — senão estrangeiros ficam com bandeira a dobrar.
        <TournPName
          name={p._nomeFormatted || "–"}
          fed={p.fed || undefined}
          // Internacionais: id do agregador vindo da licenca federativa. O
          // match por nome falha aqui — o clube publica "Diego Gross", o
          // agregador tem "Diego Gross Paneque".
          juniorId={(p as any)._rfeg?.juniorId}
          playersDB={playersDB}
          // País da própria fonte (circuitos estrangeiros marcam-no na linha) —
          // o playersDB só cobre quem tem federado nosso.
          country={(p as { country?: string }).country}
          highlight={manuel}
        />
      );
      return {
        key: `${p.fed ?? p.nome}-${i}`,
        pos: isDesist ? <span className="muted">–</span> : numPos,
        gross: 0,
        toPar: null,
        scores: [],
        isManuel: manuel,
        sortPos: numPos ?? (nConf + nRes + (p.pos ?? i + 1)),
        sortName: p._nomeFormatted,
        rowBg: manuel ? undefined
          : isDesist ? "color-mix(in srgb, var(--text-muted) 10%, transparent)"
          : isReserva ? "color-mix(in srgb, var(--text-muted) 6%, transparent)" : undefined,
        nameContent: isDesist
          ? <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{nameNode}</span>
          : nameNode,
        prefixCells: (
          <>
            <td className="lb-esc">
              {p._escHist ? <EscPill esc={p._escHist} /> : <span className="muted">–</span>}
            </td>
            {/* Chaves virtuais (`kids:`/`intl:`) sao ids internos derivados do
                nome — mostrar "–", que e a informacao verdadeira: sem federado.
                O `fed` cru continua a ir para o TournPName, que precisa dele
                para o perfil e para o link ↗. */}
            <td className="lb-fed">{displayFed(p.fed) || "–"}</td>
            <td className="lb-club" title={p._clube}>{p._clube || "–"}</td>
            <td className="lb-hcp">{fmtHcp(p.hcp)}</td>
            <td className="lb-tee">{
              // 1) tee do regulamento (escalão+sexo) → quadradinho de cor;
              // 2) teeName explícito (ex.: NextCaddy = distância "5498 m") → texto;
              // 3) fallback: tee genérico do escalão global → quadradinho.
              p._ruleTee ? <TeeDot teeName={p._ruleTee} />
                : p.teeName ? <span className="fs-11" style={{ whiteSpace: "nowrap" }}>{p.teeName}</span>
                : <TeeDot teeName={teeName} />
            }</td>
            <td title={p._dob ? `${p._dob} (${age ?? "?"} anos à data)` : ""} style={{ textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
              {p._dobYear != null ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <YearPill year={p._dobYear} />
                  {age != null && <span className="muted fs-10">({age})</span>}
                </span>
              ) : <span className="muted">–</span>}
            </td>
          </>
        ),
        postScorecardCells: hidePostCols ? undefined : (
          <>
            <td className="lb-hcp" style={{ fontWeight: 600 }}>{fmtHcp(p.vac)}</td>
            <td className="fs-11 muted" style={{ whiteSpace: "nowrap", padding: "6px 8px" }}>
              {p.dataInscricao || "–"}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "center" }}>
              {isDesist
                ? <span
                    title={desinscritoEm ? `Desinscreveu-se em ${desinscritoEm}` : "Desinscreveu-se"}
                    style={{ background: "color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)", color: "var(--danger, #dc2626)", fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--danger, #dc2626) 32%, transparent)", whiteSpace: "nowrap" }}>desistiu</span>
                : isReserva
                ? <span style={{ background: "var(--bg-muted)", color: "var(--text-muted)", fontSize: "var(--fs-10)", padding: "1px 6px", borderRadius: 10, border: "1px solid var(--border-light)" }}>pendente</span>
                : <span className="muted fs-10">✓</span>}
            </td>
          </>
        ),
      };
    });
  }, [sorted, playersDB, fedCountries, teeName, date, hidePostCols]);

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
        {confirmedCount} confirmados{reservasCount > 0 && ` · ${reservasCount} pendentes`}{desistentesCount > 0 && ` · ${desistentesCount} desistiram`}
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
      postScorecardHeaderCells={hidePostCols ? undefined : postScorecardHeaderCells}
      postScorecardColCount={hidePostCols ? 0 : 3}
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
