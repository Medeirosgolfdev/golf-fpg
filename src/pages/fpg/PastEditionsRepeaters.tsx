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
import { EscPill } from "../../ui/PillBadge";
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
  // Differential das últimas 5 voltas; a cor diz se está acima (verde) ou abaixo
  // (vermelho) do seu normal — a média das 20 está na coluna ao lado.
  if (!f || f.avgSD5 == null) return <>–</>;
  const delta = f.avgSD5 - (f.avgSD20 ?? f.avgSD5);
  const cor = delta <= -1 ? "var(--accent-dark)" : delta >= 1 ? "var(--score-birdie)" : undefined;
  return (
    <span style={{ color: cor, fontWeight: 600 }}
      title={`últimas 5 voltas: ${n1(f.avgSD5)} · 8 melhores de 20: ${n1(f.avgSD8)} · média de 20: ${n1(f.avgSD20)}\n`
        + `${f.roundsLast3m} voltas nos últimos 3 meses · última a ${f.lastRoundDate ?? "?"}`}>
      {n1(f.avgSD5)}
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
  // Colunas que só aparecem se houver dados para alguém (a maioria do field de
  // um torneio de clube não está na nossa base — evita colunas de traços).
  const temEsc = rows.some((r) => r.escalao);
  const temHcp = rows.some((r) => r.hcpNow != null);
  const temForma = rows.some((r) => r.form?.avgSD5 != null);
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
        <table className="sc-lb sc-lb-airy">
          <thead>
            <tr>
              {hdr("hora", "Saída", "Hora do draw")}
              <th>Tee</th>
              {hdr("nome", "Jogador")}
              {temEsc && hdr("esc", "Esc.")}
              {temHcp && hdr("hcp", "HCP", "Índice de hoje")}
              {temHcp && <th title="Variação do índice nos últimos 3 meses">Δ 3m</th>}
              {temForma && hdr("forma", "Forma", "Differential médio das últimas 5 voltas")}
              {temForma && <th title="Differential médio das últimas 20 voltas">Média</th>}
              {hdr("aqui", "Melhor", "Melhor ±par que fez nesta prova")}
              <th title="Edições anteriores desta prova e o lugar em cada uma">Ed.</th>
              {hdr("fit", "vs Campo", "Onde ficou face à mediana do field nesta prova: − melhor que o campo do meio")}
              {hdr("prev", "Previsão", "Gross esperado no torneio")}
              <th>±</th>
              <th title="Intervalo plausível (bom e mau dia)">Intervalo</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const id = r.fed || r.name;
              const isOpen = aberto === id;
              const f = r.form;
              return [
                <tr key={id} onClick={() => setAberto(isOpen ? null : id)} style={{ cursor: "pointer" }}>
                  {/* Um valor por coluna, todos com a mesma letra (modelo do Resumo). */}
                  <td className="mono">{r.teeTime || "–"}</td>
                  <td>{r.teeNow ? <TeeDot teeName={r.teeNow} /> : "–"}</td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                    {r.sex ? <SexBadge sex={r.sex as "M" | "F"} /> : null} {r.name}
                  </td>
                  {temEsc && <td>{r.escalao ? <EscPill esc={r.escalao} /> : "–"}</td>}
                  {temHcp && <td className="mono">{r.hcpNow ?? "–"}</td>}
                  {temHcp && (
                    <td className="mono" style={{ color: f?.hcpDelta3m ? (f.hcpDelta3m < 0 ? "var(--accent-dark)" : "var(--text-3)") : undefined }}>
                      {f?.hcpDelta3m ? `${f.hcpDelta3m > 0 ? "+" : ""}${f.hcpDelta3m}` : "–"}
                    </td>
                  )}
                  {temForma && <td className="mono"><FormaCell f={f} /></td>}
                  {temForma && <td className="mono">{n1(f?.avgSD20)}</td>}
                  <td className="mono" style={{ fontWeight: 600, color: r.bestToPar != null ? tpColorDark(r.bestToPar) : undefined }}>
                    {r.bestToPar != null ? fmtToPar(r.bestToPar) : "–"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.editions.map((e) => `${e.year}${e.pos ? ` ${e.pos}º` : ""}`).join(" · ")}
                  </td>
                  <td className="mono"
                    title={r.courseFit == null ? undefined
                      : `${Math.abs(r.courseFit)} ${r.courseFit < 0 ? "melhor" : "pior"} que a mediana do field nesta prova`}
                    style={{ color: r.courseFit != null && r.courseFit < 0 ? "var(--accent-dark)" : undefined }}>
                    {r.courseFit == null ? "–" : `${r.courseFit > 0 ? "+" : ""}${r.courseFit}`}
                  </td>
                  <td className="mono" style={{ fontWeight: 700 }}>{r.forecast ? r.forecast.total : "–"}</td>
                  <td className="mono" style={{ color: r.forecast?.toPar != null ? tpColorDark(r.forecast.toPar) : undefined }}>
                    {r.forecast?.toPar != null ? fmtToPar(r.forecast.toPar) : "–"}
                  </td>
                  <td className="mono" style={{ color: "var(--text-3)" }}>{r.forecast ? `${r.forecast.low}–${r.forecast.high}` : "–"}</td>
                </tr>,
                isOpen ? (
                  <tr key={id + "-d"} className="row-expanded">
                    <td colSpan={9 + (temEsc ? 1 : 0) + (temHcp ? 2 : 0) + (temForma ? 2 : 0)}>
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
