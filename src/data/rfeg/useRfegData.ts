/**
 * useRfegData.ts — Os dados da /rfeg: o índice de torneios, os lookups por
 * licença (data de nascimento, HCP), os gémeos RFEGolf↔LGS e o índice de
 * veteranos. As entradas da sidebar saem daqui já construídas; o detalhe de
 * cada torneio é carregado por `loadDivisions` (que a página desenha).
 *
 * Tirado da RFEGPage a 21/10/2026 — comportamento igual ao que estava lá.
 */
import { useEffect, useMemo, useState } from "react";
import { cachedFetchJson } from "../fetchCache";
import { formatPlayerName } from "../../utils/playerUtils";
import { vetKey } from "../../utils/normName";
import type { CircuitEntry, CircuitDivision } from "../../ui/circuit/types";
import type { RFEGIndex, RFEGIndexEntry, DobLookup, DobLookupFile, HcpLookup, HcpLookupFile } from "./types";
import { buildRfegEntries } from "./entries";

/* ── veteranIndex pré-calculado (páginas lazy) ──────────────────────────
 * O CircuitShell só consegue contar presenças (toggle ✦ Veteranos) a partir
 * das divisões EAGER. A RFEG é lazy (centenas de torneios carregados sob
 * demanda), por isso fornecemos um índice pré-calculado a partir dos
 * agregados de rivais (rfegolf-rivals + fcg-rivals), que já trazem a lista
 * de jogadores por torneio sem precisar de abrir cada ficheiro de detalhe.
 *
 * ⚠ As chaves TÊM de bater com `vetKey(player.name)` do shell (índice de
 * veteranos): o leaderboard formata os nomes via formatPlayerName() (reordena
 * "APELIDO, Nome" e Title-Case), por isso aplicamos a MESMA transformação aqui
 * antes da chave. Usamos o `vetKey` partilhado (normName + tokens ordenados),
 * tolerante à ordem nome/apelido. */
interface RfegRivalsFile {
  torneios?:
    | Record<string, { players?: { n?: string }[] }>
    | { players?: { n?: string }[] }[];
}

const normNameVet = vetKey;

function buildRfegVetIndex(files: (RfegRivalsFile | null | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of files) {
    if (!f?.torneios) continue;
    const tors = Array.isArray(f.torneios) ? f.torneios : Object.values(f.torneios);
    for (const t of tors) {
      const players = t?.players;
      if (!Array.isArray(players)) continue;
      const seen = new Set<string>(); // dedup por torneio (cross-divisão)
      for (const p of players) {
        const k = normNameVet(formatPlayerName(String(p?.n ?? "")));
        if (!k || seen.has(k)) continue;
        seen.add(k);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
  }
  return m;
}

export interface RfegData {
  index: RFEGIndex | null;
  entries: CircuitEntry[];
  /** Gémeos RFEGolf→LGS (compId → id LGS): o URL RFEGolf redirecciona para o LGS. */
  twins: Record<string, number>;
  vetIndex: Map<string, number>;
  error: string | null;
}

/** `loadDivisions(t, dob, hcp)` carrega o detalhe de um torneio (é a página que
 *  o desenha). */
export function useRfegData(
  loadDivisions: (t: RFEGIndexEntry, dobLookup?: DobLookup, hcpLookup?: HcpLookup) => Promise<CircuitDivision[]>,
): RfegData {
  const [index, setIndex] = useState<RFEGIndex | null>(null);
  const [dobLookup, setDobLookup] = useState<DobLookup | undefined>(undefined);
  const [hcpLookup, setHcpLookup] = useState<HcpLookup | undefined>(undefined);
  const [twins, setTwins] = useState<Record<string, number>>({});
  const [lgsSuppressed, setLgsSuppressed] = useState<Record<string, number>>({});
  const [vetIndex, setVetIndex] = useState<Map<string, number>>(() => new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cachedFetchJson<RFEGIndex>("/data/rfegolf-resultats-index.json")
      .then((d) => { if (!d) { setError("Ficheiro rfegolf-resultats-index.json não encontrado. Corre `node scripts/build-rfegolf-index.js`."); return; } setIndex(d); })
      .catch((e) => setError(String(e?.message ?? e)));
    cachedFetchJson<DobLookupFile>("/data/licencia-dob-lookup.json").then((d) => { if (d && d.lookup) setDobLookup(d.lookup); }).catch(() => {});
    cachedFetchJson<HcpLookupFile>("/data/licencia-hcp-lookup.json").then((d) => { if (d && d.lookup) setHcpLookup(d.lookup); }).catch(() => {});
    // Gémeos RFEGolf<->LGS: esconder o duplicado RFEGolf (só-PDF) quando há LGS rico.
    cachedFetchJson<{ twins: Record<string, number>; lgsSuppressed?: Record<string, number> }>("/data/rfegolf-lgs-twins.json").then((d) => { if (d && d.twins) setTwins(d.twins); if (d && d.lgsSuppressed) setLgsSuppressed(d.lgsSuppressed); }).catch(() => {});
    // Índice de veteranos (presenças por jogador) — agregados de rivais.
    Promise.all([
      cachedFetchJson<RfegRivalsFile>("/data/rfegolf-rivals.json").catch(() => null),
      cachedFetchJson<RfegRivalsFile>("/data/fcg-rivals.json").catch(() => null),
    ]).then(([a, b]) => {
      const m = buildRfegVetIndex([a, b]);
      if (m.size) setVetIndex(m);
    });
  }, []);

  // O dedup de gémeos RFEGolf<->LGS corre DENTRO de buildRfegEntries (antes de
  // agrupar), por isso apanha também as entradas combinadas `grp-…`.
  const entries = useMemo(
    () => (index ? buildRfegEntries(index, twins, lgsSuppressed, (t) => loadDivisions(t, dobLookup, hcpLookup)) : []),
    [index, dobLookup, hcpLookup, twins, lgsSuppressed, loadDivisions],
  );

  return { index, entries, twins, vetIndex, error };
}
