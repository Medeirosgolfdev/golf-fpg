# WAGR — wagr.com

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Fonte WAGR — wagr.com (2026-09-09)

O **World Amateur Golf Ranking** (The R&A + USGA) — o ranking amador oficial.
Página `/wagr` no CircuitShell, gémea da `/egr`.

> ⚠ **CORRECÇÃO de uma conclusão anterior.** O arquivo de conversas
> (`golfe-03-circuitos-internacionais`) dizia **"WAGR ⛔ depende de JavaScript"**.
> Estava ERRADO — foi tirado em 2026 a olhar para o HTML cru à procura de
> *datas*. O wagr.com é **Next.js com render no servidor + API REST pública**:
> scrapa-se com `fetch` puro, sem login, sem chave, sem cookies, sem Playwright.

### As duas portas de entrada

**1. API pública** — `https://worldgolfranking2021api.wagr.com/api/wagr/…`
(sem autenticação, CORS aberto; o `stg…` no bundle é o ambiente de testes):

| Endpoint | Dá |
|---|---|
| `rankings/getRankings?rankingsType=0\|1&pageSize=100000` | ranking mundial numa request — **`0` = homens (~5.000), `1` = senhoras (~3.300)**. `2` e `3` também devolvem senhoras |
| `events/getEvents?year=Y&pageSize=5000` | **TODOS os eventos do ano do mundo numa request** (~4.000/ano; 2026 = 4.129, 1,9 MB): id, nome, datas, país, tipo, power, campo(s), vencedor |
| `playerprofile/getPlayerEvents?profileId=&tab=1` | histórico de um jogador |
| `search/getSearchResults?searchTerm=` | pesquisa global (jogadores + eventos) |
| `getCountries` / `getRegions` / `getWeekRibbon` | tabelas de referência + a semana oficial ("9 SEP 26-36") |

⚠ O `countries` do getRankings é o **countryId**, não o nome (Portugal = **33**).
Com o nome devolve `totalRecords: 0` em silêncio.

**2. O leaderboard NÃO tem endpoint** — os resultados vêm no **`__NEXT_DATA__`**
do SSR de `https://www.wagr.com/events/{slug}-{id}` (`pageProps.eventResultsData`):
posição, país, R1-R4, total e pontos WAGR.
👉 **O SLUG É DECORATIVO — só o id final conta.** `/events/x-272939` devolve
exactamente o mesmo que `/events/campeonato-nacional-de-jovens-272939`, por isso
o scraper não guarda slugs.

### As três limitações que definem o que se pode fazer

1. **O leaderboard é PARCIAL** — só aparecem os jogadores que **pontuaram** no
   WAGR, não o campo todo. O Campeonato Nacional de Jovens 2026 dá **4 linhas**.
   É um leaderboard *de ranking*. A UI di-lo no `metaLine`.
2. **NÃO há DOB nem escalão do JOGADOR** — o escalão é do **EVENTO**
   (`eventType`: Junior / All Ages / Collegiate / MidAm / Senior / Pro / Other).
   👉 Por isso o WAGR **não alimenta o agregador kids2** — o matching seria ainda
   mais fraco que o do EGR (nome + país, sem clube).
   ✅ **Desde 2026-09-18 ENRIQUECE sem criar fichas** — `scripts/aggregator/util/wagr-enrich.js`,
   passo depois do identity-matcher: por jogador WAGR (id), só eventos Junior;
   **confirmação por torneio comum** (±1 dia, mesmas pancadas — uma fonte com menos
   voltas conta, 73-73 ⊂ 73-73-72) permite ligar mesmo com homónimos/país diferente;
   sem confirmação: candidato único, país/sexo, apelido comum exige país igual, nome
   de um só jogador WAGR; veto só se as discordâncias pesarem mais que as confirmações.
   Nunca duplica o torneio que o junior já tem nesse dia. 1.ª corrida: 6.065
   participações, 1.095 juniores, 822 confirmados, 258 órfãs resolvidas, 0 junções perdidas.
3. **O Manuel NÃO está no WAGR** (pesquisa "Medeiros" = 0 — joga USKids/FPG, não
   provas com pontos WAGR). É base de **rivais e de contexto**. A diferença face
   ao EGR: o WAGR **inclui as provas da FPG** (Nacionais, Internacional Amateur)
   **e o Faldo Madeira** — 30 eventos em Portugal só em 2026 — e traz 16
   portugueses no ranking masculino e 10 no feminino.

⚠ **Não há par do campo** em lado nenhum → sem ±Par. O `wagrCircuit` usa
`hideTotals` do `ScorecardLeaderboard` e põe TOT/PTS como colunas próprias.

⚠ **`filters.defaultYear: "current"` — opção NOVA do CircuitShell, criada para
esta página e por CUSTO DE RENDER.** A sidebar do shell desenha *todas* as
entradas e a /wagr traz ~8.000 (o mundo, 2 anos): medido em dev, montar a página
gerava **65.520 nós** e limpar um filtro custava **~2 s**. Com o ano corrente
pré-seleccionado são ~14.000 nós. Os outros anos ficam a um clique nas pills e
**os deep-links de qualquer ano continuam a abrir** (o `cur` do shell cai no
`entries.find` quando a entrada está fora do filtro). Nenhuma outra página a
define — o default continua a ser "all".

### Pipeline

```bash
node scripts/scrape-wagr.js --ranking                        # wagr-ranking.json (M+F)
node scripts/scrape-wagr.js --events --year 2026 --skip-existing --concurrency 8
node scripts/build-wagr-events-list.js                       # índice da sidebar
```

`scrape-wagr.js` também aceita `--country`, `--type Junior`, `--limit` e
`--no-leaderboards` (só o índice). Workflow **`update-wagr.yml`** — quarta 07:00
UTC (o ranking WAGR sai à quarta), `timeout-minutes: 120`, sem secrets.

⚠ **O índice de eventos faz MERGE, não substituição** — um run `--year 2024` não
pode levar à frente a meta de 2025/2026. É a mesma armadilha que apagou as datas
de 753/754 eventos do EGR a 2026-08-06.

⚠ **`total: "0"` do WAGR NÃO é um score** — vem nas linhas **"Participant"**
(match play, provas por equipas, quem pontuou só por participar; ~3% das linhas).
Guardado como 0, o jogador mostrava "0" na coluna TOTAL e **subia ao topo de
qualquer ordenação por total**. O `score()` do scraper normaliza para `null`;
os ficheiros antigos arrumam-se com `scripts/repair-wagr-zero-scores.js --apply`
(idempotente; depois refazer rollup + índice).

⚠ **`--skip-existing` NÃO é `existsSync`** — um evento ainda por jogar devolve
`results: []` e escreveria um ficheiro vazio que nunca mais seria re-fetchado
(o leaderboard nunca apareceria). A guarda é `isSettled()`: salta só se tem
classificados **ou** se acabou há mais de **60 dias** (aí o vazio é definitivo —
ninguém daquela prova pontuou no WAGR). Coberto por testes em
`scripts/scrape-wagr.test.js`.

⚠ **Ritmo real do scrape:** ~1,7 eventos/s com `--concurrency 8`. Um ano inteiro
do mundo demora ~40 min; com `--skip-existing` o run semanal só apanha os novos.

### Outputs — pesar antes de shippar

Medido com 2025+2026 do mundo inteiro (**8.084 eventos**), ~38 MB no total:

| Ficheiro | Peso | Quando é pedido |
|---|---|---|
| `wagr/events/wagr_{id}.json` | 15,4 MB em 8.084 ficheiros (~2 KB cada) | 1 por evento aberto |
| `wagr/player-events/wagr-player-events-NN.json` | 17,0 MB em **16 shards** (~1,1 MB cada) | 1 shard por jogador aberto |
| `wagr/wagr-events-list.json` | 2,0 MB (6.998 eventos com classificados) | ao abrir a /wagr |
| `wagr-ranking.json` | 1,9 MB | ao abrir o Ranking |
| `wagr/wagr-events-index.json` | 1,9 MB | nunca (intermédio do scraper) |

⚠ **O rollup jogador→eventos é SHARDED por `playerId % 16`** — inteiro são
**17 MB**, e ninguém descarrega isso para ver UM jogador. A função do shard está
duplicada (`shardOf` no scraper, `wagrShardOf` na WAGRPage); se divergirem, o
detalhe mostra "sem eventos" **em silêncio** → espelho fixado em
`scripts/wagr-shard-mirror.test.js`.


### Eventos antigos (2026-09-19)

Os eventos WAGR continuam a mostrar quem pontuou depois dos 2 anos (Junior Orange Bowl 2023: 35 linhas). Buscados os Junior de 2022-2024 (`--events --type Junior --year 2022 --year 2023 --year 2024 --skip-existing`): 2.918 eventos, ~6 min a 6 em paralelo; via `wagr-enrich.js` deram +8.502 participações a 1.302 juniores, 152 órfãs resolvidas, 0 junções perdidas. Gravação aditiva (`scripts/lib/merge-aditivo.js`).
