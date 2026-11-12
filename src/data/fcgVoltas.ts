/**
 * fcgVoltas.ts — Juntar os «jogos» do golfdirecto que são voltas da MESMA prova
 * (12/11/2026, Mariana: «Sim, passo 3»).
 *
 * O golfdirecto publica cada volta de uma prova como um jogo à parte («Ronda 1»,
 * «Ronda 2»…), todos com o mesmo `game.tournament._id`. O jogo da última volta
 * traz as anteriores só com o TOTAL do dia (`previous[]`); o buraco a buraco de
 * cada volta está no ficheiro do jogo dessa volta. Até aqui cada jogo era uma
 * entrada da /rfeg (a mesma prova duas vezes) e os cartões da 1.ª volta ficavam
 * na outra entrada.
 *
 * `juntarVoltasFcg` devolve o jogo da última volta com:
 *  - em cada jogador, os cartões das voltas anteriores que existem em disco
 *    (`__voltas`: buraco a buraco e o tee DESSA volta — muda de dia para dia);
 *  - no fim de cada categoria, quem só aparece nos jogos anteriores (não passou
 *    o cut, desistiu), marcado `__soAnteriores` — ninguém desaparece.
 *
 * O jogador é o mesmo pela licença; sem ela, pelo id do golfdirecto; sem os dois,
 * pelo nome. Linha sem nenhum dos três não se casa com ninguém.
 *
 * Só dados — sem React, sem carregamentos. Não altera os objectos que recebe.
 */
import type { FCGDetail, FCGPlayer, FCGCategory, FcgVoltaAnterior } from "./fcgAdapter";
import { soma } from "../utils/mathUtils";

/** Os totais dos dias ANTERIORES ao jogo, por ordem. O golfdirecto às vezes
 *  inclui a volta do próprio jogo em `previous[]` (soma = acumulado): essa sai. */
export function totaisAnteriores(p: Pick<FCGPlayer, "previous" | "view">): (number | null)[] {
  const prev: (number | null)[] = (Array.isArray(p.previous) ? p.previous : [])
    .map((x: { day?: { strokeNumber?: number } | null } | null) => (x && x.day && typeof x.day.strokeNumber === "number" ? x.day.strokeNumber : null));
  const acc = p.view?.acc || p.view?.day || null;
  const total = acc && typeof acc.strokeNumber === "number" ? acc.strokeNumber : null;
  if (prev.length && total != null && prev.every((g) => g != null) && soma(prev) === total) prev.pop();
  return prev;
}

/** Quem é o jogador entre jogos da mesma prova (ver o cabeçalho); null = não se casa. */
function chaveDoJogador(p: FCGPlayer): string | null {
  if (p.license) return `lic:${p.license}`;
  if (p._id) return `id:${p._id}`;
  const nome = [p.firstName, p.surname].filter(Boolean).join(" ").trim().toLowerCase();
  return nome ? `nome:${nome}` : null;
}

const temCartao = (p: FCGPlayer): boolean => !!p.scorecard?.gross?.some((x) => typeof x === "number" && x > 0);

/**
 * O jogo da última volta com o que os jogos das voltas anteriores têm.
 * `anteriores`: os outros jogos da mesma prova (qualquer ordem; os que não
 * existem ficam de fora). Sem anteriores devolve `ultimo` tal como está.
 */
export function juntarVoltasFcg(ultimo: FCGDetail, anteriores: (FCGDetail | null | undefined)[]): FCGDetail {
  const outros = anteriores.filter((j): j is FCGDetail => !!j && Array.isArray(j.categories))
    .sort((a, b) => String(a.game?.scheduleStartDate ?? "").localeCompare(String(b.game?.scheduleStartDate ?? "")));
  if (!outros.length) return ultimo;

  // Cartões por jogador (uma entrada por volta) e o registo mais recente de cada um.
  const cartoes = new Map<string, FcgVoltaAnterior[]>();
  const registo = new Map<string, { p: FCGPlayer; cat: FCGCategory }>();
  for (const jogo of outros) {
    for (const cat of jogo.categories) {
      for (const p of cat.players || []) {
        const k = chaveDoJogador(p);
        if (!k) continue;
        registo.set(k, { p, cat });
        if (!temCartao(p)) continue;
        const round = totaisAnteriores(p).length + 1;
        const lista = cartoes.get(k) ?? [];
        // A mesma volta em dois ficheiros: fica a primeira lida (a mais antiga).
        if (!lista.some((v) => v.round === round)) lista.push({ round, gross: p.scorecard!.gross, gameTee: p.scorecard!.gameTee ?? null });
        cartoes.set(k, lista);
      }
    }
  }

  const presentes = new Set<string>();
  const comVoltas = (p: FCGPlayer): FCGPlayer => {
    const k = chaveDoJogador(p);
    if (!k) return p;
    const volta = totaisAnteriores(p).length + 1;
    const antes = (cartoes.get(k) ?? []).filter((v) => v.round < volta);
    return antes.length ? { ...p, __voltas: antes } : p;
  };

  const categorias: FCGCategory[] = ultimo.categories.map((cat) => ({
    ...cat,
    players: (cat.players || []).map((p) => {
      const k = chaveDoJogador(p);
      if (k) presentes.add(k);
      return comVoltas(p);
    }),
  }));

  // Quem só aparece nos jogos anteriores: entra no fim da categoria com o mesmo nome.
  for (const [k, { p, cat }] of registo) {
    if (presentes.has(k)) continue;
    const extra: FCGPlayer = { ...comVoltas(p), __soAnteriores: true };
    const destino = categorias.find((c) => c.name === cat.name);
    if (destino) destino.players.push(extra);
    else categorias.push({ ...cat, players: [extra] });
  }

  return { ...ultimo, categories: categorias };
}
