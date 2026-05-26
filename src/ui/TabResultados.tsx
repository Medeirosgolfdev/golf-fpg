import { useState, useMemo } from "react";
import React from "react";
import { displayName, fmtDate, fmtToPar, isoDate } from "../utils/format";
import { flag } from "../utils/flagUtils";
import { scClass } from "../utils/scoreDisplay";
import { tpColor } from "./tournamentPrimitives";
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
import { ManuelPill } from "./PillBadge";
import type { TorneioResult, EscalaoResult, RondaResult, ResultsData, GreatgolfData } from "./uskidsTypes";
import { sortEscaloes } from "./uskidsTypes";
import { TEES_LOOKUP, LINKS_EXTRA, isWD, fmtTs, ArMapCtx, type TeeInfo } from "./USKIDSPageHelpers";

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
function EscalaoSection({ escalao: e, torneio: t, arMap }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
  arMap?: Map<string, AutoRivalPlayer>;
}) {
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
  if (!rondasComDados.length) return <EmptyState size="sm" message="Sem dados para este escalão." />;

  const hasAcumulado = rondasComDados.length >= 2;
  const SCORECARD_TAB = rondasComDados.length + 1;
  const defaultTab = (() => {
    for (let i = 0; i < rondasComDados.length; i++) {
      const lb = rondasComDados[i].leaderboard ?? rondasComDados[i].jogadores ?? [];
      if (lb.some(j => isManuel(j.nome))) return i;
    }
    return 0;
  })();
  const [tab, setTab] = useState(defaultTab);

  const tournament = useMemo(() => escalaoToTournament(e, t, arMap), [e, t, arMap]);
  const expandedT = useMemo(() => expandMultiRound(tournament), [tournament]);

  const isAccTab       = hasAcumulado && tab === rondasComDados.length;
  const isScorecardTab = hasAcumulado && tab === SCORECARD_TAB;
  const curT = (isAccTab || isScorecardTab)
    ? expandedT[expandedT.length - 1]
    : expandedT[tab] ?? tournament;


  const campo = (curT as any).campo || tournament.campo || "";

  return (
    <div>
      {campo && (
        <div className="fs-11 c-text-3" style={{ marginBottom: 6 }}>
          📍 {campo}
        </div>
      )}
      {/* Sub-tabs R1 / R2 / Resumo / 📋 Scorecards */}
      {(rondasComDados.length > 1) && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          {rondasComDados.map((_, i) => (
            <button key={i} className={`tab-under${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>R{i + 1}</button>
          ))}
          {hasAcumulado && (
            <button className={`tab-under${tab === rondasComDados.length ? " active" : ""}`} onClick={() => setTab(rondasComDados.length)}>
              Resumo
            </button>
          )}
          {hasAcumulado && (
            <button className={`tab-under${tab === SCORECARD_TAB ? " active" : ""}`} onClick={() => setTab(SCORECARD_TAB)}>
              📋 Scorecards
            </button>
          )}
        </div>
      )}
      {(() => {
        // Construir playersDB com kidsHash para todos os jogadores deste escalão
        const kidsDB: Record<string, { name: string; kidsHash: string }> = {};
        if (arMap) {
          for (const rd of rondasComDados) {
            for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
              const ar = arMap.get(normNameAuto(j.nome));
              if (!ar) continue;
              const memberId = (ar as any).memberId as string | undefined;
              const hash = memberId ?? encodeURIComponent(ar.n);
              const key = normNameAuto(j.nome);
              if (!kidsDB[key]) kidsDB[key] = { name: ar.n, kidsHash: hash };
            }
          }
        }
        return isScorecardTab
          ? <AllRoundsScorecardLB tournament={tournament} escLookup={new Map()} playersDB={kidsDB} />
          : isAccTab
            ? <AccumulatedLB tournament={curT} nRounds={rondasComDados.length} escLookup={new Map()} playersDB={kidsDB} />
            : <ScorecardLB tournament={curT} escLookup={new Map()} playersDB={kidsDB} siLabel="m" options={{ hideRawSDTip: true }} />;
      })()}

    </div>
  );
}

function EscalaoTabs({ escaloes, torneio: t, defaultIdx, arMap }: {
  escaloes: EscalaoResult[];
  torneio: TorneioResult;
  defaultIdx: number;
  arMap?: Map<string, AutoRivalPlayer>;
}) {
  const [esc, setEsc] = useState(defaultIdx);
  const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

  const escTabStyle = (i: number): React.CSSProperties => ({
    padding: "6px 12px", fontSize: 12,
    fontWeight: esc === i ? 700 : 500,
    color: esc === i ? "var(--text)" : "var(--text-muted)",
    background: "transparent", border: "none",
    borderBottom: esc === i ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer", whiteSpace: "nowrap" as const,
    marginBottom: -1,
  });

  const e = escaloes[esc];

  return (
    <div>
      {/* Barra de escalões */}
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
        {escaloes.map((es, i) => {
          const isME = t.escalao_manuel
            ? es.age_group === t.escalao_manuel
            : (es.is_manuel === true && es.age_group === escalaoEsperado);
          const tInfo = TEES_LOOKUP[t.t]?.[es.age_group];
          const dist = tInfo?.metros?.length === 18
            ? tInfo.metros.reduce((a: number, b: number) => a + b, 0) : null;
          return (
            <button key={es.age_group} style={escTabStyle(i)} onClick={() => setEsc(i)}>
              {isME ? "★ " : ""}{es.nome}
              {dist ? <span className="ml-4 fs-10 fw-400" style={{ opacity: 0.7 }}>{dist}m</span> : null}
            </button>
          );
        })}
      </div>
      {/* Conteúdo do escalão activo */}
      {e && <EscalaoSection key={e.age_group} escalao={e} torneio={t} arMap={arMap} />}
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
        <div style={{ padding:"14px 16px" }}>
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
function TabResultados({ data, selectedT, greatgolfData }: {
  data: ResultsData;
  selectedT: number | null;
  greatgolfData: GreatgolfData | null;
}) {
  const arMap = React.useContext(ArMapCtx);
  const t = data.resultados.find(r => r.t === selectedT) ?? null;

  // ── PRINT ──────────────────────────────────────────────────────────────────
  function printRondas() {
    if (!t) return;


    const css = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'DM Sans', sans-serif; font-size: 11px; color: var(--text); background: #fff; padding: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
      h2 { font-size: 12px; font-weight: 700; color: var(--text-dark); margin: 14px 0 6px; border-bottom: 1px solid var(--text-dark); padding-bottom: 3px; }
      h3 { font-size: 11px; font-weight: 700; color: var(--text-3); margin: 10px 0 4px; }
      .meta { font-size: 10px; color: var(--text-3); margin-bottom: 8px; }
      .page-break { page-break-before: always; }

      table { border-collapse: collapse; font-size: 10px; width: 100%; }
      th, td { padding: 4px 3px; text-align: center; border: none; white-space: nowrap; }
      th { background: var(--bg-header); font-weight: 600; font-size: 10px; color: var(--text-3); border-bottom: 1px solid var(--border); }
      tbody td { border-bottom:1px solid var(--border-light); }
      td.name { text-align: left; padding-left: 8px; min-width: 120px; }
      td.pos { width: 24px; font-weight: 700; }
      td.flag { width: 22px; }

      .lb-topar { width: 32px; font-weight: 700; font-family: 'JetBrains Mono', monospace; background: var(--accent-light); border-left: 1px solid var(--border); }
      .lb-gross { width: 36px; font-weight: 800; font-family: 'JetBrains Mono', monospace; background: var(--accent-light); border-left: 1px solid var(--border-light); }
      .lb-halftot { width: 40px; background: var(--bg-muted); font-weight: 600; font-size: 10px; font-family: 'JetBrains Mono', monospace; border-left: 1px solid var(--border); }
      .lb-hole { min-width: 28px; border-left: 1px solid var(--border-light); }
      .lb-hole-first { border-left: 1px solid var(--border); }
      .lb-par-row td { background: var(--bg-muted); font-weight: 600; border-bottom: 2px solid var(--border); }
      .lb-par-row td.lb-topar, .lb-par-row td.lb-gross { background: var(--accent-light); }
      .lb-si-row td { background:var(--bg); font-size: 10px; color:var(--text-muted); border-bottom:1px solid var(--border-light); }
      .lb-par-lbl { text-align: left; padding-left: 8px; font-weight: 800; }

      .row-manuel td { background: var(--bg-success-subtle) !important; }
      .row-manuel td.lb-topar, .row-manuel td.lb-gross { background: var(--bg-manuel-gross) !important; }

      .sc-score { display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; font-size: 10px; font-weight: 700; border-radius: 0; }
      .sc-score.birdie { background:var(--color-danger); color: #fff; border-radius: 50%; }
      .sc-score.eagle  { background: var(--score-eagle); color: #fff; border-radius: 50%; }
      .sc-score.par    { background: transparent; color: var(--text); }
      .sc-score.bogey  { background: var(--score-bogey); color: var(--score-bogey-fg); border: 1px solid var(--score-bogey-border); }
      .sc-score.double { background: var(--score-double); color: #fff; }
      .sc-score.triple { background:var(--score-triple); color: #fff; }
      .sc-score.quad   { background: var(--score-quad); color: #fff; }
      .sc-score.empty  { color:var(--text-4); }
      .row-wd td { color: var(--text-muted) !important; }
      .row-wd td.name { color: var(--text-muted) !important; }

      @media print {
        body { padding: 6px; }
        @page { margin: 10mm; size: landscape; }
      }
    `;

    const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

    let tableIndex = 0;
    const tablesHtml = sortEscaloes(t.escaloes).map(e => {
      const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);
      if (!rondasComDados.length) return "";
      const isManuelEscalao = t.escalao_manuel
        ? e.age_group === t.escalao_manuel
        : (e.is_manuel === true && e.age_group === escalaoEsperado);
      const teeInfo = TEES_LOOKUP[t.t]?.[e.age_group];

      const escalaoTitle = `<h2>${isManuelEscalao ? "★ " : ""}${e.nome}</h2>`;
      const rondasHtml = rondasComDados.map((r, _ri) => {
          const jogadores = r.leaderboard ?? r.jogadores ?? [];
          const buracos = r.buracos || 18;
          const has18 = buracos >= 18;
          const hasPontos = jogadores.some((j: any) => j.pontos > 0);
          const par: number[] | undefined = (() => {
            if (teeInfo?.par.length === buracos) return teeInfo.par;
            if (r.par?.length === buracos) return r.par;
            return undefined;
          })();
          const metros: number[] | undefined =
            teeInfo?.metros && teeInfo.metros.length === buracos ? teeInfo.metros : undefined;
          const totalPar = par ? par.reduce((s: number, p: number) => s + p, 0) : r.total_par;
          const outPar = par?.slice(0, 9).reduce((s: number, p: number) => s + p, 0);
          const inPar  = par?.slice(9, 18).reduce((s: number, p: number) => s + p, 0);
          const outM   = metros?.slice(0, 9).reduce((s: number, m: number) => s + m, 0);
          const inM    = metros?.slice(9, 18).reduce((s: number, m: number) => s + m, 0);

          const getStrokes = (j: any) => j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []);

          const holeHeaders = Array.from({length: 9}, (_, i) => `<th class="lb-hole${i===0?" lb-hole-first":""}">${i+1}</th>`).join("") +
            (has18 ? `<th class="lb-halftot">Out</th>` + Array.from({length:9}, (_,i) => `<th class="lb-hole${i===0?" lb-hole-first":""}">${i+10}</th>`).join("") + `<th class="lb-halftot">In</th>` : `<th class="lb-halftot">Tot</th>`);

          const metrosRow = metros ? `<tr class="lb-si-row">
            <td class="pos"></td><td class="name lb-par-lbl" colspan="2">m</td>
            <td class="lb-topar"></td><td class="lb-gross">${(outM??0)+(inM??0)}</td>
            ${metros.slice(0,9).map((m:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${m}</td>`).join("")}
            <td class="lb-halftot">${outM}</td>
            ${has18 ? metros.slice(9,18).map((m:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${m}</td>`).join("")+"<td class='lb-halftot'>"+inM+"</td>" : ""}
            ${hasPontos?"<td></td>":""}
          </tr>` : "";

          const parRow = par ? `<tr class="lb-par-row">
            <td class="pos"></td><td class="name lb-par-lbl" colspan="2">PAR</td>
            <td class="lb-topar"></td><td class="lb-gross">${totalPar}</td>
            ${par.slice(0,9).map((p:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${p}</td>`).join("")}
            <td class="lb-halftot">${outPar}</td>
            ${has18 ? par.slice(9,18).map((p:number,i:number)=>`<td class="lb-hole${i===0?" lb-hole-first":""}">${p}</td>`).join("")+"<td class='lb-halftot'>"+inPar+"</td>" : ""}
            ${hasPontos?"<td></td>":""}
          </tr>` : "";

          // Separar WD dos outros antes de renderizar (WD vai para o fundo)
          const jogadoresOrdenados = [
            ...jogadores.filter((j: any) => !isWD(j.score || 0, j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []))),
            ...jogadores.filter((j: any) =>  isWD(j.score || 0, j.strokes?.length ? j.strokes : (j.rondas?.["1"]?.strokes ?? []))),
          ];
          let posCounter = 0;
          const rows = jogadoresOrdenados.map((j: any) => {
            const st = getStrokes(j);
            const wd = isWD(j.score || 0, st);
            const out9 = st.slice(0,9).reduce((s:number,v:number)=>s+(v||0),0);
            const in9  = st.slice(9,18).reduce((s:number,v:number)=>s+(v||0),0);
            const manuel = isManuel(j.nome);
            const manCls = manuel ? " row-manuel" : wd ? " row-wd" : "";
            if (!wd) posCounter++;
            const holes9 = st.slice(0,9).map((s:number, hi:number) => {
              const cl = scClass(s, par?.[hi] ?? null);
              return `<td class="lb-hole${hi===0?" lb-hole-first":""}"><span class="sc-score ${cl||"empty"}">${s||""}</span></td>`;
            }).join("");
            const holes9b = has18 ? st.slice(9,18).map((s:number, hi:number) => {
              const cl = scClass(s, par?.[hi+9] ?? null);
              return `<td class="lb-hole${hi===0?" lb-hole-first":""}"><span class="sc-score ${cl||"empty"}">${s||""}</span></td>`;
            }).join("") : "";
            const tpVal = fmtToPar(j.to_par, "–");
            const tpC   = tpColor(j.to_par);
            return `<tr class="${manCls.trim()}">
              <td class="pos">${wd ? "" : posCounter}</td>
              <td class="name">${manuel?"★ ":""}${displayName(j.nome)}${wd?' <span style="color:var(--text-3);font-size:9px;font-weight:700">WD</span>':""}</td>
              <td class="flag">${flag(j.pais)}</td>
              <td class="lb-topar" style="color:${wd?"var(--text-muted)":tpC}">${wd?"WD":tpVal}</td>
              <td class="lb-gross" style="${wd?"color:var(--text-muted)":""}">${wd?"–":j.score||"–"}</td>
              ${holes9}
              <td class="lb-halftot">${out9||"–"}</td>
              ${has18 ? holes9b + `<td class="lb-halftot">${in9||"–"}</td>` : ""}
              ${hasPontos?`<td style="color:var(--color-warn);font-weight:700">${j.pontos>0?j.pontos:"–"}</td>`:""}
            </tr>`;
          }).join("");

          const pb = tableIndex++ > 0 ? '<div class="page-break"></div>' : '';
          return `${pb}${escalaoTitle}<h3>Ronda ${r.ronda} · ${jogadores.length} jogadores · ${buracos}H${totalPar ? ` · Par ${totalPar}` : ""}</h3>
          <div className="scroll-x">
          <table>
            <thead>
              ${metrosRow}${parRow}
              <tr>
                <th class="pos">#</th><th class="name">Jogador</th><th class="flag"></th>
                <th class="lb-topar">±</th><th class="lb-gross">Tot</th>
                ${holeHeaders}
                ${hasPontos?"<th>PTS</th>":""}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          </div>`;
        }).join("");

      // Tabela acumulada (só se ≥2 rondas)
      let accHtml = "";
      if (rondasComDados.length >= 2) {
        const totaisMap = new Map<string, { nome: string; pais: string; scores: number[]; total: number }>();
        for (const r of rondasComDados) {
          const lb = r.leaderboard ?? r.jogadores ?? [];
          for (const j of lb) {
            const k = j.nome.toLowerCase().trim();
            if (!totaisMap.has(k)) totaisMap.set(k, { nome: j.nome, pais: j.pais, scores: [], total: 0 });
            const entry = totaisMap.get(k)!;
            entry.scores.push(j.score || 0);
            entry.total += j.score || 0;
          }
        }
        const sorted = [...totaisMap.values()]
          .filter(p => p.scores.length === rondasComDados.length)
          .sort((a, b) => a.total - b.total);
        const incomplete = [...totaisMap.values()]
          .filter(p => p.scores.length < rondasComDados.length)
          .sort((a, b) => a.total - b.total);
        const allSorted = [...sorted, ...incomplete];

        const totalParAcc = (() => {
          const firstR = rondasComDados[0];
          const p0 = (firstR.leaderboard ?? firstR.jogadores ?? [])[0];
          const par0 = teeInfo?.par ?? (p0 as any)?.par ?? [];
          return par0.reduce((s: number, p: number) => s + p, 0) * rondasComDados.length;
        })();

        const rondaHeaders = rondasComDados.map((r, _i) => `<th class="lb-gross">R${r.ronda}</th>`).join("");
        const accRows = allSorted.map((p, idx) => {
          const manuel = isManuel(p.nome);
          const manCls = manuel ? "row-manuel" : "";
          const isInc = p.scores.length < rondasComDados.length;
          const tpRaw = totalParAcc > 0 ? p.total - totalParAcc : null;
          const tpVal = fmtToPar(tpRaw, "–");
          const tpC   = tpColor(tpRaw);
          const rondaCells = rondasComDados.map((_, i) =>
            `<td class="lb-gross">${p.scores[i] ?? "–"}</td>`
          ).join("");
          return `<tr class="${manCls}">
            <td class="pos">${isInc ? "–" : idx + 1}</td>
            <td class="name">${manuel ? "★ " : ""}${displayName(p.nome)}</td>
            <td class="flag">${flag(p.pais)}</td>
            <td class="lb-topar" style="color:${tpC}">${isInc ? "–" : tpVal}</td>
            <td class="lb-gross" style="font-weight:700">${p.total || "–"}</td>
            ${rondaCells}
          </tr>`;
        }).join("");

        accHtml = `<div class="page-break"></div>${escalaoTitle}<h3>Acumulado · ${sorted.length} classificados · ${rondasComDados.length} rondas${totalParAcc ? ` · Par ${totalParAcc}` : ""}</h3>
        <div className="scroll-x">
        <table>
          <thead><tr>
            <th class="pos">#</th><th class="name">Jogador</th><th class="flag"></th>
            <th class="lb-topar">±Par</th><th class="lb-gross">Total</th>
            ${rondaHeaders}
          </tr></thead>
          <tbody>${accRows}</tbody>
        </table>
        </div>`;
        tableIndex++;
      }

      return rondasHtml + accHtml;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${t.name}</title>
      <style>${css}</style>
    </head><body>
      <h1>${t.name}</h1>
      <div class="meta">📅 ${fmtDate(t.date_inicio)}${t.campo ? ` · ${t.campo}` : ""}</div>
      ${tablesHtml}
    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }
  // ──────────────────────────────────────────────────────────────────────────

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
          <button onClick={printRondas} className="btn fs-12" style={{ display:"flex", alignItems:"center", gap:5 }}>
            🖨�� Imprimir
          </button>
        </div>
        <div className="detail-sub">
          <span className="muted">📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          <span className="muted fs-11">actualizado {fmtTs(t.ultima_atualizacao)}</span>
          <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${t.t}`}
            target="_blank" rel="noopener noreferrer"
            className="fs-12 fw-600" style={{ textDecoration:"none", color:"var(--accent-text)",
              border:"1px solid var(--border)", borderRadius:5, padding:"1px 8px" }}>
            📋 Resultados ↗
          </a>
          {(LINKS_EXTRA[t.t] ?? []).map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              className="fs-12 fw-600" style={{ textDecoration:"none", color:"var(--accent-text)",
                border:"1px solid var(--border)", borderRadius:5, padding:"1px 8px" }}>
              {l.label}
            </a>
          ))}
        </div>
        {/* Resultados do Manuel em destaque */}
        {manuelRows.length > 0 && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
            {manuelRows.map((m, i) => {
              const toPar = m.to_par != null
                ? (m.to_par === 0 ? "E" : m.to_par > 0 ? `+${m.to_par}` : `${m.to_par}`)
                : null;
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
        return <EscalaoTabs escaloes={escaloes} torneio={t} defaultIdx={manuelIdx >= 0 ? manuelIdx : 0} arMap={arMap} />;
      })()}

      {/* ── Greatgolf Junior Open ── */}
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );
}

export default TabResultados;
export { EscalaoTabs, EscalaoSection, escalaoToTournament, SecaoGreatgolf };
