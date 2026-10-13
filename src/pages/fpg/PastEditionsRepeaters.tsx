/**
 * PastEditionsRepeaters.tsx — painel "Quem repete" no topo da tab
 * "Edições anteriores" (FPGPage).
 *
 * Responde a três perguntas sobre o field de hoje: quem já jogou esta prova, o
 * que fez cá, e o que se espera que faça agora. A lógica vive em
 * `repeatersModel.ts` (pura, testada); aqui é só apresentação.
 *
 * Três fontes, todas já servidas ao browser:
 *  - `playersDB` (a FPGPage já o tem) → índice, escalão, clube, sexo de hoje;
 *  - `player-stats.json` (303 KB) → a FORMA: differentials das últimas 5/8/20
 *    voltas, voltas nos últimos 3 meses, evolução do índice a 3 meses;
 *  - `master-courses.json` → CR/Slope de todos os tees do campo, por sexo.
 */
import { useEffect, useMemo, useState } from "react";
import type { Tournament } from "../../data/fpgTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { TeeDot } from "../../ui/tournamentPrimitives";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import SexBadge from "../../ui/SexBadge";
import { fmtToPar } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";
import { loadMasterData } from "../../data/loader";
import { loadPlayerStats, type PlayerStatsDb } from "../../data/playerStatsTypes";
import {
  buildRepeaters, currentField, masterTeeRatings,
  type Repeater, type FedInfo, type PlayerForm,
} from "./repeatersModel";

type SortKey = "hora" | "nome" | "esc" | "aqui" | "forma" | "fit" | "hcp" | "prev";

const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

/**
 * Forma numa célula: o differential médio das últimas 5 voltas contra o das
 * últimas 20. Quem está a jogar acima do seu normal tem a barra curta à
 * esquerda — em golfe, menos é melhor, e a barra respeita isso.
 */
function FormaCell({ f }: { f: PlayerForm | null }) {
  // Uma linha só (modelo das tabelas de torneio, 13/10/2026): «3.3 ▼ 6.5».
  if (!f || f.avgSD5 == null) return <span className="muted">—</span>;
  const recente = f.avgSD5;
  const normal = f.avgSD20 ?? f.avgSD5;
  const delta = recente - normal;
  const quente = delta <= -1, frio = delta >= 1;
  const cor = quente ? "var(--accent-dark)" : frio ? "var(--score-birdie)" : "var(--text)";
  return (
    <span
      title={`últimas 5 voltas: ${n1(f.avgSD5)} · 8 melhores de 20: ${n1(f.avgSD8)} · média de 20: ${n1(f.avgSD20)}\n`
        + `${f.roundsLast3m} voltas nos últimos 3 meses · última a ${f.lastRoundDate ?? "?"}`}
      style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
    >
      <span style={{ color: cor, fontWeight: 600 }}>{n1(recente)}</span>
      <span className="muted fs-10"> {quente ? "▼" : frio ? "▲" : "="} {n1(normal)}</span>
    </span>
  );
}

/** Previsão numa linha: «77 +5 · 73–81» (intervalo plausível em pequeno). */
function PrevCell({ r }: { r: Repeater }) {
  const f = r.forecast;
  if (!f) return <span className="muted">—</span>;
  const incerto = f.basis === "indice" || !f.teeKnown;
  return (
    <span
      style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
      title={[
        {
          forma: "as voltas das últimas semanas, no tee que vai jogar hoje",
          historico: "o que fez nesta prova, corrigido pela evolução do índice",
          indice: "só o índice de hoje — sem forma nem voltas utilizáveis aqui",
        }[f.basis],
        f.teeKnown ? null : `sem CR/Slope do tee de hoje (${r.teeNow ?? "?"}) — usado o do tee anterior`,
      ].filter(Boolean).join(" · ")}
    >
      <b>{f.total}</b>
      {f.toPar != null ? <span style={{ color: tpColorDark(f.toPar) }}> {fmtToPar(f.toPar)}</span> : null}
      {incerto ? <span className="muted"> ≈</span> : null}
      <span className="muted fs-10"> · {f.low}–{f.high}</span>
    </span>
  );
}

export default function PastEditionsRepeaters({
  current, previous, playersDB,
}: {
  current: Tournament;
  previous: { id: string; year: number; t: Tournament }[];
  playersDB: PlayersDB;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("prev");

  // CR/Slope oficiais de todos os tees do campo + forma de cada jogador.
  // Lazy (só ao abrir a tab) e por cache — se a app já os carregou, é grátis.
  const [masterRatings, setMasterRatings] = useState<Map<string, { cr: number; slope: number }> | null>(null);
  const [stats, setStats] = useState<PlayerStatsDb | null>(null);
  useEffect(() => {
    let vivo = true;
    loadMasterData()
      .then((m) => { if (vivo) setMasterRatings(masterTeeRatings(m as never, current.campo)); })
      .catch(() => { if (vivo) setMasterRatings(new Map()); });
    loadPlayerStats()
      .then((s) => { if (vivo) setStats(s); })
      .catch(() => { if (vivo) setStats({}); });
    return () => { vivo = false; };
  }, [current.campo]);

  const rows = useMemo(() => {
    const fedInfo = (fed: string | null): FedInfo | null => {
      const p = fed ? playersDB?.[fed] : null;
      if (!p) return null;
      const club = p.club as unknown as { short?: string; long?: string } | string | null | undefined;
      return {
        hcp: typeof p.hcp === "number" ? p.hcp : (typeof p.hcpExact === "number" ? p.hcpExact : null),
        club: typeof club === "string" ? club : (club?.short || club?.long || null),
        escalao: p.escalao || null,
        sex: p.sex || null,
      };
    };
    const form = (fed: string | null): PlayerForm | null => {
      const s = fed ? stats?.[fed] : null;
      return s ? { ...s, roundsLast3m: s.roundsLast3m ?? 0, roundsLast12m: s.roundsLast12m ?? 0 } : null;
    };
    return buildRepeaters({
      current, previous, fedInfo, form,
      masterRatings: masterRatings ?? undefined,
    });
  }, [current, previous, playersDB, masterRatings, stats]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Repeater): number | string => {
      switch (sortKey) {
        case "hora": return r.teeTime || "zz";
        case "nome": return r.name;
        case "esc": return r.escalao || "zz";
        case "aqui": return r.bestToPar ?? 999;
        case "forma": return r.form?.avgSD5 ?? 999;
        case "fit": return r.courseFit ?? 999;
        case "hcp": return r.hcpNow ?? 99;
        case "prev": return r.forecast?.total ?? 9e9;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const fieldSize = useMemo(() => currentField(current).length, [current]);
  if (!rows.length) return null;

  const anos = [...new Set(previous.map((p) => p.year))].sort((a, b) => b - a);
  const favorito = [...rows].sort((a, b) => (a.forecast?.total ?? 9e9) - (b.forecast?.total ?? 9e9))[0];
  const emAlta = [...rows]
    .filter((r) => r.form?.avgSD5 != null && r.form?.avgSD20 != null && r.form.avgSD5 - r.form.avgSD20 <= -1)
    .sort((a, b) => (a.form!.avgSD5! - a.form!.avgSD20!) - (b.form!.avgSD5! - b.form!.avgSD20!))[0];
  const hdr = (k: SortKey, label: string, title?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={k === "nome" ? { textAlign: "left" } : undefined}>
      <span title={title}>{label}</span>
    </SortableHdr>
  );

  return (
    <div className="course-players-section" style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 2px" }}>
        Quem repete <span className="p p-sm p-muted">{rows.length} de {fieldSize}</span>
      </h4>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        Do field de hoje, quem já jogou esta prova ({anos.join(", ")}).
        {favorito?.forecast ? <> · Melhor previsão: <b>{favorito.name}</b> ({favorito.forecast.total})</> : null}
        {emAlta ? <> · Em alta: <b>{emAlta.name}</b> ({n1(emAlta.form!.avgSD5)} nas últimas 5, contra {n1(emAlta.form!.avgSD20)} de média)</> : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        {/* Modelo das tabelas de torneio (.sc-lb): compacta, uma linha por jogador. */}
        <table className="sc-lb">
          <thead>
            <tr>
              {hdr("hora", "Saída", "Hora e tee do draw")}
              {hdr("nome", "Jogador")}
              {hdr("esc", "Esc.")}
              {hdr("hcp", "HCP", "Índice de hoje e variação nos últimos 3 meses")}
              {hdr("forma", "Forma", "Differential médio das últimas 5 voltas vs. as últimas 20")}
              {hdr("aqui", "Aqui", "Melhor ±par que fez nesta prova")}
              {hdr("fit", "Campo", "Onde ficou face à mediana do field nesta prova: − melhor que o campo do meio")}
              {hdr("prev", "Previsão", "Gross esperado no torneio e intervalo plausível")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const id = r.fed || r.name;
              const isOpen = aberto === id;
              const f = r.form;
              return [
                <tr key={id} onClick={() => setAberto(isOpen ? null : id)} style={{ cursor: "pointer" }}>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {r.teeTime || "—"}
                    {r.teeNow ? <> <TeeDot teeName={r.teeNow} /></> : null}
                  </td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                    {r.sex ? <SexBadge sex={r.sex as "M" | "F"} /> : null} {r.name}
                    {r.club ? <span className="muted fs-10"> · {r.club}</span> : null}
                  </td>
                  <td>{r.escalao || "—"}</td>
                  <td style={{ textAlign: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {r.hcpNow ?? "—"}
                    {f?.hcpDelta3m ? (
                      <span style={{ fontSize: 10, color: f.hcpDelta3m < 0 ? "var(--accent-dark)" : "var(--text-muted)" }}
                        title="variação do índice nos últimos 3 meses">
                        {" "}{f.hcpDelta3m > 0 ? "+" : ""}{f.hcpDelta3m}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "center" }}><FormaCell f={f} /></td>
                  <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 600, color: r.bestToPar != null ? tpColorDark(r.bestToPar) : undefined }}>
                      {r.bestToPar != null ? fmtToPar(r.bestToPar) : "—"}
                    </span>
                    <span className="muted fs-10">
                      {" · "}{r.editions.map((e) => `${e.year}${e.pos ? ` ${e.pos}º` : ""}`).join(" · ")}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}
                    title={r.courseFit == null ? undefined
                      : `${Math.abs(r.courseFit)} ${r.courseFit < 0 ? "melhor" : "pior"} que a mediana do field nesta prova`}>
                    {r.courseFit == null ? "—"
                      : <span style={{ color: r.courseFit < 0 ? "var(--accent-dark)" : "var(--text-muted)" }}>
                        {r.courseFit > 0 ? "+" : ""}{r.courseFit}
                      </span>}
                  </td>
                  <td style={{ textAlign: "center" }}><PrevCell r={r} /></td>
                </tr>,
                isOpen ? (
                  <tr key={id + "-d"} className="row-expanded">
                    <td colSpan={8}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12 }}>
                        <div>
                          <div className="fw-700">Nesta prova</div>
                          {r.editions.map((e) => (
                            <div key={e.id} style={{ color: "var(--text-muted)" }}>
                              <b style={{ color: "var(--text)" }}>{e.year}</b>
                              {e.pos ? ` · ${e.pos}º` : ""}
                              {e.total != null ? ` · ${e.total}` : ""}
                              {e.toPar != null ? <span style={{ color: tpColorDark(e.toPar) }}> {fmtToPar(e.toPar)}</span> : null}
                              {e.hcpThen != null ? ` · índice ${e.hcpThen}` : ""}
                              <div>
                                {e.rounds.map((rd) => `R${rd.round} ${rd.gross}${rd.sd != null ? ` (SD ${rd.sd.toFixed(1)})` : ""}`).join(" · ")}
                                {e.rounds[0]?.tee ? ` · ${e.rounds[0].tee}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                        {f ? (
                          <div>
                            <div className="fw-700">Forma</div>
                            <div style={{ color: "var(--text-muted)" }}>
                              Differential: últimas 5 <b style={{ color: "var(--text)" }}>{n1(f.avgSD5)}</b>
                              {" "}· 8 melhores de 20 <b style={{ color: "var(--text)" }}>{n1(f.avgSD8)}</b>
                              {" "}· média de 20 <b style={{ color: "var(--text)" }}>{n1(f.avgSD20)}</b>
                              {f.lastSD != null ? <> · última volta {n1(f.lastSD)}</> : null}
                              <div>
                                {f.roundsLast3m} voltas em 3 meses · {f.roundsLast12m} em 12
                                {f.lastRoundDate ? ` · última a ${f.lastRoundDate}` : ""}
                                {f.bestGross != null ? ` · melhor volta de sempre ${f.bestGross}` : ""}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {r.forecast ? (
                          <div>
                            <div className="fw-700">Previsão</div>
                            <div style={{ color: "var(--text-muted)" }}>
                              {r.forecast.perRound} por volta · {r.forecast.total} no torneio
                              {r.forecast.toPar != null ? <span style={{ color: tpColorDark(r.forecast.toPar) }}> ({fmtToPar(r.forecast.toPar)})</span> : null}
                              <div>entre {r.forecast.low} e {r.forecast.high} · base: {r.forecast.basis}</div>
                              {r.teeNow ? <div>tee de hoje: {r.teeNow}{r.forecast.teeKnown ? "" : " (rating desconhecido)"}</div> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      <details style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <summary style={{ cursor: "pointer" }}>Como são feitas a «Forma», o «Campo» e a «Previsão»</summary>
        <p style={{ margin: "6px 0" }}>
          Tudo em <b>score differential</b> — <code>(113/Slope) × (gross − CR − PCC)</code> — que
          é o que permite comparar voltas em campos e tees diferentes. Menos é melhor.
        </p>
        <p style={{ margin: "6px 0" }}>
          <b>Forma</b>: o differential médio das <b>últimas 5 voltas</b> contra o das últimas 20.
          Quem está a jogar acima do seu normal aparece com ▼. Não se usa o índice para isto:
          o índice é a média das 8 melhores de 20, move-se devagar e não diz como alguém está
          a jogar esta semana.
        </p>
        <p style={{ margin: "6px 0" }}>
          <b>Campo</b>: onde ficou face à <b>mediana do field</b> nessa edição. Negativo = jogou
          melhor que o campo do meio. A régua são os adversários daquele dia, por isso já
          absorve o vento e o estado do campo. É informação — <b>não entra na previsão</b>:
          somá-la à forma de hoje contava a melhoria do jogador duas vezes.
        </p>
        <p style={{ margin: "6px 0" }}>
          <b>Previsão</b>: o meio entre o bom dia (as 8 melhores de 20) e o dia qualquer (a média
          de 20), convertido em gross com o CR e o Slope do tee que ele vai jogar hoje, lidos da
          ficha do campo (que os tem para todas as marcas, separados por sexo — no Torre as
          amarelas dão 66,2/122 aos rapazes e 71,1/126 às raparigas). Nem só o potencial nem só
          a média: uma volta de torneio cai tipicamente no meio, e prever pelo potencial dava
          disparates. O intervalo abre desse meio para os dois lados.
        </p>
        <p style={{ margin: "6px 0" }}>
          O «≈» marca uma suposição por baixo: sem voltas nem forma (previsão só pelo índice,
          contando-o mais ~3,5 golpes), ou o campo sem o tee que ele vai jogar. Passar o rato
          por cima diz qual dos dois é.
        </p>
      </details>
    </div>
  );
}
