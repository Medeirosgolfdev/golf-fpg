# `/campos`, `/simulador` e Vantagem de Tee

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Redesign /campos + /simulador (2026-06-13)

Sessão grande de melhorias visuais e funcionais às páginas `/campos` e
`/simulador`. **Sem gráficos** (decisão da utilizadora). Doc de pesquisa/ideias
em `docs/melhorias-campos-simulador.md`.

### Módulos partilhados novos

| Ficheiro | Exporta | Papel |
|---|---|---|
| `src/utils/teeGroups.ts` | `physicalTeeGroups(tees)`, `physicalTeeKey(tee)`, `sexesIn(groups, pick)`, tipos `SexKey`/`TeeRating`/`PhysTeeGroup` | Agrupa tees por **tee FÍSICO** (cor + distância total). O mesmo tee aparece como entradas M e F separadas (CR/Slope diferentes) — aqui junta-se tudo: `h18`/`f9`/`b9` (ratings por sexo) + `teeBySex` (objecto Tee por sexo, para selecção). Chave = `teeGroupHex(name, scorecardMeta.teeColor)|round(distances.total)|teeNameBase(teeName)`. |
| `src/ui/TeeBars.tsx` | `TeeBars` (default) | Barras de tees partilhadas entre Campos e Simulador. Uma barra por tee físico: **só a bolinha colorida** (`.tee-dot`, sem nome) + distância (bold, tamanho normal) + CR/Slope por sexo. Três modos: **display** (Campos, M/F como texto), **selector por sexo** (`onSelectTee`+`selectedTeeId`, Simulador — M/F viram botões), **selector de grupo** (`onSelectGroup`+`selectedGroupKey`, Campos — barra inteira clicável). |

⚠ **Regra do tee físico:** um campo tem N tees físicos (cor/distância); o CR e o
Slope é que diferem entre M e F — é o MESMO tee. Nunca listar "Amarelas M" e
"Amarelas F" como tees distintos (inflaciona a contagem). Usar `physicalTeeGroups`
/`physicalTeeKey` em todo o lado que conte ou liste tees.

### SimuladorPage

- **Persistência URL + localStorage** (`SIM_LS_KEY = "simulador_state_v1"`):
  campo, tee, modo de buracos, sexo, HI, PCC, allowance e jogador. URL tem
  prioridade no arranque (`readInitialSimState`); efeito espelha estado →
  query params (replace) + localStorage. Refrescar já não perde nada.
- **Selector de jogador** na toolbar (de `players.json`, default Manuel via
  `MANUEL_FED`): escolher um jogador carrega o `PlayerPageData` via
  `loadPlayerData(fed)`; o HI e o sexo seguem o jogador (ver "janela WHS,
  score-alvo e selector" abaixo — só em "Jogador (HI manual)" vale o HI escrito).
- **Simulador "E se?"** — reutiliza o `RoundSimulator` (que já existia na
  JogadoresPage). Projecta o HI após uma volta simulada (best-N de 20 via
  `whsQtyCalc`/tabela 5.2a + regra Exceptional Score), top-N, rondas
  deslocadas, tabela gross→HCP. Recebe `hcp=playerData.HCP_INFO`, `whs20`
  (últimas 20 com SD válido), `playerData` e `storageKey` (prop nova:
  persiste em páginas sem `:fedId` no URL).
- Selector de tees passou a usar o `TeeBars` partilhado (modo selector por
  sexo) — clicar num botão M/F continua a fixar o tee+rating do cálculo.

### SimuladorPage — janela WHS, score-alvo e selector (2026-09-15)

- **Cálculo único em `src/utils/whsCalc.ts`** (ver "Contas de handicap — um só
  sítio"): tabela 5.2a (quantas contam — **12 resultados → 4**, não 3
  — e o ajuste −2/−1/−1 para 3/4/6), resultados extraordinários, soft/hard cap
  com o `HCP_INFO.lowHcp` e máximo de 54. Validado contra o HI oficial: **178 de
  207 jogadores iguais à décima** (eram 133). Dos que falham, cerca de metade têm
  no site menos voltas do que a FPG conta; os outros são miúdos com muitas voltas
  de 9 buracos.
- ⚠ **`Number("")` é 0**: o `data.json` tem voltas com SD vazio. Filtrar a janela
  com `!isNaN(Number(r.sd))` deixava-as ocupar lugares nas 20, e o "E se?"
  tratava-as como SD 0. Usar sempre `parseFloat` (SimuladorPage, AnalysisView e
  RoundSimulator já o fazem). A ficha do jogador (`AnalysisView`) marca as
  melhores com o mesmo cálculo (`topRanks` + `historicExceptionalAdj`).
- ⚠ **A janela tem de levar os extraordinários JÁ aplicados pela FPG**
  (`historicExceptionalAdj`): cada volta extraordinária baixa-se a si e às 19
  anteriores. Sem isto o HI do pai (54907) saía 24,9 em vez de 23,3 e o
  score-alvo dele dizia "desce com ≤ 109". O `hi` de cada volta do site é o
  índice ANTES da volta — é contra ele que se mede o extraordinário. Teste com as
  20 voltas reais do pai em `whsCalc.test.ts`.
- **Score-alvo** (desce / entra nas N melhores / sobe / extraordinário, com o SD
  de cada limite e a posição nas melhores da volta que sai) e **"Esta volta no
  handicap"** (projecção do scorecard preenchido, com botão para o "E se?").
- **HI e sexo seguem o jogador escolhido**; só em "Jogador (HI manual)" (ou ao
  escrever no campo do HI) se usa o HI escrito. Abre sempre no Manuel.
- **Selector por grupos**: Manuel · Absolutos (`SIM_NAMED_PLAYERS`) · Madeira ·
  PJA · Percurso dos juniores. A Madeira junta a região do `players.json`, os
  escolhidos e o Drive da Madeira dos últimos 12 meses (Drive Tour + Challenge
  Sub-12/14) de `simulador-players.json`. Os escolhidos e os do Drive entraram no
  `players.json` com a tag `simulador` (o prune não os corta).
- **Lista de campos**: os mais jogados pelo jogador primeiro; o tee abre no
  habitual dele nesse campo. O casamento volta↔campo usa `courseMatchKey`
  (`playedDistance.ts`), que ignora a ordem das palavras — "Desertas+Machico" é o
  campo "Machico-Desertas" e "Serras" é "Serras-Serras".

### CamposPage

- **Hero KPI cards** (`<KpiCard>` em `.kpi-row`): Par, Tees (FÍSICOS), Jogadores. Distância
  e CR/Slope NÃO vão aqui (são por tee → vivem nas barras/tabela).
- **Header legível**: deixou de expor a `courseKey` crua; mostra tipo de campo
  (PT/Internacional/Torneio).
- **Barras de tees** (`TeeBars`, modo grupo): clicáveis — seleccionar um tee
  realça a linha na tabela e abre a coluna **Δm** (diferença de metros total
  para o tee seleccionado; sinal +/− = mais longo/curto; clicar de novo
  desactiva).
- **Tabela unificada (Scorecard + Ratings 18h)** — `ScorecardGrid`. Eliminou-se
  o split de tabs Scorecard/Ratings. Estrutura: **PAR e SI no topo, ACIMA da
  linha de cabeçalho** (para o cabeçalho colar aos tees), cabeçalho com colunas
  **CR/Slope por sexo** (cada M/F é uma CAIXA sem linhas internas), depois
  buracos 1-18 + OUT/IN/TOT. OUT e IN fechados dos dois lados (`.sc-col-out`/
  `.sc-col-in`). PAR/SI: rótulo com merge da coluna Tee+ratings, alinhado à
  direita; CR/Slope em branco (sem "–"). CR/Slope dos tees sem M ou F → célula
  vazia (sem "–").
- **Bloco F9/B9** — `CourseNineRatings`, **colapsável** (`<details>`), agrupado
  Front9/Back9 → sexo (caixa) → CR/Slope.
- **Tab "Como jogou"** — `CourseHoleAverages`: média por buraco do Manuel neste
  campo (formato scorecard, buracos em colunas), cruzando `loadPlayerData(MANUEL_FED)`
  com o campo por `canonicalCourseName`.
- **Sidebar + contadores** usam tees FÍSICOS (`physicalTeeKey` dedup).

### CSS (`.sc-table`, local à CamposPage — usado também em CourseNineRatings/CourseHoleAverages)

- `.sc-wrap`: `width: fit-content; max-width: 100%` — o fundo (cartão) acaba
  onde a tabela acaba; em ecrãs estreitos limita à viewport + scroll-x.
- Fonte: **sans normal + `tabular-nums`** (não monoespaçada) — alinhar com os
  scorecards de análise da casa.
- OUT/IN/TOT mantêm a banda verde (`accent-light`) + divisores (`.sc-col-out`/
  `.sc-col-in`). PAR/SI sem bandas de cor (estilo limpo), separador 2px sob SI.

### ⚠ Sandbox Cowork não compila este repo

`npx tsc --noEmit` / `npm run build` / `npm test` dão erros FALSOS no sandbox
(o mount lê os .tsx com bytes NUL + encoding misto pelos emojis/acentos). A
validação corre SEMPRE no PC da utilizadora. Ver memória `cowork-sandbox-build-scripts`.

---

## CamposPage — "Quem jogou neste campo" (cruzamento jogador↔campo) — 2026-06-13

A secção `CoursePlayersSection` da `CamposPage` mostra, por campo, quem lá jogou
e os resultados. Os dados vêm de **dois ficheiros gerados** que cruzam as voltas
dos jogadores (`output/<nfed>/analysis/data.json`) com os campos do master.

### Pipeline (correr por esta ordem no PC — NÃO no sandbox Cowork, que trunca os JSON)

```bash
node scripts/add-paco-do-lumiar.js        # (1×) adiciona campos manuais ao master
node scripts/build-course-players.js      # → public/data/course-players.json
node scripts/build-course-player-names.js # → public/data/course-player-names.json
```

`App.tsx` anexa o `course-players.json` aos campos PT do master por `courseKey`
em runtime (os campos *away* já trazem `_players` do pipeline). O ficheiro é
`{ generated, source, courses, links, players: { [courseKey]: { [fed]: [voltas] } } }`
e cada volta `{ date, gross, toPar, holes, tee, event, sd }` (`holes` = 9 ou 18;
as de 18 trazem também `f9`/`f9tp`/`b9`/`b9tp`).

### `scripts/lib/course-aliases.cjs` — ESPELHO Node de `src/utils/courseAliases.ts`

Escrito quando o Node ainda não corria `.ts` (hoje, Node ≥ 22.18, corre — é
assim que os scripts usam o `whsCalc.ts` via `scripts/lib/whs.cjs`; estes
espelhos `.cjs` podiam passar a esse padrão). O cruzamento precisa da MESMA canonização de nomes
que a app usa em runtime — senão perde ~16% das voltas (nomes FPG curtos/variantes
que não batem com o master). **Manter sincronizado** com `courseAliases.ts`
(precedente: `colors.ts` espelha `tokens.css`).

Resolução de courseKey por volta (`resolveCourseKey` em `build-course-players.js`),
por ordem:
1. **Por par[]** (mais fiável; par vem de `HOLES[scoreId].p`):
   - Santo da Serra → combos/loops (par dos nines; a FPG troca etiquetas, o par manda)
   - Multi-loop (Vila Sol, Pinheiros Altos, Castro Marim) → combo pelos 2 nines; **nine
     isolado (9h) → combo onde é o front-nine** (aparece na linha "9b" na UI)
   - Ribagolfe I/II → Lakes/Oaks (VERIFICADO por par: I→Lakes, II→Oaks, 100%)
   - Aroeira II → No.1/No.2 (só por par; sem par fica por casar — ambíguo de propósito)
2. **Fallbacks por nome** (voltas sem scorecard): Santo da Serra, multi-loop, Ribagolfe.
3. **`canonicalCourseName`** (sufixos CNJ/CN + `COURSE_NAME_ALIASES`) → `masterByNorm`.

Aliases novos (2026-06-13): `Tróia→Troia Golf`, `Porto Santo→Porto Santo Golfe`,
`Santo Estevão→Santo Estevão Golf`, `Oceânico Faldo→Faldo Course`.

**Sentinelas filtradas:** gross `0`/`998`/`999` (toPar absurdo = "sem cartão") → `gross:null`
(continuam a contar como volta mas não entram em Melhor/Média).

O script imprime no fim o diagnóstico "Voltas sem campo correspondente" (top 30). O que
resta aí é esperado: nomes-lixo (`NONE`/`INTERNACIONAL`/`Campo desconhecido`), campos
**internacionais** (geridos pelo pipeline *away*) e `Aroeira II` sem par.

### `scripts/build-course-player-names.js`

Resolve fed→nome contra `players.json` + `federados.json` + `federados-inativos.json`.
**Lê os 3 ficheiros de campos:** `away-courses.json`, `master-courses.json` E
`course-players.json` (este último era ignorado, fazendo os jogadores dos campos PT
aparecerem como NÚMERO de federado).

### `scripts/add-paco-do-lumiar.js`

Adiciona o **Paço do Lumiar** (campo público de 9 buracos par-3, par 29) ao
`master-courses.json`. Reconstruído dos scorecards reais; representado como 18 buracos
(9 jogados 2× = par 58), 3 tees (Brancas/Amarelas/Vermelhas, +F nas da frente).
CR/Slope `null` (par-3 sem rating publicado). Idempotente, escrita atómica. ~900 voltas
órfãs recuperadas. Padrão a reusar para outros campos PT em falta no master.

### UI da `CoursePlayersSection` (tabela ordenável)

- Tabela ordenável por cabeçalho (Voltas/Melhor/Média/Última); **Manuel fixo no topo**,
  fora da ordenação. Default: mais voltas primeiro.
- **Duas linhas de estatística por jogador: `18b` e `9b`** (nunca misturadas — uma volta
  de 9 buracos não é comparável com uma de 18). `roundHoles()` usa `r.holes`; se faltar,
  deriva do par (`gross − toPar`).
- Cor só no TEXTO do to-par (`tpTextColor`), nunca fundos berrantes.
- Clicar na linha expande as voltas individuais (data + resultado, info completa no hover);
  sentinelas mostradas como "s/ cartão".

### Vista por-tee — `CoursePlayersByTee` (tab "Como jogou", 2026-07-10)

A `CoursePlayersSection` foi refactorizada: o corpo da tabela é agora
`PlayersTable` (componente reutilizável, `{entries, title, onSelectPlayer}`) e a
construção dos resumos vive em `buildSummaries(raw, players, nameMap, teeFilter?)`
(o `teeFilter` opcional restringe as voltas a um tee). Dois consumidores:
- **`CoursePlayersSection`** (tab **Scorecard**): lista geral, todos os tees →
  `Jogadores (N)`.
- **`CoursePlayersByTee`** (tab **Como jogou**, a seguir aos KPIs por tee):
  UMA `PlayersTable` por tee (Brancas, Amarelas, Azuis, Vermelhas, …) com os nossos
  jogadores e os scores que fizeram NESSE tee. Agrupa por `teeCanonicalLabel(r.tee)`
  (junta variantes M/F da mesma cor), ordena back→front (`TEE_COLOR_ORDER`; "Sem
  tee" por último). Cada tee é um **cartão com o mesmo look dos KPIs** (faixa
  superior da cor + header tingido `teeTint` com ponto `teeDot`, nome, **distância +
  CR/Slope ♂/♀** vindos de `useTeeInfoMap`); a `PlayersTable` renderiza em modo
  `bare` (sem o wrapper `.course-players-section`/título) dentro do cartão. Cada
  tabela mantém sort próprio (regra: todas as tabelas ordenáveis). Helpers de
  aspecto (`teeTint`/`teeDot`/`useTeeInfoMap`) são partilhados com o `CourseTeeKpis`.

**KPIs por cor de tee — `CourseTeeKpis` (topo do "Como jogou", 2026-07-10).** O tab
"Como jogou" deixou de mostrar os KPIs genéricos (Par/Tees/Jogadores — esses ficam
só no Scorecard) e a média-por-buraco do Manuel passou para o fim. Lidera com um
**cartão por cor de tee**, cada um com: header (ponto de cor + **distância + CR/Slope**
do sexo/volta seleccionados, vindos de `physicalTeeGroups`), nº jogadores + voltas, e
o **TOP-3 de cada escalão** (Sub-10→Absoluto) com nome (link), to-par colorido,
**data com ano** (`fmtDMYfull`) e **SD** da volta do recorde. Extras:
- **Dois toggles** (`Seg`): **♂ Rapazes / ♀ Raparigas** (separa por sexo, `meta.sex`)
  e **18 buracos / Front 9 / Back 9** (`roundValue`; F9/B9 vêm de `r.f9`/`r.b9` — o
  `build-course-players.js` passou a emitir `f9`/`f9tp`/`b9`/`b9tp` por volta de 18 a
  partir do `HOLES[scoreId].g`). As ratings (CR/Slope) do header seguem o toggle
  (h18/f9/b9).
- **Ordenado por distância** (dificuldade) desc, não por cor.
- **Cartão do Manuel sempre no topo** (`MANUEL_FED`): o seu recorde por tee (ordenado
  por distância), com escalão à data, data e SD — independente do filtro de sexo.
- **Nota de fonte** (canto): "dados: voltas dos nossos · última {data}" com tooltip a
  explicar a origem (course-players.json, regen semanal `update-data.yml`).

O escalão é calculado **à data da volta** (`escalaoAtDate`: coorte FPG por ano de
nascimento vs ano do evento) — o mesmo miúdo aparece como Sub-12 numa volta antiga e
Sub-14 noutra. Precisa da **DOB**: o `build-course-player-names.js` emite `dob` + `sex`
por fed (além de `names`); o loader expõe-os via `useCoursePlayerMeta()`
(`loadCoursePlayerMeta` substitui o antigo `loadCoursePlayerNames`).

## Tab "Vantagem de Tee" (`/comparar`) — conselho de tee para júnior (2026-06-14)

`src/pages/comparar/TeeAdvisorView.tsx`, 2ª tab (de 4: Campos · Vantagem de Tee · Jogadores · Simulador) da `ComparePage`. Compara dois tees
de um campo e dá um **conselho fundamentado** sobre se o Manuel deve subir de tee.
Sessão grande de 2026-06-14 transformou-o de heurística mecânica em conselho
ancorado em **evidência real** e em **literacia WHS**. Sem gráficos.

### Toolbar / inputs
Campo, sexo dos tees, **HCP** (default = índice actual do Manuel), **Drive (m)**
default **185**, **2ª panc. (m)** default 160. A barra "📏 Distância habitual" é
editável (override) e mostra o valor automático.

### Distância de competição (P70, não mediana)
`habitualDistance()` = **percentil 70** dos metros das últimas 20 voltas 18B — a
distância que ele **já joga a sério**, não a típica (a mediana caía no aglomerado
dos tees curtos de treino). As voltas internacionais sem metros no `data.json`
(Marco Simone, Villa Padierna, Glen, La Forêt…) são recuperadas via
`resolvePlayedMeters` (mesmo util da JogadoresPage, com override `MANUEL_AWAY_TEE`)
— senão eram excluídas em silêncio e o valor vinha baixo demais.

### Conclusões pontuadas (veredicto A vs B)
1. **⚖️ Saldo: perdão vs perigos** — pancadas de perdão que o tee longo dá (playing
   handicap WHS) MENOS nº de perigos que cria (buracos fora de alcance em regulação).
   **Banda morta ±1 = empate** (uma pancada de margem para um perigo não é vantagem —
   se o dia corre mal não há folga); só saldo ≥2 favorece o tee longo, ≤−2 o curto.
2. **📏 Ajuste à distância de competição** — premia jogar PERTO da distância de
   competição; penaliza tanto jogar muito ACIMA (estica o jogo) como muito ABAIXO
   (tira o desafio — um júnior não cresce a recuar de tee).
3. **⚠️ Buracos de alerta** — informativo (não pontua); lista buracos fora de alcance
   e a estratégia.
4. **📊 Histórico real neste campo** — **por tee**, mostra mesmo quando só há voltas
   de UM tee (é a transição em análise). Usa o **resultado típico recente = mediana
   das últimas ≤4 voltas** (a mesma janela em todo o lado: tabela, conclusão,
   recomendação — não divergir). Só pontua quando há ≥2 voltas em AMBOS.

### Recomendação — modos (não há "arrisca sempre")
Computa um `mode` por prioridade: **go** 🚀 (avança), **suit** 🎯 (o tee curto não
premia o jogo dele — tira o driver da mão, distâncias *tweener* — o longo pode
encaixar melhor), **caution** 🤔 (tem distância mas o **saldo é negativo** ou **não
conhece o campo** → o tee curto/conhecido é a escolha sensata), **master** 🛡️ (ainda
não domina nem o tee curto deste campo → consolida primeiro), **hold** 🛡️ (longo
ainda é grande demais). Âncoras: distância de competição + forma recente no campo
(mediana) + desempenho em campos longos + jogar ao handicap no curto (= superou-o).
A janela 24-28× do drive é **referência secundária**.

### Desempenho em campos longos — métrica WHS-correcta
`longTeePerformance()` **NÃO usa a média** de score differential. Razão: o índice
WHS é a **média das 8 MELHORES de 20** voltas (potencial num bom dia) e só se joga
ao índice **~1 em cada 5 voltas** → a média de differential fica sempre vários pontos
acima do índice e seria enganadora (um índice ~10 tem médias 14-15). Em vez disso
conta as voltas jogadas **ao nível do índice ou melhor** (`sd ≤ index`) e guarda o
**melhor differential**. Só os **últimos 12 meses** (um júnior cresce depressa — não
comparar com o que era capaz há 15 meses).

### Correspondência robusta campo↔volta (teeHistory)
Usa `courseKeyName` (ignora travessão vs hífen, pontuação) + `teeKey` (ignora o
prefixo "USKids": "Boys 11" ↔ "USKids Boys 11") + fallback a `resolvePlayedTee`
(override/cor curados). Sem isto perdiam-se voltas inteiras (ex: 3 voltas em
Montecchia não apareciam).

### Helpers e detalhes
- `toNum` (sd às vezes vem string), `median`, `teeKey`, `ClubDistanceTable` (tabela
  de distâncias do saco reactiva ao Drive — % constantes do drive).
- `HoleDiffTable` tem linhas "após drive faltam" E "após 2ª pancada faltam" (par 4/5),
  agrupadas por tee (amarelas juntas, vermelhas juntas, com espaço entre).
- Dois colapsáveis didácticos: **📐 Porquê 24–28× a distância de drive?** e
  **📊 Porquê contamos voltas ao nível do índice — e não a média?**
- `playedDistance.ts` passou a **exportar `courseKeyName`**.
