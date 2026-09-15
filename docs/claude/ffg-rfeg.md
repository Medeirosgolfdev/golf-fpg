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
A `FFGPage` reexporta `ffgEscalaoCanonico` (metade da app importa-o de lá).

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
