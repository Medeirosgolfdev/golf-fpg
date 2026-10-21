import { describe, it, expect } from "vitest";
import jovens2026Raw from "../../../../public/data/jovens_2026.json?raw";
import clubes2026Raw from "../../../../public/data/CLUBES2026.json?raw";
import type { Tournament } from "../../../data/fpgTypes";
import { buildDisplayList, isDriveOrAquapor } from "../../../data/fpgUtils";
import { dedupDisplayTournaments } from "../../../data/fpgPageLoader";
import { isClubesMatchPlay } from "../../../data/clubesFormats";
import { buildEventGroups } from "../../../ui/InscricoesComponents";
import { buildFpgEntries, buildClubesEntries, resolveFpgTkey } from "../fpgCircuitData";
import { clubesCtRedirect } from "../routes";

/**
 * Passo 8 da FPGPage: o torneio aberto sai só do URL, pelo CircuitShell
 * (`resolveFpgTkey` sobre as entradas da vista) — sem `selected`/`cur` nem os
 * efeitos de sincronização da lista antiga. Estes são os deep-links que têm de
 * continuar a abrir no sítio certo, com os dados reais.
 */
const jovens = (JSON.parse(jovens2026Raw) as { tournaments: Tournament[] }).tournaments
  .map(t => ({ ...t, _jovensYear: "2026" }));
const clubes = (JSON.parse(clubes2026Raw) as { tournaments: Tournament[] }).tournaments
  .map(t => ({ ...t, series: "clubes", _clubesYear: "2026" }));

/** A vista «Todos» como a FPGPage a monta (aqui sem os pull-torneios). */
function todosEntries(ts: Tournament[]) {
  const displayList = buildDisplayList(dedupDisplayTournaments(ts, jovens));
  return buildFpgEntries(buildEventGroups(
    displayList.filter(t => !isDriveOrAquapor(t) && !isClubesMatchPlay(t)), { mergeEditions: true }));
}

describe("deep-links da /FPG", () => {
  it("/FPG/torneio/007-11011 (Regional de Jovens da Madeira) abre no escalão Sub 14", () => {
    const sel = resolveFpgTkey(todosEntries([]), "007-11011");
    expect(sel.divKey).toBe("007-11011");
    const entry = todosEntries([]).find(e => e.id === sel.id)!;
    // Evento multi-escalão: Sub 10&12 + Sub 14 a 24 numa só entrada.
    expect(entry.divisions!.map(d => d.key)).toEqual(expect.arrayContaining(["007-11010", "007-11011"]));
    expect(entry.divisions!.find(d => d.key === sel.divKey)!.escalao).toBe("Sub 14");
  });

  it("/FPG/clubes?ct=059-10685 → /FPG/torneio/059-10685, que vive na vista Clubes", () => {
    expect(clubesCtRedirect("clubes", "?ct=059-10685")).toBe("/FPG/torneio/059-10685");
    // Em «Todos» não está (match play) — a página passa para Clubes…
    expect(resolveFpgTkey(todosEntries(clubes), "059-10685").id).toBeUndefined();
    // …onde resolve na entrada certa.
    const sel = resolveFpgTkey(buildClubesEntries(clubes), "059-10685");
    expect(sel.divKey).toBe("059-10685");
  });
});
