/**
 * TeamStrokeStandings — classificação de EQUIPAS em stroke play, peça
 * partilhada (fase 6 do plano, 23/10/2026). Substitui o ClubesGruposView, o
 * ClubesCategoriasView e o DriveEquipasTab; os dados vêm de
 * `src/data/teamStroke.ts` (as mesmas contas que essas vistas faziam).
 *
 * Três vistas:
 *   • Cartões  — um cartão por equipa (o aspecto das vistas de clubes);
 *   • Lista    — uma linha por equipa, que se abre nos jogadores;
 *   • Jogadores — todos os jogadores numa tabela (filtro por equipa).
 * Numa só categoria, «Grupo · R1 · R2 · Total» escolhe a volta (e os 🐦○■).
 * Tudo ordenável. A de pontos (match play) continua na TeamPointsStandings.
 */
import React, { useMemo, useState } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../SortableHdr";
import { EscPill } from "../PillBadge";
import { medal, fmtToPar } from "../../utils/format";
import { isManuelByName, MANUEL_FED } from "../../constants/manuel";
import type { TsModel, TsTeam, TsCat, TsPlayer, Bpb } from "../../data/teamStroke";

type View = "cartoes" | "lista" | "jogadores";
/** Volta escolhida (uma categoria): grupo = ordem das letras + 🐦○■ de todas as voltas. */
type RoundSel = "grupo" | "total" | number;

const tdC: React.CSSProperties = { padding: "5px 6px", fontSize: "var(--fs-12)", textAlign: "center", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };
const tdL: React.CSSProperties = { ...tdC, textAlign: "left" };
const thC: React.CSSProperties = { ...tdC, fontWeight: 700, fontSize: "var(--fs-11)", color: "var(--text-muted)", background: "var(--bg-muted)", textTransform: "uppercase", letterSpacing: "0.04em" };

const tpTxt = (tp: number | null | undefined) => (tp == null ? "" : tp === 0 ? "PAR" : tp > 0 ? `+${tp}` : String(tp));
const isEu = (p: TsPlayer) => (p.fed ? p.fed === MANUEL_FED : isManuelByName(p.name));
const sumBpb = (xs: (Bpb | null)[]): Bpb | null => {
  const ok = xs.filter((x): x is Bpb => !!x);
  return ok.length ? ok.reduce((a, b) => ({ bir: a.bir + b.bir, par: a.par + b.par, bog: a.bog + b.bog }), { bir: 0, par: 0, bog: 0 }) : null;
};

/** Valor da equipa que ordena e classifica (pancadas ou ±par). */
function teamVal(c: TsCat, model: TsModel, ri: number | null): number | null {
  if (ri != null) return model.rankBy === "toPar" ? c.rdToPar[ri] : c.rdTotals[ri];
  return model.rankBy === "toPar" ? c.toPar : c.total;
}

/* ── Nome do jogador (link à ficha FPG quando há) ── */
function PName({ p }: { p: TsPlayer }) {
  const txt = p.link && p.fed
    ? <a href={`/jogadores/${p.fed}`} target="_blank" rel="noopener noreferrer" className="td-none" style={{ color: "inherit" }}
        onClick={e => e.stopPropagation()}>{p.name}</a>
    : <>{p.name}</>;
  if (!p.esc) return txt;
  return (
    <span style={{ display: "grid", gridTemplateColumns: "94px 1fr", alignItems: "center", columnGap: 6 }}>
      <span style={{ whiteSpace: "nowrap" }}><EscPill esc={p.esc} /></span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txt}</span>
    </span>
  );
}

/* ── Gross (±par) de uma volta; os que contam a cheio, na cor da equipa ── */
function ScoreCell({ r, color }: { r: TsPlayer["rds"][number]; color: string }) {
  if (r.gross == null && r.toPar == null) return <td style={{ ...tdC, color: "var(--text-muted)" }}><span style={{ opacity: 0.4 }}>–</span></td>;
  return (
    <td style={{ ...tdC, fontWeight: r.counts ? 700 : 400, color: r.counts ? color : "var(--text)", padding: "4px 4px" }}>
      <div style={{ lineHeight: 1.2 }}>
        <div>{r.gross ?? "—"}</div>
        {r.toPar != null && (
          <div style={{ fontSize: "var(--fs-9)", lineHeight: 1, color: r.counts ? color : "var(--text-muted)", opacity: r.counts ? 0.85 : 0.65 }}>
            ({fmtToPar(r.toPar)})
          </div>
        )}
      </div>
    </td>
  );
}

type PKey = "nome" | "hcp" | "bur" | "tot" | "conta" | `r${number}`;

/** Jogadores de uma equipa (ou categoria): a mesma tabela nos cartões e na lista. */
function PlayersTable({ cat, model, color, cols, bpbMode, showTotal }: {
  cat: TsCat; model: TsModel; color: string;
  /** Índices das voltas visíveis. */
  cols: number[];
  /** 🐦○■ de uma volta (índice) ou de todas («all»). */
  bpbMode: number | "all" | null;
  showTotal: boolean;
}) {
  const { sortKey, sortDir, toggleSort } = useSort<PKey>(model.playerSort ?? (model.showConta ? "r0" : "nome"), "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const v = (p: TsPlayer): number | string => {
      if (sortKey === "nome") return p.name;
      if (sortKey === "hcp") return p.hcpSort ?? 999;
      if (sortKey === "bur") return p.holes ?? INF;
      if (sortKey === "tot") return p.total ?? INF;
      if (sortKey === "conta") return p.conta ? 0 : 1;
      const ri = parseInt(sortKey.slice(1), 10);
      const r = p.rds[ri];
      return (model.rankBy === "toPar" ? r?.toPar : r?.gross) ?? INF;
    };
    return [...cat.players].sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number));
    });
  }, [cat.players, sortKey, sortDir, model.rankBy]);
  const hdr = (k: PKey, label: React.ReactNode, style?: React.CSSProperties, title?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} title={title} style={{ ...thC, cursor: "pointer", ...style }}>{label}</SortableHdr>
  );
  const bpbOf = (p: TsPlayer) => (bpbMode === "all" ? sumBpb(p.rds.map(r => r.bpb)) : bpbMode != null ? p.rds[bpbMode]?.bpb ?? null : null);
  const footBpb = bpbMode != null ? sumBpb(cat.players.map(bpbOf)) : null;
  const withFooter = model.rankBy !== "toPar";
  return (
    <table className="w-full" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {hdr("nome", "Jogador", { textAlign: "left", paddingLeft: 10 })}
          {model.showHcp && hdr("hcp", "HCP")}
          {model.showHoles && hdr("bur", "Bur.", undefined, "Sub-10 joga 9 buracos")}
          {cols.map(ri => hdr(`r${ri}`, model.rankBy === "toPar" ? "Gross" : `R${model.rounds[ri]}`))}
          {bpbMode != null ? (<>
            <th style={{ ...thC, color: "var(--color-good)", borderLeft: "1px solid var(--border)" }}>🐦</th>
            <th style={{ ...thC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>○</th>
            <th style={{ ...thC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>■</th>
          </>) : showTotal && hdr("tot", "Tot.")}
          {model.showConta && hdr("conta", "Conta", undefined, "Entra no total da equipa")}
        </tr>
      </thead>
      <tbody>
        {rows.map(p => {
          const b = bpbOf(p);
          return (
            <tr key={p.key} className={isEu(p) ? "row-manuel" : undefined}>
              <td style={{ ...tdL, paddingLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: p.hasScore ? "var(--text)" : "var(--text-muted)", fontWeight: p.hasScore ? 500 : 400, opacity: p.hasScore ? 1 : 0.55 }}>
                <PName p={p} />
              </td>
              {model.showHcp && <td style={{ ...tdC, color: "var(--text-muted)", opacity: p.hasScore || model.multiCat ? 1 : 0.55 }}>{p.hcp}</td>}
              {model.showHoles && <td style={tdC}>{p.holes ?? "–"}</td>}
              {cols.map(ri => <ScoreCell key={ri} r={p.rds[ri]} color={color} />)}
              {bpbMode != null ? (<>
                <td style={{ ...tdC, color: "var(--color-good)", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>{b ? (b.bir || "") : "–"}</td>
                <td style={{ ...tdC, color: "var(--text-3)", borderLeft: "1px solid var(--border-light)" }}>{b ? (b.par || "") : "–"}</td>
                <td style={{ ...tdC, color: "var(--color-danger)", borderLeft: "1px solid var(--border-light)" }}>{b ? (b.bog || "") : "–"}</td>
              </>) : showTotal && <td style={{ ...tdC, fontWeight: 500, color: p.hasScore ? "var(--text)" : "var(--text-muted)" }}>{p.total ?? "–"}</td>}
              {model.showConta && <td style={tdC}>{p.conta ? "✓" : ""}</td>}
            </tr>
          );
        })}
      </tbody>
      {withFooter && (
        <tfoot>
          <tr style={{ background: model.footerAll ? color : "var(--accent-light, #eef6ef)" }}>
            <td colSpan={1 + (model.showHcp ? 1 : 0) + (model.showHoles ? 1 : 0)} style={{ ...tdL, paddingLeft: 10, fontWeight: model.footerAll ? 600 : 700, fontSize: "var(--fs-10)",
              textTransform: "uppercase", letterSpacing: "0.04em", color: model.footerAll ? "rgba(255,255,255,0.85)" : "var(--text-2)" }}>
              {cat.footerLabel}
            </td>
            {cols.map(ri => {
              // Uma categoria: soma de todos os jogadores; com categorias: o total da equipa (best-N).
              const v = model.footerAll ? cat.rdSumsAll[ri] : cat.rdTotals[ri];
              return <td key={ri} style={{ ...tdC, borderBottom: "none", fontWeight: model.footerAll ? 600 : 700, color: model.footerAll ? "#fff" : undefined }}>{v ?? "–"}</td>;
            })}
            {bpbMode != null ? (<>
              <td style={{ ...tdC, color: "#fff", fontWeight: 600, borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", opacity: 0.9 }}>{footBpb ? (footBpb.bir || "") : "–"}</td>
              <td style={{ ...tdC, color: "#fff", borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{footBpb ? (footBpb.par || "") : "–"}</td>
              <td style={{ ...tdC, color: "#fff", borderBottom: "none", borderLeft: "1px solid rgba(255,255,255,0.2)", opacity: 0.8 }}>{footBpb ? (footBpb.bog || "") : "–"}</td>
            </>) : showTotal && (
              model.footerAll ? (() => {
                const vs = cols.map(ri => cat.rdSumsAll[ri]);
                const grand = vs.every(v => v != null) ? (vs as number[]).reduce((s, v) => s + v, 0) : null;
                return <td style={{ ...tdC, color: "#fff", fontWeight: 700, borderBottom: "none" }}>{grand ?? "–"}</td>;
              })() : (
                <td style={{ ...tdC, fontWeight: 900, borderBottom: "none" }}>
                  <div style={{ lineHeight: 1.15 }}>
                    <div>{cat.total ?? "–"}</div>
                    {cat.toPar != null && <div style={{ fontSize: "var(--fs-9)", lineHeight: 1, opacity: 0.7 }}>({fmtToPar(cat.toPar)})</div>}
                  </div>
                </td>
              )
            )}
            {model.showConta && <td style={{ ...tdC, borderBottom: "none" }} />}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/* ── Cartões ─────────────────────────────────────────────────────── */
function TeamCard({ team, model, sel }: { team: TsTeam; model: TsModel; sel: RoundSel }) {
  const c0 = team.cats[0];
  const ri = typeof sel === "number" ? model.rounds.indexOf(sel) : null;
  const allCols = model.rounds.map((_, i) => i);
  const single = !model.multiCat;
  const cols = single ? (sel === "grupo" && model.rounds.length > 1 && model.showBpb ? [] : ri != null ? [ri] : allCols) : allCols;
  const bpbMode: number | "all" | null = !single || !model.showBpb ? null : ri != null ? ri : sel === "grupo" && model.rounds.length > 1 ? "all" : null;
  const disp = single && c0 ? (ri != null ? teamVal(c0, model, ri) : teamVal(c0, model, null)) : null;
  const dispTp = single && c0 ? (ri != null ? c0.rdToPar[ri] : c0.toPar) : null;
  const mdl = c0?.pos != null ? medal(c0.pos) : null;
  return (
    <div style={{
      background: "var(--bg-card,#fff)", border: `1px solid ${team.isMulti ? team.color + "80" : "var(--border)"}`,
      borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    }}>
      <div style={{ background: team.color, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        {model.showLetter && team.letter && (
          <div className="shrink-0 fw-900" style={{ width: 34, height: 34, background: "rgba(255,255,255,0.18)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-20)", lineHeight: 1 }}>
            {team.letter}
          </div>
        )}
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="fs-12 fw-700 overflow-hidden" style={{ lineHeight: 1.3, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
          {team.sub && <div className="fs-10 fw-600 mt-1" style={{ opacity: 0.8 }}>{team.sub}</div>}
        </div>
        {/* Uma categoria: lugar + total (ou a volta escolhida). Com categorias o
            lugar vive em cada categoria (são campeonatos à parte). */}
        {single && c0?.pos != null && disp != null && (
          <div className="shrink-0 ta-right">
            <div className="fs-10" style={{ opacity: 0.85, lineHeight: 1, marginBottom: 2 }}>{ri != null ? `R${sel}` : (mdl ?? `#${c0.pos}`)}</div>
            <div className="fw-900" style={{ fontSize: "var(--fs-20)", lineHeight: 1 }}>{model.rankBy === "toPar" ? tpTxt(disp) : disp}</div>
            {model.rankBy !== "toPar" && dispTp != null && (
              <div className="fs-10 mt-1" style={{ opacity: 0.85, lineHeight: 1 }}>({fmtToPar(dispTp)})</div>
            )}
          </div>
        )}
      </div>
      {team.cats.map((cat, idx) => (
        <div key={cat.key} style={{ marginTop: model.multiCat && idx > 0 ? 10 : 0 }}>
          {model.multiCat && (
            <div style={{
              background: cat.pos === 1 ? "var(--accent-light, #eef6ef)" : "var(--bg-hover)", padding: "4px 10px",
              fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--text-2)", display: "flex", justifyContent: "space-between", alignItems: "center",
              borderTop: idx === 0 ? "none" : "1px solid var(--border)", borderBottom: "1px solid var(--border)",
            }}>
              <span>
                {cat.pos != null && (
                  <span style={{ fontWeight: 900, color: cat.pos === 1 ? team.color : "var(--text-2)", marginRight: 6 }}>
                    {cat.pos === 1 ? "🏆 " : ""}#{cat.pos}{cat.fieldSize > 1 ? `/${cat.fieldSize}` : ""}
                  </span>
                )}
                {cat.label}
              </span>
              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{cat.nLabel}</span>
            </div>
          )}
          <PlayersTable cat={cat} model={model} color={team.color} cols={cols} bpbMode={bpbMode}
            showTotal={single ? cols.length > 1 : model.rounds.length > 1} />
        </div>
      ))}
      {(team.capitao || team.suplente) && (
        <div style={{ display: "flex", borderTop: "1px solid var(--border)", fontSize: "var(--fs-11)" }}>
          {team.capitao && (
            <div style={{ flex: 1, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5, borderRight: team.suplente ? "1px solid var(--border)" : "none", color: "var(--text-2)" }}>
              <span className="fs-13">🎖️</span>
              <span>
                <span style={{ fontSize: "var(--fs-9)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Capitão</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{team.capitao}</span>
              </span>
            </div>
          )}
          {team.suplente && (
            <div style={{ flex: 1, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5, color: "var(--text-2)" }}>
              <span className="fs-13">🔄</span>
              <span>
                <span style={{ fontSize: "var(--fs-9)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", display: "block", lineHeight: 1 }}>Suplente</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{team.suplente}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Lista: uma linha por equipa (por categoria), que se abre nos jogadores ── */
type LKey = "pos" | "equipa" | "tot" | "tp" | "n" | `r${number}`;
function TeamList({ model, catKey, label, nLabel }: { model: TsModel; catKey: string; label?: string; nLabel?: string }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<LKey>("pos", "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const list = model.teams.map(t => ({ t, c: t.cats.find(c => c.key === catKey) })).filter((x): x is { t: TsTeam; c: TsCat } => !!x.c);
    const v = ({ t, c }: { t: TsTeam; c: TsCat }): number | string => {
      if (sortKey === "equipa") return t.name;
      if (sortKey === "pos") return c.pos ?? INF;
      if (sortKey === "tot") return c.total ?? INF;
      if (sortKey === "tp") return c.toPar ?? INF;
      if (sortKey === "n") return c.players.length;
      const ri = parseInt(sortKey.slice(1), 10);
      return c.rdTotals[ri] ?? INF;
    };
    return list.sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number)) || a.t.name.localeCompare(b.t.name, "pt");
    });
  }, [model, catKey, sortKey, sortDir]);
  const byGross = model.rankBy === "gross";
  const nCols = 2 + (byGross ? model.rounds.length + 1 : 0) + 2;
  const hdr = (k: LKey, l: React.ReactNode, style?: React.CSSProperties, title?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={style} title={title}>{l}</SortableHdr>;
  return (
    <div className="mb-16">
      {label && <div className="fw-700 fs-13 mb-6">{label}{nLabel && <span className="muted fw-400 fs-12"> · {nLabel}</span>}</div>}
      <div className="sc-wrap">
        <table className="dtable tbl-compact" style={{ width: "auto", minWidth: 360 }}>
          <thead>
            <tr>
              {hdr("pos", "Pos.")}
              {hdr("equipa", model.rankBy === "toPar" ? "Região" : "Equipa", { textAlign: "left" })}
              {byGross && model.rounds.map((rd, ri) => <React.Fragment key={rd}>{hdr(`r${ri}`, `R${rd}`)}</React.Fragment>)}
              {byGross && hdr("tot", "Total")}
              {hdr("tp", byGross ? "±Par" : "10 melhores", undefined, byGross ? undefined : "Soma dos 10 melhores resultados em relação ao par")}
              {hdr("n", "Jogadores", undefined, "Jogadores com resultado")}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, c }) => {
              const open = aberta === t.key;
              return (
                <React.Fragment key={t.key}>
                  <tr onClick={() => setAberta(open ? null : t.key)} className={open ? "row-selected" : undefined} style={{ cursor: "pointer" }}
                    title="Clicar para ver os jogadores">
                    <td className="ta-c fw-700">{c.pos != null ? (medal(c.pos) ?? c.pos) : "–"}</td>
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                      {t.isMulti && <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 2, background: t.color, display: "inline-block", marginRight: 6 }} />}
                      {model.showLetter && t.letter && <b style={{ marginRight: 6 }}>{t.letter}</b>}
                      {t.name}{t.sub && <span className="muted fs-11"> · {t.sub}</span>}
                      <span className="muted fs-11"> {open ? "▾" : "▸"}</span>
                    </td>
                    {byGross && c.rdTotals.map((v, ri) => <td key={ri} className="ta-c">{v ?? "–"}</td>)}
                    {byGross && <td className="ta-c fw-700">{c.total ?? "–"}</td>}
                    <td className="ta-c fw-700">{byGross ? (c.toPar != null ? fmtToPar(c.toPar) : "–") : tpTxt(c.toPar)}</td>
                    <td className="ta-c">{c.players.length}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={nCols} style={{ padding: 0, background: "var(--bg-card)" }}>
                        <PlayersTable cat={c} model={model} color={t.color} cols={model.rounds.map((_, i) => i)}
                          bpbMode={null} showTotal={model.rounds.length > 1} />
                        {(t.capitao || t.suplente) && (
                          <div className="fs-11 muted" style={{ padding: "4px 10px" }}>
                            {t.capitao && <>🎖️ Capitão: <b>{t.capitao}</b></>}{t.capitao && t.suplente && " · "}{t.suplente && <>🔄 Suplente: <b>{t.suplente}</b></>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Jogadores: todos numa tabela ── */
type JKey = "equipa" | "cat" | "nome" | "hcp" | "bur" | "tot" | "conta" | `r${number}`;
function AllPlayers({ model }: { model: TsModel }) {
  const [equipa, setEquipa] = useState<string>("");
  const { sortKey, sortDir, toggleSort } = useSort<JKey>(model.rankBy === "toPar" ? "r0" : "tot", "asc");
  const rows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    const all = model.teams.filter(t => !equipa || t.key === equipa)
      .flatMap(t => t.cats.flatMap(c => c.players.map(p => ({ t, c, p }))));
    const v = ({ t, c, p }: typeof all[number]): number | string => {
      switch (sortKey) {
        case "equipa": return (c.pos ?? 999) * 1000 + (model.teams.indexOf(t));
        case "cat": return c.label;
        case "nome": return p.name;
        case "hcp": return p.hcpSort ?? 999;
        case "bur": return p.holes ?? INF;
        case "tot": return p.total ?? INF;
        case "conta": return p.conta ? 0 : 1;
        default: { const r = p.rds[parseInt(sortKey.slice(1), 10)]; return (model.rankBy === "toPar" ? r?.toPar : r?.gross) ?? INF; }
      }
    };
    return all.sort((a, b) => {
      const av = v(a), bv = v(b);
      if (typeof av === "string") return dir * av.localeCompare(bv as string, "pt");
      return dir * ((av as number) - (bv as number)) || a.p.name.localeCompare(b.p.name, "pt");
    });
  }, [model, equipa, sortKey, sortDir]);
  const hdr = (k: JKey, l: React.ReactNode, style?: React.CSSProperties, title?: string) =>
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={style} title={title}>{l}</SortableHdr>;
  return (
    <div>
      <div className="mb-8" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select className="input fs-12" value={equipa} onChange={e => setEquipa(e.target.value)} style={{ padding: "3px 6px" }}>
          <option value="">{model.rankBy === "toPar" ? "Todas as regiões" : "Todas as equipas"}</option>
          {model.teams.map(t => <option key={t.key} value={t.key}>{t.letter && model.showLetter ? `${t.letter} · ` : ""}{t.name}{t.sub ? ` (${t.sub})` : ""}</option>)}
        </select>
        <span className="muted fs-12">{rows.length} jogadores{model.showConta ? " · ✓ = resultado que conta para a equipa" : " · a negrito, os resultados que contam para a equipa"}</span>
      </div>
      <div className="sc-wrap">
        <table className="dtable tbl-compact" style={{ width: "auto", minWidth: 420 }}>
          <thead>
            <tr>
              {hdr("equipa", model.rankBy === "toPar" ? "Região" : "Equipa", { textAlign: "left" })}
              {model.multiCat && hdr("cat", "Categoria", { textAlign: "left" })}
              {hdr("nome", "Jogador", { textAlign: "left" })}
              {model.showHcp && hdr("hcp", "HCP")}
              {model.showHoles && hdr("bur", "Bur.", undefined, "Sub-10 joga 9 buracos")}
              {model.rounds.map((rd, ri) => <React.Fragment key={rd}>{hdr(`r${ri}`, model.rankBy === "toPar" ? "Gross (±Par)" : `R${rd}`)}</React.Fragment>)}
              {model.rounds.length > 1 && hdr("tot", "Tot.")}
              {model.showConta && hdr("conta", "Conta", undefined, "Entra no total da equipa")}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, c, p }) => (
              <tr key={t.key + c.key + p.key} className={isEu(p) ? "row-manuel" : undefined}>
                <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{model.showLetter && t.letter ? <b>{t.letter} </b> : null}{t.name}</td>
                {model.multiCat && <td style={{ textAlign: "left" }}>{c.label}</td>}
                <td style={{ textAlign: "left" }}><PName p={p} /></td>
                {model.showHcp && <td className="ta-c muted">{p.hcp}</td>}
                {model.showHoles && <td className="ta-c">{p.holes ?? "–"}</td>}
                {p.rds.map((r, ri) => <ScoreCell key={ri} r={r} color={t.color} />)}
                {model.rounds.length > 1 && <td className="ta-c">{p.total ?? "–"}</td>}
                {model.showConta && <td className="ta-c">{p.conta ? "✓" : ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── A peça ─────────────────────────────────────────────────────── */
export default function TeamStrokeStandings({ model, intro, initialView, footnote }: {
  model: TsModel;
  /** Texto por cima (default: a regra do modelo). */
  intro?: React.ReactNode;
  initialView?: View;
  /** Nota extra por baixo da regra (ex.: a fonte do PDF da Final Drive). */
  footnote?: React.ReactNode;
}) {
  const [view, setView] = useState<View>(initialView ?? (model.rankBy === "toPar" ? "lista" : "cartoes"));
  const { sortKey: sel, sortDir, toggleSort } = useSort<RoundSel>("total");
  const single = !model.multiCat;
  const played = model.rounds.length;

  // Ordem dos cartões: uma categoria — pela escolha (Grupo/Rn/Total); com
  // categorias — pela melhor posição do clube em qualquer categoria.
  const cards = useMemo(() => {
    if (!single) {
      return [...model.teams].sort((a, b) => {
        const ba = Math.min(...a.cats.map(c => c.pos ?? Infinity), Infinity);
        const bb = Math.min(...b.cats.map(c => c.pos ?? Infinity), Infinity);
        return ba - bb || a.name.localeCompare(b.name, "pt");
      });
    }
    const INF = sortDir === "asc" ? Infinity : -Infinity;
    return [...model.teams].sort((a, b) => {
      if (sel === "grupo") return (sortDir === "asc" ? 1 : -1) * (a.letter ?? a.name).localeCompare(b.letter ?? b.name);
      const ri = typeof sel === "number" ? model.rounds.indexOf(sel) : null;
      const av = (a.cats[0] ? teamVal(a.cats[0], model, ri) : null) ?? INF;
      const bv = (b.cats[0] ? teamVal(b.cats[0], model, ri) : null) ?? INF;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [model, single, sel, sortDir]);

  const SelBtn = ({ label, col }: { label: string; col: RoundSel }) => {
    const active = sel === col;
    return (
      <button type="button" onClick={() => toggleSort(col)} style={{
        fontSize: "var(--fs-11)", fontWeight: active ? 700 : 500, padding: "3px 9px", borderRadius: 4,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "var(--accent)" : "var(--bg-hover)",
        color: active ? "#fff" : "var(--text-muted)", cursor: "pointer",
      }}>{label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</button>
    );
  };

  const views: { k: View; l: string }[] = [{ k: "cartoes", l: "Cartões" }, { k: "lista", l: "Lista" }, { k: "jogadores", l: "Jogadores" }];
  const catsForList = model.multiCat
    ? [...new Map(model.teams.flatMap(t => t.cats.map(c => [c.key, c] as const))).values()]
    : [model.teams[0]?.cats[0]].filter((c): c is TsCat => !!c);

  return (
    <div style={{ padding: "12px 16px 24px" }}>
      <div className="mb-10 flex-wrap" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div className="segmented-toggle" role="tablist" aria-label="Vista">
          {views.map(v => (
            <button key={v.k} type="button" role="tab" aria-selected={view === v.k}
              className={"seg-btn" + (view === v.k ? " active" : "")} onClick={() => setView(v.k)}>
              <span className="seg-label">{v.l}</span>
            </button>
          ))}
        </div>
        {view === "cartoes" && single && (played > 1 || model.showLetter) && (<>
          <span style={{ fontSize: "var(--fs-10)", color: "var(--text-muted)", marginLeft: 6 }}>Ordenar:</span>
          {model.showLetter && <SelBtn label="Grupo" col="grupo" />}
          {model.rounds.map(rd => <SelBtn key={rd} label={`R${rd}`} col={rd} />)}
          <SelBtn label="Total" col="total" />
        </>)}
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-13)", color: "var(--text-muted)", marginTop: 4 }}>
          {intro ?? model.rule}
          {model.nRounds > 1 && played > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: single ? (played >= model.nRounds ? "var(--color-good)" : "var(--color-warn)") : undefined }}>
              · R{played}/{model.nRounds}
            </span>
          )}
        </span>
      </div>
      {footnote && <div className="muted fs-12 mb-10">{footnote}</div>}

      {/* Clubes com 2+ equipas */}
      {model.legend.length > 0 && view !== "jogadores" && (
        <div className="flex-wrap mb-12" style={{ display: "flex", gap: 6 }}>
          {model.legend.map(l => (
            <span key={l.clube} style={{ fontSize: "var(--fs-10)", display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${l.color}`, borderRadius: 4, padding: "2px 8px", background: `${l.color}12` }}>
              <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 2, background: l.color, display: "inline-block" }} />
              <strong style={{ color: l.color }}>{l.teams}</strong>
              <span style={{ color: "var(--text-muted)" }}>— {l.clube}</span>
            </span>
          ))}
        </div>
      )}

      {view === "cartoes" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${model.multiCat ? 340 : 310}px, 1fr))`, gap: model.multiCat ? 12 : 10 }}>
          {cards.map(t => <TeamCard key={t.key} team={t} model={model} sel={sel} />)}
        </div>
      )}
      {view === "lista" && catsForList.map(c => (
        <TeamList key={c.key} model={model} catKey={c.key} label={model.multiCat ? c.label : undefined} nLabel={model.multiCat ? c.nLabel : undefined} />
      ))}
      {view === "jogadores" && <AllPlayers model={model} />}
    </div>
  );
}
