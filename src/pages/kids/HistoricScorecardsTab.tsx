/**
 * pages/kids/HistoricScorecardsTab.tsx
 *
 * Tab "Scorecards" do FieldRivaisDashboard.
 *
 * UMA tabela contínua (não uma por ano) que mostra, para cada edição passada
 * do MESMO torneio+escalão, os top-N finishers com strokes hole-by-hole por
 * ronda. Visual idêntico ao de FPGPage/DrivePage (classes `sc-lb`).
 *
 * Controlos globais:
 *   • Top-N: 5 / 10 / 20 / Todos (default 10)
 *   • Modo:  Agrupado (1 jogador × N rondas com rowspan no nome) |
 *            Independente (1 linha por (jogador, ronda), ordenado por ±par)
 *
 * Colunas: # | Jogador | País | R | ± | Tot | B1..9 | Out | B10..18 | In | 🐦 | Par | ■
 * SD não aparece porque o slim não tem slope/CR para os calcular.
 *
 * Dados: uskids-member-history-slim.json (apenas USKids; WJGC/Doral/EOWAGR
 * mostram mensagem porque os tids correspondentes não têm strokes[]).
 */
import { useMemo, useState } from "react";
import { scClass } from "../../utils/scoreDisplay";
import { fmtToPar } from "../../utils/format";

interface FieldEscalao { nome: string; jogadores?: unknown[] }
interface FieldTorneio { t: number; name: string; date_inicio: string; escaloes: FieldEscalao[] }

interface MHRound { gross: number; strokes?: number[] }
interface MHTorn { ageGroup: string; place: number | null; rounds: Record<string, MHRound> }
interface MHPlr { name: string; country: string; torneios: Record<string, MHTorn> }
interface MHEscalaoMeta { course?: string; yards?: number[]; par?: number[] }
interface MHSlim {
  torneios: Record<string, {
    name: string;
    startDate: string;
    holesPerRound: number;
    par: number[] | null;
    yards?: number[] | null;
    byEscalao?: Record<string, MHEscalaoMeta>;
  }>;
  jogadores: Record<string, MHPlr>;
}

interface PlayerRound {
  rn: number;
  gross: number;
  strokes: number[];
  toPar: number;     // gross - parPerRound
  birds: number;
  pars: number;
  bogeys: number;    // bogey strokes-only (NOT including double+)
  worse: number;     // double bogey ou pior (qualquer +2 ou mais)
  out: number;       // soma front 9
  inn: number;       // soma back 9 (0 se torneio 9H)
}
interface PlayerCard {
  memberId: string;
  name: string;
  country: string;
  officialPlace: number | null;
  total: number;
  rounds: PlayerRound[];
}
interface Edition {
  tcode: string;
  name: string;
  year: string;
  course?: string;
  par: number[] | null;
  parPerRound: number;
  parF9: number;
  parB9: number;
  holesPerRound: number;
  is9: boolean;
  nRoundsMax: number;
  fieldSize: number;
  meters?: number;
  players: PlayerCard[];
}

const MIN_FIELD_SIZE = 10;
const MIN_GROSS_18H = 55;
const MIN_GROSS_9H = 28;

/** Conta birdies/pars/bogeys/worse num scorecard. */
function tallyHoles(strokes: number[], par: number[] | null): { birds: number; pars: number; bogeys: number; worse: number } {
  let birds = 0, pars = 0, bogeys = 0, worse = 0;
  if (!par) return { birds, pars, bogeys, worse };
  for (let i = 0; i < strokes.length; i++) {
    const g = strokes[i];
    const p = par[i];
    if (!g || g <= 0 || !p || p <= 0) continue;
    const d = g - p;
    if (d <= -1) birds++;
    else if (d === 0) pars++;
    else if (d === 1) bogeys++;
    else worse++;
  }
  return { birds, pars, bogeys, worse };
}

export default function HistoricScorecardsTab({ mh, torneio, escalaoNome }: {
  mh: MHSlim | null;
  torneio: FieldTorneio | null;
  escalaoNome: string;
}) {
  const [topN, setTopN] = useState<5 | 10 | 20 | 0>(10); // 0 = todos
  const [groupMode, setGroupMode] = useState<boolean>(true); // true = Agrupado

  const editions: Edition[] | null = useMemo(() => {
    if (!mh || !torneio) return null;
    if (torneio.t < 0) return [];
    const baseName = torneio.name.replace(/\s+\d{4}\s*$/, "").trim();
    if (!baseName) return [];

    const out: Edition[] = [];
    for (const [tcode, meta] of Object.entries(mh.torneios)) {
      if (!meta?.name) continue;
      if (/Parent\/Child/i.test(meta.name)) continue;
      const mBase = meta.name.replace(/\s+\d{4}\s*$/, "").trim();
      if (mBase !== baseName) continue;
      const yearMatch = meta.name.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = yearMatch[1];
      const hpr = (meta as any).holesPerRound || 18;
      const is9 = hpr === 9;
      const minGross = is9 ? MIN_GROSS_9H : MIN_GROSS_18H;

      const escMeta = (meta as any).byEscalao?.[escalaoNome] as MHEscalaoMeta | undefined;
      const par = escMeta?.par || (meta as any).par || null;
      const yards = escMeta?.yards || (meta as any).yards || null;
      const parPerRound = Array.isArray(par)
        ? par.slice(0, hpr).reduce((a: number, b: number) => a + (b || 0), 0)
        : 0;
      const parF9 = Array.isArray(par) ? par.slice(0, Math.min(9, hpr)).reduce((a, b) => a + (b || 0), 0) : 0;
      const parB9 = Array.isArray(par) && !is9 ? par.slice(9, 18).reduce((a, b) => a + (b || 0), 0) : 0;

      const yardsTotal = Array.isArray(yards)
        ? yards.slice(0, hpr).reduce((a: number, b: number) => a + (b || 0), 0)
        : 0;
      const meters = yardsTotal > 0 ? Math.round(yardsTotal * 0.9144) : undefined;

      const players: PlayerCard[] = [];
      let nRoundsMax = 0;
      for (const [mid, p] of Object.entries(mh.jogadores)) {
        const tEntry = p.torneios[tcode];
        if (!tEntry) continue;
        if (tEntry.ageGroup !== escalaoNome) continue;
        const officialPlace = (typeof tEntry.place === "number" && tEntry.place > 0) ? tEntry.place : null;
        const rds: PlayerRound[] = [];
        let total = 0;
        for (const [rn, r] of Object.entries(tEntry.rounds || {})) {
          if (!r || r.gross <= 0) continue;
          if (r.gross < minGross) continue;
          const strokes = Array.isArray(r.strokes) ? r.strokes.slice() : [];
          const t = tallyHoles(strokes, par);
          const out9 = strokes.slice(0, Math.min(9, hpr)).reduce((a, b) => a + (b || 0), 0);
          const in9 = !is9 ? strokes.slice(9, 18).reduce((a, b) => a + (b || 0), 0) : 0;
          rds.push({
            rn: parseInt(rn, 10),
            gross: r.gross,
            strokes,
            toPar: parPerRound > 0 ? r.gross - parPerRound : 0,
            birds: t.birds,
            pars: t.pars,
            bogeys: t.bogeys,
            worse: t.worse,
            out: out9,
            inn: in9,
          });
          total += r.gross;
        }
        if (rds.length === 0) continue;
        rds.sort((a, b) => a.rn - b.rn);
        if (rds.length > nRoundsMax) nRoundsMax = rds.length;
        players.push({
          memberId: mid,
          name: p.name || "?",
          country: p.country || "",
          officialPlace,
          total,
          rounds: rds,
        });
      }
      const completed = players.filter(pl => pl.rounds.length === nRoundsMax);
      if (completed.length < MIN_FIELD_SIZE) continue;

      const placedEntries = completed.filter(e => e.officialPlace != null);
      if (placedEntries.length > 0) {
        const maxOfficialPlace = Math.max(...placedEntries.map(e => e.officialPlace!));
        const coverage = placedEntries.length / maxOfficialPlace;
        if (coverage < 0.8) continue;
      }

      completed.sort((a, b) => {
        const aOff = a.officialPlace ?? Number.POSITIVE_INFINITY;
        const bOff = b.officialPlace ?? Number.POSITIVE_INFINITY;
        if (aOff !== bOff) return aOff - bOff;
        return a.total - b.total;
      });

      out.push({
        tcode, name: meta.name, year,
        course: escMeta?.course,
        par: Array.isArray(par) ? par : null,
        parPerRound, parF9, parB9,
        holesPerRound: hpr,
        is9,
        nRoundsMax,
        fieldSize: completed.length,
        meters,
        players: completed,
      });
    }
    out.sort((a, b) => b.year.localeCompare(a.year));
    return out;
  }, [mh, torneio, escalaoNome]);

  if (!torneio) {
    return <div className="muted p-16">Sem torneio selecionado.</div>;
  }
  if (editions === null) {
    return <div className="muted p-16">A carregar histórico…</div>;
  }
  if (editions.length === 0) {
    return (
      <div className="muted p-16">
        Sem scorecards hole-by-hole disponíveis para esta combinação. Esta vista
        funciona apenas com edições USKids cobertas pelo member-history-slim
        (≥ {MIN_FIELD_SIZE} finishers, ≥ 80% de cobertura do field oficial).
      </div>
    );
  }

  // Todas as edições têm 18H? (assume 18H se qualquer uma for; misturar 9H+18H
  // não acontece neste contexto — same torneio = same nº de buracos)
  const is9 = editions[0]?.is9 ?? false;
  const hpr = editions[0]?.holesPerRound ?? 18;

  // Total de scorecards/jogadores mostrados (respeitando top-N)
  const limit = topN === 0 ? Infinity : topN;
  const totalPlayers = editions.reduce((a, e) => a + Math.min(limit, e.players.length), 0);
  const totalScorecards = editions.reduce((a, e) => a + Math.min(limit, e.players.length) * e.nRoundsMax, 0);

  return (
    <div>
      {/* Toolbar topo: top-N + Agrupado/Independente */}
      <div
        className="muted fs-11 mb-8 p-0-4px gap-8 flex-wrap"
        style={{ display: "flex", alignItems: "center" }}
      >
        <span>
          {groupMode ? totalPlayers : totalScorecards} {groupMode ? "jogadores" : "scorecards"} ·
          {" "}{editions.length} edi{editions.length === 1 ? "ção" : "ções"}
        </span>

        {/* Top-N selector */}
        <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <span className="c-muted fs-10">Top:</span>
          <span
            style={{
              display: "flex", gap: 2,
              border: "1px solid var(--border)",
              borderRadius: 8, overflow: "hidden",
            }}
          >
            {([5, 10, 20, 0] as const).map(n => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className="fs-10"
                style={{
                  padding: "2px 9px",
                  border: "none",
                  cursor: "pointer",
                  background: topN === n ? "var(--accent)" : "transparent",
                  color: topN === n ? "#fff" : "var(--text-muted)",
                  fontWeight: topN === n ? 700 : 400,
                }}
              >
                {n === 0 ? "Todos" : n}
              </button>
            ))}
          </span>
        </span>

        {/* Toggle Agrupado/Independente — copia visual exacto de AllRoundsScorecardLB */}
        <span
          style={{
            display: "flex", gap: 2, marginLeft: 4,
            border: "1px solid var(--border)",
            borderRadius: 8, overflow: "hidden",
          }}
        >
          {([true, false] as const).map(g => (
            <button
              key={String(g)}
              onClick={() => setGroupMode(g)}
              className="fs-10"
              style={{
                padding: "2px 9px",
                border: "none",
                cursor: "pointer",
                background: groupMode === g ? "var(--accent)" : "transparent",
                color: groupMode === g ? "#fff" : "var(--text-muted)",
                fontWeight: groupMode === g ? 700 : 400,
              }}
            >
              {g ? "Agrupado" : "Independente"}
            </button>
          ))}
        </span>
      </div>

      <div className="bjgt-chart-scroll">
        <table className="sc-lb sc-lb-with-sc" data-sc-table="1">
          <thead>
            <tr>
              <th className="lb-pos sticky-col-0">#</th>
              <th className="lb-name sticky-col-1" style={{ maxWidth: 140 }}>Jogador</th>
              <th className="lb-club">País</th>
              <th className="lb-tee fs-10 c-muted fw-600">Rnd</th>
              <th className="lb-topar">±</th>
              <th className="lb-gross">Tot</th>
              {Array.from({ length: Math.min(9, hpr) }, (_, h) => (
                <th key={h} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "") + " fs-10"}>
                  {h + 1}
                </th>
              ))}
              <th className="lb-halftot">{is9 ? "Tot" : "Out"}</th>
              {!is9 && (
                <>
                  {Array.from({ length: 9 }, (_, h) => (
                    <th key={h + 9} className={"lb-hole" + (h === 0 ? " lb-hole-first" : "") + " fs-10"}>
                      {h + 10}
                    </th>
                  ))}
                  <th className="lb-halftot">In</th>
                </>
              )}
              <th className="lb-bird">🐦</th>
              <th className="lb-par-stat">Par</th>
              <th className="lb-bog">■</th>
            </tr>
          </thead>
          <tbody>
            {editions.map((ed, edIdx) => {
              const players = ed.players.slice(0, limit);
              return (
                <EditionRows
                  key={ed.tcode}
                  edition={ed}
                  players={players}
                  groupMode={groupMode}
                  hpr={hpr}
                  is9={is9}
                  isFirst={edIdx === 0}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Banner + PAR row + linhas dos jogadores de UMA edição. */
function EditionRows({ edition: ed, players, groupMode, hpr, is9, isFirst }: {
  edition: Edition;
  players: PlayerCard[];
  groupMode: boolean;
  hpr: number;
  is9: boolean;
  isFirst: boolean;
}) {
  // Colspan total: pos(1) + nome(1) + país(1) + R(1) + ±(1) + Tot(1)
  //              + buracos(9) + Out(1) + (back 9 + In, se 18H)
  //              + 🐦 + Par + ■ = 6 + 10 + (is9 ? 0 : 10) + 3
  // Total cols = 19 (se 9H) ou 29 (se 18H).
  const totalCols = 6 + (is9 ? 10 : 20) + 3;

  // Para o ranking dos players no modo agrupado
  return (
    <>
      {/* Banner da edição */}
      <tr style={{ background: "var(--bg-muted)", borderTop: isFirst ? undefined : "3px solid var(--border)" }}>
        <td
          colSpan={totalCols}
          style={{
            padding: "6px 10px",
            fontSize: 12, fontWeight: 700, color: "var(--text)",
            position: "sticky", left: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800 }}>{ed.year}</span>
          {ed.course && (
            <span style={{ fontSize: 12, color: "var(--text-2)", fontStyle: "italic", fontWeight: 500, marginLeft: 8 }}>
              {ed.course}
            </span>
          )}
          {ed.meters != null && (
            <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600, marginLeft: 8 }}>
              · {ed.meters}m
            </span>
          )}
          {ed.parPerRound > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600, marginLeft: 8 }}>
              · Par {ed.parPerRound}
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8 }}>
            · {ed.nRoundsMax} rondas · field {ed.fieldSize}
          </span>
          {/^\d+$/.test(ed.tcode) && (
            <a href={`https://www.signupanytime.com/plugins/links/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t=${ed.tcode}`}
               target="_blank" rel="noreferrer"
               style={{ fontSize: 11, color: "var(--color-info)", fontWeight: 700, textDecoration: "none", marginLeft: 6 }}>
              ↗
            </a>
          )}
        </td>
      </tr>

      {/* Linha PAR específica da edição */}
      {ed.par && (
        <tr className="lb-par-row">
          <td className="sticky-col-0" />
          <td className="lb-par-lbl sticky-col-1" colSpan={4}>PAR</td>
          <td className="lb-topar" />
          <td className="lb-gross">{ed.parPerRound}</td>
          {ed.par.slice(0, Math.min(9, hpr)).map((v, i) => (
            <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>
          ))}
          <td className="lb-halftot">{ed.parF9}</td>
          {!is9 && ed.par.slice(9, 18).map((v, i) => (
            <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>{v}</td>
          ))}
          {!is9 && <td className="lb-halftot">{ed.parB9}</td>}
          <td /><td /><td />
        </tr>
      )}

      {/* Jogadores */}
      {groupMode
        ? players.map((pl, idx) => (
            <GroupedPlayer key={pl.memberId} player={pl} idx={idx} ed={ed} hpr={hpr} is9={is9} />
          ))
        : (() => {
            // Modo independente: aplanar TODAS as rondas dos jogadores e ordenar
            // por toPar ASC. Mantém os jogadores cuja ronda é mostrada — não
            // mais que `limit` linhas por jogador (já filtrado).
            interface Flat { pl: PlayerCard; r: PlayerRound }
            const flat: Flat[] = [];
            for (const pl of players) {
              for (const r of pl.rounds) flat.push({ pl, r });
            }
            flat.sort((a, b) => a.r.toPar - b.r.toPar || a.r.gross - b.r.gross);
            return flat.map((f, idx) => (
              <IndependentRow key={f.pl.memberId + "_" + f.r.rn} f={f} pos={idx + 1} ed={ed} hpr={hpr} is9={is9} />
            ));
          })()
      }
    </>
  );
}

function fmtCountry(c: string): string {
  if (!c) return "—";
  // Strings curtas (2-3 chars) já estão no formato ISO, mostrar uppercase.
  if (c.length <= 3) return c.toUpperCase();
  return c;
}

function GroupedPlayer({ player, idx, ed, hpr, is9 }: {
  player: PlayerCard;
  idx: number;
  ed: Edition;
  hpr: number;
  is9: boolean;
}) {
  const rowBg = idx % 2 === 0 ? undefined : "var(--bg-muted)";
  const subBg = rowBg
    ? "color-mix(in srgb,var(--bg-muted) 60%,transparent)"
    : "var(--bg-muted-alt,rgba(0,0,0,.02))";
  const displayPos = player.officialPlace ?? null;
  const posStr = displayPos != null ? String(displayPos) : String(idx + 1);

  return (
    <>
      {player.rounds.map((r, ri) => {
        const isFirstRd = ri === 0;
        const bg = isFirstRd ? rowBg : subBg;
        const bTop = isFirstRd ? "2px solid var(--border)" : undefined;
        return (
          <tr key={r.rn} style={{ background: bg, borderTop: bTop }}>
            <td className="lb-pos sticky-col-0" style={{ background: bg, borderTop: bTop }}>
              {isFirstRd ? posStr : ""}
            </td>
            <td className="lb-name sticky-col-1"
                style={{ background: bg, fontWeight: isFirstRd ? 600 : 400, borderTop: bTop, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isFirstRd ? (
                <a href={`/kids2#${encodeURIComponent(player.name)}`}
                   target="_blank" rel="noreferrer"
                   style={{ color: "var(--text)", textDecoration: "none" }}
                   title={`Abrir ${player.name} em Kids2`}>
                  {player.name}
                </a>
              ) : (
                <span className="muted fs-10" style={{ paddingLeft: 8 }}>↳</span>
              )}
            </td>
            <td className="lb-club"
                style={{ borderTop: bTop, color: isFirstRd ? undefined : "var(--text-muted)", fontSize: isFirstRd ? undefined : 11 }}>
              {isFirstRd ? fmtCountry(player.country) : ""}
            </td>
            <td className="lb-tee fw-600 fs-10 c-muted" style={{ borderTop: bTop }}>R{r.rn}</td>
            <td className="lb-topar"
                style={{ color: r.toPar < 0 ? "var(--color-good)" : r.toPar > 0 ? "var(--color-danger)" : "var(--text)", borderTop: bTop }}>
              {ed.parPerRound > 0 ? fmtToPar(r.toPar) : "—"}
            </td>
            <td className="lb-gross" style={{ borderTop: bTop }}>{r.gross}</td>
            <ScorecardCells r={r} ed={ed} hpr={hpr} is9={is9} />
            <td className="lb-bird" style={{ borderTop: bTop }}>{r.birds || ""}</td>
            <td className="lb-par-stat" style={{ borderTop: bTop }}>{r.pars || ""}</td>
            <td className="lb-bog" style={{ borderTop: bTop }}>{r.bogeys || ""}</td>
          </tr>
        );
      })}
    </>
  );
}

function IndependentRow({ f, pos, ed, hpr, is9 }: {
  f: { pl: PlayerCard; r: PlayerRound };
  pos: number;
  ed: Edition;
  hpr: number;
  is9: boolean;
}) {
  const bg = pos % 2 === 1 ? undefined : "var(--bg-muted)";
  const bTop = "1px solid var(--border-light)";
  return (
    <tr style={{ background: bg, borderTop: bTop }}>
      <td className="lb-pos sticky-col-0" style={{ background: bg }}>{pos}</td>
      <td className="lb-name sticky-col-1 fw-600"
          style={{ background: bg, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <a href={`/kids2#${encodeURIComponent(f.pl.name)}`}
           target="_blank" rel="noreferrer"
           style={{ color: "var(--text)", textDecoration: "none" }}>
          {f.pl.name}
        </a>
      </td>
      <td className="lb-club">{fmtCountry(f.pl.country)}</td>
      <td className="lb-tee fw-600 fs-10 c-muted">R{f.r.rn}</td>
      <td className="lb-topar"
          style={{ color: f.r.toPar < 0 ? "var(--color-good)" : f.r.toPar > 0 ? "var(--color-danger)" : "var(--text)" }}>
        {ed.parPerRound > 0 ? fmtToPar(f.r.toPar) : "—"}
      </td>
      <td className="lb-gross">{f.r.gross}</td>
      <ScorecardCells r={f.r} ed={ed} hpr={hpr} is9={is9} />
      <td className="lb-bird">{f.r.birds || ""}</td>
      <td className="lb-par-stat">{f.r.pars || ""}</td>
      <td className="lb-bog">{f.r.bogeys || ""}</td>
    </tr>
  );
}

/** Células de score B1..B18 com Out/In. Usa scClass para coloração. */
function ScorecardCells({ r, ed, hpr, is9 }: {
  r: PlayerRound;
  ed: Edition;
  hpr: number;
  is9: boolean;
}) {
  const par = ed.par || [];
  const front = r.strokes.slice(0, Math.min(9, hpr));
  const back = !is9 ? r.strokes.slice(9, 18) : [];
  return (
    <>
      {front.map((sc, i) => (
        <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
          <span className={"sc-score " + scClass(sc, par[i] ?? null)}>{sc || ""}</span>
        </td>
      ))}
      <td className="lb-halftot">
        {r.out} <span className="fs-10 c-text-3">({fmtToPar(r.out - ed.parF9)})</span>
      </td>
      {!is9 && (
        <>
          {back.map((sc, i) => (
            <td key={i} className={"lb-hole" + (i === 0 ? " lb-hole-first" : "")}>
              <span className={"sc-score " + scClass(sc, par[9 + i] ?? null)}>{sc || ""}</span>
            </td>
          ))}
          <td className="lb-halftot">
            {r.inn} <span className="fs-10 c-text-3">({fmtToPar(r.inn - ed.parB9)})</span>
          </td>
        </>
      )}
    </>
  );
}
