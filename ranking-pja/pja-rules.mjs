/**
 * pja-rules.mjs — FONTE ÚNICA das regras de pontuação/elegibilidade do
 * Ranking PJA 2026+.
 *
 * Consumido por DOIS sítios (uma alteração aqui chega aos dois no deploy):
 *  - App principal (golf-fpg.vercel.app): `src/pages/FPGPage.tsx` (isPJA do
 *    pjaRankingList), `src/ui/PJARankingView.tsx` (classificação/multiplicadores)
 *    e `src/pages/fpg/constants.ts` (TOURN_PILLS deriva de PJA_TCODES).
 *  - Página standalone (ranking-pja.vercel.app): `ranking-pja/index.html`
 *    importa este ficheiro via <script type="module"> (served same-origin —
 *    o root directory do projecto Vercel `ranking-pja` é esta pasta).
 *
 * ⚠ JS puro sem dependências (corre no browser tal-e-qual). Tipos em
 * `pja-rules.d.mts`. Regras de APRESENTAÇÃO (shortTournName, etc.) ficam
 * fora — só aqui vive o que afecta pontos/elegibilidade.
 */

/** tcodes de torneios PJA exclusivos (pill "PJA" + contam para o ranking).
 *  ⚠ NÃO adicionar aqui tcodes que a FPG reutilize noutros clubes/anos —
 *  o match é só por tcode. Casos desses vão por nome em `isPJACore`. */
export const PJA_TCODES = new Set([
  "10444", // AT&T Pebble Beach Pro-Am by Titleist (Royal Óbidos, 2025-02-01)
  "10492", // Aroeira Master by Details (Fev 2025)
  "10036", // Ribagolfe Oaks Masters 2025
  "10260", // Greatgolf Junior Open w/ Luis Figo Foundation (Vilamoura Millennium, 2025-03-02) — confirmado oficial PJA pelo Excel da comissão técnica
  "10019", // Race to Dunas G. Final (Comporta Dunas, 2025-11-29) — Grande Final 2025
]);

/** tcodes conhecidos das Grandes Finais PJA. Whitelist preferencial — o nome
 *  varia: "PJA TOUR Grand Final" (2024 = 10005), "Race to Dunas G. Final"
 *  (2025 = 10019), etc. */
export const GF_TCODES = new Set(["10005", "10019"]);

/** Multiplicadores especiais por tcode — decisões da comissão técnica PJA
 *  que se sobrepõem ao standard (1.0) e à Grande Final (1.5).
 *  Documentar SEMPRE a razão no comentário ao lado para auditoria futura. */
export const TOURN_MULTIPLIER = {
  // Royal Óbidos AT&T Pebble Beach Pro-Am — 2025-02-01 (ccode 152, tcode 10444):
  // x1.75 decidido pela comissão técnica porque o torneio anterior do
  // calendário foi cancelado, sendo este compensado com pontuação mais alta.
  "10444": 1.75,
};

/** Pontos de uma volta: par = 25, −1 por pancada acima, +1 abaixo (mín. 0). */
export function pjaPts(toPar, mult) {
  return Math.max(0, 25 - toPar) * mult;
}

export function isGFTournament(t) {
  const tcode = String(t.tcode || "");
  if (GF_TCODES.has(tcode)) return true;
  // Fallback: nome com "Grand Final"/"Grande Final"/"G. Final" (NÃO apanhar
  // /dunas/ por si só — bug 2026-04-28: "PJA Race to Dunas" marcado GF).
  return /\b(grand[ae]?|g\.)\s*final\b/i.test(t.name || "");
}

/** Multiplicador do torneio: TOURN_MULTIPLIER (especial) → GF (1.5) → 1.0. */
export function getTournMultiplier(t) {
  const tcode = String(t.tcode || "");
  if (TOURN_MULTIPLIER[tcode] !== undefined) return TOURN_MULTIPLIER[tcode];
  if (isGFTournament(t)) return 1.5;
  return 1.0;
}

/** Classificação de um torneio para as regras 2026+ (GG Main só R2+R3,
 *  Aquapor só os 2 primeiros e exclusão mútua com DT, etc.). */
export function classifyPJAEvent(t) {
  const name = t.name || "";
  const tcode = String(t.tcode || "");
  // Greatgolf tcodes 2026 (nome + tcode para evitar colisões com Drive Challenge)
  if (/greatgolf/i.test(name)) {
    if (tcode === "10294") return "GG_MAIN";
    if (tcode === "10295") return "GG_U14";
    if (tcode === "10296") return "GG_U12";
    // Greatgolf noutros anos (ex. 10260 em 2025) — tratar como exclusivo
    return "PJA_EXCL";
  }
  if (/Circuito\s+Aquapor/i.test(name)) return "AQUAPOR";
  if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return "DT";
  return "PJA_EXCL";
}

/** Um torneio conta para o ranking PJA? (regras partilhadas por nome/tcode/ano)
 *  Regras específicas da app (torneios `_manual` com `_origin === "PJA"`,
 *  exclusão do Santo da Serra por ccode) ficam no wrapper da FPGPage. */
export function isPJACore(t) {
  const name = t.name || "";
  const year = (t.date || "").slice(0, 4);
  if (/PJA/i.test(name)) return true;
  // (sem `??` de propósito — o ficheiro corre cru em browsers antigos)
  const tcodes = String(t.tcode == null ? "" : t.tcode).split("+").filter(Boolean);
  if (tcodes.some((tc) => PJA_TCODES.has(tc))) return true;
  if (year >= "2026") {
    if (/greatgolf.*junior/i.test(name)) return true;
    if (/Drive\s+Tour/i.test(name) && !/Challenge/i.test(name)) return true;
    if (/Circuito\s+Aquapor/i.test(name)) return true;
    // Amendoeira World Kids Golfe (ccode 179, tcodes 10603-10607 em 2026, um
    // por escalão). Por nome — a FPG reutiliza os tcodes 10604-10606 no Clube
    // de Belas 2025, por isso NÃO podem entrar em PJA_TCODES. A edição 2025
    // fica fora (ranking 2025 é o legacy confirmado contra o Excel oficial).
    if (/Amendoeira\s+World\s+Kids/i.test(name)) return true;
    // Miramar Internacional Open U25 (Club de Golf de Miramar, ccode 003 —
    // tcode 10652 U25 + 10653 Sub-10, 19-21 Ago 2026), "Miramar Open" no
    // calendário oficial PJA TOUR 2026.
    // Por NOME, nunca por tcode: a FPG reutiliza os dois números noutros
    // clubes e anos (10652 em 009/022, 10653 em 009/022), por isso NÃO podem
    // entrar em PJA_TCODES. O regex exige "Intern*cional" (cobre a gralha
    // "Internancional" da fonte) para não apanhar as provas de clube do mesmo
    // campo — Taça Praia de Miramar, Miramar Winter/Spring Cup, Banco
    // Carregosa Miramar Open.
    if (/Miramar\s+Intern\w*cional\s+Open/i.test(name)) {
      // ⚠ Só o U25 (10652). O Sub-10 (10653, prova separada de 9 buracos/dia)
      // fica de fora: não há nenhum Sub-10 inscrito no PJA 2026, por isso a
      // prova nunca creditaria ninguém e só acrescentaria uma coluna vazia.
      // Se um dia houver um Sub-10 no circuito, apagar esta linha.
      return !/\bSub\s*-?\s*10\b/i.test(name);
    }
    // ⚠ A Taça Visconde Pereira Machado (T.V.P.M., 6-7 Jul 2026) está no
    // calendário mas NÃO conta — exclusão deliberada, não re-adicionar.
    // A razão é a que a nota pública explica (ver PJA_NOTAS); o detalhe
    // técnico está no CLAUDE.md, secção "Ranking PJA".
  }
  return false;
}

/** Notas de elegibilidade MOSTRADAS ao público — as duas superfícies (app e
 *  ranking-pja.vercel.app) renderizam esta mesma lista, cada uma à sua maneira.
 *  O TEXTO vive aqui, e não em cada página, pela mesma razão que as regras:
 *  a 2026-08-12 o Amendoeira entrou só numa das duas e as páginas ficaram a
 *  dizer coisas diferentes uma da outra.
 *
 *  - `ano`   — época a que a nota pertence.
 *  - `tipo`  — "fora" (prova do calendário que NÃO conta) · "info".
 *  - `ate`   — data ISO a partir da qual a nota deixa de ser mostrada (para as
 *              notas de agenda não ficarem no site depois de a prova passar).
 */
export const PJA_NOTAS = [
  {
    ano: "2026",
    tipo: "fora",
    titulo: "A Taça Visconde Pereira Machado (6-7 Jul, Estoril) não conta para o ranking",
    texto:
      "Os miúdos jogaram das marcas brancas, mais recuadas do que as do " +
      "escalão deles. O ranking pontua o resultado em relação ao par, e o par " +
      "é o mesmo seja qual for a marca de saída — num campo mais comprido " +
      "fariam mais pancadas e perderiam pontos por causa da marca, não do " +
      "jogo. Por isso a prova ficou de fora.",
  },
  {
    ano: "2026",
    tipo: "info",
    ate: "2026-09-06",
    titulo: "Próxima prova: Torre — 5 de Setembro",
    texto: "Terras da Comporta · Torre.",
  },
];

/** Notas a mostrar hoje: as do ano pedido que ainda não expiraram (`ate`).
 *  `hoje` em ISO (YYYY-MM-DD) — parâmetro para os testes serem determinísticos. */
export function notasPJA(year, hoje) {
  const hj = hoje || new Date().toISOString().slice(0, 10);
  return PJA_NOTAS.filter((n) => String(n.ano) === String(year) && (!n.ate || n.ate >= hj));
}
