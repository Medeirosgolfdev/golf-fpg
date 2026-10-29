# França (FFG) e Espanha — categorias e torneios por jogador

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Scripts — FFG (França)

### Categoria FFG de um jogador (`cat`/`catYear`) — 2026-07-23

A FFG **não expõe DOB**, por isso a categoria de cada jogador do
`france-players.json` é inferida. ⚠ **A série sozinha não chega**: no portal
resultats as divisões de uma prova juvenil chamam-se muitas vezes só
"Messieurs"/"Dames" (a idade vive no NOME — "1re Division U16 Garçons"). Antes
`cat` saía só do `lastSerie` e apenas **4560/13230** jogadores ficavam
classificados; os outros caíam fora de QUALQUER filtro de escalão e do toggle
"Só Jovens" da `/ffg/info/joueurs` (o Xan Iribarne, inscrito no torneio mais
recente, era invisível). O `build-france-players.js` passou a acumular os
escalões por ÉPOCA a partir de **série + nome da prova** (`addEsc`) → **13187/13230**.

`cat` = escalão **mais novo** da época mais recente com sinal de idade
(`categoriaDe` + `ffgEscalaoMaisNovo`), **não** o da última prova: um júnior
pode inscrever-se acima do escalão dele mas nunca abaixo, e o Xan (U12) fez a
"1re Division U16" em Julho — pelo máximo ficava Sub-16. `catYear` guarda a
época usada (tooltip da coluna Catégorie).

A regra canónica vive em `src/utils/ffgEscalao.ts` (`ffgEscalaoCanonico` +
`ffgEscalaoMaisNovo`), **espelhada** em `scripts/lib/ffg-escalao.cjs` para o
build Node — `scripts/ffg-escalao-mirror.test.js` compara as duas sobre os
labels reais do portal e falha se divergirem (padrão do `lib/course-aliases.cjs`).
Quem o usa importa-o de `src/utils/ffgEscalao.ts` (a `FFGPage` deixou de o
reexportar a 21/10/2026 — ninguém o lia de lá).

### Onde está o código de França (21/10/2026)

A `FFGPage` só desenha (Catégories d'âge, totais e mapa LGPIDF, DrawTab). Os
dados vivem em `src/data/ffg/`: `types.ts`, `names.ts` (`normalizeName`,
`ffgPlayerName`, `ffgCountry`, `divisionLabel`, escalões do filtro),
`toTournament.ts` (`ffgResToFPGTournament`, `toFPGTournament`), `lgpidf.ts`
(`lgpidfAdmissions`/`lgpidfDraws`/`lgpidfTotais`), `golfgenius.ts`
(`ggDrawToFpgDraw`, `buildFfgMatchplay`, chave de evento, sexo/datas/escalão
inferidos), `ffgEntries.ts` (`loadFfgSources`, `buildFfgEntries`,
`ffgResLoadDivisions`, entradas GG/`gg:evt:…`/LGPIDF — o que se desenha entra
pelos `FfgRenderers` que a página passa) e o hook `useFfgData.ts`. Testes:
`src/data/__tests__/ffgConverters.test.ts`.

**Lista lazy (21/10/2026):** a /ffg já não descarrega no arranque os ficheiros
GolfGenius do catálogo nem os LGPIDF (eram ~5,8 MB de 7,3 MB; agora o arranque
pede 4 ficheiros, ~1,5 MB, quase tudo o `ffgolf-resultats-index.json`). A lista
GG/LGPIDF sai de `public/data/ffg-list-index.json`, **gerado no predev/prebuild**
por `scripts/build-ffg-list-index.js` (fora do git, como o `fpg-files-index.json`
— o Vercel gera-o em cada deploy, por isso nenhum workflow o regenera). O
script empacota `src/data/ffg/listIndex.ts` com o esbuild do Vite e corre as
mesmas funções do browser (`ggGroups` — gémeos, match play, fusão dos escalões
do CFJ em `gg:evt:…` —, `visibleLgpidf`, `ggGroupEntry`/`lgpidfEntry`); o
`entryListMeta` (`src/ui/circuit/entryState.ts`) guarda o que a sidebar e os
filtros leem (★ `hasManuel`, PT `hasPt`, 🕳️ `hasAce`, `escalao`, `sex`…) e
**lança** se uma divisão trouxer um escalão/sexo que os metadados não cobrem.
Cada ficheiro só se pede ao abrir o torneio (`ffgListLoadDivisions`). Teste:
`src/data/__tests__/ffgListIndex.test.ts` (entrada lazy = eager).

### CR/Slope, metros e SI oficiais — RMS9 do organizador (29/10/2026)

O live scoring da FFG é o RMS9/A9online do **organizador** (tenant 9401 Ligue PIDF, 9406 Occitanie, 9411 Bretagne, 8023 FFG). A API é pública com cabeçalhos `x-tenant-id: fr_{tenant}`, `x-access-token` vazio e `Accept-Language: fr_FR`:

- `GET https://{tenant}.rms9.fr/a9online/v1/rs/cs/tournaments?archived={true|false}&page=0&size=2000&sort=startDate,asc&startDateFrom=YYYY-MM-01&startDateTo=YYYY-MM-31` (perguntar com os dois `archived`);
- `GET …/tournaments/{id}/course-assignments` → por tee: `cr`, `slope`, `par`, `length`, `holes[]` (par, si, length), `ageClasses` (série) e `courseValidFrom`.

Os valores vão para `public/data/ffgolf-course-overrides.json` → `resultats.{trnId}.series.{chave}` (chave = `serieCourseKey`), com `pcc` por volta deduzido dos SD oficiais de um jogador conhecido (com NDB): em 2025 deu +1, em 2026 +2. Não estão no RMS9: Evian 2021/2024 e Internacionais U14 2021/2024. Nos Internacionais U14 fica o CR/Slope que a FPG usou nos SD oficiais (o RMS9 dá 71/137 em 2025 e 71,4/136 · 74,4/142 em 2026) — do RMS9 só os metros.

### Torneios+resultados por jogador — `ffgolf-player-tournaments.json` (2026-07-23)

Clicar numa linha da `/ffg/info/joueurs` expande a lista de **todos os torneios
do jogador com o resultado** (data · torneio · série · posição · voltas ·
total), e o nome do torneio abre a leaderboard completa em `/ffg/t/{entryId}`.
UI: `src/pages/ffg/PlayerTournaments.tsx`.

Gerado pelo **mesmo passo** que o `france-players.json`
(`build-france-players.js`, 2ª saída) — de propósito: a dedup de participações
é a MESMA que a da coluna 📊 Tot (por `trnId`; um jogador aparece por vezes em
2 séries do mesmo torneio), por isso o nº de linhas bate sempre certo. O
builder avisa se divergir.

Formato compacto (~95k participações → 2,5 MB): catálogo `tournaments[]`
partilhado + labels de série internados em `series[]`, e cada linha é
`[ti, pos, total, [gross por volta], si]`. Carregado só quando o utilizador
expande a primeira linha (não pesa no load da página).

⚠ **O `pos` do portal FFG é a classificação do TORNEIO INTEIRO, não da série** —
medido: em 1212/1225 provas o máximo bate certo com o nº de licenças do torneio,
e há séries de 41 jogadores com gente em 42º. Por isso o "N.º de" vem de
`tournaments[].np` (licenças distintas de todo o `trnId`) e não do tamanho da
série. Duas sentinelas: `pos ≥ 900` = sem classificação, e **sem score não há
posição** (nas provas por jogar / só com tee sheet o `pos` é a ordem da linha na
lista de partida — dava "91º" a quem nem jogou; nesses casos mostra-se
"inscrito").

### Torneios+resultados por jogador (ES) — `spain-player-tournaments.json` (2026-07-23)

Gémeo espanhol do `ffgolf-player-tournaments.json`: clicar numa linha da
`/rfeg/info/jugadores` expande as provas do jogador com posicao e voltas, e o
nome abre a classificacao em `/rfeg/{source}/{id}`. UI partilhada com a FFG:
`src/ui/PlayerTournamentsPanel.tsx` + adaptador `src/pages/rfeg/PlayerTournaments.tsx`.
⚠ O painel recebe TODAS as licencas do jogador (a lista agrupa quem mudou de
clube) e deduplica por prova.

**Substituiu o `build-spain-player-results.js`** (removido): esse gerava um
`spain-player-results.json` de 9,6 MB, era corrido e committado pelo workflow
mas **nunca teve consumidor no `src/`** — a UI nunca chegou a ser feita. O que
tinha de bom foi portado (matching de nome contra os inscritos da propria prova,
FCG/golfdirecto, e o unswap `licencia`↔`nivel` do NextCaddy).

Linhas = inscricoes (`sources[]` do `licencia-dob-lookup.json`) ∪ classificacoes.
As inscricoes trazem provas em que o jogador nao chegou a jogar — mostradas com
o estado (baja/reserva/no admitido). As classificacoes trazem os **Campeonatos
de España publicados so no LiveGolfScoring** (164 provas), que nao tem lista de
inscritos na RFEGolf e por isso nao apareciam em `sources[]` nenhuma.

⚠ **`counts` (tot/ano) vem deste ficheiro para o `spain-players.json`** — o
`build-spain-players-export.js` le-os, para a coluna 📊 Tot ser exactamente o nº
de linhas do painel. Logo **a ordem no `update-spain.yml` importa**:
`build-lgs-twins` → `build-fcg-rivals` → `build-spain-player-tournaments` →
`build-spain-players-export`.

Armadilhas medidas (todas com caso real):
- **`pos` do NextCaddy é dentro da CATEGORIA**, e um tour junta 12 categorias →
  o "de N" é por LINHA (tamanho da categoria), não do torneio: "34º de 768" era
  na verdade 34º de 113.
- **Os blocos do microsite RFEGolf são muitas vezes de UMA jornada**
  ("Clasificación - 3ª Jornada", 60 jogadores). Quando a prova tem gémeo LGS, o
  **LGS ganha** — senão o Sub-16 2025 dizia "1º de 60" a quem foi 3º de 90.
- **Classificações por handicap trazem LÍQUIDOS** nos campos de gross → preferir
  sempre a scratch (mesma regra da memória "NextCaddy par real = tarjeta").
- **Gémeos RFEGolf↔LGS que o `rfegolf-lgs-twins.json` não apanha** (cruza por
  nome+ano, e a RFEG baptiza o mesmo evento de forma diferente em cada
  plataforma) são detectados aqui por ROSTER — possível porque os nomes do LGS
  ficam resolvidos em licenças. Guardas contra o falso gémeo: as duas datas têm
  de existir e ficar a ≤7 dias, ≥5 licenças e ≥80% de sobreposição. Sem o guard
  de data, a "Copa S.M. El Rey" (sem data) fundia com um Sub-16 de outro ano a
  0,81 — a mesma coorte de juniores de topo joga tudo.
- **Deep-link para provas agrupadas**: o `buildRfegEntries` funde as categorias
  de um Campeonato numa entrada `grp-…`, e um link `/rfeg/{source}/{id}` não
  batia com entrada nenhuma. As entradas combinadas passaram a levar
  `memberIds[]` (novo campo opcional em `CircuitEntry`) e o `selectedId` da
  RFEGPage resolve o membro → grupo.

### Onde está o código de Espanha (21/10/2026)

A `RFEGPage` só desenha. Os dados vivem em `src/data/rfeg/`: `types.ts` (formatos
das fontes e dos lookups por licença — `DobLookup`/`HcpLookup` vivem em `src/data/intlCommon.ts`, partilhados com o
`fcgAdapter`), `text.ts` (`normEs`, `esDateToIso`), `escalao.ts` (`ageToSubN`,
`escaloEsForPlayer`…), `flags.ts` (`rfegPlayerFlag`, overrides de nacionalidade),
`adapters.ts` (`adaptLgs`, `adaptNextCaddy`), `toTournament.ts` (LGS/NextCaddy/
RFEGolf/mitarjeta → Tournament FPG), `horarios.ts`, `roundDraw.ts`
(`rfegRoundDraw`: o draw de uma volta já enriquecido), `divisionData.ts`
(`loadRfegDivisionData`: detalhe lazy de um torneio — inscrições, links de PDF,
voltas com draw, totais/destaques NextCaddy, divisão M/F), `entries.ts`
(`buildRfegEntries`: sidebar, gémeos, `grp-…`), `lookups.ts` e o hook
`useRfegData.ts`. NextCaddy sem cartões: `ncTotalsPlayers`/`ncHighlightPlayers`
(divisionData) dão as linhas do `TotalsResumo` partilhado. Destaque PT
(22/10/2026): `isPtCountry` sobre o país da fonte; RFEGolf PDF e mitarjeta não
trazem país e vão buscá-lo às listas de inscritos (`rfegPaisLookup`), e o LGS
com gémeo RFEGolf aos inscritos do gémeo (`lgsWithTwinCountries`). Escalão:
`escaloEsForPlayer` também no golfdirecto (coorte de ano; sem nascimento, o
nome da categoria por `escaloEsFromCategory`). Sem par (RFEGolf PDF, LGS/NextCaddy/golfdirecto sem cartão
do campo) não se inventa par (22/10/2026): o ±par é o da fonte (PDF,
leaderboard LGS, `onlyGross` do golfdirecto) e no NextCaddy com cartões e sem
par fica «–». As fichas por nome (`loadFedByName`, `loadGolfboxPlayers`)
passaram para `src/data/playerLookups.ts`. Testes:
`src/data/__tests__/rfegConverters.test.ts`.

## Espanha — guardas dos scrapers (2026-10-20)

As fontes espanholas respondem às vezes 200 com lixo (listas vazias, páginas de
erro). Regras actuais (`update-spain.yml` trata o exit 2 de todos):
- **`scrape-nextcaddy.js --discover`**: 0 tours, ou menos de metade do scope em
  disco → o scope NÃO é regravado (o scrape a seguir usa o anterior), exit 2.
  Por torneio: um `nextcaddy/{id}.json` com >30% menos jogadores
  (classificação + inscritos) não substitui o do disco. Exit 1 se todos falharam,
  2 se nada foi gravado.
- **`discover-rfegolf-comps.js --merge`**: scope existente ilegível é ERRO (antes
  gravava só a janela desta corrida por cima dos ~400 comps curados); perda >10%
  recusada; exit 2 sem compIds novos.
- **`scrape-rfegolf-node.js`**: um `{ok:false}` nunca substitui um
  `rfegolf-resultats/{cid}.json` bom; perda >50% de inscritos+resultados
  recusada. Exit 1 se tudo falhou, 2 se nada gravado.
- **`scrape-livegolfscoring.js`** (>30% menos entradas) e
  **`scrape-nextcaddy-horarios.js`** (horários com <70% dos jogadores já
  guardados) também já não regravam por cima; os dois e os `enrich-lgs-*`
  passaram a devolver 1/2 em vez de acabar sempre em 0.
- Os builders (`build-rfegolf-index`, `build-licencia-*-lookup`, `build-lgs-twins`,
  `build-fcg-rivals`, `build-spain-player-tournaments`, `build-spain-players-export`,
  `build-rfegolf-rivals`, e na França o `build-france-players`) recusam gravar um
  ficheiro com menos de metade dos bytes do anterior: `::error::` e exit 1
  (`--force` para gravar).
`--force` passa todas estas guardas.

## Espanha — hándicap oficial e rankings RFEG (2026-10-22)

Pedido da Mariana: «quero acompanhar os espanhóis» — o hándicap actual e o lugar
nos rankings da RFEG dos juniores espanhóis que jogam contra o Manuel. Refeito
sobre o main a partir do ramo nunca juntado `claude/eloquent-goldberg-ykatma`
(26/06), que lia o site ANTIGO (`serviciohandicap.aspx`, `RankingList.aspx`):
**em Set/2026 a RFEG mudou para WordPress e esses endereços redireccionam para
a página inicial.** Fontes actuais (públicas, sem cookies):

- **Hándicap:** `GET https://rfegolf.es/wp-json/handicap-search/v1/search?q=<licença|nome>&size=20`
  (o buscador de `rfegolf.es/aprende-mejora/consulta-handicap`). JSON com
  `guid_licence`, `full_name`, `handicap`, `date_hdc_updated_at`, `enum_gender`,
  `club_title`. Sem data de nascimento. Pesquisa aproximada (pode devolver
  licenças parecidas) e responde **429** a pesquisas seguidas.
- **Rankings:** lista em `rfegolf.es/competiciones/rankings-golf?rk_anio=&rk_comite=&rk_pagina=`
  (Juvenil = 9239; 24 cartões por página com id, título, data e PDF); as linhas
  vêm do botão «CSV»: `POST wp-admin/admin-ajax.php` `action=eqf_rankings_csv`
  + `nonce` (o `eqfRankings.nonce` da página da lista) + `ranking_id` →
  `{posicion, nombre, puntos}`. **A licença, a categoria (B/A/I/C) e a idade só
  estão no PDF** dos rankings juvenis (os de Sub-18/Boy não as têm) — lidas com
  o `pdf-parse` e casadas pelo nome do «CSV».

Scripts (lib partilhada `scripts/lib/rfeg-web.js`):
- **`scrape-rfeg-ranking.js`** → `public/data/rfeg-rankings/{ano}_{id}_{slug}.json`
  + `rfeg-rankings-index.json`. Por omissão Comité Juvenil do ano corrente
  (`--years`, `--comites juvenil,masculino…`). O id do post no nome acabou com a
  colisão de 26/06 (slug cortado aos 48 caracteres: Zona 6/8/9 M×F gravavam-se
  uns por cima dos outros); os 42 ficheiros antigos (`cb300750e7`) saíram.
- **`scrape-federados-es.js`** → `public/data/rfeg-hcp.json` (`byLicencia`, chave =
  licença pedida). **Não enriquece as ~17 mil licenças** (o `--enrich` de 26/06
  parou aos 500): só os juniores do kids2 com licença RFEG nascidos 2010–2018
  (sem data: escalão Benjamín/Alevín/Infantil/Cadete) ou que já jogaram com o
  Manuel, mais as licenças dos rankings casadas por nome — ~1,1 mil pedidos, um
  de cada vez (pausa 1,2 s; 429 → espera e pára à 4.ª). Salta o que consultou
  há < 6 dias (`--max-dias`), grava a cada 100 e é aditivo.
- **Casamento** (`scripts/lib/rfeg-oficial.js`, o MESMO no scraper e no
  agregador): licença igual → mesmos 6 dígitos finais (mudança de clube; no
  hándicap também tem de haver nome compatível) → só para fichas SEM licença
  RFEG: nome (todas as palavras do kids2 no nome do ranking, ≥2) + ano de
  nascimento = ano do ranking − EDAD + mesmo sexo + um só candidato. Guardas:
  com data de nascimento e EDAD, >1 ano de diferença anula até o casamento por
  licença (num Sub-12 nunca aparece um adulto, nem um cadete); hándicap com o
  sexo trocado não entra; nunca se casa hándicap só pelo nome (sem idade).
- **Agregador** `util/rfeg-oficial.js` (corre depois do matcher, só enriquece):
  `junior.rfegOficial = { lic, hcp, hcpData, hcpClube, hcpVia, rankings:[{t, curto,
  ano, pos, n, pts, f, nac, via}] }` (rankings: ano mais recente, nacional antes
  de zona, melhor lugar). O `util/scout.js` passa a preferir o hándicap oficial
  da RFEG ao da última inscrição (`h`, com `hr: [hcp, data]`) e grava
  `rk: [lugar, jogadores, ranking curto, data]`.
- **Interface:** Scout dos circuitos — tooltip do HCP com «oficial … actualizado
  a» e coluna **Rk RFEG** (bloco Carreira, ordenável); ficha do kids2
  (`HeroIdentity`) — pill do HCP RFEG com a data e pills «Nº de N · Ranking …».
- Workflow `update-rfeg-rankings.yml` (terça 05:00 UTC) → agregador → push.
  Testes: `scripts/lib/rfeg-oficial.test.js`.
