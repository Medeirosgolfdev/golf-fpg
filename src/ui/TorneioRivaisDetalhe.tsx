import { useState, useEffect, useMemo } from "react";
import { isoDate, fmtDate } from "../utils/format";
import { normPaisDisplay } from "../utils/flagUtils";
import { normName as normNameAuto, type AutoRivalPlayer } from "../data/KIDSdataLoader";
import { FieldEscalaoTable } from "./FieldEscalaoTable";
import { sortEscaloes, type TorneioResult, type FieldData } from "./uskidsTypes";
import { TorneioComManuel, seriesBase } from "./USKIDSPageHelpers";
import { isManuelByName as isManuel } from "../constants/manuel";

function TorneioRivaisDetalhe({ torneio, resultados, fieldData, torneiosComManuel, arMap, kidsMap }: {
  torneio: TorneioComManuel;
  resultados: TorneioResult[];
  fieldData: FieldData | null;
  torneiosComManuel: TorneioComManuel[];
  arMap: Map<string, AutoRivalPlayer>;
  kidsMap: Map<string, string>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isFuture = isoDate(torneio.date_inicio) > today;

  const resT = resultados.find(r => r.t === torneio.t);
  const fieldT = fieldData?.torneios.find(f => f.t === torneio.t);

  const escaloes: { nome: string; age_group: number; players: { nome: string; pais: string }[]; isManuel: boolean }[] = useMemo(() => {
    const esc = new Map<string, { nome: string; age_group: number; players: { nome: string; pais: string }[]; isManuel: boolean }>();
    if (resT) {
      for (const e of resT.escaloes) {
        const seen = new Set<string>();
        const pList: { nome: string; pais: string }[] = [];
        for (const rd of e.rondas) {
          for (const j of (rd.leaderboard ?? rd.jogadores ?? [])) {
            const k = normNameAuto(j.nome);
            if (!seen.has(k)) { seen.add(k); pList.push({ nome: j.nome, pais: j.pais }); }
          }
        }
        if (pList.length > 0) esc.set(e.nome, { nome: e.nome, age_group: e.age_group, players: pList, isManuel: e.is_manuel });
      }
    }
    if (fieldT) {
      for (const e of fieldT.escaloes) {
        const jogadores = e.jogadores ?? [];
        if (jogadores.length === 0) continue;
        const hasManuel = jogadores.some(j => isManuel(j.nome) && j.pais === "PT");
        if (!esc.has(e.nome)) {
          esc.set(e.nome, { nome: e.nome, age_group: e.age_group ?? 0, players: jogadores.map(j => ({ nome: j.nome, pais: j.pais })), isManuel: hasManuel });
        } else {
          const ex = esc.get(e.nome)!;
          const existNames = new Set(ex.players.map(p => normNameAuto(p.nome)));
          for (const j of jogadores) {
            if (!existNames.has(normNameAuto(j.nome))) ex.players.push({ nome: j.nome, pais: j.pais });
          }
          if (hasManuel) ex.isManuel = true;
        }
      }
    }
    return sortEscaloes([...esc.values()]);
  }, [resT, fieldT]);

  const defaultEsc = torneio.escalaoManuel ?? escaloes.find(e => e.isManuel)?.nome ?? escaloes[0]?.nome ?? "";
  const [activeEsc, setActiveEsc] = useState(defaultEsc);
  useEffect(() => { setActiveEsc(defaultEsc); }, [torneio.t]);

  const activeEscData = escaloes.find(e => e.nome === activeEsc);
  const nPaises = new Set((activeEscData?.players ?? []).map(p => normPaisDisplay(p.pais)).filter(Boolean)).size;

  const sBase = seriesBase(torneio.name);
  const currentYear = parseInt((isoDate(torneio.date_inicio) || `${new Date().getFullYear()}-01-01`).slice(0, 4));
  const prevYears = [currentYear - 1, currentYear - 2, currentYear - 3].filter(y => y >= 2020);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <div className="h-lg" style={{ marginTop:0 }}>{torneio.name}</div>
        <div className="detail-sub" style={{ marginTop:4 }}>
          {torneio.date_inicio && <span className="muted">📅 {fmtDate(torneio.date_inicio)}</span>}
          {isFuture
            ? <span className="p p-sm toggle-pill-info">futuro</span>
            : <span className="p p-sm toggle-pill-success">disputado</span>
          }
          {activeEscData && <span className="muted">{activeEscData.players.length} jogadores</span>}
          {nPaises > 1 && <span className="muted">{nPaises} países</span>}
          {resT?.url_resultados && (
            <a href={resT.url_resultados} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted td-none">
              Resultados ↗
            </a>
          )}
          {fieldT?.url_uskids && !resT?.url_resultados && (
            <a href={fieldT.url_uskids} target="_blank" rel="noopener noreferrer"
              className="p p-sm p-muted td-none">
              USKids ↗
            </a>
          )}
        </div>
      </div>

      {escaloes.length > 1 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {escaloes.map(e => (
            <button key={e.nome}
              className={`tourn-tab tourn-tab-sm${activeEsc === e.nome ? " active" : ""}`}
              style={activeEsc === e.nome ? {} : { background:"var(--bg-muted)", color:"var(--text-2)", borderColor:"var(--border)" }}
              onClick={() => setActiveEsc(e.nome)}>
              {e.nome}
              <span className="fs-11" style={{ marginLeft:4, opacity:.7 }}>{e.players.length}</span>
              {e.isManuel && (
                <span className="fs-10" style={{ marginLeft:3, color: activeEsc === e.nome ? "rgba(255,255,255,.8)" : "var(--color-good)" }}>●</span>
              )}
            </button>
          ))}
        </div>
      )}

      {activeEscData && (
        <FieldEscalaoTable
          escalaoNome={activeEsc}
          players={activeEscData.players}
          isFuture={isFuture}
          torneioT={torneio.t}
          resultados={resultados}
          sBase={sBase}
          prevYears={prevYears}
          tornName={torneio.name}
          arMap={arMap}
          kidsMap={kidsMap}
          urlResultados={resT?.url_resultados}
          urlUskids={fieldT?.url_uskids ?? undefined}
        />
      )}
    </div>
  );
}

export default TorneioRivaisDetalhe;
