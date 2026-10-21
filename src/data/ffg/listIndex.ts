/**
 * listIndex.ts — Gera o índice da lista da /ffg para os torneios GolfGenius e
 * LGPIDF (`/data/ffg-list-index.json`). Corre no BUILD, não no browser:
 * `scripts/build-ffg-list-index.js` empacota este ficheiro (esbuild) e chama
 * `buildFfgListIndex` com os ficheiros de `public/data`.
 *
 * Porquê: a /ffg descarregava no arranque todos os ficheiros GolfGenius do
 * catálogo e todos os LGPIDF (~7 MB) só para montar a lista. Agora a lista sai
 * deste índice e cada ficheiro só se pede quando o torneio se abre
 * (`ffgListLoadDivisions`).
 *
 * As entradas constroem-se com as MESMAS funções que o browser usa ao abrir o
 * torneio (`ggGroupEntry`/`lgpidfEntry`), e `entryListMeta` resume-as no que a
 * sidebar e os filtros leem (★, PT, 🕳️, escalão, sexo…) — a lista fica igual
 * à que se montava com tudo carregado.
 */
import type { ReactNode } from "react";
import { entryListMeta } from "../../ui/circuit/entryState";
import type { Catalog, FFGResIndex, FFGTournament, FfgListIndex, FfgListItem, LGPIDFIndex, LGPIDFTournament } from "./types";
import { ggGroupEntry, ggGroups, lgpidfEntry, visibleLgpidf, type FfgRenderers } from "./ffgEntries";

/** No build não se desenha nada (os metadados não dependem do que se desenha). */
const NO_RENDER: FfgRenderers = { draw: () => null as ReactNode, lgpidfTotals: () => null, lgpidfCourseMap: () => null };

export interface FfgListInput {
  ffgResIndex: FFGResIndex | null;
  lgpidfIndex: LGPIDFIndex | null;
  /** `${year}_${slug}` → ficheiro LGPIDF. */
  lgpidfData: Map<string, LGPIDFTournament>;
  ggCatalog: Catalog | null;
  /** `${year}_${slug}` → ficheiro GolfGenius. */
  ggData: Map<string, FFGTournament>;
  /** Chaves `${year}_${slug}` com gémeo no portal (`ffgolf-gg-twins.json`). */
  ggTwins: Set<string>;
}

/** O índice: primeiro os LGPIDF, depois os GolfGenius (a ordem da lista antiga). */
export function buildFfgListIndex(src: FfgListInput): FfgListIndex {
  const items: FfgListItem[] = [];
  for (const { meta, data } of visibleLgpidf(src.ffgResIndex, src.lgpidfIndex, src.lgpidfData)) {
    items.push({ entry: entryListMeta(lgpidfEntry(meta, data, NO_RENDER)), lgpidf: meta });
  }
  for (const members of ggGroups(src.ggCatalog, src.ggData, src.ggTwins)) {
    items.push({ entry: entryListMeta(ggGroupEntry(members, NO_RENDER)), gg: members.map((m) => m.meta) });
  }
  return { _gerado: "scripts/build-ffg-list-index.js", items };
}
