import { describe, it, expect } from "vitest";
import clubes2026Raw from "../../../../public/data/CLUBES2026.json?raw";
import { renderToStaticMarkup } from "react-dom/server";
import MatchplayView from "../MatchplayView";
import TeamPointsStandings from "../TeamPointsStandings";
import { clubesMatchplayToFile, clubesTeamPoints } from "../../../data/clubesMatchplayAdapter";
import { CLUBES_TEAM_FORMAT } from "../../../data/clubesFormats";
import type { MatchPlayData } from "../../../data/clubesMatchplayTypes";

// Regional de Clubes 2026 (3-way match play) desenhado pelas peças partilhadas.
const clubes2026 = JSON.parse(clubes2026Raw) as {
  tournaments: { ccode: string; tcode: string; matchPlayResults?: MatchPlayData }[];
};
const mp = clubes2026.tournaments.find(t => t.ccode === "059" && t.tcode === "10685")!.matchPlayResults!;
const opts = { categories: CLUBES_TEAM_FORMAT["059-10685"].categories };

describe("MatchplayView com confrontos 3-way", () => {
  const html = renderToStaticMarkup(<MatchplayView data={clubesMatchplayToFile(mp, opts)} roundPicker />);

  it("selector de dias, uma coluna por clube, jogador com link, gross (±par) e pontos", () => {
    expect(html).toContain(">Dia 1<");
    expect(html).toContain(">Total<");
    for (const c of ["C.G.S.S.", "PXO Golf", "C.P. Golf"]) expect(html).toContain(`>${c}<`);
    expect(html).toContain('href="/jogadores/52884"');
    expect(html).toContain("80 (+8)");
    expect(html).toContain("mp-pts mp-pts-lead");
    expect(html).toContain("row-manuel");
  });

  it("Dia 1 por defeito: sem confrontos pendentes e sem o Dia 2", () => {
    expect(html).not.toContain("sem resultado publicado");
    expect(html).toContain("20/06");
    expect(html).not.toContain("21/06");
  });
});

describe("TeamPointsStandings", () => {
  const html = renderToStaticMarkup(<TeamPointsStandings data={clubesTeamPoints(mp, opts)} />);

  it("Total por defeito: pontos por categoria, total, classificação oficial e aviso dos pendentes", () => {
    expect(html).toContain("Classif. oficial");
    expect(html).toContain(">Homens<");
    expect(html).toContain(">Senhoras<");
    expect(html).toContain(">Juniores<");
    expect(html).toContain("18½");   // CPG: 10 + 1 + 7½
    expect(html).toContain("confrontos sem resultado publicado");
    expect(html).toContain('title="Não joga esta categoria"'); // CGSS nas Senhoras
  });
});
