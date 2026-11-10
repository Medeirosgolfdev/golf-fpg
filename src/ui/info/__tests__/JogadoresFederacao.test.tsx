import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import JogadoresFederacao, { colunasComuns, type ColunaJogadorFed, type JogadorFedRow } from "../JogadoresFederacao";

type Row = JogadorFedRow & { extra?: string };

const linha = (over: Partial<Row> & { _key: string; _name: string }): Row => ({
  _club: "", sex: null, _cat: null, _young: false, _hcp: null, _hcpDate: null,
  _tot: 0, _ano: 0, _manuel: false, _hay: `${over._name} ${over._key}`.toLowerCase(), ...over,
});

const C = colunasComuns<Row>("pt", { tot: "Total", hcpDate: "Data do HCP" });
const COLUNAS: ColunaJogadorFed<Row>[] = [
  C.nome(), C.club, C.hcp, C.sex,
  { k: "extra", label: "Extra", tem: (r) => !!r.extra, cmp: () => 0, td: (r) => <td>{r.extra}</td> },
  C.tot, C.ano, C.hcpDate,
];

const ROWS: Row[] = [
  linha({ _key: "L3", _name: "Zélia Costa", _club: "Clube B", sex: "F", _hcp: 12.4, _tot: 3, _ano: 1 }),
  linha({ _key: "L1", _name: "Ana Dias", _club: "", sex: "F", _hcp: null }),
  linha({ _key: "L2", _name: "Manuel Medeiros", _club: "Clube A", sex: "M", _hcp: -1.2, _manuel: true }),
];

const desenha = (over: Partial<Parameters<typeof JogadoresFederacao<Row, unknown>>[0]> = {}) =>
  renderToStaticMarkup(
    <JogadoresFederacao<Row, unknown>
      rows={ROWS} error={null} loadingMessage="A carregar…" title="Jogadores" sub="3 jogadores"
      licLabel="Licença" colunas={COLUNAS} catOptions={[]} catClass="u-w-150px" jovensTitle="Só jovens"
      torneios={{ url: "/x.json", ok: () => true, render: () => null, erro: "erro" }}
      footer="rodapé" {...over}
    />,
  );

describe("JogadoresFederacao — esqueleto das listas de jogadores das federações de fora", () => {
  it("esconde as colunas em que ninguém tem dados e mostra as outras", () => {
    const html = desenha();
    const cabecalhos = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    // «Extra» e «Últ. HCP» não têm dados em ninguém → fora; Tot e Ano aparecem as duas (uma tem torneios).
    expect(cabecalhos.map((c) => c.replace(/[▲▼]/g, "").trim())).toEqual([
      "Licença", "Nome", "Clube", "HCP", "Sexo", "📊 Tot", `🗓 ${new Date().getFullYear()}`,
    ]);
  });

  it("ordena por nome à partida, marca o Manuel e mostra o contador «N de M»", () => {
    const html = desenha();
    const ordem = ["Ana Dias", "Manuel Medeiros", "Zélia Costa"].map((n) => html.indexOf(n));
    expect(ordem.every((i) => i > 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(html).toContain("row-manuel");
    expect(html).toContain("3 de 3");
    // HCP plus com «+», como em todo o site
    expect(html).toContain("+1.2");
  });

  it("a carregar, com erro e sem jogadores", () => {
    expect(desenha({ rows: null })).toContain("A carregar…");
    expect(desenha({ rows: null, error: "ficheiro em falta" })).toContain("ficheiro em falta");
    expect(desenha({ rows: [] })).toContain("Nenhum jogador corresponde aos filtros.");
  });

  it("o filtro a mais da página entra na contagem", () => {
    const html = desenha({ passaExtra: (r) => r.sex === "F" });
    expect(html).toContain("2 de 3");
    expect(html).not.toContain("row-manuel");
  });

  it("colunas comuns: vazios no fim nas duas direcções", () => {
    const [zelia, ana, manuel] = ROWS;
    for (const m of [1, -1] as const) {
      // Ana não tem HCP nem clube → depois de quem tem, a subir e a descer
      expect(C.hcp.cmp(ana, zelia, m)).toBeGreaterThan(0);
      expect(C.hcp.cmp(manuel, ana, m)).toBeLessThan(0);
      expect(C.club.cmp(ana, manuel, m)).toBeGreaterThan(0);
    }
    expect(C.hcp.cmp(manuel, zelia, 1)).toBeLessThan(0);
    expect(C.hcp.cmp(manuel, zelia, -1)).toBeGreaterThan(0);
    expect(C.tot.cmp(zelia, ana, 1)).toBeGreaterThan(0);
  });
});
