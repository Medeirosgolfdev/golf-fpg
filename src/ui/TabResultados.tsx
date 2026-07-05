import { useState, useMemo } from "react";
// Components: TabResultados + EscalaoTabs + EscalaoSection (Draw R{n} integrado).
import React from "react";
import { displayName, fmtDate, fmtToPar } from "../utils/format";
import { flag } from "../utils/flagUtils";
import {
  ScorecardLB,
  AccumulatedLB,
  AllRoundsScorecardLB,
  expandMultiRound,
  type Tournament as TATournament,
} from "../pages/FPGPage";
import { normName as normNameAuto, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../constants/manuel";
import { MultiRoundLeaderboard } from "./MultiRoundLeaderboard";
import type { MultiRoundRow } from "./multiRoundTypes";
import EmptyState from "./EmptyState";
import type { TorneioResult, EscalaoResult, ResultsData, GreatgolfData,
  UskidsDrawsData, UskidsDrawRonda } from "./uskidsTypes";
import { sortEscaloes } from "./uskidsTypes";
import { TEES_LOOKUP, isWD, fmtTs, ArMapCtx } from "./USKIDSPageHelpers";
import UskidsDrawTab from "./UskidsDrawTab";
import { TournExternalLinks } from "./TabCampoDetalhe";

// ─────────────────────────────────────────────
// ADAPTER: escalaoToTournament
// ─────────────────────────────────────────────
function escalaoToTournament(
  e: EscalaoResult,
  t: TorneioResult,
  arMap?: Map<string, AutoRivalPlayer>,
): TATournament {
  const teeInfo = TEES_LOOKUP[t.t]?.[e.age_group];
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

  // Colectar todos os jogadores de todas as rondas
  const playerMap = new Map<string, any>();

  for (const r of rondasComDados) {
    const lb = r.leaderboard ?? r.jogadores ?? [];
    const buracos = r.buracos || 18;
    // par por buraco: só usar se tiver dados reais — nunca inventar
    const par: number[] =
      teeInfo?.par.length === buracos ? teeInfo.par :
      r.par?.length === buracos ? r.par :
      [];  // desconhecido → ScoreCircles sem cor vs par
    const parKnown = par.length === buracos;
    const si: number[] = r.si?.length === buracos ? r.si : [];
    const meters: number[] =
      teeInfo?.metros?.length === buracos ? teeInfo.metros :
      (r.metros?.length === buracos ? r.metros : Array(buracos).fill(0));
    const hasSI = si.some(v => v > 0);
    // Para USKids: se não há SI real, usar metros na linha que normalmente seria SI
    const siForDisplay: number[] = hasSI ? si : meters;
    const parPerRound = parKnown ? par.reduce((s, p) => s + p, 0) : null;

    for (const j of lb) {
      const key = j.nome.toLowerCase().trim();
      const strokes: number[] = j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);
      if (!playerMap.has(key)) {
        // Lookup HCP FPG (só jogadores PT federados — via arMap → fpgHcpExact).
        // Quando disponível, computeSD() vai pelo ramo AGS (Net Double Bogey)
        // e devolve source="ags" — SD exacto em vez de "raw".
        let hcpExact: number | undefined;
        let fpgFed: string | undefined;
        if (arMap && j.pais === "PT") {
          const ar = arMap.get(normNameAuto(j.nome));
          if (ar?.fpgHcpExact != null) hcpExact = ar.fpgHcpExact;
          if (ar?.ptFed) fpgFed = ar.ptFed;
        }
        playerMap.set(key, {
          scoreId: j.nome,
          pos: null,
          name: displayName(j.nome),
          club: flag(j.pais) + " " + j.pais,
          grossTotal: 0,
          toPar: null,
          par, si: siForDisplay, meters,
          parTotal: 0,
          nholes: buracos,
          // Course Rating / Slope (quando disponíveis no TEES_LOOKUP) —
          // necessários para o cálculo de SD em computeSD().
          courseRating: teeInfo?.cr,
          slope: teeInfo?.slope,
          teeName: teeInfo?.tee,
          course: teeInfo?.campo,
          // HCP FPG do jogador (só PT com licença federativa) — permite SD AGS exacto.
          hcpExact,
          fedCode: fpgFed,
          roundScores: [],
          _wd: false,
        });
      }
      const p = playerMap.get(key)!;
      p.grossTotal += j.score || 0;
      if (parPerRound !== null) p.parTotal = parPerRound;  // par de UMA ronda — expandMultiRound multiplica por nPlayed
      p.roundScores.push({
        round: r.ronda,
        gross: j.score || 0,
        scores: strokes,
        pars: par,
        si: siForDisplay,
        meters,
        // CR/Slope/teeName por ronda — expandMultiRound usa estes valores
        // ao criar as views per-round (sem isto, o computeSD da R1/R2/R3
        // não tem dados e devolve null → coluna SD fica "—").
        courseRating: teeInfo?.cr,
        slope: teeInfo?.slope,
        teeName: teeInfo?.tee,
      });
      // scores / par / si do primeiro round (para ScorecardLB de ronda única)
      if (r.ronda === rondasComDados[0].ronda) {
        p.scores = strokes;
      }
    }
  }

  // WD players ficam no fundo da tabela — marcados com _wd para o sort em expandMultiRound
  const allPlayersRaw = [...playerMap.values()];
  for (const p of allPlayersRaw) {
    const allScores: number[] = p.roundScores.flatMap((rs: any) => rs.scores ?? []);
    const totalGross: number = typeof p.grossTotal === 'number' ? p.grossTotal : 0;
    p._wd = isWD(totalGross, allScores);
  }
  const players = [
    ...allPlayersRaw.filter(p => !p._wd),
    ...allPlayersRaw.filter(p =>  p._wd),
  ];
  return {
    name: `${t.name} — ${e.nome}`,
    tcode: `${t.t}-${e.age_group}`,
    date: t.date_inicio,
    campo: teeInfo?.campo ?? e.campo ?? t.campo ?? "",
    rounds: rondasComDados.length,
    playerCount: allPlayersRaw.filter(p => {
      const allScores: number[] = p.roundScores.flatMap((rs: any) => rs.scores ?? []);
      const totalGross: number = typeof p.grossTotal === 'number' ? p.grossTotal : 0;
      return !isWD(totalGross, allScores);
    }).length,
    players,
  } as any;
}

// ─────────────────────────────────────────────
// ESCALÃO SECTION — tabs R1 / R2 / Acumulado
// usa ScorecardLB e AccumulatedLB de FPGPage
// ─────────────────────────────────────────────
function EscalaoSection({ escalao: e, torneio: t, arMap, drawsData }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
  arMap?: Map<string, AutoRivalPlayer>;
  drawsData?: UskidsDrawsData | null;
}) {
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

  // Procurar o escalão correspondente no drawsData (matching por t + age_group)
  const drawEscalao = useMemo(() => {
    if (!drawsData) return null;
    const td = drawsData.torneios.find(x => x.t === t.t);
    if (!td) return null;
    return td.escaloes.find(x => x.age_group === e.age_group) || null;
  }, [drawsData, t.t, e.age_group]);

  // Mapa ronda → UskidsDrawRonda (só inclui rondas com pelo menos 1 grupo)
  const drawsByRonda = useMemo(() => {
    const m = new Map<number, UskidsDrawRonda>();
    if (!drawEscalao) return m;
    for (const r of drawEscalao.rondas) {
      if ((r.grupos || []).length > 0) m.set(r.ronda, r);
    }
    return m;
  }, [drawEscalao]);

  if (!rondasComDados.length && drawsByRonda.size === 0) {
    return <EmptyState size="sm" message="Sem dados para este escalão." />;
  }

  // Estrutura de tabs: para cada ronda com dados criamos UMA entry de Draw
  // (se existir no drawsData) e UMA entry de leaderboard. Depois Resumo +
  // 📋 Scorecards quando há ≥ 2 rondas. Cada item carrega tipo + índice
  // associado.
  type TabEntry =
    | { kind: "draw"; ronda: number; drawRonda: UskidsDrawRonda }
    | { kind: "round"; index: number; ronda: number }
    | { kind: "resumo" }
    | { kind: "scorecards" };
  const tabsEntries: TabEntry[] = [];
  for (let i = 0; i < rondasComDados.length; i++) {
    const rondaNum = rondasComDados[i].ronda;
    const dr = drawsByRonda.get(rondaNum);
    if (dr) tabsEntries.push({ kind: "draw", ronda: rondaNum, drawRonda: dr });
    tabsEntries.push({ kind: "round", index: i, ronda: rondaNum });
  }
  // Caso especial: o draw publicou para uma ronda que ainda não tem leaderboard
  // (ex: torneio futuro com draw disponível). Acrescentar essas rondas de draw
  // no início para que apareçam mesmo sem dados de scores.
  if (!rondasComDados.length) {
    for (const r of drawsByRonda.values()) {
      tabsEntries.push({ kind: "draw", ronda: r.ronda, drawRonda: r });
    }
  } else {
    // Apanhar rondas de draw que não correspondem a nenhuma ronda do leaderboard
    const rondasComLb = new Set(rondasComDados.map(r => r.ronda));
    for (const r of drawsByRonda.values()) {
      if (!rondasComLb.has(r.ronda)) {
        tabsEntries.push({ kind: "draw", ronda: r.ronda, drawRonda: r });
      }
    }
  }
  const hasAcumulado = rondasComDados.length >= 2;
  if (hasAcumulado) {
    tabsEntries.push({ kind: "resumo" });
    tabsEntries.push({ kind: "scorecards" });
  }

  // Tab activa por defeito: primeira ronda com Manuel; ou primeiro "round";
  // ou primeiro draw se não há rondas; ou 0.
  const defaultTab = (() => {
    for (let i = 0; i < tabsEntries.length; i++) {
      const ent = tabsEntries[i];
      if (ent.kind !== "round") continue;
      const lb = rondasComDados[ent.index].leaderboard ?? rondasComDados[ent.index].jogadores ?? [];
      if (lb.some(j => isManuel(j.nome))) return i;
    }
    const idxFirstRound = tabsEntries.findIndex(e => e.kind === "round");
    if (idxFirstRound >= 0) return idxFirstRound;
    const idxFirstDraw = tabsEntries.findIndex(e => e.kind === "draw");
    return idxFirstDraw >= 0 ? idxFirstDraw : 0;
  })();
  const [tab, setTab] = useState(defaultTab);

  const tournament = useMemo(() => escalaoToTournament(e, t, arMap), [e, t, arMap]);
  const expandedT = useMemo(() => expandMultiRound(tournament), [tournament]);

  const activeEntry = tabsEntries[tab] ?? tabsEntries[0];
  const isAccTab       = activeEntry?.kind === "resumo";
  const isScorecardTab = activeEntry?.kind === "scorecards";
  const isDrawTab      = activeEntry?.kind === "draw";
  const isRoundTab     = activeEntry?.kind === "round";

  const curT = isRoundTab
    ? (expandedT[activeEntry.index] ?? tournament)
    : (expandedT[expandedT.length - 1] ?? tournament);

  const campo = (curT as any).campo || tournament.campo || "";

  // playersDB com kidsHash para todos os jogadores deste escalão
  const kidsDB = useMemo(() => {
    const db: Record<string, { name: string; kidsHash: string }> = {};
    if (!arMap) return db;
    for (const rd of rondasComDados) {
      for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
        const ar = arMap.get(normNameAuto(j.nome));
        if (!ar) continue;
        const memberId = (ar as any).memberId as string | undefined;
        const hash = memberId ?? encodeURIComponent(ar.n);
        const key = normNameAuto(j.nome);
        if (!db[key]) db[key] = { name: ar.n, kidsHash: hash };
      }
    }
    return db;
  }, [arMap, rondasComDados]);

  // Externa URL signupanytime — link "↗" no header do draw.
  // Aponta para a página `v=results` (que abre OK no browser); o user pode
  // mudar para "Tee Time" usando o dropdown da própria página signupanytime.
  // Nota: tentámos `v=teetimes` mas o iframe oficial fica preso em "Loading
  // Age Group Information" sem nunca renderizar o draw (bug do site).
  // Preservar o ax que vem do `url_resultados` quando existe (Marco Simone=2739,
  // El Prat=2760, default=1129).
  const drawExternalUrl = t.url_resultados ||
    `https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`;

  return (
    <div>
      {campo && (
        <div className="fs-11 c-text-3" style={{ marginBottom: 6 }}>
          📍 {campo}
        </div>
      )}
      {/* Sub-tabs Draw R1 / R1 / Draw R2 / R2 / Resumo / 📋 Scorecards */}
      {tabsEntries.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          {tabsEntries.map((ent, i) => {
            const label =
              ent.kind === "draw"       ? `Draw R${ent.ronda}` :
              ent.kind === "round"      ? `R${ent.ronda}` :
              ent.kind === "resumo"     ? "Resumo" :
                                          "📋 Scorecards";
            return (
              <button key={i} className={`tab-under${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>
                {label}
              </button>
            );
          })}
        </div>
      )}
      {(() => {
        if (isDrawTab && activeEntry.kind === "draw") {
          // Cruzar com leaderboard da MESMA ronda para popular a coluna Resultado.
          const lbRound = e.rondas.find(r => r.ronda === activeEntry.ronda);
          const roundLeaderboard = lbRound?.leaderboard ?? lbRound?.jogadores ?? undefined;
          // Par total da ronda — usado como fallback se o leaderboard não tem
          // `to_par` por jogador (acontece em alguns torneios completos antigos).
          const parTotal = lbRound?.total_par
            ?? (lbRound?.par?.length ? lbRound.par.reduce((s, v) => s + (v || 0), 0) : null);
          return (
            <UskidsDrawTab
              draw={activeEntry.drawRonda}
              roundNum={activeEntry.ronda}
              escalaoNome={e.nome}
              isManuelEscalao={!!e.is_manuel || e.age_group === t.escalao_manuel}
              externalUrl={drawExternalUrl}
              roundLeaderboard={roundLeaderboard}
              roundParTotal={parTotal}
            />
          );
        }
        if (isScorecardTab) {
          return <AllRoundsScorecardLB tournament={tournament} escLookup={new Map()} playersDB={kidsDB} />;
        }
        if (isAccTab) {
          return <AccumulatedLB tournament={curT} nRounds={rondasComDados.length} escLookup={new Map()} playersDB={kidsDB} />;
        }
        return <ScorecardLB tournament={curT} escLookup={new Map()} playersDB={kidsDB} siLabel="m" options={{ hideRawSDTip: true }} />;
      })()}

    </div>
  );
}

function EscalaoTabs({ escaloes, torneio: t, defaultIdx, arMap, drawsData }: {
  escaloes: EscalaoResult[];
  torneio: TorneioResult;
  defaultIdx: number;
  arMap?: Map<string, AutoRivalPlayer>;
  drawsData?: UskidsDrawsData | null;
}) {
  const [esc, setEsc] = useState(defaultIdx);
  const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

  const e = escaloes[esc];

  return (
    <div>
      {/* Barra de escalões */}
      <div className="tabbar-under">
        {escaloes.map((es, i) => {
          const isME = t.escalao_manuel
            ? es.age_group === t.escalao_manuel
            : (es.is_manuel === true && es.age_group === escalaoEsperado);
          const tInfo = TEES_LOOKUP[t.t]?.[es.age_group];
          const dist = tInfo?.metros?.length === 18
            ? tInfo.metros.reduce((a: number, b: number) => a + b, 0) : null;
          return (
            <button key={es.age_group} className={"tab-under" + (esc === i ? " active" : "")} onClick={() => setEsc(i)}>
              {isME ? "★ " : ""}{es.nome}
              {dist ? <span className="ml-4 fs-10 fw-400" style={{ opacity: 0.7 }}>{dist}m</span> : null}
            </button>
          );
        })}
      </div>
      {/* Conteúdo do escalão activo */}
      {e && <EscalaoSection key={e.age_group} escalao={e} torneio={t} arMap={arMap} drawsData={drawsData} />}
    </div>
  );
}

function SecaoGreatgolf({ data }: { data: GreatgolfData }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<"sub12"|"sub14"|"d1">("sub12");

  const cats: { key: "sub12"|"sub14"|"d1"; label: string }[] = [
    { key:"sub12", label:"Sub-12" },
    { key:"sub14", label:"Sub-14" },
    { key:"d1",    label:"WAGR / Open" },
  ];

  const rows = data.results[cat] ?? [];

  return (
    <div className="card" style={{ marginTop:20, padding:0, overflow:"hidden" }}>
      {/* Header clicável */}
      <div onClick={() => setOpen(v => !v)} style={{
        padding:"12px 16px",
        background: open ? "var(--bg-header)" : "var(--bg-card)",
        borderBottom: open ? "1px solid var(--border)" : "none",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div>
          <div className="h-md" style={{ marginBottom:3 }}>🏆 {data.name}</div>
          <div className="detail-sub" style={{ marginTop:0 }}>
            <span className="muted">📅 {data.dates.map(d => fmtDate(d)).join(" · ")}</span>
            <span className="muted">📍 {data.course}</span>
          </div>
        </div>
        <span className="fs-13 c-text-3">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding:"12px 16px" }}>
          {/* Selector de categoria — usa tourn-tab */}
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {cats.map(c => (
              <button key={c.key}
                className={`tourn-tab tourn-tab-sm${cat === c.key ? " active" : ""}`}
                style={cat !== c.key ? { background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" } : {}}
                onClick={() => setCat(c.key)}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="scroll-x">
            <MultiRoundLeaderboard
              rows={rows.map((r, i): MultiRoundRow => ({
                key: r.name + i,
                name: isManuel(r.name) ? `★ ${r.name}` : r.name,
                club: r.club,
                gross: r.gross ?? 0,
                parTotal: r.gross != null && r.toPar != null ? r.gross - r.toPar : 0,
                toPar: r.toPar,
                pos: r.pos ?? 0,
                isHighlighted: isManuel(r.name),
                isWD: r.pos == null,
                rounds: [{ gross: r.gross }],
              }))}
              nRounds={1}
              sortable
              showCols={{ esc: false, fed: false, tee: false, hcp: false, roundStats: false, roundToPar: false }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB RESULTADOS
// ─────────────────────────────────────────────
function TabResultados({ data, selectedT, greatgolfData, drawsData }: {
  data: ResultsData;
  selectedT: number | null;
  greatgolfData: GreatgolfData | null;
  /** Pairings (Draw R1/R2/R3) — quando disponível, renderiza tabs intercalados
   *  antes de cada ronda. Vem de public/data/uskids-draws.json (escalão do
   *  Manuel + ±1 adjacente). Optional: o fluxo continua a funcionar sem isto. */
  drawsData?: UskidsDrawsData | null;
}) {
  const arMap = React.useContext(ArMapCtx);
  const t = data.resultados.find(r => r.t === selectedT) ?? null;


  if (!data.resultados.length) return (
    <div className="c-text-3 fs-13" style={{ padding:"32px 0", textAlign:"center" }}>
      Sem resultados ainda — os scorecards aparecerão aqui durante e após os torneios
    </div>
  );

  if (!t) return (
    <div>
      <div className="c-text-3 fs-13" style={{ padding:"32px 0 16px", textAlign:"center" }}>
        Selecciona um torneio na sidebar
      </div>
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );

  const manuelRows = t.escaloes.flatMap(e =>
    e.rondas.flatMap(r => {
      const lb = r.leaderboard ?? r.jogadores ?? [];
      const manuel = lb.find(j => isManuel(j.nome));
      if (!manuel) return [];
      const lider = lb[0];
      const diffLider = (lider && lider.score > 0 && manuel.score > 0)
        ? manuel.score - lider.score
        : null;
      return [{ escalao: e.nome, ronda: r.ronda, ...manuel, diffLider }];
    })
  );

  return (
    <div>
      {/* ── Header — padrão detail-header ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <h2 className="detail-title">{t.name}</h2>
        </div>
        <div className="detail-sub">
          <span className="muted">📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          <span className="muted fs-11">actualizado {fmtTs(t.ultima_atualizacao)}</span>
        </div>
        {/* Links externos — mesma fila que a tab Torneios (Inscritos, Resultados,
            USKids, Distâncias, Info jogadores…). */}
        <TournExternalLinks t={t.t} />
        {/* Resultados do Manuel em destaque */}
        {manuelRows.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
            {manuelRows.map((m, i) => {
              const toPar = m.to_par != null ? fmtToPar(m.to_par) : null;
              const liderStr = m.diffLider === 0 ? "líder"
                : m.diffLider != null ? `+${m.diffLider} do líder`
                : null;
              return (
                <span key={i} className="fs-13 fw-700" style={{
                  background:"var(--accent)", color:"#fff",
                  padding:"5px 14px", borderRadius:8,
                  display:"inline-flex", alignItems:"center", gap:6,
                }}>
                  <span style={{ opacity:.8 }}>★</span>
                  <span>{m.escalao} · R{m.ronda} · {m.score}{toPar ? ` (${toPar})` : ""}</span>
                  {liderStr && <span className="fs-11" style={{ opacity:.8 }}>{liderStr}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Escalões — barra de tabs no topo */}
      {(() => {
        const escaloes = sortEscaloes(t.escaloes).filter(e =>
          e.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).length > 0)
        );
        if (!escaloes.length) return null;
        const escalaoEsperado = escalaoManuelParaData(t.date_inicio);
        const manuelIdx = escaloes.findIndex(e =>
          t.escalao_manuel ? e.age_group === t.escalao_manuel
            : (e.is_manuel === true && e.age_group === escalaoEsperado)
        );
        return <EscalaoTabs escaloes={escaloes} torneio={t} defaultIdx={manuelIdx >= 0 ? manuelIdx : 0} arMap={arMap} drawsData={drawsData} />;
      })()}

      {/* ── Greatgolf Junior Open ── */}
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );
}

export default TabResultados;
export { EscalaoTabs, EscalaoSection, escalaoToTournament, SecaoGreatgolf };
