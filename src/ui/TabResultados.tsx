import { useState, useMemo, useEffect } from "react";
// Components: TabResultados + EscalaoTabs + EscalaoSection (TournamentDetail, com os Draw R{n}).
import React from "react";
import { displayName, fmtDate, fmtToPar, isoDate, norm } from "../utils/format";
import { flag } from "../utils/flagUtils";
import type { Tournament as TATournament } from "../pages/FPGPage";
import { TournamentDetail, type TournamentDetailProps } from "../pages/fpg/TournamentDetail";
import DrawTab from "./DrawTab";
import type { FpgDraw } from "../data/nacional2026Loader";
import { normName as normNameAuto, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import { escalaoManuelParaData, isManuelByName as isManuel } from "../constants/manuel";
import { MultiRoundLeaderboard } from "./MultiRoundLeaderboard";
import type { MultiRoundRow } from "./multiRoundTypes";
import EmptyState from "./EmptyState";
import type { TorneioResult, EscalaoResult, ResultsData, GreatgolfData,
  UskidsDrawsData, UskidsDrawRonda } from "./uskidsTypes";
import { sortEscaloes } from "./uskidsTypes";
import { TEES_LOOKUP, isWD, fmtTs, ArMapCtx } from "./USKIDSPageHelpers";
import { TournExternalLinks } from "./TabCampoDetalhe";
import { cachedFetchJson } from "../data/fetchCache";
import { tournamentFamilyKey, divKey, buildPastEditionFromTournament } from "./circuit/pastEditions";
import PastEditionsTable, { type PastEdition } from "./circuit/PastEditionsTable";
import PastEditionsRepeatersTable from "./circuit/PastEditionsRepeatersTable";
import { buildRepeaters } from "./circuit/repeaters";

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

/** Draw de uma volta USKids → formato FPG (DrawTab partilhado). A cidade vai
 *  na coluna do clube; o país dá a bandeira. */
function uskidsDrawToFpg(dr: UskidsDrawRonda): FpgDraw {
  return {
    groups: dr.grupos.map((g) => ({
      teeTime: g.tee_time, startHole: g.start_hole ?? null, tee: null,
      players: g.jogadores.map((j) => ({ nome: displayName(j.nome), clube: j.cidade || null, country: j.pais || null })),
    })),
  };
}

/** Resultado de cada jogador numa volta (para as colunas ±/Tot do draw), por
 *  nome normalizado. Sem ±par na fonte, calcula-o com o par da volta. */
function uskidsRoundResults(e: EscalaoResult, ronda: number): Map<string, { gross: number; toPar: number | null }> {
  const m = new Map<string, { gross: number; toPar: number | null }>();
  const r = e.rondas.find((x) => x.ronda === ronda);
  if (!r) return m;
  const parTotal = r.total_par ?? (r.par?.length ? r.par.reduce((s, v) => s + (v || 0), 0) : null);
  for (const j of r.leaderboard ?? r.jogadores ?? []) {
    if (!j.nome || !(j.score > 0)) continue;
    const toPar = j.to_par ?? (parTotal ? j.score - parTotal : null);
    m.set(norm(displayName(j.nome)), { gross: j.score, toPar });
  }
  return m;
}

const DRAW_HIDE = { esc: true, fed: true, hcp: true, tee: true, nasc: true };

/** Escalão correspondente noutra edição: nome igual, senão sexo + idade. */
function matchEscalao(escaloes: EscalaoResult[], e: EscalaoResult): EscalaoResult | null {
  const exact = escaloes.find(x => x.nome === e.nome);
  if (exact) return exact;
  const k = divKey(e.nome);
  return escaloes.find(x => { const kx = divKey(x.nome); return kx.sex === k.sex && kx.age === k.age; }) ?? null;
}

const temDados = (esc: EscalaoResult) => esc.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

/** Campo do escalão: o das voltas (no World cada escalão joga noutro campo e o
 *  `campo` do torneio é a lista de todos). */
function campoEscalao(esc: EscalaoResult): string {
  const voltas = [...new Set(esc.rondas.map(r => (r as { campo?: string }).campo).filter(Boolean))];
  return esc.campo || voltas.join(" / ");
}

/** Uma coluna de edição (PastEdition) para um escalão de um torneio. */
function uskidsEdition(esc: EscalaoResult, ed: TorneioResult, arMap?: Map<string, AutoRivalPlayer>, label?: string): { ed: PastEdition; stamp: string } | null {
  const stamp = isoDate(ed.date_inicio);
  const pe = buildPastEditionFromTournament(escalaoToTournament(esc, ed, arMap), {
    id: label ? `${ed.t}:${esc.age_group}` : String(ed.t), year: parseInt(stamp.slice(0, 4), 10) || 0,
    division: esc.nome, course: campoEscalao(esc) || ed.campo || null, label: label ?? null,
  });
  if (!pe) return null;
  // O adaptador deixa toPar a null e parTotal a 0 quando não há par (o Resumo
  // calcula o ±Par à parte) → par 0 = desconhecido; ±Par pelas voltas jogadas.
  const par = pe.parPerRound || null;
  pe.parPerRound = par;
  for (const p of pe.players) {
    const n = p.rounds.filter(Boolean).length;
    if (p.toPar == null && par && p.total && n) p.toPar = p.total - par * n;
  }
  return { ed: pe, stamp };
}

const porData = (rows: { ed: PastEdition; stamp: string }[]) =>
  rows.sort((a, b) => b.stamp.localeCompare(a.stamp)).map(r => r.ed);

/** «Edições anteriores» do USKids — a /uskids não usa o CircuitShell, por isso
 *  monta aqui as mesmas colunas (PastEditionsTable) a partir das edições do
 *  mesmo torneio (`tournamentFamilyKey`) já em memória (19/10/2026). */
function uskidsPastEditions(e: EscalaoResult, edicoes: TorneioResult[], arMap?: Map<string, AutoRivalPlayer>): PastEdition[] {
  const rows: { ed: PastEdition; stamp: string }[] = [];
  for (const ed of edicoes) {
    const esc = matchEscalao(ed.escaloes, e);
    const r = esc && temDados(esc) ? uskidsEdition(esc, ed, arMap) : null;
    if (r) rows.push(r);
  }
  return porData(rows);
}

/** Idades de um escalão USKids: «Boys 12» → [12,12], «Boys 13-14» → [13,14],
 *  «Boys 7 & Under» → [0,7]. */
function idadesEscalao(nome: string): [number, number] | null {
  const n = (nome.match(/\d+/g) || []).map(Number);
  if (!n.length) return null;
  if (/under/i.test(nome)) return [0, n[0]];
  return [n[0], n[1] ?? n[0]];
}

/** Edições para o «Quem repete» do USKids (pedido dela, 19/10/2026): os miúdos
 *  sobem de escalão todos os anos, por isso cada edição anterior entra com o(s)
 *  escalão(ões) onde estavam ENTÃO — idade de hoje menos os anos de diferença
 *  (Boys 12 2026 ↔ Boys 11 2025; Boys 13-14 2026 ↔ Boys 12 e 13-14 2025). */
function uskidsRepeaterEditions(e: EscalaoResult, t: TorneioResult, edicoes: TorneioResult[], arMap?: Map<string, AutoRivalPlayer>): PastEdition[] {
  const faixa = idadesEscalao(e.nome);
  if (!faixa) return [];
  const sexo = divKey(e.nome).sex;
  const anoHoje = parseInt(isoDate(t.date_inicio).slice(0, 4), 10);
  const rows: { ed: PastEdition; stamp: string }[] = [];
  for (const ed of edicoes) {
    if (ed.t === t.t) continue;
    const dif = anoHoje - (parseInt(isoDate(ed.date_inicio).slice(0, 4), 10) || anoHoje);
    if (dif <= 0) continue;
    const [lo, hi] = [faixa[0] - dif, faixa[1] - dif];
    for (const esc of ed.escaloes) {
      const f = idadesEscalao(esc.nome);
      if (!f || divKey(esc.nome).sex !== sexo || f[1] < lo || f[0] > hi || !temDados(esc)) continue;
      const r = uskidsEdition(esc, ed, arMap, esc.nome);
      if (r) rows.push(r);
    }
  }
  return porData(rows);
}

// ─────────────────────────────────────────────
// ESCALÃO SECTION — o detalhe de torneio único (TournamentDetail), com os
// draws por volta («Draw R{n}» antes da volta n) pelo DrawTab partilhado.
// ─────────────────────────────────────────────
function EscalaoSection({ escalao: e, torneio: t, arMap, drawsData, edicoes }: {
  escalao: EscalaoResult;
  torneio: TorneioResult;
  arMap?: Map<string, AutoRivalPlayer>;
  drawsData?: UskidsDrawsData | null;
  /** O mesmo torneio noutros anos (incluindo este) — só com ≥2. */
  edicoes?: TorneioResult[] | null;
}) {
  const rondasComDados = e.rondas.filter(r => (r.leaderboard ?? r.jogadores ?? []).length > 0);

  // Draws do escalão (matching por t + age_group), só rondas com grupos.
  const roundDraws = useMemo(() => {
    const td = drawsData?.torneios.find(x => x.t === t.t);
    const de = td?.escaloes.find(x => x.age_group === e.age_group);
    return (de?.rondas ?? []).filter(r => (r.grupos || []).length > 0).map(dr => ({
      round: dr.ronda,
      render: () => <DrawTab draw={uskidsDrawToFpg(dr)} roundNum={dr.ronda} tournamentDate={t.date_inicio}
        results={uskidsRoundResults(e, dr.ronda)} hideCols={DRAW_HIDE} clubLabel="Cidade" />,
    }));
  }, [drawsData, t, e]);

  const tournament = useMemo(() => escalaoToTournament(e, t, arMap), [e, t, arMap]);
  // Escalão num campo diferente do do torneio (ex.: European Championship, um
  // campo por escalão): o campo vai para a linha de informação, junto do CR e
  // do Slope, em vez de uma linha solta por cima das abas (14/10/2026).
  const campo = tournament.campo || "";
  const campoProprio = !!campo && campo.trim() !== (t.campo || "").trim();
  const options = useMemo(() => ({ noInferBlanks: true, showCourse: campoProprio }), [campoProprio]);

  // «Edições anteriores» e «Quem repete», como nas outras secções.
  const extraTabs = useMemo(() => {
    if (!edicoes) return undefined;
    const tabs: { key: string; label: string; content: React.ReactNode }[] = [];
    const rows = uskidsPastEditions(e, edicoes, arMap);
    if (rows.length >= 2) tabs.push({ key: "past-editions", label: "Edições anteriores", content: <PastEditionsTable editions={rows} title={e.nome} /> });
    const rep = uskidsRepeaterEditions(e, t, edicoes, arMap);
    if (rep.length) {
      const field = tournament.players.filter(p => p.name).map(p => ({ name: p.name, club: p.club || null }));
      tabs.push({ key: "repeaters", label: "Quem repete", content: <PastEditionsRepeatersTable data={buildRepeaters(field, rep, String(t.t))} /> });
    }
    return tabs.length ? tabs : undefined;
  }, [edicoes, e, arMap, tournament, t]);

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

  if (!rondasComDados.length && roundDraws.length === 0) {
    return <EmptyState size="sm" message="Sem dados para este escalão." />;
  }

  // Notas sobre resultados (ex.: penalização do Manuel no Marco Simone 2026),
  // visíveis por cima das tabelas do escalão — 14/10/2026.
  const notas = [...new Map(e.rondas.flatMap(r => (r.leaderboard ?? r.jogadores ?? []))
    .filter(j => j._nota).map(j => [`${j.nome}|${j._nota}`, j] as const)).values()];

  return (
    <div>
      {notas.map(j => (
        <div key={j.nome + j._nota} className="notice" style={{ margin: "2px 0 6px", padding: "5px 10px" }}>
          ⚠️ <strong>{displayName(j.nome)}</strong> — {j._nota}
        </div>
      ))}
      {/* «rt»: a /uskids já usa «tab» para as abas da página. */}
      <TournamentDetail tournament={tournament} escLookup={new Map()} playersDB={kidsDB as unknown as TournamentDetailProps["playersDB"]}
        options={options} siLabel="m" hideHeader synthDraws={false} roundDraws={roundDraws} extraTabs={extraTabs} tabParam="rt" />
    </div>
  );
}

/** O Manuel jogou este escalão? Primeiro pelo NOME nas classificações (o mais
 *  fiável — o Paris 2026 abria no Boys 7 porque o escalão «esperado» pela idade
 *  não batia, 14/10/2026); sem ele, a marcação da fonte como antes. */
function escalaoTemManuel(e: EscalaoResult, t: TorneioResult, escalaoEsperado: number | null | undefined): boolean {
  if (e.rondas.some(r => (r.leaderboard ?? r.jogadores ?? []).some(j => isManuel(j.nome)))) return true;
  return t.escalao_manuel ? e.age_group === t.escalao_manuel : (e.is_manuel === true && e.age_group === escalaoEsperado);
}

function EscalaoTabs({ escaloes, torneio: t, defaultIdx, arMap, drawsData, edicoes }: {
  escaloes: EscalaoResult[];
  torneio: TorneioResult;
  defaultIdx: number;
  arMap?: Map<string, AutoRivalPlayer>;
  drawsData?: UskidsDrawsData | null;
  edicoes?: TorneioResult[] | null;
}) {
  const [esc, setEsc] = useState(defaultIdx);
  const escalaoEsperado = escalaoManuelParaData(t.date_inicio);

  const e = escaloes[esc];

  return (
    <div>
      {/* Barra de escalões — as mesmas pílulas «(N jog)» das outras secções
          (CircuitShell/FPG), 14/10/2026. A distância vai para o tooltip. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {escaloes.map((es, i) => {
          const isME = escalaoTemManuel(es, t, escalaoEsperado);
          const tInfo = TEES_LOOKUP[t.t]?.[es.age_group];
          const dist = tInfo?.metros?.length === 18
            ? tInfo.metros.reduce((a: number, b: number) => a + b, 0) : null;
          const ult = es.rondas[es.rondas.length - 1];
          const nJog = (ult?.leaderboard ?? ult?.jogadores ?? []).length;
          return (
            <button key={es.age_group} className={`tourn-tab tourn-tab-sm${esc === i ? " active" : ""}`} onClick={() => setEsc(i)}
              title={dist ? `${dist} m` : undefined}>
              {es.nome}
              {nJog > 0 && <span className="fs-10" style={{ marginLeft: 3, opacity: 0.8 }}>({nJog} jog)</span>}
              {isME && <span style={{ color: "var(--color-good)" }}> ★</span>}
            </button>
          );
        })}
      </div>
      {/* Conteúdo do escalão activo */}
      {e && <EscalaoSection key={e.age_group} escalao={e} torneio={t} arMap={arMap} drawsData={drawsData} edicoes={edicoes} />}
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
  // Edições anteriores que não estão nos resultados (2021–2026, montadas da
  // cache dos flights — scripts/build-uskids-edicoes-anteriores.js): o índice é
  // pequeno; cada edição só se carrega quando a prova dela está aberta.
  const familia = t ? tournamentFamilyKey(t.name) : null;
  const [indiceEdicoes, setIndiceEdicoes] = useState<{ t: number; name: string }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedFetchJson<{ torneios: { t: number; name: string }[] }>("/data/uskids-edicoes/index.json")
      .then(d => { if (vivo) setIndiceEdicoes(d?.torneios ?? []); })
      .catch(() => { if (vivo) setIndiceEdicoes([]); });
    return () => { vivo = false; };
  }, []);
  const [edicoesExtra, setEdicoesExtra] = useState<{ familia: string; lista: TorneioResult[] } | null>(null);
  useEffect(() => {
    if (!familia || !indiceEdicoes) return;
    const temos = new Set(data.resultados.map(r => r.t));
    const ts = indiceEdicoes.filter(x => !temos.has(x.t) && tournamentFamilyKey(x.name) === familia).map(x => x.t);
    if (!ts.length) { setEdicoesExtra({ familia, lista: [] }); return; }
    let vivo = true;
    Promise.all(ts.map(x => cachedFetchJson<TorneioResult>(`/data/uskids-edicoes/${x}.json`).catch(() => null)))
      .then(lista => {
        if (!vivo) return;
        const ok = lista.filter((x): x is TorneioResult => !!x);
        // As voltas vêm em jardas (como o uskids-results.json) → metros.
        for (const ed of ok) for (const esc of ed.escaloes ?? []) for (const rd of esc.rondas ?? []) {
          const yards = (rd as { yards?: number[] }).yards;
          if (!rd.metros?.length && yards?.length) rd.metros = yards.map(y => Math.round(y * 0.9144));
        }
        setEdicoesExtra({ familia, lista: ok });
      });
    return () => { vivo = false; };
  }, [familia, indiceEdicoes, data.resultados]);
  // O mesmo torneio noutros anos (Rome Classic 2025 ↔ 2026…), pelo nome sem ano.
  const edicoes = useMemo(() => {
    if (!familia) return null;
    const extra = edicoesExtra?.familia === familia ? edicoesExtra.lista : [];
    const sib = [...new Map([...data.resultados.filter(r => tournamentFamilyKey(r.name) === familia), ...extra].map(r => [r.t, r])).values()];
    return sib.length >= 2 ? sib : null;
  }, [data.resultados, familia, edicoesExtra]);


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
          {/* Links oficiais à direita, como nas outras secções. */}
          <TournExternalLinks t={t.t} />
        </div>
        <div className="detail-sub">
          <span className="muted">📅 {fmtDate(t.date_inicio)}{t.campo ? ` · ${t.campo}` : ""}</span>
          {fmtTs(t.ultima_atualizacao) && <span className="muted fs-11 ml-8">actualizado {fmtTs(t.ultima_atualizacao)}</span>}
        </div>
        {/* Resultados do Manuel em destaque */}
        {manuelRows.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
            {manuelRows.map((m, i) => {
              const toPar = m.to_par != null ? fmtToPar(m.to_par) : null;
              const liderStr = m.diffLider === 0 ? "líder"
                : m.diffLider != null ? `+${m.diffLider} do líder`
                : null;
              return (
                // Cor do Manuel (a mesma da pílula «★ Manuel» e da linha dele
                // nas tabelas), pequena — 14/10/2026: «estes botões estão
                // grandes e … deveriam ser da cor do manuel».
                <span key={i} className="p p-sm fw-700" style={{
                  background:"var(--bg-success-strong)", color:"var(--color-good-dark)",
                  borderColor:"var(--color-good)", display:"inline-flex", alignItems:"center", gap:4,
                }}>
                  <span>★</span>
                  <span>{m.escalao} · R{m.ronda} · {m.score}{toPar ? ` (${toPar})` : ""}</span>
                  {liderStr && <span className="fw-400" style={{ opacity:.8 }}>· {liderStr}</span>}
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
        const manuelIdx = escaloes.findIndex(e => escalaoTemManuel(e, t, escalaoEsperado));
        return <EscalaoTabs escaloes={escaloes} torneio={t} defaultIdx={manuelIdx >= 0 ? manuelIdx : 0} arMap={arMap} drawsData={drawsData} edicoes={edicoes} />;
      })()}

      {/* ── Greatgolf Junior Open ── */}
      {greatgolfData && <SecaoGreatgolf data={greatgolfData} />}
    </div>
  );
}

export default TabResultados;
;
