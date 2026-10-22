/**
 * Para os testes da /drive com os DADOS REAIS: o `fetch` passa a ler os
 * ficheiros de `public/data` (pelo `import.meta.glob` do Vite, como o
 * `fpgFilesIndex.test.ts`); o `fpg-files-index.json` (gerado no build) sai dos
 * ficheiros que existem, com o mesmo `buildIndex` do gerador.
 */
import { buildIndex } from "../../../../scripts/build-fpg-files-index.js";

const FILES = import.meta.glob("../../../../public/data/*.json", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const byUrl = new Map(Object.entries(FILES).map(([p, f]) => [`/data/${p.split("/").pop()}`, f]));

export function useRealDataFetch(): void {
  const index = JSON.stringify(buildIndex([...byUrl.keys()].map(u => u.slice(6))));
  globalThis.fetch = (async (url: string) => {
    const u = String(url).split("?")[0];
    // Os gerados no build que faltem: o índice monta-se aqui; o só-do-Drive das
    // inscrições é um subconjunto do completo (o teste driveAdmissionsSubset
    // prova que dá o mesmo à /drive), por isso serve-se o completo.
    const load = u === "/data/fpg-files-index.json" ? async () => index
      : byUrl.get(u) ?? (u === "/data/fpg-admissions-draws-drive.json" ? byUrl.get("/data/fpg-admissions-draws.json") : undefined);
    if (!load) return { ok: false, status: 404, text: async () => "" };
    const txt = await load();
    return { ok: true, status: 200, text: async () => txt, json: async () => JSON.parse(txt) };
  }) as unknown as typeof fetch;
}
