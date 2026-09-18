# USKids — scripts, procura de torneios, API signupanytime e tcodes

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — USKids (Playwright)

**fetch-uskids-results.js** — Scorecards completos + par/yards reais por buraco. Torneios em curso: atualiza auto. Históricos configurados no array `HISTORICOS`.
```bash
node scripts/fetch-uskids-results.js
```
Output: `public/data/uskids-results.json`

**fetch-uskids-member-history.js** — Histórico completo de carreira USKids de cada jogador nos flights configurados. Matching memberID→nome por strokes fingerprinting. Checkpoint a cada 250 jogadores (grava os chunks) — seguro interromper.
```bash
node scripts/fetch-uskids-member-history.js         # scrape (só novos)
node scripts/fetch-uskids-member-history.js --clean  # re-match nomes offline (sem browser)
```
Output: `data-archive/uskids-member-history-NNN.json` (chunks; o monolítico `uskids-member-history.json` só é lido como semente, já não é escrito)

**fetch-uskids-rich-players-node.js** — **Node puro** (sem Playwright). Pipeline RICA por jogador (não por torneio). Para cada memberID no slim + novos descobertos: `GetMemberTournamentResults` → cruza para `(tcode, age_group)` → `GetMeta` (cached) → `GetPlayerTeeTimes` (cached) → escreve `data-archive/uskids-rich-players/{memberID}.json` com TODOS os campos da API (teeMarkerName, teeMarkerColor, startHole, startTime, groupNumber, playerNumber, status, points, handicap, place, etc.). **Sem filtros TOP-N nem MAX_AGE_TODAY** — carreira completa.

Cache separada do member-history: `uskids-rich-flight-cache.json.gz` (re-fetch só se torneio ≤15d). **É gzipada de propósito** (2026-08-24): em claro são ~84 MB a crescer ~20 MB/semana e passou os **100 MB** do GitHub a 17 Ago — o push era rejeitado e, como o commit era ÚNICO, levava atrás as fichas dos jogadores desse run (2 segundas-feiras seguidas, ~10h de scrape perdidas). Gzipada dá ~8 MB e o histórico do repo deixa de levar um blob de 100+ MB por semana. O `loadFlightCache` ainda lê um `.json` legado para migrar; o primeiro save grava o `.gz` e apaga-o. ⚠ O workflow faz **dois commits com pushes separados** (fichas primeiro, cache depois) — um ficheiro problemático nunca mais pode custar os dados novos. Skip-existing por `lastUpdated` (default `--since-days 14`). Matching memberID→pid local via fingerprint de strokes (mesmas salvaguardas `MIN_FINGERPRINT_HOLES=6`, `MIN_FINGERPRINT_DISTINCT=3` do member-history). Exit code 2 = sem novidades.

```bash
node scripts/fetch-uskids-rich-players-node.js                    # default (skip-existing 14d)
node scripts/fetch-uskids-rich-players-node.js --limit 10         # smoke test
node scripts/fetch-uskids-rich-players-node.js --players 630106,591440
node scripts/fetch-uskids-rich-players-node.js --since-days 30 --concurrency 8
node scripts/fetch-uskids-rich-players-node.js --force-rebuild    # ignora todos os caches
node scripts/fetch-uskids-rich-players-node.js --discovery-only   # só descobre novos mids
```

Workflow: `update-uskids-rich-players.yml` (Seg 02:00 UTC, depois do member-history). Sem secrets (signupanytime é público server-side).

**build-member-history-slim.js** — Converte os ficheiros numerados `uskids-member-history-XXX.json` (em `data-archive/`) num único `uskids-member-history-slim.json` (em `public/data/`). Remove campos duplicados entre jogadores, mantém apenas gross+strokes por ronda.
```bash
node scripts/build-member-history-slim.js
```

**fetch-uskids-field.js** — Corre 1x/dia (`uskids-field.yml`, 07:00 UTC). Fase 1
descobre torneios novos (→ `uskids-discovery-cache.json`), Fase 2 recolhe
inscritos por escalão (→ `uskids-field.json`). O `fetch-uskids-results.js` lê a
MESMA cache para saber que torneios estão em curso — descoberta partida = sem
resultados também.
```bash
node scripts/fetch-uskids-field.js
node scripts/fetch-uskids-field.js --only 23132,23670   # só estes torneios: sem Fase 1, os outros ficam como estão
node scripts/fetch-uskids-field.js --backfill 400       # enche mais depressa o catálogo para trás (default 150/corrida)
node scripts/fetch-uskids-field.js --force              # grava mesmo perdendo >30% dos inscritos
```

Exit **0** = gravou · **2** = guarda anti-encolhimento recusou (ficheiro
anterior intacto, não é erro) · **1** = erro.

### ⚡ Procura só para a frente, um pedido de cada vez (2026-09-14)

A varredura das secções seguintes (Passagem A + densa +1500 + sondas +20000,
5 em paralelo, sem pausa) fazia **4.400–6.000 pedidos por dia** e levou a
USKids a bloquear-nos a 12/09 — no GitHub e, em teste, também no PC de casa.
Substituída por `scripts/lib/uskids-frontier.js` (puro, com testes) +
`descobrirTorneios`. O que a justifica, **medido a 14/09**:

- **Os tcodes são todos da USKids e seguidos.** O "buraco de 632" (21610→22243)
  não existia: 11 de 12 números amostrados lá dentro são torneios USKG (Local
  Tours, State Invitationals, Tour Championships). O código antigo chamava
  "vazio" a tudo o que o filtro excluía.
- Número que ainda não existe = **HTTP 200 com corpo vazio**. Na zona viva o
  maior falhanço seguido medido é de 15.
- A USKids cria **~6 números por dia** (23588 a 23/08 → 23714 a 14/09).
- Em **6 meses de histórico** nenhum torneio apareceu atrás da fronteira por si:
  os 87 "atrás" caem todos em dias em que mudámos as regras.
- **Abrir a página de inscritos no browser custa 13 pedidos** (+ analytics); o
  GetMeta pedido de dentro da página, 1.

O que faz agora, por corrida:

| Parte | Pedidos | Como |
|---|---|---|
| Fronteira | ~6 + 40 | do último número que existe para a frente, 1 de cada vez (1,2 s), até **40 seguidos inexistentes**. Sem resposta → **pára** e recomeça no mesmo número na corrida seguinte (nunca passa à frente de um número por confirmar) |
| Buracos | poucos | inexistentes deixados para trás revistos durante 7 dias |
| Catálogo | 150 | `uskids-tcode-catalog.json` guarda **todos** os números vistos, incluindo os excluídos (tipo, tour, datas, estado); enche-se para trás até `PISO_BACKFILL` (22240). Uma mudança de regras **reclassifica em casa, 0 pedidos** |
| Inscritos | ~250–400 | `planearFase2`: **todos os torneios todos os dias** (decisão dela, 15/09 — *"a qualquer momento quero ver se é vantajoso me inscrever"*): contagens e vagas a 1 pedido por torneio; escalão com a contagem mudada volta a pedir os nomes; 1×/semana (`t % 7`) os nomes refazem-se por inteiro. O Manuel e `scripts/uskids-seguir-diario.json` vão primeiro. Página aberta **uma vez**; tecto `ORCAMENTO_FASE2 = 800` |

À **primeira recusa** pára tudo (Fase 1 e Fase 2); os torneios que faltam ficam
com o registo anterior. Total típico: **~150–300 pedidos/dia**, contra ~6.000.

Regras de inclusão (14/09, `uskids-classify.js`): entram pelo tipo os
Regionais (1), Teen Series (2, 13), **Mundiais (3, 4 — o World Championship é
tipo 4)**, **todos** os Tour Championships (6, EUA incluídos), State (7) e
Internacionais (8). **Ficam fora os Girls (12) — "não procures os GIRLS" — e os
Pais/Filhos (9)**, e por nome o Veteran Qualifier e as Van Horn Cup. Na página
`/uskids` há chips por categoria ao lado do ★ Manuel (só com ele desligado); por
defeito vêem-se os Internacionais e os Mundiais.

---

⛔ **HISTÓRICO — as secções seguintes, até "Datas de inscrição USKids",
descrevem a varredura antiga, substituída a 2026-09-14 (acima).** Ficam pelo
registo das avarias que ensinaram as regras. As secções "Datas de inscrição
USKids" e "O NOME não classifica o torneio" continuam em vigor, com as regras de
inclusão por tipo alargadas a 2026-09-14 (acima).

⚠ **A varredura de tcodes tem de ser em DUAS passagens (corrigido 2026-08-23).**
Os tcodes do signupanytime são sequenciais por criação mas só uma fatia pertence
à conta internacional (`ax=1129`) — o resto devolve `GetMeta` sem torneio. A
versão antiga começava na âncora (`ultimo_t+1`) e parava ao fim de **100 tcodes
seguidos vazios**; entre 21610 e o torneio conhecido seguinte (22243) há **632
vazios**, por isso morria sempre a ~21710 e **não descobria um torneio novo
desde 6 de Julho** (o site ficou preso em Outubro). Por cima disso havia um
`T_MAX = 23000` fixo, com os tcodes vivos já em ~23590. Agora:

- **Passagem A** — âncora → maior tcode conhecido: varrida **por inteiro, sem
  paragem antecipada** (é onde estão os buracos gigantes).
- **Passagem B** — acima do maior conhecido: segue o plano de
  `scripts/lib/uskids-scan-plan.js` (9 testes; apagado a 2026-09-14 com a procura só para a frente), que **nunca desiste
  definitivamente num buraco**. ⚠ Desde 2026-09-12 as **sondas** (e a Passagem
  A) correm só 1×/semana — ver "O volume" mais abaixo; a densa continua diária. Duas redes: (1) varredura **densa com margem
  dinâmica** — varre tudo até `últimoVivo + 1500`, e como a margem conta a
  partir do último tcode VIVO, cada torneio encontrado empurra o fim para a
  frente (enquanto houver vida a varredura não acaba); (2) **sondas de salto** —
  janelas de 20 tcodes de 250 em 250 até `últimoVivo + 20000`, para o caso de um
  buraco absurdo: se alguma acha vida, a densa RETOMA a partir dela. Só termina
  quando as sondas esgotam o alcance sem nada. Nunca há tecto absoluto.

⚠ **Um tcode que não responde NÃO é um tcode vazio.** `metaTournament` devolve o
sentinela `ERRO` (≠ `null`) ao fim das tentativas, e `varrerIntervaloFiavel`
repete qualquer intervalo que venha vazio com >25% de erros. Sem isto uma falha
de rede passageira parece o fim da fronteira e trunca a varredura em silêncio —
a mesma classe de avaria, por outra porta. Um **disjuntor** (3 intervalos
degradados seguidos) abandona a fronteira e marca `fim: 'rede-degradada'` — não
`fronteira-esgotada` — para o canário gritar e a Fase 2 ainda correr.

⚠ **Um tcode inexistente responde HTTP 200 com CORPO VAZIO.** Chamar `r.json()`
nesse corpo lança, e classificar essa excepção como falha de rede fazia cada
tcode inexistente custar 3 tentativas × 12 s — a fronteira, que por definição
acaba em milhares de tcodes vazios, deixava de ser varrível em tempo útil
(medido: 60/60 "sem resposta" num servidor que respondia perfeitamente). Ler
`r.text()` primeiro e tratar vazio/lixo como "não existe".

**🐤 Canário — a defesa que faltava.** A avaria durou 7 semanas porque o
workflow ficava VERDE a descobrir zero torneios. A cache guarda agora
`ultima_descoberta` / `dias_sem_descoberta` e `fronteira_avancou_em` /
`dias_sem_avanco` (o maior tcode vivo alguma vez visto), mais o diagnóstico da
varredura (`varredura: {fim, blocos, sondas, retomas, intervalos_degradados}`).
O passo **"Canário"** do `uskids-field.yml` corre DEPOIS do commit (para os
dados nunca se perderem por causa do alarme) e **falha o job** — logo o GitHub
manda email — com >30d sem torneios novos, >21d sem a fronteira avançar, ou >3
intervalos degradados. Limiares largos de propósito: isto avisa que a varredura
parou, não que houve uma semana fraca.
- `GetMeta` por **`fetch` directo** (`metaTournament`, sem browser — a API é
  pública server-side), concorrência 5. É o que torna viável varrer ~2000
  tcodes/dia; com `page.goto` cada tcode custava ~3,2 s. A Fase 2 continua no
  browser.
- A cache guarda `varredura_max_t` (último tcode vivo visto) — na corrida
  seguinte a Passagem A já cobre tudo o que foi varrido antes.

Primeira corrida com a correcção: **8 torneios novos** (Spanish Open 20 Nov,
South American Championship 31 Out, Australian Challenge 21 Set, Mexico
Invitational 12 Dez, Indian Championship 22 Dez, Florida Winter State 5 Dez,
Antalya Turkish Open 30 Jan 2027, Circolo Golf Venezia 3 Out).

### ⚠ "Too many requests" apagou o field inteiro (2026-09-12)

O `uskids-field.json` passou de **1,07 MB / 1172 escalões / 2018 inscritos**
para **39 KB e ZERO**, num commit que o workflow deu por bom e fez deploy. Os
87 torneios ficaram lá — só com `escaloes: []` e este erro em **87 de 87**:

```
"erro": "Unexpected token 'T', \"Too many r\"... is not valid JSON"
```

O signupanytime aplicou **rate limit** e responde-lhe com `Too many requests`
em **texto, HTTP 200** — não com 429. Três defeitos em cadeia:

1. **O corpo ia direito ao `JSON.parse`.** O erro de sintaxe lia-se como
   "torneio sem dados", não como "a fonte recusou-nos".
2. **Cada falha produzia uma entrada VAZIA** e a escrita final gravava
   `resultados` **do zero** — sem merge nem guarda. Um run 100% falhado
   apagava tudo. **É este o defeito que custou os dados**, e é independente
   da causa: qualquer falha geral da fonte teria feito o mesmo.
3. **O canário não protege os dados.** Corre DEPOIS do commit (de propósito,
   para o alarme nunca custar dados) e só olha para a varredura: disparou a
   dizer "rede degradada", e o email dizia `All jobs have failed` — mas o que
   se tinha perdido já estava commitado e no ar.

⚠ **A Fase 1 portou-se bem — a correcção lá é preventiva.** O log mostra
`60/60 sem resposta` em três intervalos seguidos, e esse contador só sobe com
o sentinela `ERRO` (o `catch`): na varredura o servidor recusou com **status de
erro**, não com 200+texto, e o disjuntor fez exactamente o que devia. A guarda
`ehRateLimit` no `metaTournament` cobre a *outra* variante (200 + corpo de
texto), que ali seria lida como "tcode não existe" — mas não foi o que se
passou a 12-09; não ler o log ao contrário numa próxima vez.

Corrigido em três camadas, pela ordem em que travam a avaria:

| | O quê |
|---|---|
| `ehRateLimit()` | reconhece o corpo pelo que é, nas duas fases (`esperarGetMeta` e `metaTournament`); na Fase 1 passa a ser falha de rede, nunca "tcode inexistente" |
| `preservarAnterior()` | um torneio que falha devolve o **registo anterior** marcado `stale`/`stale_desde`, em vez de uma entrada vazia. Só fica vazio quem nunca teve dados |
| **Guarda anti-encolhimento** | recusa gravar se perder **>30%** dos inscritos (`PERDA_MAXIMA`), salvo `--force`. **Exit 2**, ficheiro anterior intacto |

⚠ **A guarda compara só os torneios que estão nos DOIS lados** — não o total.
Um torneio que se joga sai do radar e leva os inscritos com ele: a **2026-08-01**
um único evento a sair fez o total cair **39% (1500→916)** num run perfeitamente
bom — nos torneios comuns os inscritos até subiram (913→916). Sobre o total, a
guarda teria recusado esse dia e **congelado o ficheiro em silêncio** (o
workflow fica verde com um `::warning::`), que é a falha que ela existe para
evitar. Medido sobre os 223 commits do ficheiro desde Março: só há **duas**
quedas >15% em seis meses — essa, legítima, e a de 12-09. Na métrica dos
comuns dão **0%** e **100%**.

O `uskids-field.yml` traduz **exit 2 → sucesso com `::warning::`**, e salta o
commit E o canário nesse run (`steps.field.outputs.degradado`): sem dados novos
não há nada para commitar, e o canário mediria uma varredura que o rate limit
já tinha estragado.

### Porquê só agora — e porque volta a acontecer

Medido nos runs e na cache (`varredura` do `uskids-discovery-cache.json`):

| dia | fim da varredura | blocos | sondas | degradados |
|---|---|---|---|---|
| 09-09 | fronteira-esgotada | 25 | 74 | 0 |
| 10-09 | fronteira-esgotada | 26 | 74 | 0 |
| 11-09 | fronteira-esgotada | 26 | 74 | 0 |
| **12-09** | **rede-degradada** | **2** | **0** | **3** |

**Não mudámos nada.** O último tcode vivo é o mesmo nos dois dias (23701), a
Fase 2 tinha os mesmos 87 torneios, e nenhum outro workflow nosso tocava no
signupanytime naquela janela (o `daily-digest` só arrancou às 11:41, depois).
A 11-09 a Fase 1 varreu 26 blocos + 74 sondas — **~6.000 GetMeta** — e passou;
a 12-09 o servidor cortou ao **terceiro intervalo**, ~180. O que mudou foi o
lado deles. De fora não há como saber se apertaram o limite ou se foi um pico
de carga.

⚠ **Mas a exposição é nossa, e é por desenho.** A Passagem B "nunca desiste
definitivamente num buraco" (densa até `últimoVivo+1500` + sondas até +20000) —
a cura da avaria das 7 semanas — custa **~6.000 pedidos por dia para descobrir
tipicamente zero a dois torneios**, e não tem backoff nenhum. Com esse volume
diário contra uma API pública de terceiros, bater num limite era questão de
tempo: o seguro contra "a varredura pára" foi pago em pedidos.

### O volume — resolvido em duas frentes (2026-09-12)

**1. Cadência: a varredura CARA passou a semanal.** Medido o custo real da
Fase 1, por dia:

| Parte | Pedidos | O que faz | Cadência |
|---|---|---|---|
| Passagem A (âncora → topo conhecido) | 1.459 | apanha um torneio criado DENTRO da zona já varrida | **semanal** |
| Densa (até `últimoVivo+1500`) | 1.500 | **é esta que descobre**; a margem é dinâmica, cada achado empurra o fim | **diária** |
| Sondas de salto (até +20.000) | 1.480 | seguro contra um buraco maior que a margem densa | **semanal** |
| | **4.439** | | |

Média semanal: **4.439 → 1.920/dia (−57%)**, sem tocar na rede que descobre.
`DIAS_VARREDURA_PROFUNDA = 7`; `--full-scan` força; a cache guarda
`ultima_varredura_profunda` e a `varredura` do diagnóstico passa a trazer
`profunda: true|false` (num dia leve `sondas: 0` é normal, não avaria).
*(Removidos a 2026-09-14 com a procura só para a frente — `DIAS_VARREDURA_PROFUNDA`,
`--full-scan` e `varrerIntervalo*` já não existem.)*

Verificado com o plano real (`inicio` = 23702, fronteira morta):

| cenário | leve (diária) | profunda (semanal) |
|---|---|---|
| torneios a +300 e +800 | **acha 2** | acha 2 |
| cadeia de 6 (+300 … +5300) | **acha 6** (a margem dinâmica segue-os) | acha 6 |
| buraco de +9.000 | acha 0 | **acha** |

Ou seja: o único caso que a cadência atrasa é o buraco maior que 1.500, e no
máximo 7 dias — muito dentro dos limiares do canário (30d sem descobertas,
21d sem a fronteira avançar).

**2. Parar quando a fonte diz não.** A 12-09 o scraper continuou a martelar
muito depois da primeira recusa: o disjuntor só olhava a intervalos inteiros,
e cada tcode ainda gastava **3 tentativas** (as que existem para rede
instável). Com concorrência 5 isso são 15 pedidos só para um bloco perceber
que está travado, e foram ~540 tcodes até desistir. Agora:

- `metaTournament` devolve `ERRO` **à primeira** num rate limit — uma recusa
  não se repete;
- `varrerIntervalo` verifica `rateLimitHits` entre tcodes e **abandona o
  bloco** (devolve `travado: true`);
- `varrerIntervaloFiavel` **não repete** um intervalo travado;
- a Passagem B pára com `fim: 'rate-limit'`.

Medido contra um servidor local que só responde `Too many requests`: um bloco
de 60 tcodes custa **≤10 pedidos** (só os que já iam em voo), contra 15+ antes
só para o detectar.

⚠ **`fim: 'rate-limit'` avisa mas NÃO falha o canário** — é auto-recuperável
(a densa do dia seguinte apanha o que faltou) e um alarme que toca por algo
que se resolve sozinho deixa de ser lido. Se persistir, os limiares de 21d/30d
disparam por si.

⚠ **E `rede-degradada` é o MESMO caso quando há prova de recusa (2026-09-13).**
A distinção acima estava mal calibrada: uma recusa da fonte chega às duas fases
com caras diferentes — na Fase 2 vem 200 + "Too many requests" (`fim:
rate-limit`), na Fase 1 vem com **status de erro**, que o disjuntor lê,
correctamente, como `rede-degradada`. Medido no run de 13-09: Fase 2 a acusar
rate limit em **87 de 87** torneios E Fase 1 a acabar em `rede-degradada`. Era o
mesmo corte a entrar por duas portas e só uma delas tocava o alarme — ou seja, o
caso auto-recuperável falhava o job **todos os dias**.

O `fetch-uskids-field.js` grava agora `rate_limit_hits` no topo do
`uskids-field.json` (a Fase 2 corre DEPOIS de a cache ser escrita, por isso a
prova do run vive lá e não na cache), e a decisão saiu do bloco `node -e` do
workflow para **`avaliarCanario`** (`lib/uskids-rate-guard.js`, 6 testes) +
`scripts/uskids-canary.js`:

| situação | canário |
|---|---|
| `rede-degradada` **com** recusas no run | ⚠ aviso |
| `rede-degradada` **sem** recusas | ❌ falha (como sempre) |
| `fim: rate-limit` | ⚠ aviso |
| >30d sem descobertas · >21d sem a fronteira avançar | ❌ falha **mesmo com rate limit** |

⚠ A última linha é a que impede isto de virar uma mordaça: calar o ruído diário
só é defensável porque os limiares de dias continuam a disparar se a recusa
persistir. Verificado com os ficheiros reais de 13-09 — com os 87 hits sai exit
0 + aviso, e a MESMA varredura com `rate_limit_hits: 0` continua a sair exit 1.

### Onde vive, e o que está testado

A lógica pura saiu do script para **`scripts/lib/uskids-rate-guard.js`**
(`ehRateLimit` · `erroRateLimit` · `perdaNosComuns` / `deveRecusarEscrita` ·
`avaliarCanario`; o `deveVarrerProfundo` saiu a 2026-09-14),
com **18 testes** em `uskids-rate-guard.test.js` — incluindo os DOIS casos
reais do histórico (01-08 legítimo → grava; 12-09 → recusa).

Mais **5 testes de integração** em `uskids-scan-abort.test.js` que exercitam a
varredura **REAL** (o `fetch-uskids-field.js` passou a exportar quando é
`require`d) contra um HTTP local a recusar — nunca tocam no signupanytime.
Duas env vars, ambas só para testes e nunca definidas em produção:
`USKIDS_API_BASE` aponta a API para o servidor de teste e `USKIDS_DATA_DIR`
manda a cache para um directório temporário.

⚠ Esses testes de integração valem o que custaram: **apanharam um defeito na
primeira versão desta correcção** — o corte no `varrerIntervalo` não servia de
nada enquanto o `metaTournament` continuasse a fazer 3 tentativas por tcode.

### ⚠ A correcção partiu o run seguinte — e os testes não deram por nada (2026-09-13)

O run de 13-09, o primeiro com a correcção acima, morreu ao fim de 4 minutos:

```
↻ Passagem A: t=22243…23701 (zona conhecida, varrida por inteiro) — primeira vez
Erro fatal: ReferenceError: Cannot access 'hojeISO' before initialization
```

Um `const hojeISO` **local**, declarado no FIM da `descobrirTorneios` (o carimbo
do canário), ensombra a função `hojeISO()` do módulo em **toda** a função — e a
Passagem A, que a chama centenas de linhas acima, caía na temporal dead zone. A
variável local passou a chamar-se `hoje`.

⚠ **Nenhum teste chegava a EXECUTAR a `descobrirTorneios`.** Os 17 unitários
cobriam a lib pura e os 3 de integração só a varredura — a função que orquestra
tudo nunca era chamada, por isso um erro que rebenta à primeira linha executada
passava a suite inteira. O teste que faltava é barato **por causa da própria
correcção**: contra a fonte a recusar as duas passagens abortam de imediato, por
isso a orquestração inteira corre em milissegundos e passa exactamente pela
linha que rebentou.

⚠ E esse teste novo apanhou logo um **segundo** defeito, este anterior a tudo
isto: `metaTournament` devolve o sentinela `ERRO` — que é um `Symbol`, logo
**truthy** — e o ciclo dos `FORCAR_INCLUIR` fazia `if (tn) guardar(t, tn)`. Uma
recusa da fonte ali ia direita ao `guardar()` e matava o run num `TypeError`,
antes sequer de a varredura começar. "Não respondeu" ≠ "não existe", e aqui as
duas coisas estavam a ser lidas como a mesma.

✅ **Os dados não sofreram** com nenhuma das duas falhas: o processo morreu antes
de qualquer escrita, e o `uskids-field.json` ficou nos 87 torneios / 1172
escalões / 2018 inscritos do último run bom (11-09). É o efeito lateral bom de
escrever só no fim.

⚠ **É a mesma classe de avaria do FCG** (`discover-fcg-scope.js`, 2026-08-17) e
do `build-course-players.js`: uma fonte que responde **200 com lixo** vale mais
do que um erro franco, porque passa por dados bons. A regra do repo aplica-se a
qualquer scraper novo — **nunca gravar um build muito mais pequeno do que o que
está em disco sem alguém ter dito que sim**.

### Datas de inscrição USKids — reconstruídas pelo `pid` (2026-08-23)

**A API não publica data de inscrição.** `GetPlayerTeeTimes` devolve
nome/país/cidade/tee/status e mais nada, e não existe `op=` de registos
(testados 9 nomes plausíveis — todos HTTP 200 com corpo vazio). Até aqui a UI
mostrava o `firstSeen`, que é só o dia em que o NOSSO scraper viu o jogador —
por isso num torneio acabado de descobrir o campo inteiro aparecia como
"inscrito hoje".

O que dá para usar é o **`pid`** (chave do `flight_players`): um auto-incremento
**global** da tabela de inscrições do signupanytime, que ordena sempre pela
ordem real de inscrição. Verificado duas vezes: 7/7 na ordem certa contra os
nossos `firstSeen` no Belgium Invitational (15 Mai → 5 Ago), e o William Clarke
com pids **consecutivos** (1813945/1813946) em dois torneios diferentes — as
duas inscrições feitas ao mesmo tempo.

`scripts/lib/uskids-reg-dates.js` (15 testes) transforma isso em datas:
- **Âncoras** = jogadores que apareceram DEPOIS de já seguirmos o torneio (aí o
  `firstSeen` é a data real ±1 dia). Acumulam-se entre corridas em
  `public/data/uskids-pid-anchors.json` (636 na primeira passagem).
- Tudo o resto sai por **interpolação linear** entre as âncoras à volta;
  `estimarDia` marca `fora: true` quando extrapola fora do intervalo calibrado.
- Cada jogador ganha `regDia` + `regObs` (true = observado, false = estimado). A
  UI (`TabCampoDetalhe`) prefere `regDia` e prefixa a pill com **`~`** quando é
  estimativa; o tooltip di-lo por extenso.

⚠ **O `firstSeen` do primeiro dia de monitorização NÃO serve de âncora** — essa
gente já lá estava inscrita antes de o torneio entrar no radar. Usá-la
carimbaria centenas de inscrições antigas com o dia em que começámos a olhar,
que é exactamente o erro que esta datação corrige.

⚠ **`KEYWORDS_EXCLUIR_SEMPRE` vence o `INCLUIR_FORTE`.** As variantes
`Parent/Child` herdam o nome do evento principal ("Holiday Classic Parent/Child
2026") e o `INCLUIR_FORTE` ignora o `KEYWORDS_EXCLUIR` — era por isso que cada
uma tinha de ser listada à mão em `FORCAR_EXCLUIR` (4 entradas). A guarda corre
ANTES de tudo e resolve a classe inteira.

### ⚠ O NOME não classifica o torneio — o `type` do GetMeta classifica (2026-08-30)

A decisão de que torneios entram no radar vive agora em
**`scripts/lib/uskids-classify.js`** (`incluirTorneio(t, name, type)`, 11 testes).
Enquanto foi só por palavras-chave sobre o nome, falhava nos dois sentidos —
o nome de um evento USKids é livre. Três **Regionais** com inscrições abertas
nunca chegaram à app (medidos 2026-08-30, todos dentro da zona já varrida):

| t | Torneio | Porque caiu |
|---|---|---|
| 22986 | PGA Golf Club Invitational 2026 | batia no exclude `'golf club'` — que existe para deitar fora os ~1200 eventos do Local Tour, que se chamam pelo nome do campo |
| 23318 | Colonial Williamsburg Classic 2026 | `'classic'` só existia colado a um sítio (`'venice classic'`, `'holiday classic'`) |
| 23420 | Monterey Challenge 2026 | `'challenge'` nem sequer era include |

O `tournament` do `GetMeta` já traz a taxonomia oficial — `tour`
("Domestic Championships Tour") e `type` (inteiro). Medido sobre os 1320
torneios vivos em t=22240…23640:

| type | tour | n | exemplo |
|---|---|---|---|
| **1** | Domestic Championships Tour | 5 | Seaview Open 2026 ← **Regional** |
| 2 | Teen Series Tour | 30 | Teen Series at Longleaf (NC) |
| 5 | `{cidade} Tour` | ~1150 | The Legends Golf Club ← **Local Tour** |
| 6 | `{cidade} Tour` (Tour Championship) | ~190 | Longleaf … (Tour Championship) |
| **7** | State Invitationals Tour | 8 | 2026 Kansas State Invitational |
| **8** | International Championships Tour | 14 | Venice Open 2026 |
| 9 | Team Golf Tour | 23 | Concord Local Parent/Child 2026 |
| 12 | Girls Invitationals Tour | 2 | 2026 Girls Invitational - Longleaf (NC) |
| 13 | International Teen Series Tour | 3 | International Teen Series at Al Hamra |

`TIPOS_INCLUIR = {1, 7, 8}` entram **sempre**, seja qual for o nome. ⛔ *Alargado
a 2026-09-14 aos tipos 2, 3, 4, 6 e 13 — ver "Procura só para a frente".*

⛔ *Substituído a 2026-09-14: entram TODOS os Tour Championships, EUA incluídos
(escondidos por defeito na página) — ver "Procura só para a frente".*
**`TIPOS_INCLUIR_SE_INTL = {6}` — Tour Championship, só fora dos EUA.** O
type 6 é a final de época de cada Local Tour de cidade (irmão do type 5, que
fica de fora): 184, das quais 133 por jogar. Todas no radar levariam a Fase 2
do monitor diário de 33 para ~166 torneios — 5× o trabalho — e a esmagadora
maioria é americana, onde não nos cruzamos com ninguém. Entram as **54 de fora
dos EUA**: Azata/Andaluzia, Venice, Milão, Turim, Toscana, Munique, Hamburgo,
Nuremberga, Lyon, Londres, Panamá, América Latina, Ásia, África.

⚠ **O sinal é o código de país ENTRE PARÊNTESES** no `tour` ("Lima (PE) Tour",
"Andalusia (ES) Tour"). Os tours americanos com sigla de estado usam
**vírgula** e nunca parênteses ("Charleston, SC Tour", "Central Valley, CA
Tour") — verificado nos 158 tours distintos do corpus: 14 com vírgula, zero
falsos positivos. E os únicos "(CA)" são Niagara e Vancouver, que são o
**Canadá**, não a Califórnia: entram de propósito. Efeito medido: **+64 no
corpus (54 futuros), 0 americanos**. As
palavras-chave ficam como camada **aditiva** — é só isso que continua a trazer
as etapas de Local Tour que seguimos de propósito (Azata/Andaluzia, Panamá,
Al Hamra, OPEN.9 Eichenried, Circolo Golf Venezia) sem abrir a porta às outras
~1200. `KEYWORDS_EXCLUIR_SEMPRE` (Parent/Child) corre antes do tipo e
`FORCAR_EXCLUIR` vence tudo. Diferença medida sobre os 1320: **+3, −0**.

⚠ **O `type` tem de ser guardado na cache.** O `descobrirTorneios` re-filtra as
entradas de `uskids-discovery-cache.json` à entrada; sem `tour`/`type`
persistidos, a re-entrada voltava a decidir só pelo nome e os Regionais caíam
outra vez na corrida seguinte. Entradas antigas sem `type` continuam a ser
lidas pelo nome (retrocompatível). O `uskids-field.json` também passa a
carregar `tour`/`type` por torneio.

**fetch-uskids-discovery.js** (legado — ainda com `T_MAX = 23000` e `MISS_LIMIT = 100`; a descoberta em uso é a do `fetch-uskids-field.js` com `scripts/lib/uskids-classify.js`, onde `FORCAR_INCLUIR = {21080, 21133, 21667}` e o 21573 está no `FORCAR_EXCLUIR`) — Varre IDs no signupanytime, filtra torneios internacionais por keywords. Forçar inclusão: `FORCAR_INCLUIR = new Set([21080, 21573, 21199, 21200, 21133, 21667])` (21667 = World Teen Championship 2026).

### USKids — Script browser (F12)

**uskids_scrape_courses - PERFEITO COM DISTANCIAS.js** (`scripts/`, movido da raiz em 2026-06-23) — **Activo, sem substituto Node** (gerador canónico dos completos). Colar em `www.signupanytime.com` (qualquer página). Gera `uskids_torneios_completos(N).json` com par+yards reais e scorecards completos. Suporta dois formatos de output: v1 (antigo, array) e v2 (novo, objecto com `signupanytime_t`).
- Configurar: editar array `TOURNAMENTS`: `{ t: "21080" }`
- Após download: copiar para `public/data/` e atualizar `TORNEIOS_COMPLETOS_COUNT` em USKIDSPage.tsx (actualmente **41**)

### Torneios no member-history (`ALL_TCODES` em fetch-uskids-member-history.js)

Os torneios a processar estão em `ALL_TCODES`; os flights Boys 9-13 de cada
tcode são auto-descobertos via `GetMeta` (o `FLIGHTS_MANUAL` ficou vazio a
2026-06-12). Para adicionar um torneio basta acrescentar o tcode a `ALL_TCODES`.

**Quem fica com a carreira completa (2026-09-18)** — por defeito só o top-5 de
cada escalão; entram SEMPRE, sem top-5:
- **A. Torneios do Manuel, passados e futuros** — lidos no início de cada
  corrida do histórico dele (`GetMemberTournamentResults` de `630106`/`605933`
  devolve também as inscrições futuras, com `p_place` 0). Entram sozinhos no
  processamento; rapazes 10-13 todos. Não se acrescentam à mão.
- **B. Geração do Manuel** em qualquer torneio processado: o escalão
  `Boys (ano−2014)` ou `Boys (ano−2015)` (a data de corte varia entre torneios:
  Marco Simone 2026 = B11, European 2026 = B12). `escalaoDaGeracao` em
  `scripts/lib/uskids-geracao.js`.
- `FULL_FIELD_TCODES` continua a valer (lista antiga, à mão).

**Nomes dos inscritos sem cartões (regra C).** O `GetTournamentPlayers` devolve
os memberIDs do **torneio inteiro** (o `&f=` é ignorado), flight a flight pela
ordem do `GetMeta` e, dentro de cada flight, por apelido+nome. As
`flight_players` têm o nome mas a chave é o id da inscrição (`pid`), não o
memberID. `associarPorOrdem` reproduz a ordenação e emparelha por posição;
validado no Venice 2026 (187/187) e no Holiday Classic 2026 (160 confirmados,
0 falhas). Contagens diferentes ou uma única discordância com um nome já
conhecido → recusa tudo (compara só letras/dígitos: a USKids escreve
`"Tres"` e `(Tres)` para o mesmo miúdo). Guardado em `ordemNomes` na
flight-cache; quem ficou "?" numa corrida anterior ganha o nome depois.

⚠ `p_place` 0 = inscrição futura, não 1.º lugar — o filtro do top-5 contava-o
como top-5 até 2026-09-18.

**Recusa (HTTP 429) e já vistos (2026-09-18).** O script continuava a pedir
depois de um 429 e voltava a pedir, em cada corrida, o histórico dos ~5.000
jogadores que já tinham ficado de fora — foi o que levou ao bloqueio. Agora:
pára à primeira recusa em qualquer fase e grava o que já veio; quem foi pedido
e ficou de fora vai para `data-archive/uskids-member-skipped.json` (memberID →
tcodes em que foi visto) e só volta a ser pedido se aparecer num torneio novo.
**Mudar `SKIPPED_VERSAO` sempre que as regras de entrada mudarem** (senão os
já vistos nunca são reavaliados). Pausas: `DELAY_HIST` 400 ms, `DELAY_ORDEM`
1,2 s. Nomes pela ordem aceitam versões do mesmo nome (`mesmoNome`: primeiro
nome + último apelido, ou um contém o outro).

---

## API Signupanytime

Base: `https://www.signupanytime.com/plugins/links/admin/LinksAJAX.aspx?op={OP}&…`
Em Playwright, navegar primeiro para o iframe: `…/front/linksviews.aspx?v=results&fmt=nohead&ax=1129&t={t}`

| Endpoint | Método | Descrição | Retorna |
|----------|--------|-----------|---------|
| `GetMeta&t={tcode}` | GET | Metadados: flights, age_groups, **flight_courses** (par+yards reais!), courses, flight_rounds | tournament, flights, age_groups, flight_courses{pars[], lengths[]}, flight_rounds |
| `GetTournamentPlayers&t={tcode}&f={fid}` | GET | Lista de **memberIDs USKids globais** num flight (não pids locais) | PlayerNodeId: number[] |
| `GetPlayerTeeTimes&f={fid}&r={round}&p={page}&t=1&pt=undefined&jbgr={ts}&c=1` | **POST** | **Scores buraco-a-buraco + nomes + país.** Paginado, 20/pág. **⚠️ Tem de ser POST (não GET) e tem de incluir `t=1` + `pt=undefined&jbgr={Date.now()}&c=1`.** Endpoint descoberto via DevTools Network 2026-05-12 (validado em t=15573 e nos 6 tcodes PT 2023). Old endpoint `GET t=0` devolve `flight_players: {}` silenciosamente para torneios encerrados | `flight_players: {[pid]: {first,last,country,place(cidade!),rounds:{[rn]:{strokes[],num_strokes,num_holes,course_name}}}}` |
| `GetMemberTournamentResults&m={memberID}` | GET | Histórico completo de carreira | `{[tcode]: {t_name, t_start_date, p_age_group, p_place, p_strokes, p_country?, p_rounds:{[rn]:{strokes, course_name, num_strokes, num_holes}}}}` |

**Armadilhas críticas dos endpoints USKids:**
- O `pid` no `flight_players` (ex: `1108352`) é **local ao flight, NÃO é o memberID USKids global** (ex: `591440`). Para mapear nome→mid usa o `GetTournamentPlayers` em paralelo + match por strokes/place/gross dentro de (tcode, ageGroup).
- O `place` no `flight_players` é a **CIDADE** (ex: "Lisbon, Lisboa"), não a posição. A posição calcula-se ordenando por `num_strokes`.
- `flight_courses` no `GetMeta` é indexado por `flight_round_id`, **NÃO por flight_id**. Para mapear: `flight_rounds[frId].flight === flightId && flight_rounds[frId].round === 1` → `flight_courses[frId].{pars,lengths}`.
- Em flights 9H, `flight_courses[].pars` tem 18 entries mas só as 9 jogadas têm `par > 0`; `flight_courses[].lengths` tem yards completos do percurso (todos > 0). **Filtrar AMBOS pelos índices onde par > 0 para alinhamento.**

Em Playwright: intercettar `GetMeta` via `page.on('response')` é mais fiável do que chamar directamente.

---

## t= codes USKids conhecidos

### Tcodes internacionais conhecidos (lista de referência — não há constante no código)

| t= | Nome | Data | Tipo |
|----|------|------|------|
| 8300 | European Championship 2022 | Mai 2022 | EURO |
| 11604 | World Championship 2022 | Ago 2022 | WORLD |
| 12093 | Red White & Blue Inv. 2022 | Jul 2022 | USA |
| 12229 | Venice Open 2022 | Ago 2022 | EURO |
| 13568 | European Championship 2023 | Mai 2023 | EURO |
| 14029 | World Championship 2023 | Ago 2023 | WORLD |
| 14218 | Red White & Blue Inv. 2023 | Jul 2023 | EURO |
| 14302 | Venice Open 2023 | Ago 2023 | EURO |
| 15573 | Real Club de Golf El Prat | Oct 2023 | EURO (9H) |
| 15704 | European Championship 2024 | Mai 2024 | EURO |
| 15807 | World Championship 2024 | Ago 2024 | WORLD |
| 16428 | Venice Open 2024 | Ago 2024 | EURO |
| 16705 | Red White & Blue Inv. 2024 | Jul 2024 | EURO |
| 18124 | World Championship 2025 | Jul 2025 | WORLD |
| 18242 | European Championship 2025 | Mai 2025 | EURO |
| 18438 | Marco Simone Invitational 2025 | Mar 2025 | EURO |
| 18719 | Red White & Blue Inv. 2025 | Jul 2025 | USA |
| 19418 | Venice Open 2025 | Ago 2025 | EURO |
| 20175 | Rome Classic 2025 | Out 2025 | EURO |
| 20895 | Sandestin Championship 2026 | Jan 2026 | USA |
| 21004 | Desert Shootout 2026 | Fev 2026 | USA |
| 21080 | Marco Simone Invitational 2026 | Mar 2026 | EURO |
| 21239 | Mississippi State Inv. 2026 | Mar 2026 | USA |
| 21131 | European Championship 2026 | 26 Mai 2026 | EURO |

### Tids legados (`src/ui/TabelaGlobal.tsx`, com sufixo `_bN` — ex. `desert26_b9`)

| Nome no JSON | tid | Notas |
|-------------|-----|-------|
| Desert Shootout 2026 | `desert26` | |
| Sandestin Championship 2026 | `sandestin26` | |
| 2026 Mississippi State Invitational | `msstate26` | |
| Real Club de Golf El Prat | `elprat23` | 9H |

### Futuros (`ALL_TCODES` do fetch-uskids-member-history.js; o 21573 só na descoberta)

| t= | Nome | Data |
|----|------|------|
| 21573 | Marco Simone Local Tour 2026 | 2026 |
| 21610 | World Championship 2026 | Set 2026 (a ocorrer) |
| 22243 | Venice Open 2026 | Ago 2026 (jogado) |

> **Nota (2026-06-12):** European Championship 2026 (`21131`) já ocorreu a **26 Mai 2026** — movido para a tabela de conhecidos acima (estava erradamente marcado "Ago 2026"). O Venice Open 2026 (`22243`) já se jogou (Agosto); o World 2026 (`21610`) confirmar no `uskids-field.json`.

### Regionais USA (em LINKS_EXTRA / REGIONAL_CHAMPIONSHIPS)

20895, 21004, 21133 (Jekyll Island), 21620 (Texas), 22037 (Palmer Kids), 21471 (Hawaii), 21628 (Tennessee), 21629 (Wisconsin), 21631 (Nevada), 21650 (Northwest), 21722 (Arkansas), 21845 (Florida Spring), 21846 (N. California), 21847 (Arizona), 21848 (N. Carolina), 22059 (Illinois), 22062 (Georgia), 22080 (Oklahoma), 22088 (Ohio), 22090 (Missouri), 22099 (Texas Spring), 22121 (Washington), 22122 (Virginia).
