# kids2 — KIDSdataLoader e agregador de juniores

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## KIDSdataLoader — Arquitectura do loader de rivais

O `KIDSdataLoader.ts` era o loader central da KIDSPage (removida 2026-08-06); hoje o consumidor principal é o `kids2/NextTournaments.tsx` (`buildAutoRivals` → `useFieldRivaisData` + CircuitShell, `kids2/nextCircuit.tsx`). Exporta `buildAutoRivals()`, `normName()`, `getScorecards()`, `uskTournNames` (Map) e `uskFieldSizes` (Map).

### Só lê o canónico do agregador (verificado 2026-09-15)

O `KIDSdataLoader.ts` (~580 linhas) já **não** lê os ficheiros de cada circuito.
Carrega só os 3 ficheiros do agregador — `juniors.json`,
`juniors-tournaments.json` (em shards) e `tournament-catalog.json`; a
identidade e o merge das fontes (USKids, WJGC/EOWAGR, Doral, pull-torneios, …)
resolvem-se em build-time por `scripts/aggregator/` (ver "Agregador de
juniores"). `uskTournNames` e `uskFieldSizes` saem do canónico. As antigas
`processWjgc` / `processUskidsCompleto` / `processMemberHistory` /
`processManuelOverrides` saíram de vez a 21/10/2026 (eram stubs vazios, com 7
grupos de testes em `describe.skip`); o mapeamento
ficheiro→tid legado é o `FILE_TO_LEGACY_TID`. `buildAutoRivals()` cacheia em
`_autoRivalsCache`; `opts.force: true` força o reload.

### Marco Simone 2026 Boys 11 — score oficial com penalidade

O Manuel foi excluído pelo scraper nesse torneio (no loader antigo o score era injectado pelo array `MANUEL_OVERRIDES`; hoje vem do slim/canónico e do `applyResultOverrides()` da USKIDSPage). Manuel marcado IE (Ineligible) pela USKids porque não confirmou o scorecard da R1 (alertou a organização posteriormente e foi-lhe aplicada uma penalidade).

**Política do site (2026-05-17):** mostrar SEMPRE o score **oficial com penalidade** (R1=91 com hole 5=10, R2=79) e não o score real jogado (R1=86 com hole 5=5, R2=79). O `uskids-member-history-slim.json` já regista o oficial e isso alimenta o canónico que o `KIDS2Page` consome. O override do `applyResultOverrides()` na USKIDSPage replica os mesmos valores oficiais para preencher o leaderboard de `uskids-results.json` (que continua a excluir o Manuel por IE). Para reverter para o score jogado, ver comentário no override em `USKIDSPage.tsx`.

### uskids_torneios_completos(N).json — formato

Em `public/data/` os 41 ficheiros são todos v2 (com `signupanytime_t`): os 1–22 trazem também `meta`, e o 41 é um array de 24 torneios v2. O v1 (array com `rounds_data`) já não aparece em nenhum ficheiro — o suporte fica só no `converterTorneioCompleto.ts`.
**v2:** objecto `{signupanytime_t, name, start_date, age_groups, flights:{fid:{category, course_info, flight_players}}}` — detectado por presença de `signupanytime_t`. Par extraído de `course_info.R{n}.holes[].par` (preferido) ou `flight_courses` (fallback).

---

## Agregador de juniores (kids2) — fontes e regras (2026-07-02)

`scripts/aggregator/index.js` orquestra os adapters de `scripts/aggregator/sources/`
e escreve `public/data/{juniors,juniors-tournaments*,tournament-catalog}.json`
(consumidos pelo `KIDS2Page`). Corre no `build-juniors.yml` (push nos paths de
input + workflow_dispatch). ~30.4k juniores / ~21.2k torneios (2026-09-15);
38 672 juniores / 27 987 torneios a 2026-10-20.

### Guardas de escrita e de input (2026-10-20)

Os outputs somam ~185 MB e são committados — um canónico truncado ou com
metade dos jogadores partia o kids2 e os Scouts dos circuitos.
- **Escrita atómica com fsync** em tudo (`util/io.js` → `writeJson`/`writeAtomic`:
  `juniors.json`, manifest + shards, catálogo, `hcp-listas-ligacoes`, form, scout).
- **Input corrupto = erro (exit 1).** `readJsonSafe` só devolve o default quando
  o ficheiro NÃO existe; se existir e tiver NUL bytes ou JSON inválido lança
  `CorruptInputError`, que o `runAdapter` não engole (antes cortava os NUL e
  «fechava» o JSON à força, e um adapter que caía levava a fonte inteira em
  silêncio). Resolver: repor o ficheiro do git ou voltar a correr o scraper.
- **Sanity checks realistas** (`validate/sanity-check.js`): pisos de **29 000
  juniores / 21 000 torneios** (eram 100/500) e **queda máxima de 10%** face ao
  canónico em disco (`readPrevious`: `juniors.json` + `totalTournaments` do
  manifest). Falhou → nada é gravado e o exit é **1** (era 2, que se lia como
  «nada de novo»). `--force` passa por cima (ex: uma limpeza grande de
  duplicados, ou `--only=…` de debug sem `--dry-run`).

### Fontes (os 11 adapters originais — hoje são ~30, ver `scripts/aggregator/sources/`)

| Adapter | Lê | Tipo |
|---|---|---|
| `uskids` | member-history-slim + results + completos | **forte** (memberId) |
| `fpg` | players.json + pull-torneios (whitelist: Nacionais/PJA/GG/QDL/Finais Drive; Drive/Aquapor regionais fora; **+ as provas de jovens do Manuel, sem Madeira nem Drive Challenge**, ver abaixo) | **forte** (fed) |
| `rfeg` | spain-players.json (roster) + rfegolf-rivals.json | **forte** (licencia) |
| `ffgolf` | france-players.json + ffgolf-juniors-slim.json | **forte** (lic) |
| `eowagr` / `wjgc` / `doral` / `fm` | eowagr*/wjgc_*+brjgt*_*/ftm_doral_*/ftm_fm_* | fracas (nome+país) |
| `fcg` (2026-07-02) | fcg-rivals.json (Catalunha, golfdirecto) | fraca (nome+**dob** ~58%) |
| `england` (2026-07-02) | england_{slug}*.json | fraca (nome+país; memberIds GG são por-torneio) |
| `gjgl` (2026-07-02) | gjgl/gjgl_*.json (exclui U23) | fraca (nome+país + dobRange do birthYearEst) |

⚠ **FCG NÃO pode ir dentro do sourceId `rfeg`**: as licenças catalãs (ex:
`CB35994870`) vivem noutro keyspace — um miúdo com licença RFEG (roster) + FCG
seria 2 entidades "fortes" da mesma fonte e o identity-matcher RECUSA o merge
(invariante de 1 chave forte por fonte). Como fonte fraca separada, funde por
nome+DOB.

⚠ **O slim FFG não filtra pelo escalão da PROVA** (corrigido 2026-08-19). O
`build-ffgolf-juniors-slim.js` só deixava passar séries U10/U12/U14 e ainda
cortava provas cujos miúdos "já teriam >15 hoje" (`MAX_AGE_TODAY`) — confundia a
idade do JOGADOR com o escalão da PROVA. Um miúdo pode inscrever-se acima do
escalão dele (nunca abaixo): o Ricardo Castro-Ferreira (PT, fed 49085, n. 2015)
jogou a "2e Division B U16 Garçons" de 2026 com 11 anos e a prova nunca chegava
ao kids2. Como o corpus do `scrape-ffgolf-all-jeunes.js` já é 100% juvenil, o
slim guarda agora TODAS as séries (escalões U10→U18 + `ageGroup: null` quando
desconhecido): 1129 → 2034 séries, 6,4 → 11,7 MB, +12.1k participações de 2.6k
juniores que já eram entidades canónicas. **Regra:** se o jogador já existe no
corpus, todos os resultados dele devem entrar — filtra-se pela idade do miúdo,
nunca pelo nome do escalão da prova.

### Regras do identity-matcher que os adapters têm de respeitar

- **Resultados só contam se o adapter também declarar o jogador em `players[]`**
  — `playerSourceKey` sem entidade correspondente é descartado em silêncio.
- Chaves `anon|{normname}` são tratadas como fracas mesmo em fontes fortes
  (vão para `sources._secondary` como `{sid}-anon`).
- Juniores sem nenhum torneio agregado são dropped (`droppedNoTourn`).

### rfegolf-rivals.json — 3 fontes espanholas num só ficheiro

`scripts/build-rfegolf-rivals.js` consolida: **lgs** (LiveGolfScoring),
**nc{id}_{cat}** (NextCaddy) e **rfeg{compId}_{cat}_{sexo}** (microsite
rfegolf.es — blocos de `results` dos `rfegolf-resultats/*.json`, incl. blocos
mitarjeta com lic+dob+club+holeScores). Dedup de gémeos via
`rfegolf-lgs-twins.json`: compIds em `twins` são saltados (versão LGS ganha) e
lgsIds em `lgsSuppressed` são removidos (versão mitarjeta, mais rica, ganha).
⚠ **No `update-spain.yml`, `build-lgs-twins.js` corre ANTES de
`build-rfegolf-rivals.js`** — inverter a ordem faria o rivals usar twins do run
anterior. O `build-lgs-twins` casa pelo nome+ano e, para os que sobram, pelo
plantel (≥ 0,85, ≤ 7 dias — a RFEG dá nomes diferentes ao mesmo evento em cada
plataforma); depende das datas do LGS certas (`enrich-lgs-dates.js` relê as que
ficaram fora do `dateRange`).

**Uma linha por jogador e prova** (31/10/2026): o NextCaddy e o golfdirecto
publicam a mesma volta em várias classificações (Scratch + Hándicap, escalão +
geral Juvenil/Sub-18/Sub-25). `scripts/lib/uma-categoria.js` deixa cada jogador
numa só: scratch antes de hándicap, escalão mais específico, posições da fonte
(no `build-rfegolf-rivals` e no `build-fcg-rivals`). O id NextCaddy é
`nc{tour}_{escalão}_{m|f}_{sc|hcp}` — sem o sexo, «Scratch Alevín Masculino» e
«… Femenino» colidiam e a última apagava a outra. A linha que fica ganha os
campos que só a repetida tinha (cartões, nascimento, clube); a posição não.

### Provas repetidas — fundir, nunca só apagar (01/11/2026)

A mesma prova publicada 2× (EGR com dois ids; Evian no `evianjc` e na FFG;
Orange Bowl no `job` e no WAGR; FFG com a mesma volta em duas competições;
golfdirecto + PDF da FVG) passa a ser uma só em
`scripts/aggregator/util/fundir-torneios.js`, logo depois do identity-matcher.
Pedido da Mariana: «merge as entradas repetidas para ficar com toda a
informação disponível».

- **Quando são a mesma:** datas a ≤ 3 dias, ≥ 3 jogadores (mesmo `juniorId`)
  com as MESMAS pancadas (total e voltas comuns) em ≥ 90 % dos comparáveis.
  Com nº de voltas diferente só contam as voltas comuns, não o total (Aisha Wu
  na Berlin 2026: 85 no EGR, 85+56 no GJGL — era isso que a deixava separada).
  **Gémeo declarado pela fonte** (03/11/2026): um PDF regional espanhol que o
  `build-rfegolf-rivals.js` marca `gemeoDe` (jogo do golfdirecto/NextCaddy — antes
  saía inteiro, agora entra marcado e a /rfeg não o conta) funde com 1 cartão igual
  e ≥ 50 % a bater (escalões de 2 jogadoras, gralhas no PDF). A marca pode errar —
  o Laukariz 2025 não é o Puntuable da véspera (0 cartões iguais) e fica à parte.
  Na FPG, a mesma prova em `pull-torneios` e `jovens_` fica a mais rica completada
  pela outra (`completarCopia` em `sources/fpg.js`); o EGR removido pelo
  `egr-dedup` só perde os pontos do evento (clube e país vêm das fichas EGR).
  Voltas diferentes no mesmo dia (9 buracos de manhã e de tarde) têm pancadas
  diferentes e não se tocam.
- **Qual fica:** fonte dedicada > federação > EGR/WAGR; em empate,
  a com mais voltas (golfdirecto publica «Ronda 1» e «Ronda 3» à parte — as
  posições finais estão na segunda), depois a com mais cartões buraco-a-buraco.
  Cada campo que lhe falta (posição, total,
  ±par, voltas, buracos, par/metros, campo, datas, ligações) vem das outras;
  quem só estava numa cópia passa para a principal, no flight dos colegas —
  se os colegas estão em vários escalões (o «Geral» do EGR sobre U14 e U18 do
  GJGL), fica num flight à parte «Geral Rapazes (EGR)»/«Geral Raparigas (EGR)»
  (sexo pelas fichas), sem escalão inventado. `extra.fundidoCom` lista as cópias.
- **Classificação transversal** (WJGC/EOWAGR «Boys WAGR» por cima dos
  escalões; FFG «Junior Series» por cima de «U16 et U14»): liga-se a provas que
  não se ligam entre si, ou o nome acaba em «WAGR» — só saem as linhas
  repetidas (enriquecendo a do escalão); quem só lá está fica.
- **Fonte rica partida por escalão no EGR** (Estonian Junior Open, GJGL): as
  cópias EGR fundem-se nela, não o contrário.
- Mesmo nome com outra ficha e as mesmas pancadas conta como o mesmo jogador
  — a linha funde-se e as duas fichas juntam-se (ver «Fichas duplas» abaixo).
- O que sobra no mesmo dia (~370 grupos em 01/11) tem pancadas diferentes e,
  revisto caso a caso, quase tudo é a mesma pessoa em provas de vários dias que
  se cruzam (UA Worlds e USKids local, R&A Boys e uma prova de fim de semana) ou
  datas erradas de uma das fontes — não são homónimos. Diagnóstico: por ficha,
  pares de provas de fontes diferentes cujas datas (início–fim) se sobrepõem.

### Fichas duplas e homónimos (01/11/2026)

`scripts/aggregator/util/juntar-fichas.js`, logo a seguir às provas repetidas
(passo «Fichas duplas juntas» no log). Junta duas fichas só com PROVA:
- o mesmo nome com as MESMAS pancadas na mesma prova publicada 2× (Francisca
  Costa da FPG = a licença «E77995991» da FFG na Evian 2024; Marius Dupraz,
  Arthur Haghedooren, Maria Sueiro Nieves com duas licenças RFEG do mesmo sufixo);
- uma ficha só com licença «E…» da FFG (a FFG dá uma nova ao estrangeiro em
  cada prova) com o mesmo nome e nascimento de UMA ficha a sério — as outras
  «E…» com o mesmo nome e nascimento vão com ela (Louis Dirickx tinha 3).
Fica a ficha com mais provas; a chave da outra vai para o histórico da fonte
(`historicalLicenses`/`historicalFeds`/`historicalMemberIds`) e passa tudo o
que ela não tinha. O «(U18)» que a FFG cola ao nome sai no `ffgolf.js`.

**Homónimos do EGR:** o EGR distingue jogadores com o mesmo nome por uma marca
entre parênteses («Callum (ENG) Brown», «Callum (SCO) Brown», «Jack (RMS)
Turner»). O `normName` tira os parênteses, e 95 fichas juntavam pessoas
diferentes. Agora o identity-matcher veta (como o `notDuplicates`) juntar
entidades EGR do mesmo nome com marca diferente — 127 pares em 01/11. Quando o
próprio EGR mostra a mesma pessoa com e sem marca na mesma prova (Danny Lyne,
James Walsh), as mesmas pancadas voltam a juntá-las.

Casos à mão no `juniors-overrides.json` (01/11): Paul Martin n. 2009 (FFG
041933301) ≠ Paul Martin de Maisons-Laffitte (551742239) ≠ Paul-Antoine Martin
(514734273); Jack Smith US (USKids 574084) ≠ Jack Smith FR (4 provas de um dia
no mesmo dia nos dois lados do Atlântico); Jake Williams US ≠ o do EGR (Welsh
Closed); Isabel Sirel com três datas de nascimento na GolfBox = uma só.
⚠ No `notDuplicates`, uma regra com mais de 2 chaves veta TODOS os pares entre
elas (também entre as do mesmo lado) — escrever pares.

**Datas do LiveGolfScoring:** em 46 de 72 provas o `dateIso` é o ÚLTIMO dia
(«25 junio - 27 junio» → 2025-06-27). O `sources/rfeg.js` usa o primeiro dia
do `dateRange` (`datasDoIntervalo`, com `endDate`); sem isto o Campeonato de
España Alevín caía em cima do Nacional de Jovens Sub-12 e o Raul Pazos e a
Sabrina Crisóstomo pareciam dois. O `rfegolf-rivals.json` em si não mudou.

O adapter `rfeg` resolve resultados **sem licença** (todo o LGS + blocos
nativos do microsite) por lookup de nome normalizado contra `spain.byName`
(nomes ambíguos ficam fora), com fallback `anon|`. Sem isto, os torneios LGS
existiam no kids2 mas não creditavam nenhum jogador. Jogadores vistos em
resultados mas fora do roster ganham RawPlayer próprio (com dob/club quando o
mitarjeta os traz).

### UI kids2 — checklist ao adicionar uma fonte

1. `Kids2SourceKey` + `SOURCE_PILLS` em `KIDS2Page.tsx` e `SourceKey` em `kids2/Sidebar.tsx` (o filtro para fontes fracas funciona via `tournament.sourceId`, sem mais código).
2. Token `--source-{id}` em `tokens.css` + `SOURCE_COLORS`/`SOURCE_LABELS` no `kids2/components/EvolutionChart.tsx`.
3. Matcher de domínio em `kids2/tournamentLinks.ts` (nota: `eg-*.golfgenius.com` → england tem de vir ANTES do matcher genérico `golfgenius.com` → doral).
4. Paths de trigger no `build-juniors.yml` (o workflow NÃO instala dependências: um adapter não pode precisar de `node_modules`).
5. Sanity: Manuel×Dmitrii = **7 confrontos** (EC26, Venice25, Venice26, QDL25, EOWAGR LTQ25, WJGC25, WJGC26).

### Limpeza de duplicados — `scripts/find-junior-duplicates.js` (2026-07-08)

**Limpeza de nomes no intake do matcher (2026-07-09):** `stripDupAbbrev()`
(`aggregator/util/names.js`) conserta nomes corrompidos "Jessica WangJ. Wang"
(o EGR e alguns leaderboards antigos colam nome completo + abreviatura na célula) antes do matching E
do display; o `normName` do agregador remove anotações entre parênteses
("(IRE)", "(AJ)", "(jr)") só para matching. Sem isto havia ~185 entidades
fantasma que nenhum merge apanhava.

O matcher é conservador de propósito, por isso sobram duplicados no canónico:
mesmo miúdo federado em 2 países (país difere → matcher recusa), nome abreviado
("J. Smith"), só 1 dos sobrenomes ("Tomás Silva" vs "Tomás Costa Silva"), nome
invertido ("Ziyang Guo" vs "Guo Ziyang"). O detector lê `juniors.json` +
shards de torneios e gera pares candidatos com score/evidência.

Sinais positivos: relação de nome (exacto/invertido/subset/inicial/prefixo/
sobrenome parcial) + mesma DOB (+35) + mesmo país (+10) + mesmo clube (+12) +
**sufixo RFEG igual** (+30 — mudar de clube muda o prefixo da licença mas os
últimos 6 dígitos mantêm-se, ex: LV60968059↔LV70968059; gera `preferStrongKey`
+ `manualHistoricalIds` automáticos no snippet) + **nome raro** (+15,
2026-07-09 — nome exacto/invertido cujo multiset de tokens só existe nas 2
entidades do par em TODO o corpus E com ≥1 token raro, visto em ≤3 juniores,
ex: "Bernardini"; um "João Silva" que por acaso só aparece 2× NÃO conta porque
os tokens são comuns). Com DOB igual OU nome raro, país diferente NÃO penaliza
(é o caso multi-país/2-bandeiras que procuramos: miúdos com pais de
nacionalidades diferentes escolhem a bandeira consoante o torneio — caso
Victor Bernardini FR↔BE, fundido nessa passagem). Sinais negativos/kill: sexo
diferente, DOB exacta diferente, **escalão impossível** (dos flights jogados —
ageMax + ano — infere-se o ano de nascimento mínimo; jogar para cima é
permitido, para baixo não), e **co-ocorrência no mesmo flight do mesmo torneio**
(lado a lado na leaderboard → 2 pessoas; `--include-coplay` desactiva). Mesmo
torneio em flights diferentes = −15 + flag (irmãos?). Chaves fortes
conflituantes na mesma fonte sem sufixo RFEG igual = −25 + flag.

**Ambiguidade:** se um junior aparece em vários pares (ex: "Pablo Garcia" bate
com 3 nomes completos), todos os seus pares ficam marcados ambíguos → só
revisão manual, nunca auto-merge.

**Auto-merge (`--apply`):** candidatos com CERTEZA (nome exacto/invertido/
contido + mesma DOB, ou sufixo RFEG igual, ou **nome raro** — este último nunca
em pares ambíguos) ou corroborados (mesmo clube/país + score ≥ `--merge-min`,
default 55), sem ambiguidade nem flags, são acrescentados ao `forceMerge` do
`juniors-overrides.json` com `"auto": true`. Primeira passagem 2026-07-08: 221
merges aplicados (17195→16952 juniores), 9/9 sanity. Segunda passagem
2026-07-09 (com nome raro, pós-EGR): 208 merges (22373→22165), 9/9 sanity.

```bash
node scripts/find-junior-duplicates.js                # relatório (score ≥45)
node scripts/find-junior-duplicates.js --apply        # aplicar merges seguros
node scripts/find-junior-duplicates.js --player gao   # filtrar por nome
```

Outputs: `reports/duplicate-candidates.{json,html}` + `proposed-merges.json`
(gitignored). O HTML é o fluxo de revisão dos restantes: cada card tem 2
snippets prontos a copiar — ✅ mesma pessoa → `forceMerge`; ❌ pessoas
diferentes → **`notDuplicates`** (lista no `juniors-overrides.json`, formato
`{sourceKeys:[a,b], reason}`) que suprime a sugestão em runs futuros **e, desde
2026-08-14, é também um VETO no identity-matcher** (o `tryUnion` recusa juntar
grupos que ponham um par listado na mesma entidade; `forceMerge` explícito
continua a ganhar) — usado para desfazer fusões automáticas de homónimos, ex:
o "Luis Maier" do Doral ≠ Luis Maier DE do USKids (confirmado pelo próprio:
há 3 miúdos DE com este nome no mesmo escalão). Ciclo:
`aggregator/index.js` → detector → rever HTML → colar overrides → repetir.
Pares já cobertos por `forceMerge`/`notDuplicates` nunca são re-sugeridos.
Testes: `scripts/find-junior-duplicates.test.js` (vitest apanha
`scripts/**/*.test.js`).

## Ano de nascimento CERTO sem data (2026-11-03)

Fontes que publicam só o ANO (Federgolf — ranking juvenil; GolfBox) entram com
`dobRange` de um ano inteiro. Sem data completa, o `buildJunior` guarda esse ano em
`junior.birthYear` (+ `birthYearSource`); o `juniors-scout.json` leva-o em `y`, e
`src/data/kidsDob.ts` usa-o como ano LIDO (pílula na cor do escalão), por cima da
estimativa dos escalões USKids (`ne`, a vermelho). Antes perdia-se: os italianos do
Venice Open apareciam estimados apesar de a FIG dar o ano. Ordem: `d` > `y` > `ne`.
⚠ Só fontes que PUBLICAM o ano: Federgolf (`extra.anosNascimento`) e as com
`extra.birthYear` (GolfBox…), nunca a GJGL (`birthYearEst`, estimado) nem a EGR; e o
scout não dá `y` se contradiz os escalões USKids (`ne`) — sinal de duas pessoas na
mesma ficha (caso Paul Berger, «2015» a jogar Boys 12). Também o `hcpJogo` dos
condados ingleses entra no `hcpHistory` (source `hcp-jogo`, não é o HI).

**HCP com data para o SD:** a Federgolf põe o `indice` de cada prova no `hcpHistory`
(source `fig`); o scout leva `hh` (até 6 `[data, hcp]`, também o RFEG oficial) e
`kidsDob.hcpAt` dá o mais perto da data do torneio (≤183 dias) a quem não tem
`hcpExact` — o `SDPill` pinta o SD com ele (Venice Open 2026: 20 de 31; antes só o Manuel).

**HCP de cada prova em todas as fontes (03/11/2026):** peça comum
`util/hcp-historico.js` (`criarHistorico(source)` → `registar(chave, data, hcp, prova)` e
`aplicar(players, chavesDe)`) — rfeg, fcg (golfdirecto, `hcpExact`) e gjgl. O
`util/jobfile.js` passa a guardar o `hcp` (índice) que as fontes JobFile publicam por
jogador: DGV (7 287), EJT (3 200), EJO, EYM, Evian, AV Trophy, EATC/EBTC/EGTC, ELG,
Faldo Madeira — antes só o `hcpJogo` dos condados. Juniores com HCP datado
14 791 → 18 442 (61 872 pontos). Teste: `util/hcp-historico.test.js`. Fonte nova com HCP
por prova → `criarHistorico`, nunca guardar só o último.

**HCP de cada prova espanhola (03/11/2026):** o `sources/rfeg.js` guarda no
`hcpHistory` (source `rfeg`, com a data e o nome da prova) o HCP que cada classificação
traz (RFEG, Basco, Navarra, CLM, Rioja, NextCaddy — o NextCaddy deixa os «+N» de fora)
e o das listas de inscritos `rfegolf-resultats/*.json` (admitidos e convidados), que
cobrem as provas que ficam no Kids 2 pela gémea do LiveGolfScoring, sem HCP. É o índice
WHS do jogador — também dos estrangeiros (licença «XXXXX…» → chave pelo nome). Antes só
ficava o último, sem data (Junes Chirband: 1 HCP → 3). 4021 jogadores; 14 791 juniores
com HCP datado no scout. Teste: `sources/rfeg-hcp-historico.test.js`.

**Só no ranking juvenil da Federgolf** (sem prova nos `federgolf/*.json`): o `fig.js`
acrescenta-os sem provas (`extra.soRanking`, com ano e clube). O passo 5b junta-os
à ÚNICA ficha italiana (alguma entidade com país IT) com esse nome, mesmo sexo e
ano compatível; sem ela não fazem ficha (fichas sem provas caem no passo 8).
Venice 2026: Orlando Borghi, Francesco Monosi e Michael Spivak ganharam ano e clube.

**Fichas manuais (`juniors-overrides.json` → `manualPlayers`, 03/11/2026):** para
quem interessa e ainda não jogou nada que as fontes tragam (os irmãos Pérez Granell,
inscritos no Spanish Open). Cada uma: `{ key, canonicalName, sex, country, club,
sources: { rfeg: { lic } }, reason }`. O `identity-matcher` (`fonteManual`) põe-nas
como fonte `manual` sem provas; o matcher, o `fundir-torneios` e o scout mantêm-nas
mesmo com 0 provas. Com licença RFEG: id `r<licença>`, `sources.rfeg.manual` e o
`scrape-federados-es.js` inclui-as sempre no âmbito → hándicap oficial actualizado
sozinho (para uma licença nova já: `--lics A,B --max-dias 0`). Quando os resultados
chegarem, junta-as um `forceMerge` (`manual:<key>` + `uskids:<id>`) ou o nome + país.
Também levam `dob` e `club` de um registo oficial que não é fonte — com um
`forceMerge` para a ficha existente, a data entra e o clube passa à frente (`primary`).
Suecos: o golfdata.se (ranking da federação, `sgfranking/Players_searchpage`, fichas
`players_startpage?PlayerID=N`) dá data e clube de quem joga provas do ranking (≈13+);
HCP sueco só no Min Golf, com login. Feito para Erik Groth, Henri Sandqvist Lidholm e
Junes Chirband (European Championship 2026).

**Raparigas e quem não está no member-history USKids:** sem memberId os resultados
caem no matcher e não há ficha (as raparigas do Venice ficaram sem seta). Testado a
03/11/2026 dar ficha a todos pelo nome + país (5,4 mil novas) e desfeito — ela não
as quer («as raparigas não me são relevantes»).

## Órfãs e cauda de duplicados (`find-orphan-duplicates.js`, 2026-09-18)

O `find-junior-duplicates.js` exige idade (quase nunca há DOB) e desconfia de países diferentes (cada fonte regista coisas diferentes: residência, licença, nacionalidade) — por isso não apanhava a cauda. O `scripts/find-orphan-duplicates.js` usa:
- **idade pelos escalões** (Boys 9 em 2023 → nasceu 2013-2014; intersecção de todas as participações) e **sexo pelos escalões**;
- vetos: **jogaram juntos** no mesmo torneio, ou **torneios diferentes no mesmo dia** (Michael Egan GB ≠ US);
- nome tolerante com regras aprendidas em amostras reais: contido só com o mesmo 1.º nome; variante só com todos os apelidos do curto no longo e 1.º nome = diminutivo ou 1 letra (só se um dos dois for raro); variantes com países diferentes ou nomes do leste asiático não; nome curto a acabar num nome próprio comum ("Juan Pablo") não serve de dono; nomes muito comuns exigem mesmo país E idade;
- **candidato único** (fichas com historial: recíproco).

```bash
node scripts/find-orphan-duplicates.js            # só órfãs (1 torneio), relatório
node scripts/find-orphan-duplicates.js --todos    # todas as fichas
node scripts/find-orphan-duplicates.js --todos --apply   # forte + média → forceMerge (auto)
```

1.ª aplicação (18/09): 413 junções + 10 reposições; 30.354 → 29.932 fichas; 0 junções perdidas (verificado contra o juniors.json da manhã; só o Michael Egan, errado, foi separado). **Tecto medido:** pares com nome compatível + idade/sexo compatíveis + nunca juntos = 736 em 30 mil fichas; 10.547 das 10.981 órfãs têm um nome que não se parece com nenhum outro — são miúdos de quem só temos 1 torneio, não duplicados. Cruzar pelos resultados (mesmas pancadas na mesma semana) foi testado e **descartado**: sem cartões buraco a buraco dos dois lados, coincidências ao acaso (Doral 2022 ≡ Mexico City 2022).

Correcções na fonte do mesmo dia: UA Worlds com país da `location`; FFG com licenças `E…` juntas por estrangeiro e sem FR assumido; `normName` trata `’ ‘ ´ ʼ` como `'`.

## EGR — fichas de jogador (2026-09-18)

`node scripts/scrape-egr.js --players --skip-existing --concurrency 3 --id <ids>` → `public/data/egr/players/egr_{id}.json`. A ficha traz os eventos da **janela do ranking (~2 anos)**, não a carreira toda (Felix Dietz: 8 na ficha, 13 nos nossos eventos). O `sources/egr.js` junta-os: evento que não scrapámos entra como **torneio parcial** (`extra.parcial`, só os jogadores com ficha; posição + voltas). Chave do jogador = nome+país, igual às classificações (confirmado).
1.ª corrida: U12+U14 do ranking (gerações 2012-2015; o `birthYear` só existe em ~10%) — 2.985 fichas, ~40 min; 1.098 fichas existentes ganharam 2.389 participações, 181 órfãs deixaram de o ser, +441 miúdos que não tínhamos, 591 torneios parciais; 0 junções perdidas. 2.ª corrida: todos os 9.696 jogadores dos nossos eventos EGR (`--ids-file ids.txt` — a linha de comando do Windows não aguenta ~7 mil ids): 10.282 fichas, 4.547 fichas ganharam 18.150 participações, 606 órfãs resolvidas, 0 junções perdidas; ~6 min a 3 em paralelo.

## EGR — eventos antigos (2026-09-19)

As classificações dos eventos EGR continuam publicadas depois dos 2 anos (só os pontos caducam). Calendário por ano: `/events/search?date[year]=Y` (o de 2018 dá HTTP 500 — o `scrape-egr.js` agora salta o ano e continua). `--events --year 2019 … --year 2024 --skip-existing`: +1.864 eventos juvenis (934 → 2.798); 37.859 fichas; 5.759 fichas existentes ganharam 27.857 participações; 892 órfãs resolvidas; 0 junções perdidas.

## Fontes Swiss Golf (Suíça) e RBGF (Bélgica) — federações no GolfBox (2026-11-04)

Pedido dela: «traz as provas suíças de 2025 e 2026 para enriquecer os dados do EGR».
`scripts/scrape-golfbox-federacao.js --fed swissgolf|rbgf` lê o calendário GolfBox da federação (Swiss Golf customer 1085,
RBGF customer 22; época corrente e anterior), escolhe as provas juvenis individuais já jogadas (Junior
Tour, National Events U14, National Championships U10–U18, finais U10–U18; fora os
jogos por equipas contra regiões, acompanhantes, camps, indoor e U25) e reaproveita o
`scrapeOne` do `scrape-golfbox.js` → `public/data/{swissgolf|rbgf}/{competitionId}.json`
(JobFile) → adapters `sources/swissgolf.js` e `sources/rbgf.js`, os dois pelo `util/golfbox-federacao.js` (fonte FRACA: nome +
país; chave `gb{RefID}`). Só kids2 — não vai à `/major`. Federação nova no GolfBox = uma entrada em `FEDERACOES` + um adapter de 5 linhas.
- **Bálticos (\`baltico\`, 04/11/2026):** Letónia (federação, customer 911: BTA Latvijas Junioru golfa tūre e Latvian Junior Open) + Lithuanian Junior Open (a federação lituana não está no GolfBox; está no calendário do clube organizador, customer 884). Uma fonte pode ler vários calendários (\`calendarios\` em \`FEDERACOES\`) e tirar classes (\`classesFora\`: «Neto» = net, «LGF Dāmas/Kungi» = adultos, «Autobuss»). 19 provas de 2025–26.
- **Irlanda (`irlanda`, 04/11/2026):** a Golf Ireland publica os campeonatos no GolfGenius (uma `/pages/{id}` por campeonato) e não tem directório público — a lista vem da EGR (eventos com país Ireland e link GolfGenius). `scripts/scrape-golf-ireland.js` usa o `runOne` do `scrape-golfgenius-node.js` com duas opções novas: `outDir` (grava em `public/data/irlanda/`, fora da /major) e `transform` (acerta o resultado ANTES da comparação com o disco: país pela EGR — o GolfGenius da Golf Ireland só mostra o clube e o leitor cairia em «US» —, sem país quando a EGR não o tem; fora as classes vazias e as «Best Net»; o sexo vem do nome do campeonato quando a classe não o diz). As provas de 2026 na plataforma «GolfHub» (`golfhub.golfgenius.com/events/{uuid}`) resolvem-se pela API pública `api.golfhub.golfgenius.com/api/v1/events/{uuid}` (campo `gg_portal_url` → redirecciona para a página clássica `/pages/{id}`); a lista completa de eventos do hub e as voltas/cartões da GolfHub pedem login. HCP de jogo: as classes «Best Net/Nett» dão Gross − Net (dividido pelas voltas; só um inteiro plausível) → `hcpJogo`, como nos condados ingleses. O «Flogas Order of Merit» do topgolfer.ie é de ADULTOS (Junior/Senior Scratch Cups = categorias de handicap, não idade) — não entra. Corre no workflow das federações.
- **Noruega, Finlândia, Polónia (`ngf`, `sgl`, `stars5`, 04/11/2026):** GolfBox — Norges Golfforbund (customer 18: Srixon Tour U19 e Junior NM por pancadas; fora o Jr NM Match, Future Camps, Winter Open), Suomen Golfliitto (332: FootJoy Finnish Junior Tour, Junior SM, Finnish International Junior U14/U16, qualificação do JR SM; fora reikäpeli, Challenge/Haastaja, simulador, short course e o GJG, que já vem pela gjgl) e o 5 Stars Junior Cup by Adrian Meronk (2299; fora a «HCP klasa»). O `parseDivGolfbox` lê «Gutter/Jenter 16-19 år», «G19-klassen», «Tytöt-18», «Man/Woman». 15 + 22 + 12 provas de 2025–26.
- **Áustria (`oegv`, 04/11/2026):** `scripts/scrape-oegv-nexxchange.js` — a página pública do torneio no golf.at (data, campo, par/SI) embute a classificação do **nexxchange** (`tournament.nexxchange.com/de/at/{ano}/{clube nt-club-nr}/{torneio}/live-score`, pública): separadores por classe («Burschen/Mädchen U14»), bandeira, jogador com o HANDICAP entre parênteses («Uraki Leo (-2,4)», plus em negativo), clube, voltas e total. O buraco a buraco (`…/live-score-hole-by-hole`) só traz a ÚLTIMA volta; os cartões completos não são públicos. Lista pela EGR (país Austria, link golf.at). 15 torneios (AJGT 1–5 e Final, Austrian Girls & Boys, Wiener Meisterschaften Jugend), 1653 resultados.
- **Escócia (`scottishgolf`, 04/11/2026):** `scripts/scrape-scottishgolf.js` (peças em `scripts/lib/scottishgolf.js`) — a API pública do scottishgolf.org (a mesma das páginas `tournament-leaderboard`): calendário do ano (`GetPastTournaments`, clubWebsiteId 1002; ⚠ os parâmetros vazios TÊM de ir na query), classificação (`GetTournamentLeaderboard`) e o cartão de cada volta (`GetRsScoreV2`: pancadas, par, jardas → metros; sem SI nem CR/Slope). Os 7 campeonatos juvenis em stroke play por TournamentId fixo: 7 Boys' Open, 5 Girls' Open (U18), 12/16 Boys'/Girls' Under 16 Open, 13/14 Boys'/Girls' Amateur (a fase de stroke play; em 2026 o match play partilha o TournamentId → sai pelo nome) e 15 Under 14 Open — misto desde 2024 (Gender «A»): o sexo sai do tee, o mais comprido é o dos rapazes. Girls' U16/U14 2023: as divisões «Leading U16/U14» dão o escalão e as posições recontam-se dentro de cada uma. `ClubCountry` = clube dos escoceses, país dos estrangeiros (`clubeDe`). Sem nascimento nem HCP — fonte fraca. Na API só há resultados desde 2023 (antes: outro sistema, `championships/#/competition/…`). A Junior Tour Scotland continua fora. Prova acabada e gravada não se volta a pedir.
- **Dinamarca (`dgu`, 04/11/2026):** Dansk Golf Union (GolfBox customer 15): Dormy Elite Tour (Drenge U22 / Piger) e a Finale, o DM Juniorer (slagspil) e o Girls Only Tour (só a Mesterrække; a classe «GOT» não diz o sexo → `parseDiv` próprio). Fora o match play (hulspil), seniores, para-golf, as classes «Damer» e «WAGR» (vista repetida) e as filas A/B do Girls Only. Os adultos do U22 saem pelo ano de nascimento. 20 provas de 2025–26, 807 resultados.
- **Suécia (`sgf`, 04/11/2026):** SGF Juniortävlingar (customer 4) — só o nível nacional: Svenska Juniortouren Elit, a Final e o ANNIKA Invitational Europe (só raparigas; a classe não o diz → `parseDiv` próprio no `sources/sgf.js`). Fora as ~350 regionais (Juniortouren Div./Vinter), as taças de clubes e o match play (JSM Match, Nordic Junior Match). Classes «Pojkar»/«Flickor». 13 provas de 2025–26.
- **Bélgica (RBGF):** Junior U12 & U14, Junior Opens (54 buracos, 3 voltas de 18), National Juniors, Junior Masters, finais U12/U14. Fora: Interclubs (equipas), Bélgica × Países Baixos, Kids Tour (iniciação), canceladas e o Albert Vermeiren (fica na fonte `avtrophy`: o leitor salta tudo o que já está no `golfbox-scope.json`). Classes «Boys»/«Girls» = overall: sem idade, perdem para o escalão.

- O EGR já tinha ~140 provas suíças, só com o total de cada volta e quase sem U10/U12/U16.
  Esta fonte traz ano de nascimento, clube, HCP do dia (→ `hcpHistory`), cartões buraco a
  buraco, par/SI/CR/Slope; o dedup genérico do EGR (`util/egr-dedup.js`) tira a versão EGR.
- No Junior Tour o U16 repete os miúdos do U18 e nos Nacionais o U12 repete o U14: os
  ficheiros guardam as classes como vêm; o `umaDivisaoPorJogador` do `jobfile.js` deixa
  cada miúdo no escalão mais específico.
- **EGR: juntar, não apagar (04/11/2026, pedido dela).** Quando o dedup do EGR tira um evento porque outra fonte já o traz, a prova que fica guarda-o em `extra.egr` (sourceKey, nome, link) e ganha o link «European Golf Rankings»; o filtro «EGR» do Kids 2 conta-a. Cada prova liga também ao evento na federação/organizador de onde vem (`collectLinks` do `jobfile.js`: link por classe; sem ele, o do evento — Faldo/Evian no GolfGenius; o Evian antigo «(trnId N)» vira a página FFG real pelo `ffgolf-resultats-index.json`; `linkSite` dá o nome da federação, «Swiss Golf»/«RBGF Bélgica» em vez de «golfbox.dk»). Na página `/egr`, os eventos que a EGR foi buscar ao GolfBox e que nós lemos inteiros (Suíça, Bélgica, Albert Vermeiren, Estonian Junior Open…) mostram o ficheiro completo (cartões, clube, HCP, draw): `scripts/build-egr-fontes-ricas.js` (prebuild, gitignored) → `egr/egr-fontes-ricas.json` {id EGR → ficheiro + classes}; além do nº GolfBox, usa `egr/egr-cobertos.json` (gravado pelo agregador: evento EGR → fonte + chave da prova que o cobre) para as fontes em JobFile — DGV, Faldo, Evian, condados ingleses, JOB; FFG, FIG, RFEG e England (formatos próprios) ficam com os totais, lido em `src/pages/egr/egrCircuit.tsx`. A classe escolhe-se pelos JOGADORES em comum (o «U18» da EGR é muitas vezes o campo todo; o «U16/U14» junta duas classes); menos de metade em comum → fica com os totais. 94 eventos ligados; 3 suíços de 2025 em que a EGR aponta para a competição errada ficam com os totais.
- Workflow `update-golfbox-federacoes.yml` (as duas federações; segunda 06:30 UTC, só de Abril a Novembro — 1× por semana chega, decisão dela). Pedidos um a um, pausa de 2 s.

## Fonte DGV — Alemanha (2026-10-10)

`scripts/scrape-dgv.js` → `public/data/dgv_{tournamentNumber}.json` (1 JobFile por prova) → adapter `sources/dgv.js` (sourceId `dgv`, fonte FRACA: nome + país, chave forte `dgv{dgvPlayerId}`). Cobre as provas juvenis do Deutscher Golf Verband desde 2022: DM AK 14/16/18, DM-Vorausscheide, DMM da juventude e German International Boys/Girls (98 provas na 1.ª corrida). Divisão «AK 14 Jungen» → idade máx. 14 + sexo; Boys/Girls → 18.

- **Só voltas individuais contam.** Nas DMM o foursome (Vierer, `partnerNumber` > 0) dá uma pancada por par: fica em `teamRounds` e o agregador ignora-o. Quem só jogou o foursome não é participação (fica como roster).
- **Handicap:** o «plus» da DGV vem com sinal menos — é a nossa convenção, guarda-se tal como vem. Vem com vírgula ou ponto conforme a prova.
- **Estrangeiros:** clube 8 e o nome do clube é o país em alemão → ISO2 (tabela `COUNTRY_DE` no scraper).
- **Cartões:** o buraco a buraco é uma imagem PNG; do cartão só se lê par, CR, Slope, percurso e tee (`membership-card-api.golf.de/…/details`).
- **Workflow** `update-dgv.yml` (segunda 06:00 UTC, 1× por semana — decisão dela, 04/11/2026): janela de −21 a +7 dias; a pedido com `ids` ou `from_days`. Guarda anti-encolhimento por nº de jogadores com voltas; exit 2 = nada mudou.
- Ainda **não** está na `/major` (só kids2). Mapa de links: secção «DGV — Alemanha» em `docs/links-conhecidos.html`.

## Fonte «Condados ENG» — `ggcondados` (03/11/2026)

Uma só fonte (pill «Condados ENG») que lê DUAS pastas, com o mesmo formato JobFile (`dirs` no `buildJobfileSource`): `public/data/gg-condados/` (circuitos no GolfGenius — BB&O, PING, Cheshire; `scrape-gg-condados.js`) e `public/data/ig-condados/` (sites das associações de condado em intelligentgolf — Surrey, Kent, Lancashire…; `scrape-ig-condados.js`). Fonte FRACA (nome + país GB + clube). Cada ficheiro traz a sua série (`ggc-bbo`, `igc-surrey`…). Por resultado o `hcpJogo` (handicap de jogo do dia, não o HI) → pill «🎯 HCP de jogo» na ficha. Detalhe: [england.md](england.md).

## FPG — as provas de jovens em que o Manuel jogou (03/11/2026)

Pedido dela: «procura mais miúdos com quem já jogamos, pelos torneios que jogamos». A whitelist
da fonte `fpg` deixava de fora o Miramar Open, o World Kids 2024, o Drive Tour Norte e as quatro
provas PJA sem «PJA» no nome (AT&T Pebble Beach, Aroeira Master by Details, Ribagolfe Oaks
Masters, Race to Dunas G. Final — vão pelo `PJA_TCODES` de `ranking-pja/pja-rules.mjs`).

- **Regra** (`provasDeJovensDoManuel`, `sources/fpg.js`): entra o escalão que tem o Manuel
  (fed 52884) **e os escalões irmãos** (mesmo clube e mesmo dia), desde que o nome tenha marcador
  juvenil (Drive Tour, Jovens, Junior, Kids, PJA, Sub NN, U NN) ou tcode PJA. Lê também os
  `drive-data-*.json`. Torneios de clube de adultos (Rali, Taça Presidente, Taça Yeatman…) ficam
  fora, mesmo com o Manuel; escalões adultos (Sub 24) também. Com as duas voltas juntas
  («10674+10676») os dias soltos saem.
- **⛔ Fora: a Madeira e o Drive Challenge** (`foraDoKids2`). Ela: «não quero os miúdos (fracos)
  da Madeira no kids 2». Na 1.ª versão entraram o Drive Challenge e o Drive Tour da Madeira, os
  Regionais, o CGSS Junior e a Academia do Palheiro, e o topo dos cruzamentos encheu-se de
  miúdos da Madeira (Íris Costa 26×…). Fica fora tudo o que se joga na Madeira (região
  «madeira», CGSS 007, Palheiro 059, campos da ilha) e o Drive Challenge, regional ou Final
  Nacional — o circuito de iniciação, por onde esses miúdos chegavam.
- **⛔ Federado e escalão vêm da PRÓPRIA prova** (regra no `CLAUDE.md`). Sem número na
  classificação, o fed vem das inscrições/draw da mesma prova (`fedDoJogador` ←
  `fpg-admissions-draws*.json`, chave ccode|tcode|ano + nome): Ryan Dantas, Frederico Almeida da
  Silva, Maria Madalena Neves Ferreira… Na 1.ª versão casei por nome + clube noutras listas e
  ela corrigiu: «tens o número também de federado dele… estás sempre a insistir no mesmo erro».
- **Data de nascimento** dos federados não seguidos vem do `federados.json` pelo número; o roster
  GolfBox (`util/golfbox-dob.js`) já não dá data a federados da FPG — pelo nome, um miúdo Sub-12
  (Francisco Silva, 48649) ficava com a de 1990 do adulto homónimo.
- **Provas abertas a adultos** (Miramar Open U25): saem os federados com mais de 18 anos no ano da
  prova. Os estrangeiros não têm federado nem escalão na prova — ficam.
- 9 buracos: `holesPerRound` = 9 quando o par tem 9 (Nacionais Sub-10).
- Efeito: o Manuel passou de 29 para 38 provas; miúdos no mesmo escalão 325 → 391; topo dos
  cruzamentos = Ricardo Castro-Ferreira, João Rocha, Pedro Costa Alemão… Miúdos de clubes da
  Madeira: 19 fichas antes, 21 depois (os do Miramar e da AT&T).
- No mesmo dia: o European Open WAGR 2025 («LTQ» = Le Touquet) tinha a data de 1 de Julho por
  omissão; `EDICAO` em `sources/eowagr.js` dá 11/08/2025 e o campo (voltas WHS do Manuel).

## Listas de inscritos sem números — ligar sem errar de pessoa (03/11/2026)

Pergunta dela: «como é que podemos fazer para isso de cruzar uma lista de inscritos que ainda
não tem números de federado com o jogador errado?». Medido antes (1130 ligações automáticas
nas 18 listas, 1129 só pelo nome) e aplicado com o «sim» dela, em `util/hcp-listas.js`:

1. **O número primeiro.** A licença FFG que a lista traz (`licFFG`, GP Jeunes) liga à ficha
   dessa licença; o federado que a PRÓPRIA prova dá ao inscrito (`lista.prova` = {ccode, tcode}
   → inscrições/draw, `util/feds-das-provas.js`, partilhado com a fonte `fpg`) liga à ficha
   desse federado — e só a essa. As 5 listas de Castro Marim têm `prova` 000/90872 (rapazes)
   e 000/90873 (raparigas). Apanhou logo um erro: o «Ricardo Ferreira» da lista (11.3) é o
   Ricardo ROCHA Ferreira (51180, Miramar, n. 2015), não o 45366 do Oporto (2012).
2. **Homónimos na federação inteira**, não só no Kids 2: PT (federados.json), ES (licenças
   RFEG, uma pessoa = data de nascimento ou 6 dígitos finais), FR (licenças FFG) — pelo nome
   exacto e pelos nomes contidos (mesmo 1.º e último). Dois compatíveis em sexo e idade → não
   liga.
3. **Contradições = não liga:** outra licença FFG na ficha; handicap recente (FPG oficial de
   hoje; RFEG/FFG com data a ≤ 6 meses; da FFG conta o índice do Mérite, `merite.idx` — o
   `hcp` da ficha é o de uma prova: a Zélie Guilloux tinha 3.9 e o índice +2.6) a mais de 5.
4. **Confirmação:** único na federação, clube igual (pela raiz: Münchener GC ~ München),
   handicap recente a ≤ 3, ou ano de nascimento conhecido dentro do escalão. Sem nada →
   `porConfirmar`: aparece na página com a etiqueta «ficha por confirmar», mas NÃO escreve
   o handicap na ficha.
5. **A mesma ficha para duas pessoas da lista** (handicaps a mais de 3) não fica ligada a
   nenhuma: Ben Smith (5.4 / 17), George Naylor (7.9 / 22.5), Harry Burgess (1.5 / 8.1).

Resultado (03/11): 1017 ligadas e confirmadas, 115 por confirmar (quase todas inglesas e
alemãs — sem lista completa da federação), 3 fichas desligadas por servirem duas pessoas.
Testes com os casos reais em `util/hcp-listas.test.js`. O campo `ficha` (ligação à mão)
continua a passar por cima de tudo.

## Fonte FIG — Itália (02/11/2026)

`public/data/federgolf/{id}.json` (a /fig, `scrape-federgolf.js`) + `federgolf-ranking.json` →
adapter `sources/fig.js` (sourceId `fig`, pill «FIG», cor `--source-fig`). M e F da mesma prova
juntam-se num torneio com dois flights (`fgChaveProva`); links para `/fig/{id}` e para a Federgolf.
Nomes, país dos estrangeiros, chave da prova e ano de nascimento vêm de
`src/data/federgolf/nomes.ts` — o MESMO ficheiro da /fig, lido pelo Node como o whsCalc (o
`build-juniors.yml` não instala dependências: nada de esbuild; trava em
`scripts/federgolf-nomes-loader.test.js`).

**Casamento — passo 5b do identity-matcher** (regra dela: «apenas o D é que não se liga»).
Os italianos não têm data nem país fiável (≈400 têm a ficha com outro país — residentes,
Mónaco…), por isso a `fig` fica FORA dos passos 4–5 (nome + país) e casa assim:
1. já junto pela data (roster GolfBox + nome, passo 4) — ~280;
2. **A** a ficha com uma prova em comum (≤ 3 dias, as mesmas pancadas — `mesmasPancadas`) — ~830;
3. **B/C** senão, a ÚNICA ficha com esse nome (ordem dos nomes indiferente) — ~80;
4. **D** várias fichas possíveis sem prova em comum → não casa (ficha própria) — 8;
5. nenhuma → ficha nova — ~180, id `i{sha1(id Federgolf)}` (o hash do nome colidia com
   os homónimos do passo 5.9). Uma ficha com outra fonte mantém o id de sempre.
Nunca casa com outro sexo nem com o ano contra: data da ficha > ano anual de outra fonte
(EGR/GolfBox) > escalões USKids (como o `nascimento-uskids.js`). O ano da Federgolf bate com
a data real em 66/66 e com o ano USKids em 191/192. Um 2.º id da Federgolf com o mesmo nome
(homónimo) fica à parte (`fig` é fonte forte). As cópias EGR das provas italianas saem antes
do matcher (`egr-dedup`), mas ficam em `egr.tournamentsRemovidos` para servirem de prova no 5b.
Testes: `resolution/casamento-fig.test.js`. Linha do log: «casamento por provas (fig)».

## Resumos leves para as páginas dos circuitos (2026-10-20)

As páginas dos circuitos não podem carregar o canónico (~180 MB). O agregador
escreve um resumo só (desde 23/10/2026; o `juniors-form.json` entrou nele), lido pela aba **Scout**
(`src/ui/circuit/Scout.tsx`, ex-«Quem repete» — CircuitShell, /uskids e Kids 2 «Próximos torneios»),
pelo Ranking e ficha do kids2 e pelos Próximos torneios (`buildExtraRivals`, sem a base de ~188 MB):
- `f` — a forma (`util/form.js`): últimos torneios e confrontos com o Manuel no mesmo escalão.
- `x` — resultados WJGC/Doral/EOWAGR por junior (tids de `src/data/kidsTid.ts`, partilhado com o
  browser) e, no topo, a ficha desses torneios.
- `juniors-scout.json` (`util/scout.js`, ~3 MB) — nível (tier), vitórias, top-3, HCP, data de nascimento,
  clube, país e provas em comum com o Manuel `[data, torneio, lugar, lugar do Manuel, pancadas − Manuel]`.
  Desde 21/10/2026 também `r: [ano de nascimento, sexo, posição]` — o ranking por coorte do `computeRanking`;
  a ficha do kids2 (`HeroIdentity`) e a `/kids2/ranking` leem-no com `useScoutRanking()`
  (`kids2/useScoutRanking.ts`; `decodeRanking` do `juniorCalc.ts` reconstrói percentil, tier e tamanho da
  coorte) em vez de o recalcular sobre ~38 mil juniores. Por isso o scout leva todos os juniores com ranking.

## Índice das setas ↗ — `juniors-links.json` (21/10/2026)

`util/links.js` escreve `public/data/juniors-links.json` (~1,5 MB, compacto):
`{ j: [[id, nome canónico, aliases?, memberId USKids?, fed FPG?, licença FFG?], …] }` (0 = falta; zeros do
fim cortados). É o que lê o `useKidsLinkMap` (setas ↗ do CircuitShell, `ui/ranking/RankingPage` e /uskids) e
a lista de jogadores da /ffg (`useJuniorsLinks`) — antes descarregavam o `juniors.json` inteiro (~52 MB).
⚠ O `build-juniors.yml` tem de committar também este ficheiro.

As contas são as do kids2, **no mesmo ficheiro**: `src/pages/kids2/juniorCalc.ts` (tipos, tier, vitórias,
confrontos, peso dos torneios) não tem imports, e o Node carrega-o directamente (como o `whsCalc.ts`).
O `data.ts` e o `tournWeight.ts` re-exportam daqui. Nada de `enum`/`namespace` nem imports nesse ficheiro.
Os resumos e o índice são ficheiros gerados — em conflito de git, regenerar (`node scripts/aggregator/index.js`).
