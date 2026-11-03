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
| `fpg` | players.json + pull-torneios (whitelist: Nacionais/PJA/GG/QDL/Finais Drive; **Drive/Aquapor regionais excluídos por design**) | **forte** (fed) |
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

## Fonte DGV — Alemanha (2026-10-10)

`scripts/scrape-dgv.js` → `public/data/dgv_{tournamentNumber}.json` (1 JobFile por prova) → adapter `sources/dgv.js` (sourceId `dgv`, fonte FRACA: nome + país, chave forte `dgv{dgvPlayerId}`). Cobre as provas juvenis do Deutscher Golf Verband desde 2022: DM AK 14/16/18, DM-Vorausscheide, DMM da juventude e German International Boys/Girls (98 provas na 1.ª corrida). Divisão «AK 14 Jungen» → idade máx. 14 + sexo; Boys/Girls → 18.

- **Só voltas individuais contam.** Nas DMM o foursome (Vierer, `partnerNumber` > 0) dá uma pancada por par: fica em `teamRounds` e o agregador ignora-o. Quem só jogou o foursome não é participação (fica como roster).
- **Handicap:** o «plus» da DGV vem com sinal menos — é a nossa convenção, guarda-se tal como vem. Vem com vírgula ou ponto conforme a prova.
- **Estrangeiros:** clube 8 e o nome do clube é o país em alemão → ISO2 (tabela `COUNTRY_DE` no scraper).
- **Cartões:** o buraco a buraco é uma imagem PNG; do cartão só se lê par, CR, Slope, percurso e tee (`membership-card-api.golf.de/…/details`).
- **Workflow** `update-dgv.yml` (Sex/Sáb/Dom 19:30 UTC + Seg 06:00): janela de −21 a +7 dias; a pedido com `ids` ou `from_days`. Guarda anti-encolhimento por nº de jogadores com voltas; exit 2 = nada mudou.
- Ainda **não** está na `/major` (só kids2). Mapa de links: secção «DGV — Alemanha» em `docs/links-conhecidos.html`.

## Fonte «Condados ENG» — `ggcondados` (03/11/2026)

Uma só fonte (pill «Condados ENG») que lê DUAS pastas, com o mesmo formato JobFile (`dirs` no `buildJobfileSource`): `public/data/gg-condados/` (circuitos no GolfGenius — BB&O, PING, Cheshire; `scrape-gg-condados.js`) e `public/data/ig-condados/` (sites das associações de condado em intelligentgolf — Surrey, Kent, Lancashire…; `scrape-ig-condados.js`). Fonte FRACA (nome + país GB + clube). Cada ficheiro traz a sua série (`ggc-bbo`, `igc-surrey`…). Por resultado o `hcpJogo` (handicap de jogo do dia, não o HI) → pill «🎯 HCP de jogo» na ficha. Detalhe: [england.md](england.md).

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
