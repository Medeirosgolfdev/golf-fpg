'use strict';

/**
 * uskids-classify.js — que torneios do signupanytime entram no radar.
 *
 * ⚠ O NOME DO TORNEIO NÃO CLASSIFICA NADA — o `GetMeta` já o faz por nós.
 * Durante muito tempo a decisão era só por palavras-chave sobre o nome, e isso
 * falha nos dois sentidos porque o nome de um evento USKids é livre:
 *   • "PGA Golf Club Invitational 2026" (Regional, Port St. Lucie) caía no
 *     exclude 'golf club', que existe para deitar fora os ~1200 eventos do
 *     Local Tour, que se chamam pelo nome do campo;
 *   • "Colonial Williamsburg Classic 2026" e "Monterey Challenge 2026"
 *     (Regionais também) não batiam em include nenhum — 'classic' e 'challenge'
 *     só existiam colados a um sítio ('venice classic', 'australian').
 * Os três estavam com inscrições abertas e nunca chegaram à app (medido
 * 2026-08-30: t=22986, 23318, 23420, todos dentro da zona varrida).
 *
 * O `tournament` do GetMeta traz `tour` (ex: "Domestic Championships Tour") e
 * `type` (inteiro), e é essa a taxonomia oficial. Medida sobre os 1320 torneios
 * vivos em t=22240…23640 (2026-08-30):
 *
 *   type  tour                            n     exemplo
 *   ────  ──────────────────────────────  ────  ─────────────────────────────
 *      1  Domestic Championships Tour        5  Seaview Open 2026        ← Regional
 *      2  Teen Series Tour                  30  Teen Series at Longleaf (NC)
 *      5  {cidade} Tour                   ~1150 The Legends Golf Club    ← Local Tour
 *      6  {cidade} Tour (Tour Championship) ~190 Longleaf … (Tour Championship)
 *      7  State Invitationals Tour           8  2026 Kansas State Invitational
 *      8  International Championships Tour  14  Venice Open 2026
 *      9  Team Golf Tour                    23  Concord Local Parent/Child 2026
 *     12  Girls Invitationals Tour           2  2026 Girls Invitational - Longleaf (NC)
 *     13  International Teen Series Tour     3  International Teen Series at Al Hamra
 *
 * Os três escalões que a app segue — Regional (1), State (7) e Internacional
 * (8) — entram agora pelo `type`, sem depender do nome. As palavras-chave
 * ficam como camada ADITIVA, e só elas: é o que continua a trazer as etapas de
 * Local Tour que seguimos de propósito (Azata/Andaluzia, Panamá, Al Hamra,
 * OPEN.9 Eichenried, Circolo Golf Venezia) sem abrir a porta aos outros ~1200.
 * FORCAR_EXCLUIR vence tudo.
 */

// ── Camada 1: tipo oficial do GetMeta ─────────────────────────────────────
const TIPO_LABEL = {
  1:  'Domestic Championships (Regional)',
  2:  'Teen Series',
  5:  'Local Tour',
  6:  'Local Tour (Tour Championship)',
  7:  'State Invitationals',
  8:  'International Championships',
  9:  'Team Golf (Parent/Child)',
  12: 'Girls Invitationals',
  13: 'International Teen Series',
};
/** Tipos que entram SEMPRE, seja qual for o nome. */
const TIPOS_INCLUIR = new Set([1, 7, 8]);

/**
 * Tipos que entram só quando o tour é INTERNACIONAL (fora dos EUA).
 *
 * O type 6 é a final de época (Tour Championship) de cada Local Tour de
 * cidade — o irmão do type 5, que fica de fora de propósito. São 184, das
 * quais 133 por jogar: pô-las todas no radar levaria a Fase 2 do monitor
 * diário de 33 para ~166 torneios, cinco vezes o trabalho, e a esmagadora
 * maioria é dos EUA, onde não nos cruzamos com ninguém. Ficam as 54 de fora
 * dos EUA — Azata/Andaluzia, Venice, Milão, Turim, Toscana, Munique,
 * Hamburgo, Nuremberga, Lyon, Londres, Panamá, América Latina, Ásia.
 */
const TIPOS_INCLUIR_SE_INTL = new Set([6]);

/**
 * O tour é de fora dos EUA?
 *
 * ⚠ O sinal é o CÓDIGO DE PAÍS ENTRE PARÊNTESES ("Lima (PE) Tour",
 * "Andalusia (ES) Tour"). Os tours americanos que trazem sigla de estado
 * usam VÍRGULA e nunca parênteses ("Charleston, SC Tour",
 * "Central Valley, CA Tour") — verificado nos 158 tours distintos do corpus:
 * 14 com vírgula, zero falsos positivos. Os únicos "(CA)" são Niagara e
 * Vancouver, que são o CANADÁ, não a Califórnia — e esses contam como fora
 * dos EUA, portanto entram de propósito.
 */
const ehTourInternacional = (tour) => /\([A-Z]{2}\)/.test(String(tour || ''));

// ── Camada 2: palavras-chave (só para Local Tours que seguimos) ───────────
const KEYWORDS_INCLUIR = [
  'world championship', 'world van horn', 'van horn cup',
  'european championship', 'european van horn',
  'irish open', 'paris invitational',
  'marco simone', 'venice open', 'venice classic', 'venezia',
  'rome open', 'rome classic', 'terre dei consoli',
  'andaluz', 'andalusia', 'sevilla', 'marbella', 'sotogrande', 'valderrama',
  'european', 'australian', 'canadian', 'african',
  'panama', 'vallarta', 'jekyll', 'nordic', 'al hamra',
  'fazenda boa vista', 'azata', 'holiday classic',
  'championship', 'invitational', 'masters', 'open',
];
// Vencem TUDO (incluindo INCLUIR_FORTE e o tipo): variantes pais/filhos de
// torneios que de outra forma entravam pelo nome do evento principal ("Holiday
// Classic Parent/Child 2026", "European Championship Parent/Child"). Era isto
// que obrigava a listar cada uma à mão em FORCAR_EXCLUIR.
const KEYWORDS_EXCLUIR_SEMPRE = ['parent/child', 'parent child'];
const KEYWORDS_EXCLUIR = [
  'tour championship', 'parent/child', 'parent', 'qualifier',
  'van horn', 'teen series', 'teen championship', 'world teen',
  'girls invitational', 'girls championship', 'girls open', 'girl',
  'golf course', 'golf club', 'country club',
  'veteran', 'world golf village',
  'thailand championship', 'korean championship', 'malaysian championship', 'philippines championship',
];
// Keywords específicos o bastante para ignorar KEYWORDS_EXCLUIR.
const INCLUIR_FORTE = [
  'world championship', 'world van horn', 'van horn cup',
  'european championship', 'european van horn',
  'marco simone', 'venice open', 'venice classic', 'venezia',
  'rome open', 'rome classic', 'terre dei consoli',
  'irish open', 'paris invitational',
  'andaluz', 'andalusia', 'sevilla', 'marbella', 'sotogrande', 'valderrama',
  'panama', 'vallarta', 'jekyll', 'nordic', 'al hamra',
  'fazenda boa vista', 'azata', 'holiday classic',
  'state invitational', 'state championship', 'state open',
];

// ── Camada 3: excepções por tcode ─────────────────────────────────────────
// 21080=Marco Simone 2026, 21133=Jekyll Island Cup,
// 21667=World Teen Championship 2026 (excepção às teen series)
const FORCAR_INCLUIR = new Set([21080, 21133, 21667]);
const FORCAR_EXCLUIR = new Set([
  21573, // Marco Simone local tour
  21298, // International Teen Series at Al Hamra
  21571, // Terre Dei Consoli Golf Club (local, não torneio)
  21872, // Teen Van Horn Cup
  22096, // World Championship Parent/Child - Girls
  21502, // European Van Horn Cup 2026
  21747, // World Van Horn Cup 2026
  21510, // European Championship Parent/Child 2026
  22095, // World Championship Parent/Child 2026 - Boys
  21400, // Marco Simone Invitational Parent/Child 2026
  22140, // OPEN.9 Golf Eichenried (local tour)
]);

/**
 * Decide se um torneio interessa, pelo tipo do GetMeta e, em segunda mão, pelo
 * nome. `tipo` é opcional: entradas de cache antigas não o têm e continuam a
 * ser avaliadas só pelo nome (o comportamento de antes).
 */
function ehInternacional(name, tipo, tour) {
  const n = String(name || '').toLowerCase();
  if (KEYWORDS_EXCLUIR_SEMPRE.some(k => n.includes(k))) return false;
  // Tipo oficial: Regional / State / Internacional entram sempre.
  if (tipo != null && TIPOS_INCLUIR.has(Number(tipo))) return true;
  // Tour Championship: só fora dos EUA.
  if (tipo != null && TIPOS_INCLUIR_SE_INTL.has(Number(tipo))) return ehTourInternacional(tour);
  // KEYWORDS_INCLUIR tem prioridade — se bater, inclui (exceto FORCAR_EXCLUIR)
  if (!KEYWORDS_INCLUIR.some(k => n.includes(k))) return false;
  if (INCLUIR_FORTE.some(k => n.includes(k))) return true;
  // Keywords genéricos (championship, open, invitational...) — exclude actua
  return !KEYWORDS_EXCLUIR.some(k => n.includes(k));
}

/** Decisão final para um tcode: FORCAR_EXCLUIR > FORCAR_INCLUIR > tipo/nome. */
function incluirTorneio(t, name, tipo, tour) {
  if (FORCAR_EXCLUIR.has(Number(t))) return false;
  if (FORCAR_INCLUIR.has(Number(t))) return true;
  return ehInternacional(name, tipo, tour);
}

module.exports = {
  TIPO_LABEL, TIPOS_INCLUIR, TIPOS_INCLUIR_SE_INTL, ehTourInternacional,
  KEYWORDS_INCLUIR, KEYWORDS_EXCLUIR, KEYWORDS_EXCLUIR_SEMPRE, INCLUIR_FORTE,
  FORCAR_INCLUIR, FORCAR_EXCLUIR,
  ehInternacional, incluirTorneio,
};
