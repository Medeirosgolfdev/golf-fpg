/**
 * DriveEquipasTab — classificação por equipas (regiões) de uma Final Drive.
 *
 * Dados: `public/data/drive-equipas.json` (chave «ccode-tcode»), lidos do PDF oficial
 * «Resultados» da FPG. Regra dos Termos: equipas de 15 jogadores por região; conta o
 * somatório dos 10 melhores resultados gross em relação ao par (o Sub-10 joga 9 buracos
 * e entra pelo To PAR). `conta` marca os 10 resultados que entram no total.
 */
import { useMemo, useState } from "react";
import { useSort } from "../../hooks/useSort";
import SortableHdr from "../../ui/SortableHdr";
import { isManuelByName } from "../../constants/manuel";

import type { DriveEquipasData } from "../../data/drive/driveLoader";
export type { DriveEquipasData };

const fmtPar = (n: number) => (n === 0 ? "PAR" : n > 0 ? `+${n}` : String(n));

type EqKey = "pos" | "regiao" | "toPar" | "n";
type JgKey = "regiao" | "nome" | "buracos" | "gross" | "toPar" | "conta";

export default function DriveEquipasTab({ data }: { data: DriveEquipasData }) {
  const [regiao, setRegiao] = useState<string | null>(null);
  const eq = useSort<EqKey>("pos", "asc");
  const jg = useSort<JgKey>("toPar", "asc");

  const equipas = useMemo(() => {
    const dir = eq.sortDir === "asc" ? 1 : -1;
    return [...data.equipas].sort((a, b) => {
      switch (eq.sortKey) {
        case "regiao": return dir * a.regiao.localeCompare(b.regiao);
        case "toPar": return dir * (a.toPar - b.toPar);
        case "n": return dir * (a.jogadores.length - b.jogadores.length);
        default: return dir * (a.pos - b.pos);
      }
    });
  }, [data, eq.sortKey, eq.sortDir]);

  const jogadores = useMemo(() => {
    const dir = jg.sortDir === "asc" ? 1 : -1;
    const rows = data.equipas
      .filter((e) => !regiao || e.regiao === regiao)
      .flatMap((e) => e.jogadores.map((j) => ({ ...j, regiao: e.regiao, posEquipa: e.pos })));
    return rows.sort((a, b) => {
      switch (jg.sortKey) {
        case "regiao": return dir * (a.posEquipa - b.posEquipa) || a.toPar - b.toPar;
        case "nome": return dir * a.nome.localeCompare(b.nome);
        case "buracos": return dir * (a.buracos - b.buracos) || a.toPar - b.toPar;
        case "gross": return dir * ((a.gross ?? 999) - (b.gross ?? 999));
        case "conta": return dir * (Number(b.conta) - Number(a.conta)) || a.toPar - b.toPar;
        default: return dir * (a.toPar - b.toPar) || a.nome.localeCompare(b.nome);
      }
    });
  }, [data, regiao, jg.sortKey, jg.sortDir]);

  return (
    <div className="flex-col gap-12">
      <div className="muted fs-12">{data.regra} Fonte: <a href={data.fonte} target="_blank" rel="noreferrer">PDF «Resultados» da FPG</a>.</div>

      <div className="sc-wrap">
      <table className="dtable tbl-compact" style={{ width: "auto", minWidth: 320 }}>
        <thead>
          <tr>
            <SortableHdr k="pos" sortKey={eq.sortKey} sortDir={eq.sortDir} onSort={eq.toggleSort}>Pos.</SortableHdr>
            <SortableHdr k="regiao" sortKey={eq.sortKey} sortDir={eq.sortDir} onSort={eq.toggleSort} style={{ textAlign: "left" }}>Região</SortableHdr>
            <SortableHdr k="toPar" sortKey={eq.sortKey} sortDir={eq.sortDir} onSort={eq.toggleSort} title="Soma dos 10 melhores resultados em relação ao par">10 melhores</SortableHdr>
            <SortableHdr k="n" sortKey={eq.sortKey} sortDir={eq.sortDir} onSort={eq.toggleSort} title="Jogadores com resultado">Jogadores</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {equipas.map((e) => (
            <tr key={e.regiao} onClick={() => setRegiao(regiao === e.regiao ? null : e.regiao)}
              className={regiao === e.regiao ? "row-manuel" : undefined} style={{ cursor: "pointer" }}
              title="Clique para ver só os jogadores desta região">
              <td className="ta-c fw-700">{e.pos}</td>
              <td>{e.regiao}</td>
              <td className="ta-c fw-700">{fmtPar(e.toPar)}</td>
              <td className="ta-c">{e.jogadores.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="muted fs-12">
        {regiao ? <>Jogadores de <strong>{regiao}</strong> · <a href="#" onClick={(ev) => { ev.preventDefault(); setRegiao(null); }}>ver todas as regiões</a></> : "Jogadores de todas as regiões (clique numa região para filtrar)"}
        {" · "}✓ = resultado que conta para a equipa
      </div>
      <div className="sc-wrap">
      <table className="dtable tbl-compact" style={{ width: "auto", minWidth: 420 }}>
        <thead>
          <tr>
            <SortableHdr k="regiao" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort} style={{ textAlign: "left" }}>Região</SortableHdr>
            <SortableHdr k="nome" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort} style={{ textAlign: "left" }}>Jogador</SortableHdr>
            <SortableHdr k="buracos" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort} title="Sub-10 joga 9 buracos">Bur.</SortableHdr>
            <SortableHdr k="gross" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort}>Gross</SortableHdr>
            <SortableHdr k="toPar" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort}>To PAR</SortableHdr>
            <SortableHdr k="conta" sortKey={jg.sortKey} sortDir={jg.sortDir} onSort={jg.toggleSort} title="Entra nos 10 melhores da equipa">Conta</SortableHdr>
          </tr>
        </thead>
        <tbody>
          {jogadores.map((j) => (
            <tr key={j.regiao + j.nome} className={isManuelByName(j.nome) ? "row-manuel" : undefined}>
              <td>{j.regiao}</td>
              <td>{j.nome}</td>
              <td className="ta-c">{j.buracos}</td>
              <td className="ta-c">{j.gross ?? "—"}</td>
              <td className="ta-c fw-700">{fmtPar(j.toPar)}</td>
              <td className="ta-c">{j.conta ? "✓" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
