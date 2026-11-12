/**
 * src/data/kidsFicha.ts — a ficha do Kids 2 de um jogador de uma tabela: o
 * MESMO caminho da seta ↗, para tudo o que as tabelas vão lá buscar (12/11/2026,
 * Mariana: «em todas as tabelas, de todas as páginas, da mesma forma que aparece
 * a setinha para a página de kids2, também deve de vir de lá a info daquele
 * jogador»).
 *
 * Ordem, igual à da seta (TournPName):
 *   1. `juniorId` — a ficha dada pela própria fonte (lista de inscritos, licença
 *      de uma federação). Determinístico; ganha ao nome.
 *   2. o nome, pelo mapa das setas (KidsLinkCtx). Um homónimo com OUTRO federado
 *      não conta (o pai do Manuel).
 *
 * Quem usa: o nome com bandeira e sexo (TournPName), o nascimento e o HCP
 * (kidsDob.ts → Inscrições, Draw, voltas e Resumo) e as colunas do Kids 2 das
 * Inscrições dos circuitos de fora.
 */
import type { KidsLinkEntry } from "../ui/KidsLink";
import { normName } from "../utils/normName";

export interface QuemEKids {
  nome?: string | null;
  fed?: string | null;
  juniorId?: string | null;
}

/** Índice por id de cada mapa das setas (construído uma vez por mapa). */
const _porId = new WeakMap<ReadonlyMap<string, KidsLinkEntry>, Map<string, KidsLinkEntry>>();
function porId(kidsMap: ReadonlyMap<string, KidsLinkEntry>): Map<string, KidsLinkEntry> {
  let idx = _porId.get(kidsMap);
  if (!idx) {
    idx = new Map();
    for (const e of kidsMap.values()) if (e.id && !idx.has(e.id)) idx.set(e.id, e);
    _porId.set(kidsMap, idx);
  }
  return idx;
}

/** A ficha do Kids 2 do jogador, ou undefined (sem ficha, ou só um homónimo). */
export function fichaDoKids(kidsMap: ReadonlyMap<string, KidsLinkEntry>, q: QuemEKids): KidsLinkEntry | undefined {
  if (q.juniorId) {
    // A fonte disse qual é a ficha: mesmo que o índice ainda não a tenha, o id serve
    // para ler o juniors-scout.json.
    return porId(kidsMap).get(q.juniorId) ?? { n: q.nome ?? "", id: q.juniorId };
  }
  if (!q.nome) return undefined;
  const e = kidsMap.get(normName(q.nome));
  if (!e || (q.fed && e.fed && e.fed !== q.fed)) return undefined;
  return e;
}
