/**
 * Para os testes da /drive com os DADOS REAIS: o `fetch` passa a ler os
 * ficheiros de `public/data` (pelo `import.meta.glob` do Vite, como o
 * `fpgFilesIndex.test.ts`). Os gerados no build (gitignored) que faltem — no CI
 * os testes correm sem o prebuild — montam-se aqui com os mesmos geradores.
 */
import { buildIndex } from "../../../../scripts/build-fpg-files-index.js";
import { buildLite } from "../../../../scripts/build-federados-lite.js";

const FILES = import.meta.glob("../../../../public/data/*.json", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
const byUrl = new Map(Object.entries(FILES).map(([p, f]) => [`/data/${p.split("/").pop()}`, f]));

export function useRealDataFetch(): void {
  const index = JSON.stringify(buildIndex([...byUrl.keys()].map(u => u.slice(6))));
  globalThis.fetch = (async (url: string) => {
    const u = String(url).split("?")[0];
    // Os gerados no build que faltem: o índice monta-se aqui; o só-do-Drive das
    // inscrições é um subconjunto do completo (o teste driveAdmissionsSubset
    // prova que dá o mesmo à /drive), por isso serve-se o completo.
    // O federados-lite.json (também gerado no build) monta-se do federados.json
    // com o mesmo gerador — no CI os testes correm sem o prebuild.
    const load = u === "/data/fpg-files-index.json" ? async () => index
      : byUrl.get(u)
        ?? (u === "/data/fpg-admissions-draws-drive.json" ? byUrl.get("/data/fpg-admissions-draws.json")
        : u === "/data/federados-lite.json" ? async () => JSON.stringify(buildLite(JSON.parse(await byUrl.get("/data/federados.json")!())))
        : undefined);
    if (!load) return { ok: false, status: 404, text: async () => "" };
    const txt = await load();
    return { ok: true, status: 200, text: async () => txt, json: async () => JSON.parse(txt) };
  }) as unknown as typeof fetch;
}
