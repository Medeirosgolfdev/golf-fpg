# WHS — enriquecimento de voltas internacionais, PCC e SD oficial

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Enriquecimento de rondas internacionais — MÉTODO ÚNICO (2026-08-14)

Rondas de torneios internacionais chegam da FPG **sem metros**, com campo
genérico ("INTERNACIONAL", nome sem combo) e tee por cor ("VERMELHAS"). O
enriquecimento é SEMPRE **full-bake** no `melhorias.json` da **RAIZ** (a UI
importa-o directamente em `App.tsx`; o antigo `public/data/melhorias.json` era
órfão e foi eliminado 2026-08-14) — entrada por scoreId com
`whs.course_description` + `scorecard {course_description, tee_name, par_1..18,
meters_1..18, course_rating?, slope?}`. Gerado por **`scripts/enrich-intl-round.js`**
(nunca escrever entradas à mão):

```bash
# Fonte USKids: TEES_LOOKUP (src/ui/uskidsData.ts, curado dos PDFs oficiais) com
# fallback par+yards do uskids-results.json (yards×0.9144, guarda _yards)
node scripts/enrich-intl-round.js --scores 4333809,4333833,4333835 --uskids 21795:2105 --course "Val d'Europe"
# Fonte cópia: outra entrada do melhorias (D2/D3 a partir do D1; mesmo tee físico noutro ano)
node scripts/enrich-intl-round.js --scores 4213116 --copy-from 3946427 --tee "Boys 10-11"
# Depois, sempre:
node pipeline.js --skip-import 52884 && npm test && npm run build
```

Flags: `--course`/`--tee` sobrepõem os da fonte (default: campo/tee do lookup);
`--par n,n,...` sobrepõe o par da fonte — para quando a ORGANIZAÇÃO joga o campo
com par diferente do homologado (caso real: WJGC 2026 jogou o Flamingos par-71
como par 72 no buraco 10 "para não haver tantos bogeys"; a FPG manteve 71 no
WHS — o site mostra o par do TORNEIO, o SD da FPG não muda);
`--nota`/`--pill`/`--group`/`--link`; `--comment "..."` cria a linha `_comment_*`
antes de entradas novas; `--dry-run`. Entradas existentes são FUNDIDAS (notas,
links, pill, campos extra preservados). O ficheiro é editado por splice textual
(⚠ nunca re-serializar o JSON inteiro: o JS reordena as chaves numéricas para a
frente dos `_comment_*`; e o ficheiro é CRLF).

Checklist para um torneio internacional novo:
1. Garantir o evento no `TEES_LOOKUP` (`src/ui/uskidsData.ts`): par/metros dos
   results oficiais + CR/Slope **só do PDF USKids "SSS & SLOPE"** (nunca
   inventar; sem PDF → sem cr/slope e a coluna SD do /uskids fica "—").
2. scoreIds das rondas: `output/{fed}/analysis/data.json` (campo + data).
3. Correr o script (1 comando por evento/tee) + regenerar + testar.

⚠ **Não usar `MANUEL_AWAY_TEE` para casos novos** — é um override por CAMPO e
parte quando o mesmo campo tem tees diferentes por ano (Montecchia: 2025 Boys 11
vs 2026 Boys 12). O runtime (`resolvePlayedSI` / `resolvePlayedMeters` em
`utils/playedDistance.ts`, usados no `jogadores/PlayerDetail.tsx` e na `TeeAdvisorView`)
mantém-se como fallback para rondas ainda não tratadas. Estado
2026-08-14: TODOS os internacionais do Manuel até ao Venice Open 2026 estão
full-bake (Padierna/Le Touquet/Doral/Venice 25+26/Paris/Glen/Marco Simone).

---

## PCC — o ajuste que chega SEMPRE depois do scrape (2026-08-30)

O **PCC** (*Playing Conditions Calculation*, Regra 5.6 do WHS) é um inteiro de
**−1 a +3** calculado pela FPG **por campo e por dia**, a partir de todos os
cartões válidos de jogadores com índice ≤ 36.0 entregues nesse campo nesse dia.
Entra **subtraído** no differential:

```
SD = (113 / Slope) × (AGS − CR − PCC)
```

Logo **PCC −1 SOBE o SD em ~1 pancada** (dia fácil → o bom resultado conta um
pouco menos) e +1..+3 baixam-no (dia difícil). Sem ele a tabela diverge do SD
oficial exactamente por (113/slope)×PCC.

⚠ **A FPG só o calcula ao FIM DO DIA** — e todos os nossos scrapes de resultados
correm na própria noite do torneio (`update-drive` Sex/Sáb/Dom 21:00,
`update-classif` Dom/Seg 01:00, `update-cgss-draw-results` Sex/Sáb/Dom de hora a hora 12:10–18:10 e Seg–Qui 13:10). O
`extractPcc()` desses scripts lê o campo `cba` do scorecard, encontra-o vazio, e
o torneio ficava **para sempre** sem PCC. Caso que destapou isto: 8º Torneio
CGSS OM NOS 2026 (007/11057, 29-08, Santo da Serra), scrapado às 22:57 do
próprio dia — o Manuel aparecia com SD 5.5 em vez do oficial 6.4.

### `scripts/backfill-pcc.js` — a rede de segurança

Cada volta do WHS (`output/{fed}/whs.json`) traz o **`cba` oficial** mais
`tournament_code`, `hcp_dateStr` e `course_description`. Como o WHS é
re-descarregado às 00:05 UTC (já depois da meia-noite de Lisboa), o PCC chega-nos
de graça — sem cookies e sem um pedido extra à FPG.

```bash
node scripts/backfill-pcc.js                      # dry-run
node scripts/backfill-pcc.js --apply
node scripts/backfill-pcc.js --apply --since 2026-01-01
node scripts/backfill-pcc.js --tcode 11057 --verbose
```

Alvos: `pull-torneios*.json`, `drive-data-*.json`, `aquapor-data-*.json`.
Exit **0** = preencheu · **2** = nada a fazer · **1** = erro. Idempotente.

⚠ **Chave = tcode + DATA + CAMPO, nunca só o tcode.** A FPG reutiliza tcodes
entre clubes — o 10052 é ao mesmo tempo um Drive Challenge dos Açores e um do
Tejo. Casar só por tcode carimba um torneio com o PCC de outro, noutro ano.

⚠ **Valor MODAL com maioria estrita, não o primeiro que aparece.** A própria FPG
guarda `cba` desactualizado nalguns registos: na "Final Regional Drive Challenge
Açores-Sub18" (10121, 27-08-2024) cinco dos nossos têm −1 e um tem 0 — o cartão
desse foi processado antes de o PCC existir. É a mesma avaria pelo outro lado.
Empate → não se mexe.

⚠ **Só se escreve PCC ≠ 0.** 0 é "sem ajuste", idêntico a não ter campo nenhum —
e é o que o `extractPcc()` dos scrapers faz, por isso um re-scrape futuro produz
o mesmo ficheiro. O `pcc` vive no **`roundScores[]`** (a seguir a `meters`), não
no jogador; o `normalizePlayer` levanta-o para o topo em runtime.

Passagem inicial (2026-08-30): **5008 rondas em 136 torneios**; a coincidência
exacta entre o SD calculado e o `sgd` oficial subiu de **63,4% para 73,4%** em
15 421 rondas dos nossos. Limitação: só cobre torneios onde pelo menos um dos
nossos jogadores jogou. (Medição anterior ao `whsCalc.ts`: com os métodos
validados a 2026-09-15 o cálculo bate em 99,4% em 18 buracos e 85–91% em 9 — e
o site mostra o SD oficial sempre que o tem; ver "SD oficial nas voltas dos
torneios".)

### Onde corre

| Workflow | Quando | Papel |
|---|---|---|
| `update-data.yml` | Dom+Seg 00:05 UTC | Varredura geral, a seguir a descarregar o WHS. O passo tem `id: pcc` e o commit corre também quando `steps.pcc.outputs.filled == '1'` (senão o PCC ficava no runner) |
| `update-classif.yml` | Dom+Seg 01:00 UTC | Os torneios acabados de scrapar apanham o PCC na mesma noite, em vez de esperar uma semana |

⚠ O `git add` dos dois workflows **tem de incluir** `pull-torneios*`,
`drive-data-*` e `aquapor-data-*` — faltavam no `update-data.yml` e o backfill
teria sido silenciosamente deitado fora.

### ⚠ Sentinelas de "sem cartão" (o bug do badge verde)

A FPG põe **998** (ND/NR — não devolveu) e **999** (NS/WD) no lugar do gross, e o
`numGross()` converte um `grossTotal` null no mesmo 999. O `computeSD` só
rejeitava `null`: o cartão a zeros era "reparado" pelo Net Double Bogey e saía um
SD de **−58.8** que, sendo ≤ HCP, pintava o badge de **VERDE** — as 9
desistências do CGSS OM NOS apareciam como as melhores voltas do dia (25 verdes
em vez de 16). Guarda `gross >= 900` no `computeSD` (`fpgUtils.ts`) e no
`roundDifferential` (`whsCalc.ts`) — as antigas cópias no `ResumoTable.tsx` e na
`DrivePage.tsx` passaram a chamar o `computeSD` (2026-09-15). Mesma convenção do
ranking Drive. Testes em `src/data/__tests__/computeSD.test.ts`.

---

## SD oficial nas voltas dos torneios (2026-09-15)

O site mostra o SD que a FPG atribuiu sempre que o tem; sem ele, calcula-o com
o HCP da inscrição (ver a regra "⛔ Contas de handicap" nos Princípios de
arquitectura). O cartão público do
torneio (`ScoreCard` do classif) **não traz o SD** — medido: traz `cba` (PCC),
`exact_hcp`, `federated_code`, mas nenhum differential. Só o WHS de cada jogador
o tem. Daí o circuito:

| Passo | Script | O quê |
|---|---|---|
| 1 | `fpg-scrape-node.js` | WHS completo dos ~200 que acompanhamos (207 em Set 2026) (`output/{fed}/whs.json`) |
| 2 | `data-archive/whs-sd.json` | SD oficial de ~1.000 juniores (fora do deploy), descarregado **uma vez** a 2026-09-15. Não se volta a pedir — ver abaixo |
| 3 | **`backfill-sd.js`** | escreve o SD em `roundScores[].sd` (ou `sd` no jogador flat) de `pull-torneios*`, `drive-data-*`, `aquapor-data-*`, `jovens_*` |

A lógica partilhada (ficheiros, datas das rondas, casamento) está em
`scripts/lib/official-sd.js`.

- **Casamento (`matchPlayer`, todas as voltas do jogador de uma vez):** se o WHS
  tem tantas voltas desse tcode na semana do torneio como o jogador tem cartões,
  casa-se pela ORDEM das datas e, dentro do mesmo dia, pela proximidade ao SD
  calculado de cada volta. Senão, volta a volta por fed + DATA da ronda
  (`t.date + ronda − 1`), desempatado pelo tcode e pelo gross, sem repetir
  linhas. ⚠ Nunca só por tcode (a FPG reutiliza-os).
  ⚠ **Duas voltas no mesmo dia** — caso real: Taça João Salazar de Sousa 2026
  (038/10758), R1 a 12-09 e R2+R3 a 13-09. O my.fpg.pt não dá o gross, as duas
  linhas do dia 13 eram indistinguíveis e a 1ª versão (volta a volta, R3 → dia
  14 → "pela ordem") deu à R3 de todos o SD da R2 (Sardo 70 com 0.1 em vez de
  −1.5). Teste em `scripts/lib/official-sd.test.js`.
- ⛔ **Não se descarrega WHS de ninguém só para ter o SD oficial** (decisão
  2026-09-15). Existiu um `fetch-whs-sd.js` que o fazia todas as noites e foi
  apagado: em 18 buracos o SD calculado com o HCP da inscrição bate com o
  oficial em 99,4% (os adultos "em vão"), e em 9 buracos a Mariana também o
  achou desnecessário. O que ele trouxe (1.000 juniores, 28.502 SD) ficou no
  `whs-sd.json` e continua a ser usado.
- O `backfill-sd.js` corre no `update-data.yml` (Dom/Seg 00:05 UTC), a seguir ao
  `backfill-pcc.js`, sem pedidos à FPG. Cobertura das voltas dos torneios com SD
  oficial: 64% (2026-09-15).
- Uma volta sem SD oficial usa o calculado com o HCP da inscrição (`computeSD`).
