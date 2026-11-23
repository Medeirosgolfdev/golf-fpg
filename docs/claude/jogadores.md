# JogadoresPage (`/jogadores`) — arquitectura e ficha só-cadastro

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## JogadoresPage — arquitectura pós-refactor (2026-08-15)

A `/jogadores/:fed` deixou de ser um monólito de ~4700 linhas: o shell
(`src/pages/JogadoresPage.tsx`, ~500 linhas) compõe módulos em
`src/pages/jogadores/`:

- **`filterPlayers.ts`** — filtragem/ordenação PURA da sidebar (testada em
  `__tests__/filterPlayers.test.ts`): pesquisa multi-palavra com índice
  pré-calculado (`buildSearchIndex`), seniores ocultos por defeito, pin
  (`PIN_RANK`), cadeia de contagem de rondas, `HCP_UNESTABLISHED_THRESHOLD=54`.
- **`filtersUrl.ts`** — codec filtros↔query (`?q&esc&sexo&regiao&nac&clube&
  hmin&hmax&activos&fonte&novos&pp&ord&dir&modo` — a vista Stats vai no `modo`). FILTROS vivem no URL
  (partilháveis, replace-only, só não-defaults, preserva `?view=`);
  PREFERÊNCIAS (viewMode, 👴 seniores, ⭐ destaques) em localStorage
  (`jogadores_prefs_v1`). Seleccionar jogador preserva a query e apaga só
  `?view=` (análogo do `?tab=` da FPGPage).
- **`JogadoresToolbar.tsx`** — linha 1 magra (padrão FPG/Drive: DataSourcesChip,
  segmented Nossos/TODOS + Lista|📊 Stats, pesquisa 🔎+×, pills de escalão +
  presets rotulados 🧒/🟢/🏌️, ⚙️ Filtros com badge, ⓘ Info select) + painel
  colapsável (selects raros, HCP DO/AO, Ordenar, ToggleChips de preferências).
  `FilterField`/`ToggleChip` são partilhados com a landing via `src/ui/FilterField.tsx`.
- **`PlayerDetail.tsx`** — vistas consolidadas 5→3 no dropdown: 🗓 Rondas
  (segmented Data|Torneio) · ⛳ Campos (SEMPRE a análise rica — o modo simples
  e a TeeSummaryTable morreram, o Eclético cobre) · 📊 Análises. Deep-links
  legados `?view=by_tournament`/`by_course_analysis` continuam válidos.
- **Dois mundos deliberados**: `PlayerDetail` (análise local) e
  `FederadoOnlyDetail` (cadastro + WHS live) mantêm-se separados mas partilham
  `IdentityPills`, `eventInfo` (effectivePill/OriginPill/EventInfo),
  `FederadoRoundsTable` e as células de `ui/tableCells`.
- Stats: `FederadosStatsPanel` (+`computeGlobalStats`), `FilteredStatsCard`,
  `hcpBins.ts` (`isCountableHcp` exclui placeholders ≥54/99 em TODOS os
  painéis), `statsWidgets.tsx` (KpiCard/MFBar/MFColumn/MFLegend).
- Perf: `PlayerSidebarItem` é `React.memo` com `onSelect` estável; contagens
  da toolbar memoizadas no shell; batch de scorecards live com tecto 200 (`SCORECARD_BATCH_MAX`).

---

### Link da coluna Prova nas voltas internacionais (23/11/2026)

A FPG regista as voltas jogadas lá fora (e nos internacionais cá — Faldo Madeira) com o código de torneio fictício **`999999`**; um link `classif…tourn=999999` dá erro (Mariana: «tu sabes identificar que os resultados são internacionais, então tb tens de saber colocar o link correcto para o evento»). Regra: **com `999999` nunca há link para a FPG** (`isTcodeIntlFpg`, `src/data/provasFora.ts`; também se ignora um `_links.classif*` com esse código). O `EventInfo` abre a prova no **organizador** (Signupanytime, GolfGenius…, pela ordem do Kids 2 — `categorizeTournamentLinks`) através de `public/data/provas-fora-federados.json`, que o agregador escreve (`scripts/aggregator/util/provas-fora.js`): cada cartão 999999 de `output/{fed}/scorecards.json` liga-se a uma prova do Kids 2 pela data **e** (ficha do Kids 2 desse federado na prova, com a volta dentro dos dias dela) **ou** (nome da prova a bater, ±1 dia). Treinos/EDS/registos não se ligam. Sem ligação segura → sem link (nunca um link errado). A 23/11/2026: 1003 voltas de 70 federados ligadas; as outras ~2100 são sobretudo EDS, «Resultado no estrangeiro», «Away Internacional» de provas que o Kids 2 não tem.

### UI de "Só cadastro FPG" em `JogadoresPage.tsx`

Componente `FederadoOnlyDetail` (hoje em `src/pages/jogadores/FederadoOnlyDetail.tsx`) renderiza jogadores que só têm
cadastro em `federados.json` (sem `{fed}/analysis/data.json` pré-calculado).
Usa `getPlayerHistory(fed)` de `datagolfClient.ts` → `/api/datagolf?action=whs&fed=X`.

Depois das correcções 2026-04-14/15:
- Erro é mostrado num `<details>` expansível "Ver detalhes do erro" em vez
  de truncado a 80 chars (antes ficavam invisíveis mensagens importantes
  como o erro do segundo backend)
- Mensagem auxiliar sugere consultar o site da FPG directamente quando
  ambos falham
- A `FederadoRoundsTable` renderiza as 200 primeiras rondas (ordenáveis) com data, torneio, campo, buracos,
  HCP, stableford, score differential, origem

### Lista `/jogadores` — activos e INACTIVOS (02/11/2026)

A `JogadoresListPage` mostra os federados activos (`federados.json`, ~18,4 mil)
**e os que já saíram** (`federados-inativos-lista.json`, ~41,6 mil que não
voltaram a ser federados — pedido dela: «desde que estejam com a indicação
INACTIVOS»). Os inactivos levam a pill cinzenta «Inactivo» ao lado do nome; o
filtro «Estado federativo» (por defeito Todos) separa Activo/Inactivo. Quem está
nos dois ficheiros conta como activo. A lista chega depois dos activos (não
atrasa a página).

- `federados-inativos-lista.json` (~3,2 MB, ~0,85 MB comprimido) é gerado por
  `node scripts/build-inativos-lista.js` a partir do `data-archive/federados-inativos.json`
  (scrape FPG FedStat=7 de 14/04/2026, `scrape-federados-inativos.js`) — refazer
  os dois quando se quiser actualizar os inactivos. Leitura:
  `loadFederadosInativos()` (`src/data/federadosLoader.ts`).
- A ficha `/jogadores/{fed}` de um inactivo vai buscar o cadastro a esta lista
  (nome, clube, HCP, «Status federado: Inativo») em vez do stub vazio.

### Sidebar de JogadoresPage — sem tecto fixo

Rendering progressivo (2026-08-15): `SIDEBAR_CHUNK = 300` + sentinel
IntersectionObserver que carrega mais ao chegar ao fim — todos os federados
(~17,9k) ficam alcançáveis. Substituiu o tecto fixo `MAX_SIDEBAR_ITEMS`
(500 → 2000 a 2026-04-15, porque "Joana Sousa" aparecia depois da 500ª posição).
Sem react-window, de propósito.

## Draws (`?view=draws`) — companheiros de jogo e voltas de treino

- **Todos os jogadores seguidos** (Mariana, 23/11/2026: «faz da fpg… porque é que a parte do uskids não?»). A vista «🤝 Draws» da ficha aparece a quem tem draws (`hooks/useTemDraws.ts`); `?view=draws` de quem não tem mostra «Ainda não há draws». Um só componente, `pages/DrawsPage.tsx` (`fed`, `nome`).
- Tudo sai de `node scripts/pairings-build.js`, numa passagem por todos os grupos dos draws FPG (`buildFpgGroups`):
  - **Manuel** → `public/data/manuel-pairings.json`: FPG + USKids (escalões dele) + tee sheets GolfGenius + `public/data/manuel-draws-overrides.json` (o internacional é registo à mão, só dele).
  - **Outros seguidos** (`players.json`) → `public/data/pairings/{fed}.json` (só quem tem rondas) + `public/data/pairings/index.json` (fed → nº de rondas; guarda anti-encolhimento). FPG + USKids + GolfGenius (tee sheets MAJOR e provas francesas); os registos à mão do internacional são só do Manuel. Os ficheiros dos jogadores não levam hora (`geradoEm` só no índice e no do Manuel), para não mudarem a cada corrida.
  - **França** («e os do ricardo em frança?» → «queria mais draws de frança..»): duas fontes, as duas com os grupos reais de cada volta:
    - GolfGenius (`buildFfgDrawPairings`): `public/data/ffgolf/*.json` com `draws` (7 em 23/11/2026 — CFJ, Internationaux, U18);
    - **RMS9** (`buildRms9DrawPairings`): `public/data/ffgolf-rms9-startlists.json`, lido pelo `scripts/scrape-ffgolf-rms9-startlists.js` (workflow `update-ffgolf-resultats`) dos torneios FFG ligados ao RMS9 (`ffgolf-rms9.json`). Endpoint `tournaments/rounds/{roundId}/start-list` (tirado do código do A9online; mesmos cabeçalhos do `scrape-ffgolf-rms9-tees`). Scores dos resultados FFG da mesma prova; um dia que já venha do GolfGenius não se repete. A app não lê o ficheiro (está no `prune-deploy-output`). As horas dos resultados FFG (`ffgolf-resultats`) **não** entram: cada jogador traz uma hora sem dizer de que volta é (só 35% das séries com várias voltas batem com «última volta»; noutras é «08:00» para todos) — seria adivinhar os grupos.
  - **Quem é o dono da ronda, na FPG:** a licença; sem ela, o Manuel pelo nome (regra antiga — o pai, 54907, só se separa pela licença) e os outros pelas inscrições/draw da MESMA prova. Nome e data dos torneios corrigidos pelos `output/{fed}/scorecards.json` do próprio; a cobertura FPG também sai daí.
  - **USKids e GolfGenius:** os draws não trazem número nenhum. O jogador reconhece-se pelos nomes que o Kids 2 liga ao federado (`juniors-links.json`, o caminho das setas ↗), comparados sem olhar à ordem das palavras (`chaveNome`: «CASTRO FERREIRA Ricardo» = «Ricardo Castro Ferreira»); um nome que o Kids 2 dá a mais de um federado não conta, nem um nome do Manuel. O `uskids-draws.json` só tem os escalões do Manuel (e alguns adjacentes) — fora deles não há draws USKids.
  - Cada ronda: `{ circuito, torneioId, torneioNome, data, ronda, teeTime, startHole, campo, jogadorScore, companheiros[] }` (era `manuelScore` até 23/11/2026).
- **Draws em falta de um jogador:** `node scripts/scrape-manuel-missing-draws.js --fed 49085,48971,…` (sem `--fed` = o Manuel; `--dry-run` só lista). Lê a cobertura FPG do ficheiro de Draws de cada um, junta os torneios sem draw (sem repetidos, sem o 007 CGSS, que não publica), mete-os no `fpg-admissions-scope.json` com a data real, chama o `scrape-fpg-admissions-draws-node.js` (cookies das inscrições) e regenera os Draws. Os que continuam sem draw **saem outra vez do scope** (senão o workflow do fim-de-semana pedia-os sempre). 1.ª corrida para 10 jogadores a 23/11/2026 (678 torneios).
- **Voltas de treino (practice round): registo à mão** (Mariana, 19/11/2026: «o que eu quero é ficar com o registo de quem vai dando voltas»). Uma entrada em `manuel-draws-overrides.json` → `intl`, com `ronda: 0`, `torneioId` `usk-<t>-pr` (USKids) ou `<prova>-pr`, `torneioNome` «… — Practice Round», `data`, `campo`, `fonte` e `companheiros` [{ nome, pais }]. Depois `node scripts/pairings-build.js`. **Ficam junto do torneio** (ela: «deveria ficar tudo junto… as voltas de treino com o torneio»): o `pairings-build` dá à volta `<id>-pr` o id, nome, circuito e campo do torneio `<id>` (marca `treino: true`), e ela aparece como «PR» no mesmo cartão, antes da R1 (vista «Por torneio»); sem pairings do torneio fica sozinha. Não se faz aba no torneio para a volta de treino (ela não quer).
