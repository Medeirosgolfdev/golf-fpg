/**
 * scripts/aggregator/sources/fig.js
 *
 * Adapter — Federazione Italiana Golf (Federgolf, /fig): provas juvenis
 * individuais (Trofei Giovanili Federali, U16, WAGR, Campionati Nazionali e
 * Internazionali). Lê `federgolf/{id}.json` (scripts/scrape-federgolf.js; uma
 * prova = um sexo — M e F da mesma prova juntam-se num torneio com dois
 * flights, como na /fig) e o `federgolf-ranking.json` (ano de nascimento =
 * ano do ranking − idade).
 *
 * Chave forte: o id da Federgolf (GUID por jogador, estável entre provas).
 * Sem data de nascimento nem país dos italianos → o casamento com as fichas
 * que já existem NÃO passa pelo nome + país do matcher (≈400 italianos têm a
 * ficha com outro país — residentes, dupla nacionalidade), mas pelo passo
 * próprio `casarPorProvas` do identity-matcher: prova em comum (mesmo dia,
 * mesmas pancadas) > ficha única com esse nome; ano de nascimento contra
 * (data, ano do ranking, escalões USKids) nunca casa; várias fichas
 * possíveis sem prova em comum não casa (decisão dela, 02/11/2026).
 *
 * Os nomes, o país dos estrangeiros (o «clube» é o país: SWI, DAN, SCO…), a
 * chave da prova e os anos de nascimento vêm das MESMAS funções da /fig
 * (src/data/federgolf/nomes.ts).
 */

const fs = require("fs");
const path = require("path");
const { DATA_DIR, readJsonSafe } = require("../util/io");

const SOURCE_ID = "fig";
const SOURCE_LABEL = "Federazione Italiana Golf";

// O MESMO ficheiro que a /fig (o Node ≥ 22.18 corre TypeScript; o workflow não instala dependências).
const FG = require("../../../src/data/federgolf/nomes.ts");

const grossOk = (g) => typeof g === "number" && g > 0 && g < 900;
/** «U16»/«U18» → idade máxima; o resto (TGF, Campionati…) fica sem. */
const idadeMax = (categoria) => { const m = /U\s?(\d{2})/i.exec(String(categoria || "")); return m ? +m[1] : null; };
const paisIso2 = (clube) => { const p = FG.fgPais(clube); return p ? p.slice(0, 2) : "IT"; };

function load() {
  const dir = path.join(DATA_DIR, "federgolf");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const anos = FG.fgAnosNascimento(readJsonSafe(path.join(DATA_DIR, "federgolf-ranking.json"), null));

  const players = new Map();
  const grupos = new Map(); // data|clube|nome base → provas (M e F)
  for (const f of files) {
    const t = readJsonSafe(path.join(dir, f), null);
    if (!t || t.futura || !Array.isArray(t.jogadores) || !t.jogadores.length || !t.data) continue;
    const k = FG.fgChaveProva(t);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(t);
  }

  const tournaments = [];
  for (const provas of grupos.values()) {
    provas.sort((a, b) => (a.sexo === "M" ? 0 : 1) - (b.sexo === "M" ? 0 : 1));
    const p0 = provas[0];
    const flights = provas.map((t) => {
      const par = Array.isArray(t.campo?.par) && t.campo.par.length ? t.campo.par : undefined;
      const jogadas = Math.max(0, ...t.jogadores.map((j) => (j.voltas || []).filter(grossOk).length));
      const results = t.jogadores.filter((j) => j.id).map((j) => {
        if (!players.has(j.id)) {
          const ano = anos.get(j.id);
          players.set(j.id, {
            sourceKey: j.id,
            name: FG.fgNome(j.nome),
            sex: t.sexo === "F" ? "F" : "M",
            country: paisIso2(j.clube),
            club: FG.fgPais(j.clube) ? null : FG.fgClube(j.clube) || null,
            hcp: typeof j.indice === "number" ? j.indice : undefined,
            hcpDate: typeof j.indice === "number" ? t.data : undefined,
            dobRange: ano ? { lo: `${ano}-01-01`, hi: `${ano}-12-31` } : undefined,
            extra: { anosNascimento: ano ? [ano] : [] },
          });
        }
        // HCP desta prova (o «indice» da Federgolf à data) → histórico datado, que o
        // Kids 2 usa para pintar o SD de quem não tem HCP noutra fonte (03/11/2026).
        if (typeof j.indice === "number" && t.data) {
          const pl = players.get(j.id);
          if (!pl.hcpHistory) pl.hcpHistory = [];
          if (!pl.hcpHistory.some((h) => h.date === t.data)) {
            pl.hcpHistory.push({ date: String(t.data).slice(0, 10), hcpExact: j.indice, source: "fig", label: FG.fgTitulo(FG.fgNomeBase(t.nome)) });
          }
        }
        const voltas = j.voltas || [];
        const rounds = voltas.map((g, i) => {
          const c = (j.cartoes || [])[i];
          return { round: i + 1, gross: grossOk(g) ? g : null, ...(Array.isArray(c) && c.some((s) => s > 0) ? { strokes: c.map((s) => s || 0) } : {}) };
        }).filter((r) => r.gross != null);
        const status = !rounds.length ? "WD" : rounds.length < jogadas ? "CUT" : "OK";
        return {
          playerSourceKey: j.id,
          playerName: FG.fgNome(j.nome),
          pos: status === "OK" ? j.pos : null,
          status,
          totalGross: grossOk(j.total) ? j.total : null,
          toPar: typeof j.toPar === "number" && status === "OK" ? j.toPar : null,
          rounds,
        };
      });
      return {
        flightKey: t.sexo === "F" ? "femminile" : "maschile",
        label: t.sexo === "F" ? "Femminile" : "Maschile",
        ageMin: null,
        ageMax: idadeMax(t.categoria),
        sex: t.sexo === "F" ? "F" : "M",
        par,
        fieldSize: results.length,
        results,
      };
    });
    tournaments.push({
      sourceKey: p0.id,
      name: FG.fgTitulo(FG.fgNomeBase(p0.nome)),
      seriesId: `fig-${String(p0.tipo || "giovanili").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      seriesLabel: p0.tipo || "Federgolf",
      date: p0.data,
      startDate: p0.data,
      course: FG.fgClube(p0.clube) || undefined,
      parTotal: p0.parTotal || undefined,
      holesPerRound: 18,
      rounds: Math.max(...provas.map((t) => t.voltas || 0)) || undefined,
      flights,
      links: [
        { label: "Itália", url: `/fig/${p0.id}` },
        ...provas.map((t) => ({ label: `Federgolf · ${t.sexo === "F" ? "Femminile" : "Maschile"}`, url: t.url })).filter((l) => l.url),
      ],
      extra: { ids: provas.map((t) => t.id) },
    });
  }
  return { sourceId: SOURCE_ID, sourceLabel: SOURCE_LABEL, players: [...players.values()], tournaments };
}

module.exports = { load, SOURCE_ID, SOURCE_LABEL };
