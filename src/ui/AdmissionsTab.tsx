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

import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FpgAdmissions, FpgAdmissionPlayer } from "../data/nacional2026Loader";
import { fmtHcp, ageAtDate, escalaoAtDate, birthYearOf } from "../utils/format";
import { formatPlayerName } from "../utils/playerUtils";
import { MANUEL_FED } from "../constants/manuel";
import { TournPName, TeeDot } from "./tournamentPrimitives";
import type { PlayersDB } from "./tournamentPrimitives";
import { EscPill } from "./PillBadge";
import BirthPill from "./BirthPill";
import { useFedCountries, useFedBirthdates, useFedGenders, useFedHcp } from "./InscricoesComponents";
import { parseSubNumber, teeNameFor, type TeeRule } from "../utils/teeRegulation";
import { ScorecardLeaderboard, type ScorecardRow } from "./ScorecardLeaderboard";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";
import { displayFed } from "../utils/fedKeys";
import { RowsFilterBar, filterRows } from "./PlayerFilterBar";
import { EMPTY_FILTER, type PlayerFilter, type MultiRoundRow } from "./multiRoundTypes";
import { KidsLinkCtx } from "./KidsLink";
import { normName } from "../data/KIDSdataLoader";
import { cachedFetchJson } from "../data/fetchCache";
import { formaMedia, type ScoutFile, type JuniorScout } from "./circuit/scoutModel";
import { getTierLabel, type TierKey } from "../pages/kids2/juniorCalc";

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
  /** Colunas próprias de uma página, depois do TEE (ex.: forma WHS dos
   *  Nacionais; HCP actual e edição anterior das listas do kids2). */
  extraCols?: AdmissionsExtraCol[];
  /** Esconde colunas que a fonte não tem (sem afectar as outras páginas). */
  hideCols?: { esc?: boolean; nasc?: boolean; fed?: boolean; tee?: boolean; vac?: boolean; registo?: boolean };
  /** Inscrições recentes: linha destacada + «NOVO» + aviso por cima (default 48 h;
   *  null desliga). Só conta quem traz `dataInscricao`. */
  recentHours?: number | null;
  /** Desistências recentes (nomes) para o mesmo aviso. */
  removidos?: string[];
  /** Mais coisas na linha de informação (contadores, estado da cache…). */
  infoExtra?: ReactNode;
  /** Etiqueta do estado «reserva» (default «pendente»; listas: «espera»). */
  reservaLabel?: string;
  /** Conteúdo da coluna # (default: o número na ordem confirmados → reservas). */
  posContent?: (p: FpgAdmissionPlayer) => ReactNode;
  /** Coluna «HCP actual»: o handicap de hoje na FPG (federados-lite) de quem
   *  traz federado — para comparar com o HCP da inscrição (listas em PDF de
   *  semanas atrás; 29/10/2026). */
  hcpActual?: boolean;
  /** Colunas do Kids 2 (nível, torneios, vitórias, forma) para quem casa com
   *  uma ficha — circuitos de fora, onde a inscrição só traz nome e cidade
   *  (USKids, 30/10/2026). */
  kidsCols?: boolean;
}

/** Coluna própria (ordenável) da AdmissionsTab. */
export interface AdmissionsExtraCol {
  key: string;
  label: ReactNode;
  title?: string;
  cell: (p: FpgAdmissionPlayer) => ReactNode;
  sort?: (p: FpgAdmissionPlayer) => number | string | null;
  dir?: "asc" | "desc";
}

/** «2026/04/03 09:14» (hora de Lisboa, como a FPG publica) nas últimas N horas? */
function isRecentHours(s: string | null | undefined, hours: number): boolean {
  if (!s) return false;
  const d = new Date(s.replace(/\//g, "-"));
  return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < hours * 3600_000;
}

/** «2026/09/15 16:05» (FPG) → «15/09 16:05», o formato de datas do resto da
 *  app (14/10/2026). O ano só aparece se não for o corrente. Outros formatos
 *  ficam como vêm. */
function fmtRegisto(s: string | null | undefined): string {
  const m = String(s || "").match(/^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return s || "–";
  const ano = m[1] !== String(new Date().getFullYear()) ? `/${m[1]}` : "";
  return `${m[3]}/${m[2]}${ano}${m[4] ? ` ${m[4]}` : ""}`;
}

type SortKey = "pos" | "nome" | "esc" | "fed" | "clube" | "hcp" | "nasc" | "pts" | "vac" | "registo" | "status" | `x:${string}`;


/** Chave da ficha do Kids 2 — as colunas recebem a cópia enriquecida do jogador. */
const scoutKey = (p: FpgAdmissionPlayer) => `${p.fed ?? ""}|${p.nome ?? ""}`;

const TIER_ORDEM: TierKey[] = ["elite", "strong", "solid", "developing", "beginner"];

const NO_COLS: AdmissionsExtraCol[] = [];
const NO_HIDE: NonNullable<Props["hideCols"]> = {};
const NO_NAMES: string[] = [];

export default function AdmissionsTab({
  admissions, playersDB, date, fpgUrl,
  tournamentEscalao, tournamentSex, hidePostCols, teeRule,
  extraCols: extraColsProp = NO_COLS, hideCols = NO_HIDE, recentHours = 48, removidos = NO_NAMES, infoExtra, reservaLabel, posContent,
  hcpActual = false, kidsCols = false,
}: Props) {
  // A MESMA barra de filtros do scorecard e do draw (13/10/2026 — «tudo igual»).
  const [pFilter, setPFilter] = useState<PlayerFilter>(EMPTY_FILTER);
  const fedCountries = useFedCountries();
  const fedBirthdates = useFedBirthdates();
  const fedGenders = useFedGenders();
  const fedHcp = useFedHcp();
  const players = admissions.players || [];
  // Ficha do Kids 2 de cada inscrito (pelo nome, como a seta ↗ e o Scout; um
  // homónimo com outro federado não conta). Dá a data de nascimento a quem a
  // inscrição não traz e, com `kidsCols`, as colunas do Kids 2. Só a data
  // completa (`d`) — nunca o ano estimado do ranking.
  const kidsMap = useContext(KidsLinkCtx);
  const precisaScout = kidsMap.size > 0 && (kidsCols || players.some(p => !p.dob && !p.fed));
  const [scout, setScout] = useState<ScoutFile | null>(null);
  useEffect(() => {
    if (!precisaScout) return;
    let vivo = true;
    cachedFetchJson<ScoutFile>("/data/juniors-scout.json").then(d => { if (vivo) setScout(d ?? null); }).catch(() => {});
    return () => { vivo = false; };
  }, [precisaScout]);
  const scoutOf = useMemo(() => {
    const m = new Map<string, JuniorScout>();
    if (!scout) return m;
    for (const p of players) {
      const kid = kidsMap.get(normName(p.nome || ""));
      if (!kid?.id || (p.fed && kid.fed && kid.fed !== p.fed)) continue;
      const sc = scout.players[kid.id];
      if (sc) m.set(scoutKey(p), sc);
    }
    return m;
  }, [scout, players, kidsMap]);
  const extraCols = useMemo<AdmissionsExtraCol[]>(() => {
    const cols = [...extraColsProp];
    if (hcpActual) cols.push({
      key: "hcpActual", label: "HCP actual", title: "Handicap de hoje na FPG (só quem tem federado)",
      sort: (p) => (p.fed ? fedHcp.get(p.fed) : undefined) ?? null,
      cell: (p) => fmtHcp(p.fed ? fedHcp.get(p.fed) : undefined),
    });
    if (kidsCols && scoutOf.size > 0) {
      const sc = (p: FpgAdmissionPlayer) => scoutOf.get(scoutKey(p));
      const sem = <span className="muted">–</span>;
      cols.push(
        { key: "k2nivel", label: "Nível", title: "Nível no Kids 2 (pela carreira)",
          sort: (p) => { const t = sc(p)?.t; return t ? TIER_ORDEM.indexOf(t) : null; }, cell: (p) => { const t = sc(p)?.t; return t ? getTierLabel(t) : sem; } },
        { key: "k2n", label: "Torn.", title: "Torneios na carreira (Kids 2)", dir: "desc",
          sort: (p) => sc(p)?.n ?? null, cell: (p) => sc(p)?.n ?? sem },
        { key: "k2w", label: "Vit.", title: "Vitórias na carreira (Kids 2)", dir: "desc",
          sort: (p) => sc(p)?.w ?? null, cell: (p) => sc(p) ? (sc(p)!.w ?? 0) : sem },
        { key: "k2forma", label: "Forma", title: "±par médio por 18 buracos nos últimos torneios (Kids 2)",
          sort: (p) => formaMedia(sc(p)?.f),
          cell: (p) => { const f = formaMedia(sc(p)?.f); return f == null ? sem : f > 0 ? `+${f}` : f === 0 ? "E" : `${f}`.replace("-", "−"); } },
      );
    }
    return cols;
  }, [hcpActual, extraColsProp, fedHcp, kidsCols, scoutOf]);
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("pos", "asc", {
    pts: "desc", ...Object.fromEntries(extraCols.filter(c => c.dir).map(c => [`x:${c.key}`, c.dir!])),
  });
  const isNovo = (p: { dataInscricao?: string | null }) => recentHours != null && isRecentHours(p.dataInscricao, recentHours);

  // Listas de apurados (finais Drive) trazem os pontos do ranking que os apurou.
  const hasPts = players.some(p => p.pts != null);
  const confirmedCount = admissions.totalInscritos ?? players.filter(p => p.status === "confirmed").length;
  const reservasCount = admissions.reservas ?? players.filter(p => p.status === "reserva").length;
  const desistentesCount = players.filter(p => p.status === "desistente").length;
  // Lista de convocados de uma final Drive: «inscritos» / «por inscrever».
  const convocados = !!admissions._apurados;
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
      p.dob || bd?.dob || (p.fed ? fedBirthdates.get(p.fed) : undefined) || (p as any)._rfeg?.dob ||
      (/^\d{4}-\d{2}-\d{2}/.test(scoutOf.get(scoutKey(p))?.d ?? "") ? scoutOf.get(scoutKey(p))!.d : undefined);
    const dobYear = birthYearOf(dob);
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
  }), [players, playersDB, fedBirthdates, fedGenders, date, teeRule, tournamentSex, scoutOf]);

  // Colunas sem nada para mostrar escondem-se sozinhas; o ESC. também quando
  // todos são do mesmo escalão (USKids: a divisão já é o escalão, 30/10/2026).
  const hide = useMemo(() => {
    const escs = new Set(enriched.map(p => p._escHist || ""));
    return {
      ...hideCols,
      esc: hideCols.esc || escs.size <= 1,
      nasc: hideCols.nasc || !enriched.some(p => p._dob),
      fed: hideCols.fed || !enriched.some(p => displayFed(p.fed)),
      hcp: !enriched.some(p => p.hcp != null),
      tee: hideCols.tee || (!teeName && !enriched.some(p => p._ruleTee || p.teeName)),
    };
  }, [hideCols, enriched, teeName]);

  // Cada inscrito na forma das linhas do scorecard, para a barra de filtros comum.
  const asRow = (p: (typeof enriched)[number], i: number): MultiRoundRow => ({
    key: String(i), name: p._nomeFormatted, fed: p.fed ?? undefined, club: p._clube || undefined,
    esc: p._escHist ?? undefined, teeName: p._ruleTee ?? undefined, dob: p._dob ?? null,
    toPar: null, gross: null, pos: p.pos ?? 0, rounds: [],
  });
  const filterRowsAll = useMemo(() => enriched.map(asRow), [enriched]);
  const filtered = useMemo(() => {
    // Nº de federado escrito na pesquisa → procura pelo fed (a barra só vê nome/clube).
    const q = pFilter.name.trim();
    const byFed = /^\d+$/.test(q);
    const f = byFed ? { ...pFilter, name: "" } : pFilter;
    const keep = new Set(filterRows(filterRowsAll, f, playersDB).map(r => r.key));
    return enriched.filter((p, i) => keep.has(String(i)) && (!byFed || (p.fed || "").includes(q)));
  }, [enriched, filterRowsAll, pFilter, playersDB]);

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
        case "pts":     v = (a.pts ?? -1) - (b.pts ?? -1); break;
        case "vac":     v = (a.vac ?? INF) - (b.vac ?? INF); break;
        case "registo": v = (a.dataInscricao || "").localeCompare(b.dataInscricao || ""); break;
        case "status":  v = a.status.localeCompare(b.status); break;
        default: {
          const col = extraCols.find(c => `x:${c.key}` === sortKey);
          const va = col?.sort?.(a) ?? null, vb = col?.sort?.(b) ?? null;
          if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1; // vazios no fim
          v = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt");
        }
      }
      return mult * v;
    });
  }, [filtered, sortKey, sortDir, extraCols]);

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
      const novo = isNovo(p);
      const nameNode = (
        // A bandeira é desenhada pelo TournPName (lookup country via playersDB).
        // NÃO adicionar CountryFlag aqui — senão estrangeiros ficam com bandeira a dobrar.
        <TournPName
          name={p._nomeFormatted || "–"}
          fed={p.fed || undefined}
          // Internacionais: id do agregador vindo da licenca federativa. O
          // match por nome falha aqui — o clube publica "Diego Gross", o
          // agregador tem "Diego Gross Paneque".
          juniorId={p.juniorId ?? (p as any)._rfeg?.juniorId}
          playersDB={playersDB}
          // País da própria fonte (circuitos estrangeiros marcam-no na linha) —
          // o playersDB só cobre quem tem federado nosso.
          country={(p as { country?: string }).country}
          highlight={manuel}
        />
      );
      const nameWithTags = p.tags?.length
        ? <span className="inline-flex items-center gap-4">{nameNode}{p.tags.map(t => <span key={t} className="chip fs-10">{t}</span>)}</span>
        : nameNode;
      return {
        key: `${p.fed ?? p.nome}-${i}`,
        pos: posContent ? posContent(p) : isDesist ? <span className="muted">–</span> : numPos,
        gross: 0,
        toPar: null,
        scores: [],
        isManuel: manuel,
        sortPos: numPos ?? (nConf + nRes + (p.pos ?? i + 1)),
        sortName: p._nomeFormatted,
        rowBg: manuel ? undefined
          : novo ? "color-mix(in srgb, var(--score-eagle) 10%, transparent)"
          : isDesist ? "color-mix(in srgb, var(--text-muted) 10%, transparent)"
          : isReserva ? "color-mix(in srgb, var(--text-muted) 6%, transparent)" : undefined,
        nameContent: isDesist
          ? <span className="u-td-line-through u-op-0_6">{nameWithTags}</span>
          : nameWithTags,
        prefixCells: (
          <>
            {!hide.esc && <td className="lb-esc">
              {p._escHist ? <EscPill esc={p._escHist} /> : <span className="muted">–</span>}
            </td>}
            {/* Nasc. + Idade como no Resumo (pílulas neutras, colunas próprias). */}
            {!hide.nasc && <>
            <td className="lb-esc" title={p._dob ? `${p._dob} (${age ?? "?"} anos à data)` : ""}>
              {p._dobYear != null ? <BirthPill>{p._dobYear}</BirthPill> : <span className="muted">–</span>}
            </td>
            <td className="lb-esc" title={p._dob ? `${p._dob} (${age ?? "?"} anos à data)` : ""}>
              {age != null ? <BirthPill>{age}a</BirthPill> : <span className="muted">–</span>}
            </td>
            </>}
            {/* Chaves virtuais (`kids:`/`intl:`) sao ids internos derivados do
                nome — mostrar "–", que e a informacao verdadeira: sem federado.
                O `fed` cru continua a ir para o TournPName, que precisa dele
                para o perfil e para o link ↗. */}
            {!hide.fed && <td className="lb-fed">{displayFed(p.fed) || "–"}</td>}
            <td className="lb-club" title={p._clube}>{p._clube || "–"}</td>
            {!hide.hcp && <td className="lb-hcp">{fmtHcp(p.hcp)}</td>}
            {!hide.tee && <td className="lb-tee">{
              // 1) tee do regulamento (escalão+sexo) → quadradinho de cor;
              // 2) teeName explícito (ex.: NextCaddy = distância "5498 m") → texto;
              // 3) fallback: tee genérico do escalão global → quadradinho.
              p._ruleTee ? <TeeDot teeName={p._ruleTee} />
                : p.teeName ? <span className="fs-11 u-ws-nowrap">{p.teeName}</span>
                : <TeeDot teeName={teeName} />
            }</td>}
            {hasPts && (
              <td title={p.ptsInfo || ""} className="u-ta-center u-ws-nowrap">
                {/* Uma linha só (como o scorecard): «674 · 1º Madeira». */}
                {p.pts != null ? (
                  <>
                    <b>{p.pts}</b>
                    {p.ptsRank && <span className="muted fs-10"> · {p.ptsRank}</span>}
                  </>
                ) : <span className="muted">–</span>}
              </td>
            )}
            {extraCols.map(c => <td key={c.key} className="u-ta-center">{c.cell(p)}</td>)}
          </>
        ),
        postScorecardCells: hidePostCols ? undefined : (
          <>
            {!hide.vac && <td className="lb-hcp u-fw-600">{fmtHcp(p.vac)}</td>}
            {!hide.registo && <td className="fs-11 muted u-ws-nowrap">
              {fmtRegisto(p.dataInscricao)}
              {novo && <span className="p p-sm fs-10 fw-700 u-bg-score-eagle u-c-fff u-ml-4px u-p-1px-5px u-br-radius-lg"
                title={`Inscrito nas últimas ${recentHours} h`}>NOVO</span>}
            </td>}
            <td className="u-ta-center">
              {isDesist
                ? <span
                    title={desinscritoEm ? `Desinscreveu-se em ${desinscritoEm}` : "Desinscreveu-se"}
                    className="u-bg-b3bq4 u-c-var-danger-dc2626 u-fs-fs-10 u-p-1px-6px u-br-radius-lg u-bd-qj328 u-ws-nowrap">desistiu</span>
                : isReserva
                ? <span className="u-bg-bg-muted u-c-text-muted u-fs-fs-10 u-p-1px-6px u-br-radius-lg u-bd-1px-solid-border-light">{reservaLabel ?? (convocados ? "por inscrever" : "pendente")}</span>
                : <span className="muted fs-10">✓</span>}
            </td>
          </>
        ),
      };
    });
  }, [sorted, playersDB, fedCountries, teeName, date, hidePostCols, hasPts, convocados, extraCols, hide, recentHours, reservaLabel, posContent]);

  if (admissions.error) {
    return <div className="detail-toolbar u-p-16px">
      <span className="muted">Não foi possível carregar inscrições: {admissions.error}</span>
    </div>;
  }
  if (players.length === 0) {
    return <div className="detail-toolbar u-p-16px">
      <span className="muted">Ainda não há inscritos registados.</span>
    </div>;
  }

  const effDate = date ?? admissions.date ?? null;
  const recentes = players.filter(p => p.status !== "desistente" && isNovo(p));
  const nPost = hidePostCols ? 0 : 3 - (hide.vac ? 1 : 0) - (hide.registo ? 1 : 0);

  const prefixHeaderCells = (
    <>
      {/* Ordem e aspecto das colunas = Resumo: ESC. · Nasc. · Idade · FED · Clube · HCP · TEE */}
      {!hide.esc && <SortableHdr k="esc"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">ESC.</SortableHdr>}
      {!hide.nasc && <>
      <SortableHdr k="nasc"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">Nasc.</SortableHdr>
      <SortableHdr k="nasc"   sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-esc">Idade</SortableHdr>
      </>}
      {!hide.fed && <SortableHdr k="fed"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-fed">FED</SortableHdr>}
      <SortableHdr k="clube"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-club">Clube</SortableHdr>
      {!hide.hcp && <SortableHdr k="hcp"    sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">HCP</SortableHdr>}
      {!hide.tee && <th className="lb-tee">TEE</th>}
      {hasPts && (
        <SortableHdr k="pts" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}
          style={{ textAlign: "center" }} title="Pontos no ranking que o apurou (e a posição nesse ranking)">PTS</SortableHdr>
      )}
      {extraCols.map(c => (
        <SortableHdr key={c.key} k={`x:${c.key}`} sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)}
          style={{ textAlign: "center" }} title={c.title}>{c.label}</SortableHdr>
      ))}
    </>
  );
  const postScorecardHeaderCells = (
    <>
      {!hide.vac && <SortableHdr k="vac"     sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} className="lb-hcp">VAC</SortableHdr>}
      {!hide.registo && <SortableHdr k="registo" sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} >Registo</SortableHdr>}
      <SortableHdr k="status"  sortKey={sortKey} sortDir={sortDir} onSort={(k) => toggleSort(k as SortKey)} >Status</SortableHdr>
    </>
  );

  // Linha de resumo + barra de filtros: o MESMO formato e ordem do scorecard e do draw.
  const filterBar = (
    <>
      <div className="lb-info-line flex-wrap">
        {convocados
          ? <span>{filtered.length !== players.length ? `${filtered.length}/${players.length}` : players.length} convocados · {confirmedCount} inscritos{reservasCount > 0 && ` · ${reservasCount} por inscrever`}{desistentesCount > 0 && ` · ${desistentesCount} desistiram`}</span>
          : <span>{filtered.length !== players.length ? `${filtered.length}/${players.length}` : players.length} jog · {confirmedCount} confirmados{reservasCount > 0 && (reservaLabel ? ` · ${reservasCount} em ${reservaLabel}` : ` · ${reservasCount} pendentes`)}{desistentesCount > 0 && ` · ${desistentesCount} desistiram`}</span>}
        {effDate && <span>· início {effDate.split("-").reverse().join("/")}</span>}
        {admissions.status && <span className="chip" title="Estado FPG">{admissions.status}</span>}
        {infoExtra}
        {fpgUrl && (
          <a href={fpgUrl} target="_blank" rel="noopener noreferrer"
            className="fs-11 u-c-chart-2 u-ml-auto">
            scoring.fpg.pt ↗
          </a>
        )}
      </div>
      {/* Inscrições e desistências recentes (era o aviso do painel dos Nacionais). */}
      {(recentes.length > 0 || removidos.length > 0) && (
        <div className="u-d-flex u-fwr-wrap u-gap-8px u-p-6px-12px u-bg-bg-muted u-br-radius u-m-4px-0-6px u-fs-fs-12">
          {recentes.length > 0 && (
            <span className="u-c-color-good">
              <span className="fw-700">+{recentes.length} inscrito{recentes.length > 1 ? "s" : ""} ({recentHours}h):</span>{" "}
              {recentes.map(p => formatPlayerName(p.nome || "")).join(", ")}
            </span>
          )}
          {removidos.length > 0 && (
            <span className="u-c-color-bad">
              <span className="fw-700">-{removidos.length} desistência{removidos.length > 1 ? "s" : ""}:</span>{" "}
              {removidos.join(", ")}
            </span>
          )}
        </div>
      )}
      <RowsFilterBar rows={filterRowsAll} filter={pFilter} onChange={setPFilter} total={players.length} playersDB={playersDB} />
    </>
  );

  return (
    <div className="adm-tab">
    <ScorecardLeaderboard
      par={[]}
      rows={rows}
      prefixHeaderCells={prefixHeaderCells}
      postScorecardHeaderCells={hidePostCols ? undefined : postScorecardHeaderCells}
      postScorecardColCount={nPost}
      showScorecard={false}
      // Inscrições não têm resultados: as colunas ± e Tot estariam sempre vazias.
      hideTotals
      filterBar={filterBar}
      // Sorting da pos e nome: delegamos a useSort externo
      onSortPos={() => toggleSort("pos")}
      onSortName={() => toggleSort("nome")}
      activeSortKey={sortKey}
      activeSortDir={sortDir}
    />
    </div>
  );
}
