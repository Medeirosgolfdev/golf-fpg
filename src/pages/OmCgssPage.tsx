/**
 * src/pages/OmCgssPage.tsx — /om-cgss
 *
 * Página só da Ordem de Mérito Júnior do CG Santo da Serra: a mesma tab que
 * aparece dentro de cada prova da OM (fpgOmRanking.tsx), mas sem prova aberta,
 * logo com a classificação de HOJE — matriz com as provas jogadas e as que
 * faltam, tabela de como se pontuam os juniores em cada prova, o que ainda está
 * em jogo e os links para as OMs adultas oficiais.
 */
import { Toolbar, ToolbarTitle } from "../ui/Toolbar";
import { OmRankingTab } from "./fpg/fpgOmRanking";

export default function OmCgssPage() {
  return (
    <div className="page-full" style={{ maxWidth: "none" }}>
      <Toolbar>
        <ToolbarTitle>🏅 Ordem de Mérito Júnior — CG Santo da Serra</ToolbarTitle>
      </Toolbar>
      <div style={{ padding: "8px 12px" }}>
        <OmRankingTab tournament={null} level={null} />
      </div>
    </div>
  );
}
