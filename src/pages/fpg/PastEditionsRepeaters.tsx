/**
 * PastEditionsRepeaters.tsx — painel "Quem repete" no topo da tab
 * "Edições anteriores" (FPGPage).
 *
 * Responde a três perguntas sobre o field de hoje: quem já jogou esta prova, o
 * que fez cá, e o que se espera que faça agora. A lógica vive em
 * `repeatersModel.ts` (pura, testada); aqui é só apresentação.
 *
 * A identidade de HOJE (índice, escalão, clube, sexo) vem do `playersDB` que a
 * FPGPage já tem em memória — de propósito, para não puxar os 15 MB do
 * federados.json por causa de um painel.
 */
import { useMemo, useState } from "react";
import type { Tournament } from "../../data/fpgTypes";
import type { PlayersDB } from "../../ui/tournamentPrimitives";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import SexBadge from "../../ui/SexBadge";
import { fmtToPar } from "../../utils/format";
import { tpColorDark } from "../../utils/scoreDisplay";
import { buildRepeaters, currentField, type Repeater, type FedInfo } from "./repeatersModel";

type SortKey = "nome" | "esc" | "n" | "best" | "last" | "hcp" | "delta" | "prev";

/** Δ de índice como sinal de forma: baixar é melhorar. */
function FormaChip({ d }: { d: number | null }) {
  if (d == null) return <span className="p p-sm p-muted">—</span>;
  if (Math.abs(d) < 0.15) return <span className="p p-sm p-muted" title="índice praticamente igual">estável</span>;
  const melhorou = d < 0;
  return (
    <span
      className="p p-sm"
      title={melhorou ? `índice desceu ${Math.abs(d).toFixed(1)} desde a última vez que jogou aqui` : `índice subiu ${d.toFixed(1)} desde a última vez que jogou aqui`}
      style={{ background: melhorou ? "var(--accent-light)" : "var(--bg-subtle)", color: melhorou ? "var(--accent-dark)" : "var(--text-muted)" }}
    >
      {melhorou ? "▼" : "▲"} {Math.abs(d).toFixed(1)}
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
  const { sortKey, sortDir, toggleSort } = useSort<SortKey>("best");

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
    return buildRepeaters({ current, previous, fedInfo });
  }, [current, previous, playersDB]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Repeater): number | string => {
      switch (sortKey) {
        case "nome": return r.name;
        case "esc": return r.escalao || "zz";
        case "n": return r.editions.length;
        case "best": return r.bestToPar ?? 999;
        case "last": return r.editions[0]?.total ?? 9e9;
        case "hcp": return r.hcpNow ?? 99;
        case "delta": return r.hcpDelta ?? 99;
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
  const hdr = (k: SortKey, label: string, title?: string) => (
    <SortableHdr k={k} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
      <span title={title}>{label}</span>
    </SortableHdr>
  );

  return (
    <div className="course-players-section" style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 2px" }}>
        Quem repete <span className="p p-sm p-muted">{rows.length} de {fieldSize}</span>
      </h4>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        Jogadores do field de hoje que já jogaram esta prova ({anos.join(", ")}).
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="player-list-table">
          <thead>
            <tr>
              {hdr("nome", "Jogador")}
              {hdr("esc", "Esc.")}
              {hdr("n", "Ed.", "Quantas vezes já jogou esta prova")}
              {hdr("best", "Melhor aqui", "Melhor ±par que fez nesta prova")}
              {hdr("last", "Última vez", "Resultado da edição mais recente em que jogou")}
              {hdr("hcp", "HCP hoje")}
              {hdr("delta", "Forma", "Variação do índice desde a última vez que jogou aqui")}
              {hdr("prev", "Previsão", "Gross esperado no torneio inteiro")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const id = r.fed || r.name;
              const last = r.editions[0];
              const isOpen = aberto === id;
              return [
                <tr key={id} onClick={() => setAberto(isOpen ? null : id)} style={{ cursor: "pointer" }}>
                  <td>
                    {r.sex ? <SexBadge sex={r.sex as "M" | "F"} /> : null} {r.name}
                    {r.club ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> · {r.club}</span> : null}
                  </td>
                  <td>{r.escalao || "—"}</td>
                  <td style={{ textAlign: "center" }}>{r.editions.length}</td>
                  <td style={{ textAlign: "center", color: r.bestToPar != null ? tpColorDark(r.bestToPar) : undefined, fontWeight: 600 }}>
                    {r.bestToPar != null ? fmtToPar(r.bestToPar) : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {last ? (
                      <>
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{last.year} </span>
                        {last.total ?? "—"}
                        {last.pos ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({last.pos}º)</span> : null}
                      </>
                    ) : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {r.hcpNow ?? "—"}
                    {r.hcpThen != null ? <span style={{ color: "var(--text-muted)", fontSize: 11 }}> (era {r.hcpThen})</span> : null}
                  </td>
                  <td style={{ textAlign: "center" }}><FormaChip d={r.hcpDelta} /></td>
                  <td style={{ textAlign: "center" }}>
                    {r.forecast ? (
                      <span title={[
                        r.forecast.basis === "historico"
                          ? "a partir do que fez nesta prova, corrigido pela evolução do índice"
                          : "só a partir do índice de hoje — não há voltas utilizáveis dele aqui",
                        r.forecast.teeKnown
                          ? null
                          : `não se conhece o CR/Slope do tee de hoje (${r.teeNow ?? "?"}) — usado o do tee que jogou antes`,
                      ].filter(Boolean).join(" · ")}>
                        <b>{r.forecast.total}</b>
                        {r.forecast.toPar != null
                          ? <span style={{ color: tpColorDark(r.forecast.toPar) }}> {fmtToPar(r.forecast.toPar)}</span>
                          : null}
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}> {r.forecast.low}–{r.forecast.high}</span>
                        {r.forecast.basis === "indice" || !r.forecast.teeKnown
                          ? <span className="p p-sm p-muted" style={{ marginLeft: 4 }}>≈</span> : null}
                      </span>
                    ) : "—"}
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={id + "-d"} className="row-expanded">
                    <td colSpan={8}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12 }}>
                        {r.editions.map((e) => (
                          <div key={e.id}>
                            <b>{e.year}</b>
                            {e.pos ? ` · ${e.pos}º` : ""}
                            {e.total != null ? ` · ${e.total}` : ""}
                            {e.toPar != null ? <span style={{ color: tpColorDark(e.toPar) }}> {fmtToPar(e.toPar)}</span> : null}
                            {e.hcpThen != null ? <span style={{ color: "var(--text-muted)" }}> · hcp {e.hcpThen}</span> : null}
                            <div style={{ color: "var(--text-muted)" }}>
                              {e.rounds.map((rd) => `R${rd.round} ${rd.gross}${rd.sd != null ? ` (SD ${rd.sd.toFixed(1)})` : ""}`).join(" · ")}
                              {e.rounds[0]?.tee ? ` · ${e.rounds[0].tee}` : ""}
                            </div>
                          </div>
                        ))}
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
        <summary style={{ cursor: "pointer" }}>Como é feita a previsão</summary>
        <p style={{ margin: "6px 0" }}>
          Ancorada no que o jogador <b>já fez nesta prova</b>: tira-se o score differential
          de cada volta que ele jogou aqui — <code>(113/Slope) × (gross − CR − PCC)</code>, que
          desconta a dificuldade do tee — e corrige-se pela <b>variação do índice</b> desde
          então. Quem baixou 2 pontos de índice é esperado ~2 golpes melhor. O resultado
          volta a gross com o CR e o Slope do tee que vai jogar hoje (que difere por sexo:
          no mesmo campo, as mesmas marcas dão ratings diferentes a rapazes e raparigas).
        </p>
        <p style={{ margin: "6px 0" }}>
          O intervalo é a dispersão real das voltas dele aqui (nunca menos de ~2,5 golpes de
          differential): golfe não se prevê ao golpe.
        </p>
        <p style={{ margin: "6px 0" }}>
          O «≈» marca as previsões com uma suposição por baixo — ou não há voltas
          utilizáveis do jogador aqui (sai só do índice de hoje, contando o índice
          <b> mais ~3,5 golpes</b>, porque o índice WHS é a média das 8 melhores de 20
          voltas: o bom dia, que sai ~1 em cada 5, não o que se faz num dia normal), ou
          não se conhece o CR/Slope do tee que ele vai jogar e usou-se o do tee anterior.
          Passar o rato por cima diz qual dos dois é.
        </p>
      </details>
    </div>
  );
}
