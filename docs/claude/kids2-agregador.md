# kids2 — KIDSdataLoader e agregador de juniores

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## KIDSdataLoader — Arquitectura do loader de rivais

O `KIDSdataLoader.ts` era o loader central da KIDSPage (removida 2026-08-06); hoje o consumidor principal é o `kids2/NextTournaments.tsx` (`buildAutoRivals` → `FieldRivaisDashboard`). Exporta `buildAutoRivals()`, `normName()`, `getScorecards()`, `uskTournNames` (Map) e `uskFieldSizes` (Map).

### Só lê o canónico do agregador (verificado 2026-09-15)

O `KIDSdataLoader.ts` (~580 linhas) já **não** lê os ficheiros de cada circuito.
Carrega só os 3 ficheiros do agregador — `juniors.json`,
`juniors-tournaments.json` (em shards) e `tournament-catalog.json`; a
identidade e o merge das fontes (USKids, WJGC/EOWAGR, Doral, pull-torneios, …)
resolvem-se em build-time por `scripts/aggregator/` (ver "Agregador de
juniores"). `uskTournNames` e `uskFieldSizes` saem do canónico. As antigas
`processWjgc` / `processUskidsCompleto` / `processMemberHistory` /
`processManuelOverrides` ficam como stubs vazios, só para compatibilidade dos
testes (os grupos respectivos estão em `describe.skip`); o mapeamento
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
input + workflow_dispatch). ~30.4k juniores / ~21.2k torneios (2026-09-15).

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
anterior.

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
4. Paths de trigger no `build-juniors.yml`.
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
1.ª corrida: U12+U14 do ranking (gerações 2012-2015; o `birthYear` só existe em ~10%) — 2.985 fichas, ~40 min; 1.098 fichas existentes ganharam 2.389 participações, 181 órfãs deixaram de o ser, +441 miúdos que não tínhamos, 591 torneios parciais; 0 junções perdidas.
