/**
 * JovensAnaliseView — página de análise dos últimos 4 anos de Campeonatos
 * Regional e Nacional de Jovens.
 *
 * Secções:
 *  - Campeões Nacional (tabela por ano × escalão × sexo)
 *  - Campeões Regional (por região, mesmo formato)
 *  - Jogadores mais frequentes (top ranking cross-campeonatos)
 *  - Evolução por jogador (timeline de escalão + títulos)
 */
import React, { useMemo, useState, useEffect } from "react";
import type { Tournament } from "../data/fpgTypes";
import type { PlayersDB } from "./tournamentPrimitives";
import {
  buildJovensAnalise,
  escalaoInYear,
  yearInEscalao,
  type Champion,
  type PodiumEntry,
  type PlayerStats,
  type AnaliseData,
  type NationalityMap,
  type PlayerInfoMap,
  type Sex,
} from "../data/jovensAnaliseData";
import { cachedFetchJson } from "../data/fetchCache";
import { fpgScoringUrl, tournamentUrl, abreviarNome } from "../utils/format";
import { Link } from "react-router-dom";
import SexBadge from "./SexBadge";
import { EscPill } from "./PillBadge";
import { isManuel } from "../constants/manuel";
import { useSort } from "../hooks/useSort";
import SortableHdr from "./SortableHdr";

const ESC_ORDER = ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18", "Sub 24"];

// Agrupamento em 2 níveis para reduzir altura das grelhas — pedido user
// 2026-05-04 ("divide em 2 tabelas: sub 10, sub 12 e sub 14 e outra com os
// outros escaloes ... tanto no nacional como regional"). Aplicado em
// ChampionsGrid quer em modo splitByEscalao (Nacional) quer em modo regional.
const ESC_LOWER = new Set(["Sub 10", "Sub 12", "Sub 14"]);
const ESC_UPPER = new Set(["Sub 16", "Sub 18", "Sub 20", "Sub 21", "Sub 24"]);
const ESC_GROUPS: Array<{ key: string; label: string; set: Set<string> }> = [
  { key: "lower", label: "🟢 Sub-10 · Sub-12 · Sub-14", set: ESC_LOWER },
  { key: "upper", label: "🔵 Sub-16 · Sub-18 · Sub-24", set: ESC_UPPER },
];

/** Escalões obrigatórios por região (do regulamento do organizador).
 *  Linhas com estes escalões aparecem SEMPRE na tabela, mesmo sem campeões
 *  num determinado ano (mostra "Sem jogadores"). */
const REGION_ESCALOES: Record<string, string[]> = {
  // CRJ Madeira: regulamento define 6 escalões (Sub 10-24)
  "Madeira": ["Sub 10", "Sub 12", "Sub 14", "Sub 16", "Sub 18", "Sub 24"],
};

/** Badge "A1" / "A2" — primeiro ou segundo ano do escalão.
 *  Usa o tom do escalão (faded). escalao opcional → fallback genérico. */
function YearInEscBadge({ year, escalao }: { year: 1 | 2 | null; escalao?: string }) {
  if (!year) return null;
  const is1 = year === 1;
  const escKey = (escalao || "").toLowerCase().replace(/[\s-]/g, "");
  const useEscColor = ["sub10","sub12","sub14","sub16","sub18","sub21","sub24"].includes(escKey);
  return (
    <span title={is1 ? "Primeiro ano do escalão (idade menor dos dois)" : "Segundo ano do escalão (idade maior dos dois)"}
      className="fs-10 fw-700" style={{
        marginRight: 4,
        padding: "1px 5px",
        borderRadius: 6,
        background: useEscColor ? `var(--esc-${escKey}-bg)` : (is1 ? "var(--bg-info-subtle)" : "var(--bg-success-subtle)"),
        color: useEscColor ? `var(--esc-${escKey}-fg)` : (is1 ? "var(--accent)" : "var(--color-good-dark)"),
        border: `1px solid ${useEscColor ? "transparent" : (is1 ? "var(--accent)" : "var(--color-good)")}`,
        opacity: 0.75,
        whiteSpace: "nowrap", letterSpacing: 0.3,
      }}>
      {is1 ? "A1" : "A2"}
    </span>
  );
}

/** Linha de um jogador no pódio (campeão ou sub-campeão).
 *  Layout: [A1/A2] [Nome] [★ Manuel?] [(pos)]
 *  expectedPos = posição "natural" deste jogador (1 para campeão, 2 para vice).
 *  Só mostra a posição real se for > expectedPos (i.e., há estrangeiros à frente). */
function PodiumLine({ p, columnEsc, expectedPos, highlightManuel = true }: {
  p: PodiumEntry;
  columnEsc: string;
  expectedPos: number;
  highlightManuel?: boolean;
}) {
  const toPar = p.toPar == null ? "" : (p.toPar > 0 ? `+${p.toPar}` : p.toPar === 0 ? "E" : String(p.toPar));
  const manuel = isManuel({ name: p.name, fed: p.fed ?? undefined });
  const elevated = p.pos != null && p.pos > expectedPos;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
      <div className="fs-12" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <YearInEscBadge year={p.yearInEscalao} escalao={columnEsc} />
        {p.fed ? (
          <a
            href={`/jogadores/${p.fed}?view=federado`}
            target="_blank"
            rel="noopener noreferrer"
            title={`${p.name} — ver perfil federado (abre em nova janela)`}
            className="fw-700"
            style={{ textDecoration: "none", color: "inherit", borderBottom: "1px dotted currentColor" }}
          >
            {abreviarNome(p.name || "—", 22)}
          </a>
        ) : (
          <span className="fw-700" title={p.name}>{abreviarNome(p.name || "—", 22)}</span>
        )}
        {manuel && highlightManuel && <span title="Manuel" style={{ fontSize: 10 }}>★</span>}
        {elevated && (
          <span title={`Foi ${p.pos}º na classificação geral. O pódio do escalão+sexo é específico — quem ficou à frente pode ter sido de outra categoria (outro sexo, outro escalão num torneio combinado) ou um jogador estrangeiro.`}
            className="fs-10 muted fw-600"
            style={{ padding: "0 4px", borderRadius: 4, background: "var(--bg-muted)" }}>
            {p.pos}º
          </span>
        )}
      </div>
      <div className="fs-10 muted" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {p.fed && <span>{p.fed}</span>}
        {p.age != null && <span>· {p.age}a</span>}
        {p.gross != null && <span>· {p.gross}{toPar ? ` (${toPar})` : ""}</span>}
      </div>
    </div>
  );
}

/** Célula de um jogador (campeão OU sub-campeão) num ano — linha única.
 *  Usado em 2 sub-rows por escalão: a primeira com campeão, a segunda com sub-campeão.
 *  O link FPG é mostrado APENAS na linha do campeão (está associado ao torneio). */
function PodiumCell({ ch, isChampion }: { ch: Champion | null; isChampion: boolean }) {
  const yearBorder = { borderLeft: "1px solid var(--border-light)" };
  // Célula vazia (ano sem dados): fundo muito claro + texto centrado vertical e horizontal
  if (!ch || (!isChampion && !ch.runnerUp)) {
    return (
      <td style={{
        padding: "8px",
        textAlign: "center", verticalAlign: "middle",
        background: "var(--bg-muted-subtle, rgba(0,0,0,0.02))",
        ...yearBorder,
      }}>
        {isChampion && (
          <span className="fs-11 muted" style={{ fontStyle: "italic", display: "block", textAlign: "center" }}>
            Sem jogadores
          </span>
        )}
      </td>
    );
  }
  const p = isChampion ? ch.champion : ch.runnerUp!;
  const expectedPos = isChampion ? 1 : 2;
  const manuel = isManuel({ name: p.name, fed: p.fed ?? undefined });
  const hasForeignWinner = !!ch.defactoWinnerName;
  const scoringUrl = (ch.ccode && ch.tcode)
    ? fpgScoringUrl(ch.ccode, ch.tcode.split("+")[0])
    : null;
  const isProvisional = !!ch.provisional;

  return (
    <td className="fs-12" style={{
      padding: "4px 8px", verticalAlign: "middle",
      background: manuel
        ? "var(--bg-success-subtle)"
        : isProvisional
          ? "var(--bg-info-subtle)"
          : undefined,
      borderLeft: manuel
        ? "3px solid var(--color-good)"
        : isProvisional
          ? "3px dashed var(--accent)"
          : "1px solid var(--border-light)",
      minWidth: 200, maxWidth: 280,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PodiumLine p={p} columnEsc={ch.escalao} expectedPos={expectedPos} />
        </div>
        {/* Link FPG (externo) + scoreboard interno + badge estrangeiro — só na
            linha do campeão (tudo associado ao torneio, não aos jogadores). */}
        {isChampion && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {isProvisional && (
              <span title={`Resultado provisório: ${ch.roundsPlayed} de ${ch.roundsExpected} rondas jogadas.`}
                className="fs-10 fw-700" style={{
                  padding: "1px 4px", borderRadius: 3,
                  background: "var(--accent)", color: "#fff",
                  whiteSpace: "nowrap", letterSpacing: 0.3,
                }}>
                R{ch.roundsPlayed}/{ch.roundsExpected}
              </span>
            )}
            {!isProvisional && ch.roundsTotal && ch.roundsTotal >= 2 && (
              <span title={`${ch.roundsTotal} rondas — gross é o total.`}
                className="fs-10 fw-700" style={{
                  padding: "1px 4px", borderRadius: 3,
                  background: "var(--bg-muted)", color: "var(--text-2)",
                  whiteSpace: "nowrap", letterSpacing: 0.3,
                }}>
                {ch.roundsTotal}R
              </span>
            )}
            {scoringUrl && (
              <a href={scoringUrl} target="_blank" rel="noopener noreferrer"
                title="Ver resultados oficiais na FPG ↗"
                style={{
                  fontSize: 11, textDecoration: "none",
                  color: "var(--accent)", fontWeight: 700,
                  whiteSpace: "nowrap",
                }}>
                ↗ FPG
              </a>
            )}
            {ch.ccode && ch.tcode && (
              <Link to={tournamentUrl("FPG", ch.ccode, ch.tcode.split("+")[0])}
                title="Ver no nosso scoreboard"
                style={{
                  fontSize: 10, textDecoration: "none",
                  color: "var(--text-2)", fontWeight: 600,
                  whiteSpace: "nowrap",
                  padding: "0 4px", borderRadius: 3,
                  border: "1px solid var(--border-light)",
                }}>
                SCORE
              </Link>
            )}
            {hasForeignWinner && (
              <span title={`Vencedor absoluto do leaderboard foi ${ch.defactoWinnerName} (${ch.defactoWinnerCountry}); regra FPG atribui título ao melhor PT.`}
                className="fs-10" style={{
                  padding: "1px 4px", borderRadius: 3,
                  background: "var(--bg-muted)", color: "var(--text-2)",
                  border: "1px dashed var(--border)", whiteSpace: "nowrap",
                }}>
                🌍 {ch.defactoWinnerCountry}
              </span>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

/** Label de tipo (CAMP. NACIONAL ou VICE C. NACIONAL) — coluna fixa entre
 *  o escalão e os anos, para NÃO repetir em cada célula. */
function PodiumLabelCell({ label, isChampion }: { label: string; isChampion: boolean }) {
  return (
    <td style={{
      padding: "4px 8px", verticalAlign: "middle",
      // sticky ao lado da coluna Escalão (que é width 90px @ left:0)
      position: "sticky", left: 90, background: "var(--bg-card)",
      borderRight: "1px solid var(--border-light)",
      zIndex: 1,
    }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        fontSize: 10, lineHeight: 1.2, fontWeight: 700,
        color: isChampion ? "var(--color-good-dark)" : "var(--text-2)",
        textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap",
      }}>
        <span>{isChampion ? "🏆 CAMP." : "VICE C."}</span>
        <span style={{ opacity: 0.7 }}>{label}</span>
      </div>
    </td>
  );
}

/** Tabela TRANSPOSTA: colunas=anos, linhas=(escalão × sexo).
 *  Cada célula mostra campeão PT + sub-campeão PT.  */
function ChampionsGrid({ title, champions, years, showRegion = false, typeLabel, splitByEscalao = false }: {
  title: string;
  champions: Champion[];
  years: number[];
  showRegion?: boolean;
  typeLabel: string;   // "NACIONAL" ou "REGIONAL"
  /** Quando true, renderiza uma tabela separada por escalão (em vez de uma
   *  única tabela com todos os escalões empilhados). Cada tabela tem rows
   *  M+F do escalão e cols=anos. Mais fácil de navegar para datasets grandes. */
  splitByEscalao?: boolean;
}) {
  // Index por região → (escalão|sexo|ano) → champion
  const byRegion = useMemo(() => {
    const m = new Map<string, Map<string, Champion>>();
    for (const ch of champions) {
      const r = showRegion ? ch.region : "*";
      if (!m.has(r)) m.set(r, new Map());
      m.get(r)!.set(`${ch.escalao}|${ch.sex}|${ch.year}`, ch);
    }
    return m;
  }, [champions, showRegion]);

  // Escalões presentes — usados quando splitByEscalao=true. Mantemos a mesma
  // ordem canónica (Sub-10 → Sub-24).
  // ⚠ Hook tem de ser chamado SEMPRE (mesmo quando champions vazio) para
  // não violar Rules of Hooks (ordem deve ser estável entre renders).
  const escaloesPresentes = useMemo(() => {
    if (!splitByEscalao) return [];
    const set = new Set<string>();
    for (const ch of champions) set.add(ch.escalao);
    return [...set].sort((a, b) => {
      const ea = ESC_ORDER.indexOf(a);
      const eb = ESC_ORDER.indexOf(b);
      return (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
    });
  }, [champions, splitByEscalao]);

  if (champions.length === 0) {
    return (
      <section style={{ margin: "16px 12px" }}>
        <h3 className="fs-14 fw-700" style={{ marginBottom: 8 }}>{title}</h3>
        <p className="muted fs-12">Sem dados disponíveis.</p>
      </section>
    );
  }

  // Ordem explícita das regiões (Madeira primeiro — preferência do user) e
  // estado inicial aberto/fechado (Madeira aberto; Açores e Norte fechados).
  //
  // Política (2026-04-19): "troca a ordem das regiões, coloca a madeira
  // primeiro do que os açores... como tabelas que expandem, e colocas os
  // açores e o norte fechados por default."
  const REGION_ORDER = ["Madeira", "Açores", "Norte", "Sul", "Tejo", "outro"];
  const REGION_DEFAULT_OPEN: Record<string, boolean> = {
    "Madeira": true,
    "Açores":  false,
    "Norte":   false,
    "Sul":     false,
    "Tejo":    false,
  };
  const regions = showRegion
    ? [...byRegion.keys()].sort((a, b) => {
        const ia = REGION_ORDER.indexOf(a);
        const ib = REGION_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
    : ["*"];

  // Notas por região — edições que não existiram em certos anos.
  const regionOverrides: Record<string, { hideYears?: number[]; note?: string }> = {
    "Madeira":  { note: "Sem edição em 2021, 2022 e 2025." },
    "Açores":   { note: "Sem edição em 2022." },
    "Norte":    { note: "Sem edição em 2025." },
  };

  // Renderer de uma secção de grupo (Sub 10/12/14 ou Sub 16/18/24).
  const renderGroup = (
    groupLabel: string,
    groupSet: Set<string>,
    keyPrefix: string,
  ) => {
    const groupChamps = champions.filter((c) => groupSet.has(c.escalao));
    if (groupChamps.length === 0) return null;
    const groupYears = [
      ...new Set(groupChamps.map((c) => c.year)),
    ].sort((a, b) => a - b);

    return (
      <div
        key={keyPrefix}
        style={{
          marginBottom: 28,
          padding: "10px 12px 16px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-light)",
          borderRadius: 8,
        }}
      >
        <h4
          className="fs-13 fw-800"
          style={{
            margin: "0 0 10px",
            paddingBottom: 8,
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{groupLabel}</span>
          <span className="muted fs-11" style={{ fontWeight: 400 }}>
            · {groupChamps.length} campeões · {groupYears.length}{" "}
            {groupYears.length === 1 ? "ano" : "anos"}
          </span>
        </h4>

        {splitByEscalao ? (
          // ── Uma tabela por escalão dentro do grupo ─────────────
          escaloesPresentes
            .filter((esc) => groupSet.has(esc))
            .map((esc) => {
              const escChamps = groupChamps.filter((c) => c.escalao === esc);
              const escYears = [
                ...new Set(escChamps.map((c) => c.year)),
              ].sort((a, b) => a - b);
              if (escChamps.length === 0) return null;
              return (
                <div key={esc} style={{ marginBottom: 18 }}>
                  <h5
                    className="fs-12 fw-700"
                    style={{
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <EscPill esc={esc} />
                    <span className="muted fs-11" style={{ fontWeight: 400 }}>
                      · {escChamps.length} campeões · {escYears.length}{" "}
                      {escYears.length === 1 ? "ano" : "anos"}
                    </span>
                  </h5>
                  <RegionChampionsBlock
                    region="*"
                    showRegion={false}
                    champions={escChamps}
                    byRegionMap={
                      new Map(
                        escChamps.map((c) => [
                          `${c.escalao}|${c.sex}|${c.year}`,
                          c,
                        ]),
                      )
                    }
                    allYears={escYears}
                    typeLabel={typeLabel}
                    regionOverrides={{}}
                    defaultOpen
                  />
                </div>
              );
            })
        ) : (
          // ── Layout regional: uma tabela por região (filtrada ao grupo de
          //    escalões via prop escFilter, que filtra rows e requiredEscList).
          regions.map((region) => {
            // Calcular se a região tem qualquer champion no grupo — caso
            // contrário não renderiza secção vazia.
            const hasAny = groupChamps.some(
              (c) => !showRegion || c.region === region,
            );
            if (!hasAny) return null;
            return (
              <RegionChampionsBlock
                key={`${keyPrefix}-${region}`}
                region={region}
                showRegion={showRegion}
                champions={champions}
                byRegionMap={byRegion.get(region) || new Map<string, Champion>()}
                allYears={years}
                typeLabel={typeLabel}
                regionOverrides={regionOverrides}
                defaultOpen={
                  !showRegion || (REGION_DEFAULT_OPEN[region] ?? false)
                }
                escFilter={groupSet}
              />
            );
          })
        )}
      </div>
    );
  };

  return (
    <section style={{ margin: "16px 12px" }}>
      <h3 className="fs-14 fw-700" style={{ marginBottom: 8 }}>
        {title}
      </h3>
      {ESC_GROUPS.map((g) => renderGroup(g.label, g.set, g.key))}
    </section>
  );
}

/** Bloco de uma região (com a sua tabela sortable).
 *  Extraído para permitir hook useSort por-região (cada região tem o seu sort
 *  independente, sem um estado global a contaminar). */
function RegionChampionsBlock({
  region, showRegion, champions, byRegionMap, allYears, typeLabel, regionOverrides,
  defaultOpen = true, escFilter,
}: {
  region: string;
  showRegion: boolean;
  champions: Champion[];
  byRegionMap: Map<string, Champion>;
  allYears: number[];
  typeLabel: string;
  regionOverrides: Record<string, { hideYears?: number[]; note?: string }>;
  defaultOpen?: boolean;
  /** Quando definido, restringe as linhas (escalões) ao subset indicado.
   *  Usado para split em 2 grupos (Sub-10/12/14 e Sub-16/18+). */
  escFilter?: Set<string>;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<"esc" | "sex" | "year">("esc", "asc");
  const [open, setOpen] = useState(defaultOpen);

  const km = byRegionMap;
  const ovr = (showRegion ? regionOverrides[region] : null) || {};
  const hideYearsSet = new Set(ovr.hideYears || []);

  // ── Anos a mostrar (SCROLL horizontal — mostrar TODOS os anos com dados) ──
  // Para "Nacional" queremos mostrar só os anos que tenham champions nacionais.
  // Para "Regional" queremos mostrar só os anos que tenham champions naquela
  // região específica (não os anos do outro circuit).
  const yearsWithDataForThisBlock = [...allYears].filter(y => {
    if (hideYearsSet.has(y)) return false;
    return champions.some(c => c.year === y && (!showRegion || c.region === region));
  });
  const yearCols = yearsWithDataForThisBlock.sort((a, b) => a - b);

  // ── Linhas (escalão × sexo) ──
  // 1. Começar com as linhas obrigatórias da região (do regulamento).
  //    Ex: Madeira → 6 escalões (Sub 10/12/14/16/18/24) × 2 sexos = 12 linhas.
  // 2. Juntar quaisquer (escalão, sexo) que apareçam nos champions mas não
  //    estejam na lista obrigatória (defesa contra dados inesperados).
  const requiredEscList = showRegion ? REGION_ESCALOES[region] : null;
  const rowsMap = new Map<string, { esc: string; sex: Sex }>();
  if (requiredEscList) {
    for (const esc of requiredEscList) {
      if (escFilter && !escFilter.has(esc)) continue;
      for (const sx of ["M", "F"] as Sex[]) {
        rowsMap.set(`${esc}|${sx}`, { esc, sex: sx });
      }
    }
  }
  for (const ch of champions) {
    if (showRegion && ch.region !== region) continue;
    if (hideYearsSet.has(ch.year)) continue;
    if (escFilter && !escFilter.has(ch.escalao)) continue;
    const k = `${ch.escalao}|${ch.sex}`;
    if (!rowsMap.has(k)) rowsMap.set(k, { esc: ch.escalao, sex: ch.sex });
  }

  // Ordenação: escalão (default) ou sexo ou ano (campeão médio por ano)
  const rows = [...rowsMap.values()].sort((a, b) => {
    const dirMul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "esc") {
      const ea = ESC_ORDER.indexOf(a.esc);
      const eb = ESC_ORDER.indexOf(b.esc);
      const cmp = (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
      if (cmp !== 0) return cmp * dirMul;
      // Dentro do mesmo escalão: M antes de F
      return (a.sex === "M" ? 0 : 1) - (b.sex === "M" ? 0 : 1);
    }
    if (sortKey === "sex") {
      const sa = a.sex === "M" ? 0 : a.sex === "F" ? 1 : 2;
      const sb = b.sex === "M" ? 0 : b.sex === "F" ? 1 : 2;
      if (sa !== sb) return (sa - sb) * dirMul;
      const ea = ESC_ORDER.indexOf(a.esc);
      const eb = ESC_ORDER.indexOf(b.esc);
      return (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
    }
    // Fallback: default por escalão
    const ea = ESC_ORDER.indexOf(a.esc);
    const eb = ESC_ORDER.indexOf(b.esc);
    return (ea < 0 ? 99 : ea) - (eb < 0 ? 99 : eb);
  });

  if (rows.length === 0) return null;

  // Quantos campeões já preenchidos (para mostrar contador no header colapsado)
  const filledCount = [...km.values()].length;

  return (
    <div style={{ marginBottom: showRegion ? 20 : 8 }}>
      {showRegion && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="fs-13 fw-600"
          style={{
            marginTop: 12, marginBottom: open ? 6 : 0,
            padding: "5px 10px", borderRadius: 6,
            background: "var(--bg-muted)",
            border: "1px solid var(--border-light)",
            display: "inline-flex", alignItems: "center", gap: 8,
            cursor: "pointer", textAlign: "left",
            color: "var(--text)",
          }}
          title={open ? "Colapsar" : "Expandir"}
        >
          <span style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.7 }}>
            {open ? "▼" : "▶"}
          </span>
          <span>📍 {region}</span>
          <span className="fs-11 muted" style={{ fontWeight: 400 }}>
            · {filledCount} {filledCount === 1 ? "campeão" : "campeões"}
            {yearCols.length > 0 ? ` · ${yearCols.length} ${yearCols.length === 1 ? "ano" : "anos"}` : ""}
          </span>
        </button>
      )}
      {!open && ovr.note && (
        <p className="fs-11 muted" style={{ margin: "4px 0 0 28px", fontStyle: "italic" }}>
          * {ovr.note}
        </p>
      )}
      {open && <>
      <div style={{ overflowX: "auto", paddingBottom: 14 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
          <thead>
            <tr>
              <SortableHdr k="esc" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort as any}
                style={{ padding: "6px 8px", borderBottom: "2px solid var(--border)", textAlign: "left", position: "sticky", left: 0, background: "var(--bg-card)", minWidth: 90, width: 90, zIndex: 3, cursor: "pointer" }}>
                Escalão
              </SortableHdr>
              <SortableHdr k="sex" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort as any}
                style={{ padding: "6px 8px", borderBottom: "2px solid var(--border)", textAlign: "left", position: "sticky", left: 90, background: "var(--bg-card)", minWidth: 90, zIndex: 3, cursor: "pointer", borderRight: "1px solid var(--border-light)" }}>
                Tipo
              </SortableHdr>
              {yearCols.map(y => (
                <th key={y} style={{ padding: "6px 10px", borderBottom: "2px solid var(--border)", borderLeft: "1px solid var(--border-light)", textAlign: "center", fontWeight: 700, fontSize: 13, minWidth: 220 }}>
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ esc, sex }, idx) => {
              const prevEsc = idx > 0 ? rows[idx - 1].esc : null;
              const newEscGroup = prevEsc !== null && prevEsc !== esc;
              const escKey = esc + "_" + sex;
              return (
                <React.Fragment key={escKey}>
                  {/* Linha 1: CAMPEÃO. Escalão+sexo na 1ª coluna com rowSpan=2 */}
                  <tr style={{ borderTop: newEscGroup ? "2px solid var(--border)" : "1px solid var(--border-light)" }}>
                    <td rowSpan={2} style={{
                      padding: "6px 8px", position: "sticky", left: 0, background: "var(--bg-card)",
                      verticalAlign: "middle", width: 90, minWidth: 90, zIndex: 2,
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <EscPill esc={esc} />
                        {sex === "M" && <SexBadge sex="M" />}
                        {sex === "F" && <SexBadge sex="F" />}
                      </span>
                    </td>
                    <PodiumLabelCell label={typeLabel} isChampion />
                    {yearCols.map(y => (
                      <PodiumCell key={y} ch={km.get(`${esc}|${sex}|${y}`) ?? null} isChampion />
                    ))}
                  </tr>
                  {/* Linha 2: VICE-CAMPEÃO */}
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <PodiumLabelCell label={typeLabel} isChampion={false} />
                    {yearCols.map(y => (
                      <PodiumCell key={y} ch={km.get(`${esc}|${sex}|${y}`) ?? null} isChampion={false} />
                    ))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Nota textual da região (ex: anos sem edição) — só quando a tabela
          está aberta. Se estiver fechada, mostra-se no header colapsado. */}
      {ovr.note && (
        <p className="fs-11 muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>
          * {ovr.note}
        </p>
      )}
      </>}
    </div>
  );
}

/** Top jogadores mais frequentes */
function TopPlayers({ players, years, mode = "all" }: { players: PlayerStats[]; years: number[]; mode?: "all" | "nacional" | "regional" }) {
  const [limit, setLimit] = useState(20);
  // Filtrar players por modo: em "regional" só quem tem aparições regionais,
  // em "nacional" só quem tem aparições nacionais. Ordenação preservada.
  const filteredByMode = useMemo(() => {
    if (mode === "regional") return players.filter((p) => p.regionalAppearances > 0);
    if (mode === "nacional") return players.filter((p) => p.nacionalAppearances > 0);
    return players;
  }, [players, mode]);
  const top = filteredByMode.slice(0, limit);

  if (top.length === 0) return null;

  return (
    <section style={{ margin: "16px 12px" }}>
      <h3 className="fs-14 fw-700" style={{ marginBottom: 8 }}>
        📊 Jogadores mais frequentes <span className="fs-11 muted">(entre Regional + Nacional, últimos {years.length} anos)</span>
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)" }}>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>#</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Jogador</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Fed</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Nacional</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Regional</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Títulos</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Escalões</th>
              <th style={{ padding: "6px 8px", textAlign: "left" }}>Anos</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p, i) => {
              const manuel = isManuel({ name: p.name, fed: p.fed ?? undefined });
              return (
                <tr key={(p.fed || p.name) + "_" + i} style={{
                  borderBottom: "1px solid var(--border-light)",
                  background: manuel ? "var(--bg-success-subtle)" : undefined,
                }}>
                  <td style={{ padding: "5px 8px", textAlign: "right" }} className="fw-600">{i + 1}</td>
                  <td style={{ padding: "5px 8px" }}>
                    {p.fed ? (
                      <a href={`/jogadores/${p.fed}?view=federado`} target="_blank" rel="noopener noreferrer"
                        className="fw-600"
                        style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted currentColor" }}
                        title={`${p.displayName || p.name} — perfil federado (nova janela)`}>
                        {p.displayName || p.name}
                      </a>
                    ) : (
                      <span className="fw-600">{p.displayName || p.name}</span>
                    )}
                    {manuel && <span style={{ marginLeft: 4, fontSize: 10 }}>★</span>}
                  </td>
                  <td style={{ padding: "5px 8px" }} className="fs-11 muted">{p.fed || "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }} className="fw-700">{p.appearances}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{p.nacionalAppearances || "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{p.regionalAppearances || "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }} className="fw-700">
                    {p.titles.length > 0 ? (
                      <span title={p.titles.map(t => `${t.year} ${t.type} ${t.escalao} ${t.sex}`).join("\n")}
                        style={{ color: "var(--color-good-dark)" }}>
                        🏆 {p.titles.length}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "5px 8px" }} className="fs-11">
                    <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
                      {[...p.escaloes].sort((a, b) => ESC_ORDER.indexOf(a) - ESC_ORDER.indexOf(b)).map(e =>
                        <EscPill key={e} esc={e} />
                      )}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px" }} className="fs-11 muted">
                    {[...p.years].sort().join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {limit < filteredByMode.length && (
        <button className="fs-11" onClick={() => setLimit(limit + 20)}
          style={{
            marginTop: 8, padding: "4px 10px", borderRadius: 4,
            border: "1px solid var(--border)", background: "var(--bg-muted)",
            cursor: "pointer",
          }}>
          Mostrar mais ({filteredByMode.length - limit} restantes)
        </button>
      )}
    </section>
  );
}

/** Timeline visual de um jogador: escalão em cada ano + títulos */
function PlayerTimeline({ player, years, mode = "all" }: { player: PlayerStats; years: number[]; mode?: "all" | "nacional" | "regional" }) {
  if (!player.dob) return null;
  // Filtrar títulos por modo activo (Regional só vê títulos Regional, etc.)
  const filteredTitles = player.titles.filter((t) =>
    mode === "regional" ? t.type === "Regional" :
    mode === "nacional" ? t.type === "Nacional" :
    true,
  );
  const titlesByYear = new Map<number, Champion[]>();
  for (const t of filteredTitles) {
    if (!titlesByYear.has(t.year)) titlesByYear.set(t.year, []);
    titlesByYear.get(t.year)!.push(t);
  }
  // Filtrar para só mostrar anos onde o jogador tinha pelo menos 9 anos
  // (idade mínima do Sub-10). Pré-pubertário: 8 anos = ainda não compete.
  // Evita pills "2005 Sub-10" para um jogador nascido em 2008.
  const yob = parseInt(String(player.dob).slice(0, 4));
  const minYear = isNaN(yob) ? -Infinity : yob + 9;
  const sortedYears = [...years].sort().filter((y) => y >= minYear);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px",
      borderBottom: "1px solid var(--border-light)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {player.fed ? (
          <a href={`/jogadores/${player.fed}?view=federado`} target="_blank" rel="noopener noreferrer"
            className="fw-700 fs-13"
            style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted currentColor" }}
            title={`${player.displayName || player.name} — perfil federado (nova janela)`}>
            {player.displayName || player.name}
          </a>
        ) : (
          <span className="fw-700 fs-13">{player.displayName || player.name}</span>
        )}
        <span className="fs-10 muted">{player.fed || "—"}</span>
        {player.dob && <span className="fs-10 muted">· nasc. {player.dob.slice(0, 4)}</span>}
        <span className="fs-11 muted">
          · {mode === "regional" ? player.regionalAppearances :
              mode === "nacional" ? player.nacionalAppearances :
              player.appearances} participações
          · {filteredTitles.length} títulos
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sortedYears.map(y => {
          const esc = escalaoInYear(player.dob, y);
          const yrIn = yearInEscalao(player.dob, y);
          const titles = titlesByYear.get(y) || [];
          const played = player.years.has(y);
          return (
            <div key={y} style={{
              border: "1px solid " + (played ? "var(--border)" : "var(--border-light)"),
              borderRadius: 4,
              padding: "3px 6px",
              background: titles.length > 0
                ? "var(--medal-gold-bg, #fef3c7)"  // amber/dourado para anos com título (🏆)
                : (played ? undefined : "var(--bg-muted)"),
              opacity: played ? 1 : 0.6,
              fontSize: 11,
              display: "inline-flex", alignItems: "center", gap: 3,
              whiteSpace: "nowrap",
            }}>
              <span className="fw-700">{y}</span>
              {esc && <EscPill esc={esc} />}
              {yrIn && <YearInEscBadge year={yrIn} />}
              {titles.map((t, i) => (
                t.ccode && t.tcode ? (
                  <a key={i} href={fpgScoringUrl(t.ccode, t.tcode.split("+")[0])} target="_blank" rel="noopener noreferrer"
                    title={`Campeão ${t.type} ${t.escalao} ${t.sex} (${t.region}) — abrir torneio na FPG ↗`}
                    style={{ fontSize: 11, textDecoration: "none" }}>
                    🏆
                  </a>
                ) : (
                  <span key={i} title={`Campeão ${t.type} ${t.escalao} ${t.sex} (${t.region})`} style={{ fontSize: 11 }}>
                    🏆
                  </span>
                )
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Secção de timelines dos top jogadores */
function PlayerTimelines({ players, years, mode = "all" }: { players: PlayerStats[]; years: number[]; mode?: "all" | "nacional" | "regional" }) {
  const [limit, setLimit] = useState(8);
  // Filtrar por modo: regional só vê quem participou em regionais, etc.
  const filteredByMode = useMemo(() => {
    if (mode === "regional") return players.filter((p) => p.regionalAppearances > 0);
    if (mode === "nacional") return players.filter((p) => p.nacionalAppearances > 0);
    return players;
  }, [players, mode]);
  // Só jogadores com dob conhecida (para calcular escalão evolutivo)
  const withDob = filteredByMode.filter(p => p.dob).slice(0, limit);
  if (withDob.length === 0) return null;

  return (
    <section style={{ margin: "16px 12px" }}>
      <h3 className="fs-14 fw-700" style={{ marginBottom: 8 }}>
        📈 Evolução de jogadores (top {withDob.length})
      </h3>
      <div style={{
        border: "1px solid var(--border)", borderRadius: 6,
        background: "var(--bg-card)",
      }}>
        {withDob.map((p, i) => (
          <PlayerTimeline key={(p.fed || p.name) + "_" + i} player={p} years={years} mode={mode} />
        ))}
      </div>
      {limit < filteredByMode.filter(p => p.dob).length && (
        <button className="fs-11" onClick={() => setLimit(limit + 8)}
          style={{
            marginTop: 8, padding: "4px 10px", borderRadius: 4,
            border: "1px solid var(--border)", background: "var(--bg-muted)",
            cursor: "pointer",
          }}>
          Mostrar mais
        </button>
      )}
    </section>
  );
}

// ── Componente principal ────────────────────────────────────────────────

export function JovensAnaliseView({
  jovensTournaments,
  playersDB,
  splitByEscalao = false,
  mode = "all",
  hideHeader = false,
  hideTopPlayers = false,
  hideTimelines = false,
}: {
  jovensTournaments: Tournament[];
  playersDB: PlayersDB;
  /** Se true, renderiza Nacional como uma tabela por escalão (mais legível
   *  para datasets grandes como o histórico Nacionais 2005-2026). */
  splitByEscalao?: boolean;
  /** "all" (default) mostra Nacional + Regional. "nacional" só Nacional.
   *  "regional" só Regional. */
  mode?: "all" | "nacional" | "regional";
  hideHeader?: boolean;
  hideTopPlayers?: boolean;
  hideTimelines?: boolean;
}) {
  // Carregar mapeamento fed → {country, dob, sex, name} (federados activos +
  // inactivos consolidados). Ficheiro leve (~38KB), cacheado globalmente.
  const [nationality, setNationality] = useState<NationalityMap>({});
  const [playerInfo, setPlayerInfo] = useState<PlayerInfoMap>({});
  useEffect(() => {
    let alive = true;
    cachedFetchJson<{ byFed?: NationalityMap; info?: PlayerInfoMap }>("/data/players-nationality.json")
      .then(d => {
        if (!alive) return;
        if (d?.byFed) setNationality(d.byFed);
        if (d?.info) setPlayerInfo(d.info);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const analise: AnaliseData = useMemo(
    () => buildJovensAnalise(jovensTournaments, playersDB, nationality, playerInfo),
    [jovensTournaments, playersDB, nationality, playerInfo]
  );

  // Anos com dados — Nacional e Regional separadamente. Mostramos TODOS os
  // anos disponíveis (scroll horizontal), não só os últimos 4.
  const nacYears = useMemo(() => {
    const ys = [...new Set(analise.nacionalChampions.map(c => c.year))];
    return ys.sort((a, b) => a - b);
  }, [analise.nacionalChampions]);
  const regYears = useMemo(() => {
    const ys = [...new Set(analise.regionalChampions.map(c => c.year))];
    return ys.sort((a, b) => a - b);
  }, [analise.regionalChampions]);
  const allYearsCovered = useMemo(() => {
    const s = new Set<number>([...nacYears, ...regYears]);
    return [...s].sort((a, b) => b - a);
  }, [nacYears, regYears]);

  const showNacional = mode === "all" || mode === "nacional";
  const showRegional = mode === "all" || mode === "regional";

  return (
    <div style={{ padding: "8px 0 32px", overflowY: "auto" }}>
      {!hideHeader && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)" }}>
          <h2 className="fs-18 fw-800" style={{ marginBottom: 4 }}>
            📊 Análise — Campeonatos Jovens
          </h2>
          <p className="fs-12 muted">
            Campeões e participações entre Nacional e Regional.
            {" "}Nacional: {nacYears.length > 0 ? `${nacYears[0]}–${nacYears[nacYears.length-1]}` : "—"}.
            {" "}Regional: {regYears.length > 0 ? `${regYears[0]}–${regYears[regYears.length-1]}` : "—"}.
          </p>
        </div>
      )}

      {showNacional && (
        <ChampionsGrid
          title="🏆 Campeões — Nacional"
          champions={analise.nacionalChampions}
          years={nacYears}
          showRegion={false}
          typeLabel="NACIONAL"
          splitByEscalao={splitByEscalao}
        />
      )}

      {showRegional && (
        <ChampionsGrid
          title="🏆 Campeões — Regional (por região)"
          champions={analise.regionalChampions}
          years={regYears}
          showRegion={true}
          typeLabel="REGIONAL"
        />
      )}

      {!hideTopPlayers && (
        <TopPlayers
          players={analise.topPlayers}
          years={
            mode === "regional"
              ? regYears
              : mode === "nacional"
                ? nacYears
                : allYearsCovered
          }
          mode={mode}
        />
      )}
      {!hideTimelines && (
        <PlayerTimelines
          players={analise.topPlayers}
          years={
            mode === "regional"
              ? regYears
              : mode === "nacional"
                ? nacYears
                : allYearsCovered
          }
          mode={mode}
        />
      )}
    </div>
  );
}

export default JovensAnaliseView;
