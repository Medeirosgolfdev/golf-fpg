/**
 * FpgScout.tsx — aba «Scout» da FPGPage (20/10/2026; era o painel «Quem repete»
 * no topo das «Edições anteriores»).
 *
 * É o Scout de todos os circuitos (src/ui/circuit/Scout.tsx — nível, forma,
 * confrontos com o Manuel, próximas inscrições) com as colunas que só a FPG tem,
 * calculadas por `repeatersModel.ts` (puro, testado) para o field TODO:
 * saída e tee do draw, índice de hoje e a variação a 3 meses, forma WHS
 * (differentials), o lugar em cada edição anterior, «vs Campo» e a previsão.
 *
 * Fontes, todas já servidas ao browser: `playersDB` (índice, escalão, clube,
 * sexo), `player-stats.json` (forma WHS) e `master-courses.json` (CR/Slope).
 */
import { useEffect, useMemo, useState } from "react";
import type { Tournament } from "../../data/fpgTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { TeeDot } from "../../ui/tournamentPrimitives";
import { fmtToPar } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";
import { normName } from "../../utils/normName";
import { loadMasterData } from "../../data/loader";
import { loadPlayerStats, type PlayerStatsDb } from "../../data/playerStatsTypes";
import LoadingState from "../../ui/LoadingState";
import Scout, { type ScoutExtraCol } from "../../ui/circuit/Scout";
import {
  buildRepeaters, currentField, masterTeeRatings,
  type Repeater, type FedInfo, type PlayerForm,
} from "./repeatersModel";

const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

/** Forma WHS: differential médio das últimas 5 voltas (menos é melhor); o
 *  detalhe das 8 melhores e da média de 20 fica no tooltip. */
function FormaCell({ f }: { f: PlayerForm | null }) {
  if (!f || f.avgSD5 == null) return <>–</>;
  return (
    <span
      title={`últimas 5 voltas: ${n1(f.avgSD5)} · 8 melhores de 20: ${n1(f.avgSD8)} · média de 20: ${n1(f.avgSD20)}\n`
        + `${f.roundsLast3m} voltas nos últimos 3 meses · última a ${f.lastRoundDate ?? "?"}`}>
      {n1(f.avgSD5)}
    </span>
  );
}

export default function FpgScout({ current, previous, playersDB }: {
  current: Tournament;
  previous: { id: string; year: number; t: Tournament }[];
  playersDB: PlayersDB;
}) {
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
    return buildRepeaters({ current, previous, fedInfo, form, masterRatings: masterRatings ?? undefined, todos: true });
  }, [current, previous, playersDB, masterRatings, stats]);

  const porNome = useMemo(() => new Map(rows.map((r) => [normName(r.name), r])), [rows]);
  const field = useMemo(() => currentField(current).map((f) => ({ name: f.name, club: porNome.get(normName(f.name))?.club ?? null })), [current, porNome]);

  const extras = useMemo(() => {
    const R = (name: string): Repeater | undefined => porNome.get(normName(name));
    const anos = [...new Set(previous.map((p) => p.year))].sort((a, b) => b - a);
    const tem = {
      hora: rows.some((r) => r.teeTime), tee: rows.some((r) => r.teeNow),
      hcp: rows.some((r) => r.hcpNow != null), forma: rows.some((r) => r.form?.avgSD5 != null),
      aqui: rows.some((r) => r.editions.length), prev: rows.some((r) => r.forecast),
    };
    const antes: ScoutExtraCol[] = [];
    if (tem.hora) antes.push({ key: "hora", label: "Saída", title: "Hora do draw", cell: (n) => R(n)?.teeTime || "–", sort: (n) => R(n)?.teeTime || null });
    if (tem.tee) antes.push({ key: "tee", label: "Tee", cell: (n) => { const t = R(n)?.teeNow; return t ? <TeeDot teeName={t} /> : "–"; } });
    const depois: ScoutExtraCol[] = [];
    if (tem.hcp) {
      depois.push({ grupo: "WHS", key: "fpghcp", label: "Índice", title: "Índice de hoje (FPG)", cell: (n) => R(n)?.hcpNow ?? "–", sort: (n) => R(n)?.hcpNow ?? null });
      depois.push({ grupo: "WHS", key: "d3m", label: "Δ 3m", title: "Variação do índice nos últimos 3 meses", cell: (n) => {
        const d = R(n)?.form?.hcpDelta3m;
        return d ? `${d > 0 ? "+" : ""}${d}` : "–";
      } });
    }
    if (tem.forma) {
      depois.push({ grupo: "WHS", key: "whs", label: "Forma", title: "Differential médio das últimas 5 voltas (verde: acima do seu normal)", cell: (n) => <FormaCell f={R(n)?.form ?? null} />, sort: (n) => R(n)?.form?.avgSD5 ?? null });
      depois.push({ grupo: "WHS", key: "whs20", label: "Média", title: "Differential médio das últimas 20 voltas", cell: (n) => n1(R(n)?.form?.avgSD20) });
    }
    if (tem.aqui) {
      depois.push({ grupo: "Nesta prova", key: "aquiTp", label: "Melhor ±", title: "Melhor ±par que fez nesta prova", sort: (n) => R(n)?.bestToPar ?? null, cell: (n) => {
        const b = R(n)?.bestToPar;
        return b != null ? fmtToPar(b) : "–";
      } });
      for (const y of anos) depois.push({ grupo: "Nesta prova", key: `ano${y}`, label: String(y), title: `Lugar na edição de ${y}`,
        sort: (n) => { const e = R(n)?.editions.find((x) => x.year === y); return e?.pos ?? null; },
        cell: (n) => { const e = R(n)?.editions.find((x) => x.year === y); return e ? (e.pos ? `${e.pos}º` : "jogou") : "–"; } });
      depois.push({ grupo: "Nesta prova", key: "fit", label: "vs Campo", title: "Onde ficou face à mediana do field nesta prova: − melhor que o campo do meio", sort: (n) => R(n)?.courseFit ?? null, cell: (n) => {
        const c = R(n)?.courseFit;
        return c == null ? "–" : `${c > 0 ? "+" : ""}${c}`;
      } });
    }
    if (tem.prev) {
      depois.push({ grupo: "Previsão", key: "prev", label: "Gross", title: "Gross esperado no torneio", sort: (n) => R(n)?.forecast?.total ?? null, cell: (n) => R(n)?.forecast?.total ?? "–" });
      depois.push({ grupo: "Previsão", key: "prevTp", label: "±", cell: (n) => {
        const tp = R(n)?.forecast?.toPar;
        return tp != null ? fmtToPar(tp) : "–";
      } });
      depois.push({ grupo: "Previsão", key: "prevInt", label: "Intervalo", title: "Intervalo plausível (bom e mau dia)", cell: (n) => {
        const f = R(n)?.forecast;
        return f ? `${f.low}–${f.high}` : "–";
      } });
    }
    return { antes, depois, temPrev: tem.prev };
  }, [rows, porNome, previous]);

  const detalhe = (name: string) => {
    const r = porNome.get(normName(name));
    if (!r || (!r.editions.length && !r.form && !r.forecast)) return null;
    const f = r.form;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12 }}>
        {r.editions.length > 0 && (
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
        )}
        {f ? (
          <div>
            <div className="fw-700">Forma WHS</div>
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
    );
  };

  if (!masterRatings || !stats) return <LoadingState />;

  const favorito = [...rows].filter((r) => r.forecast).sort((a, b) => a.forecast!.total - b.forecast!.total)[0];
  const emAlta = [...rows]
    .filter((r) => r.form?.avgSD5 != null && r.form?.avgSD20 != null && r.form.avgSD5 - r.form.avgSD20 <= -1)
    .sort((a, b) => (a.form!.avgSD5! - a.form!.avgSD20!) - (b.form!.avgSD5! - b.form!.avgSD20!))[0];

  return (
    <Scout
      field={field}
      colsAntes={extras.antes}
      colsDepois={extras.depois}
      detalheExtra={detalhe}
      semHcp
      ordemInicial={extras.temPrev ? { key: "prev", dir: "asc" } : undefined}
      resumoExtra={<>
        {favorito?.forecast ? <span className="muted" style={{ marginLeft: 8 }}>· Melhor previsão: <b style={{ color: "var(--text)" }}>{favorito.name}</b> ({favorito.forecast.total})</span> : null}
        {emAlta ? <span className="muted"> · Em alta: <b style={{ color: "var(--text)" }}>{emAlta.name}</b> ({n1(emAlta.form!.avgSD5)} nas últimas 5, contra {n1(emAlta.form!.avgSD20)} de média)</span> : null}
      </>}
      rodape={
        <details style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer" }}>Como são feitas a «Forma WHS», o «vs Campo» e a «Previsão»</summary>
          <p style={{ margin: "6px 0" }}>
            Tudo em <b>score differential</b> — <code>(113/Slope) × (gross − CR − PCC)</code> — que
            é o que permite comparar voltas em campos e tees diferentes. Menos é melhor.
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>Forma WHS</b>: o differential médio das <b>últimas 5 voltas</b> contra o das últimas 20.
            Não se usa o índice para isto: o índice é a média das 8 melhores de 20, move-se devagar e
            não diz como alguém está a jogar esta semana.
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>vs Campo</b>: onde ficou face à <b>mediana do field</b> nessa edição. Negativo = jogou
            melhor que o campo do meio. A régua são os adversários daquele dia, por isso já
            absorve o vento e o estado do campo. É informação — <b>não entra na previsão</b>.
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>Previsão</b>: o meio entre o bom dia (as 8 melhores de 20) e o dia qualquer (a média
            de 20), convertido em gross com o CR e o Slope do tee que ele vai jogar hoje, lidos da
            ficha do campo. Quem nunca jogou esta prova também tem previsão, pela forma (ou pelo
            índice, contando-o mais ~3,5 golpes). O intervalo abre desse meio para os dois lados.
          </p>
        </details>
      }
    />
  );
}
