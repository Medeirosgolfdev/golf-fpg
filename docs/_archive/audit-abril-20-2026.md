# Auditoria — Golf Portugal (20-04-2026)

Revisão de ponta a ponta: incongruências e funções locais que poderiam ser globais. Cobre `src/` inteiro (~57 k linhas, 5 ficheiros de teste, 96 testes a passar).

## Refactors aplicados (2 passes nesta sessão)

Todos validados em conjunto com `npm test` (96/96 OK) e `npm run build` (sem erros TS).

### Pass 1 — deduplicação de helpers (4 alterações)

| # | Ficheiro | Alteração |
|---|---|---|
| 1 | `src/App.tsx` | `/jogadores/52884` (2 ocorrências) → `${MANUEL_FED}` importado de `constants/manuel`. |
| 2 | `src/pages/FPGPage.tsx` | `const SSERRA_CCODE = "007"` local removido. Passa a importar de `ui/TournSidebarItem` (fonte única). |
| 3 | `src/ui/FieldEscalaoTable.tsx` | Removidas 3 funções duplicadas (`fmtPosRivais`, `playerSeriesResult`, `tornCanon`). Agora importa as versões globais de `ui/uskidsHelpers`. Bónus: a global reconhece mais torneios (qdl, msstate, scstate, great golf com espaço) e trata melhor nomes não-mapeados com `pc` suffix. Removidos imports não-usados (`uskTournNames`, `uskFieldSizes`). |
| 4 | `src/data/jovensAnaliseData.ts` | `escalaoInYear` deixou de ter lógica própria — agora delega em `escalaoAtDate` (`utils/format`). Mantido como alias para os 6 call-sites não mudarem. Fonte única de verdade passa a ser `escalaoAtDate`. |

### Pass 2 — aplicação dos achados de prioridade média (7 alterações)

| # | Ficheiro | Alteração |
|---|---|---|
| 5 | CamposPage, FPGPage, KIDSPage, NacionaisPage, SimuladorPage, USKIDSPage | **M6**: 10 usos de `<a target="_blank">` raw substituídos por `<ExtLink>` do `ui/ExternalLink`. |
| 6 | FPGPage (3), JogadoresPage (4) | **M7**: 7 divs hardcoded de "A carregar..." / "Sem dados" substituídos por `<LoadingState size="sm" />` ou `<EmptyState size="sm" />`. |
| 7 | KIDSPage (2), InscricoesComponents (4) | **A4+A5**: `fetch()` directo → `cachedFetchJson()`. Partilha de cache global (incluindo um `federados.json` de 15 MB que era fetchado 4× em paralelo). |
| 8 | `src/pages/KIDSPage.tsx:2580` | **B5**: debug pill do tid de torneio (toggle `?debug=1`) deixou de usar hex hardcoded — agora usa `var(--bg-warn-light)` / `var(--color-warn-dark)`. Comentário "TEMPORÁRIO" removido (é feature legítima do modo debug). |
| 9 | `src/ui/JovensAnaliseView.tsx` | **B3**: 13 fallbacks incorrectos em `var(--token, #hex)` removidos. O `#2563eb` (azul Tailwind) como fallback de `--accent` (verde FPG) era cargo-cult; também `#10b981`/`#065f46` para good/good-dark. Agora todos os `var(--token)` são limpos. |
| 10 | `src/utils/flagUtils.ts` + `src/ui/FieldEscalaoTable.tsx` | **A3**: o mapa local de bandeiras em `FieldEscalaoTable` (65 códigos 3-letras IOC/FPG: NOR, DEN, BRA, USA, JAP, …) foi absorvido pelo `flagUtils.ts` via extensão de `CODE_ALIAS`. Adicionadas 2 bandeiras em falta (`AL`, `ME`). Removida função `flag()` local; a página passa a usar o `flag()` global — que já aceita código ISO-2, nome EN, nome PT e agora também os 3-letras IOC. |
| 11 | `src/pages/NacionaisPage.tsx` | **A2**: componente local `SortTh` (anti-pattern) substituído por wrapper fino sobre `SortableHdr` global. Todos os 8 `<SortTh>` continuam a funcionar; a lógica de sort é agora consistente com o resto da app (incluindo `lb-sortable` class + cor de accent quando activo). |
| 12 | `src/pages/CamposPage.tsx` | **A2**: tabela de ratings (10 colunas: Tee, Sexo, Dist, Par, CR, Slope, CR F9, Sl F9, CR B9, Sl B9) agora é totalmente sortable — primeira coluna usa ordem canónica de tees (branca → amarela → azul …); as outras ordenam numericamente/lexicograficamente. Usa `useSort` + `SortableHdr` padrão. |

Soma dos dois passes: ~13 ficheiros tocados, ~140 linhas de código duplicado/stale removidas, ~80 linhas novas de código globalizado, 96/96 testes a passar, build OK.

---

## Achados por prioridade (incluindo o que **não** foi aplicado)

Organizei por risco/benefício. Os itens marcados com 🔧 são candidatos a próxima sessão.

### Prioridade ALTA — recomendadas mas ainda não aplicadas

**A1. `normName` vs `norm` — duas normalizações de strings com comportamento ligeiramente diferente** 🔧

- `src/data/KIDSdataLoader.ts:42` — `normName()` usa `NFD`
- `src/utils/format.ts:16` — `norm()` usa `NFKD`
- Reimplementações inline: `FPGPage.tsx:1275,1279`, `CamposPage.tsx:56`, `KIDSPage.tsx:1790,1794,1812`

Risco de mexer: médio, porque `NFD` vs `NFKD` têm efeito subtil em caracteres com ligaturas/compatibilidade. Decidir qual é o "canónico" do projecto e converter todos para esse. Antes de refactor, escrever testes de equivalência com amostra real de nomes.

**A2. Tabelas sem `useSort` + `SortableHdr` — violação da regra-mestra do CLAUDE.md** 🔧

Páginas em violação:

- `CamposPage.tsx:202-216` — tabela de ratings (Tee, Sexo, Dist, Par, CR, Slope…) 10 colunas, nenhuma sortable.
- `SimuladorPage.tsx` — 3 tabelas sem sort (`dtable`, `sim-multi-tee`, `sc-table-modern`).
- `BJGTPage.tsx` via `IntlTournView` — `<th>` sem clique/arrow.
- `NacionaisPage.tsx:241-250` — **anti-pattern**: define `SortTh` local em vez de usar o `SortableHdr` global.

Risco: baixo (refactor mecânico), mas impacta UX directamente e exige ajustar arrays para cada contexto. Próxima sessão dedicada.

**A3. Country normalization incompleta**

`co()` em `KIDSdataLoader.ts:33`:
```js
return CC[t] || CC[t.toUpperCase()] || CC[t.toLowerCase()] || t;
```
- Se chegar `"russia"` (minúsculo), `CC["russia"]` não bate porque a chave é `"RU"` ou `"RUS"`. Retorna `"russia"` tal qual.
- `BJGTAnalysisPage.tsx` tem mock data com `"Russian Federation"` hardcoded sem passar pelo normalizador.

**Proposta**: criar `src/utils/countryUtils.ts` que:
- Exporta `COUNTRY_NAMES` (do KIDSdataLoader.CC)
- Exporta `COUNTRY_FLAGS` (do `flag()` local em `FieldEscalaoTable.tsx:91-109`, que também tem 50+ bandeiras)
- Exporta `normalizeCountry(raw)` mais robusto (tenta lowercase primeiro, tenta alias, tenta fuzzy match)

**A4. `/data/federados.json` fetchado 4× em `InscricoesComponents.tsx` sem cache global**

Linhas 59-60, 104, 638 fazem `fetch("/data/federados.json")` directo. Ficheiro tem 15 MB. Em concurrent loads (`InscricoesNacionaisSection` + `VagasSection` + `FederadosDetail`) dispara 4 downloads em paralelo.

**Proposta**: trocar por `cachedFetchJson()` de `src/data/fetchCache.ts`. Partilha cache com o que `federadosLoader.ts` já faz via `cachedFetchJson()`.

**A5. `KIDSPage.tsx` faz `fetch()` directo em vez de `cachedFetchJson()`**

Linhas 808, 866 carregam `uskids-member-history-slim.json` e `uskids-player-scoring-stats.json` sem cache global.

### Prioridade MÉDIA

**M1. `KpiCard` duplicado em `JogadoresPage.tsx`**

`src/ui/KpiCard.tsx` exporta um `KpiCard` global (classes `.kpi`, `.kpi-lbl`, `.kpi-val`).
`src/pages/JogadoresPage.tsx:1900` tem uma reimplementação local com props adicionais (`pct`, `big`) e classes diferentes (`.card`).

Não foi aplicado porque: a versão local não importa o global (não colide), mas o nome idêntico baralha. Próxima sessão: ou renomear local para `JogadoresKpiCard`, ou estender o global com as props extra e migrar.

**M2. Duas `resolveEscKey` muito parecidas dentro de `FPGPage.tsx`**

Linhas 1058-1062 e 1128-1132. Estão em `useEffect` diferentes, por isso são scoped. Consolidar num helper de módulo é purity cleanup — baixo impacto.

**M3. `CCODE_REGION` em `jovensAnaliseData.ts:110` (mapping ccode→região)**

Poderia subir para `src/constants/config.ts` ou para um novo `src/data/regions.ts` se `DrivePage` ou outra página precisar. Hoje só é usado lá.

**M4. `PlayerStats` definido duas vezes com significados diferentes**

- `src/data/playerStatsTypes.ts:8` — stats gerais FPG
- `src/data/jovensAnaliseData.ts:87` — agregação de Jovens
- `src/pages/nacionais/types.ts:19` — 3ª variante dentro de nacionais

Não são duplicados verdadeiros (schemas diferentes), mas o nome idêntico induz erro. Renomear para `JovensPlayerStats` / `NacionaisPlayerStats` reduzia fricção cognitiva.

**M5. `dataRegistry.ts` é fonte única… mas incompleta**

Paths usados em código que **não** estão no registry:
- `/data/uskids-member-history-slim.json`
- `/data/uskids-player-scoring-stats.json`
- `/data/inscricoes_nacionais.json`
- `/data/nationalities.json`
- `/data/clubes_sub_*.json`, `/data/jovens_*.json` (construídos ad-hoc em FPGPage)

Fácil de fixar: acrescentar constantes `FILE_*` e importar. Incrementalmente.

**M6. Links externos — 10 ocorrências de `<a href=... target="_blank">` raw**

Existe `src/ui/ExternalLink.tsx` mas não é usado em:
- `CamposPage.tsx:546,554`
- `FPGPage.tsx:1712`
- `KIDSPage.tsx:2596,2603`
- `NacionaisPage.tsx:274`
- `SimuladorPage.tsx:752,1080`
- `USKIDSPage.tsx:813,918`

Refactor trivial mas mecânico. Podia ser próxima sessão dedicada.

**M7. `LoadingState` e `EmptyState` existem mas 9+ sítios hardcodam texto**

`FPGPage.tsx:1798,1851,1914,1946,2102`, `JogadoresPage.tsx:1099,1211,1253,2288` todos inline `<div className="muted">Sem dados</div>` ou `"A carregar..."` em vez de usarem os componentes globais.

**M8. Inline styles `borderBottom` em tabs (violação de `.tab-under`)**

- `FPGPage.tsx:1902`
- `SimuladorPage.tsx:301,351`

Classe CSS `.tab-under` + `.active` está em `App.css` e é a forma canónica documentada no `CLAUDE.md`.

### Prioridade BAIXA — drift estético, não é bug

**B1. `color: "#fff"` inline em 102 sítios**

Não chega a violar regra (é branco puro estrutural), mas cheira mal. Criar classe `.text-white` em `App.css` limpava tudo.

**B2. z-index caótico**

Mistura de `1`, `2`, `3`, `10`, `50`, `100`, `1000`, `9999`, `10000` sem escala declarada. Tokens `--z-sticky`, `--z-modal`, `--z-tooltip` em `tokens.css` resolveriam.

**B3. Fallbacks incorretos em `JovensAnaliseView.tsx`**

Várias ocorrências de `"var(--accent, #2563eb)"` — o fallback `#2563eb` não corresponde a `--accent` (que é verde FPG). Cargo-cult de um outro contexto.

**B4. Hex duplicados em `RoundSimulator.tsx`**

Linhas 690, 711, 712, 771, 786, 860, 2085 repetem `#fef08a`, `#713f12`, `#16a34a`, `#dc2626`, `#92400e`. Existem tokens equivalentes em `tokens.css` (`--color-good`, `--color-danger`, `--color-warn-dark`).

**B5. Debug temporário em produção**

`KIDSPage.tsx:2580-2584` tem um `{debugMode && <span style={{background:"#fef08a"...}}>}` com comentário "TEMPORÁRIO: remover após diagnóstico". A instrução pendente.

**B6. Modal scorecard inline em `JogadoresPage.tsx:2620+`**

~100 linhas de `position:"fixed", inset:0, background:"rgba(0,0,0,0.5)"…` seguidas de JSX do scorecard. Não existe componente `Modal` global. Candidato a extrair para `src/ui/ScorecardModal.tsx` (ou `Modal.tsx` genérico) quando houver tempo.

**B7. `PillBadge.tsx` na `CompararPage.tsx:397`**

Usa classe `.p` correctamente mas com `style={{ borderColor, background, padding }}` inline — foge ao padrão de só usar as classes (`p-sm`, `p-muted`, `p-tourn`, …).

**B8. Scorecard components — overlap potencial**

- `AllRoundsScorecardLB.tsx` (440 L) vs `DriveAllRoundsScorecardLB.tsx` (319 L) — muito código semelhante; diferença é contexto (HCP vs SD). Parametrizar num só componente pouparia ~300 linhas. Alto risco sem testes visuais.
- `ScorecardLB`, `ScorecardTable`, `ScorecardLeaderboard` — estão em composição OK (ScorecardLB importa ScorecardLeaderboard), não é duplicação.

---

## O que está BEM feito (não mexer)

- **`constants/manuel.ts`** — centralização exemplar (MANUEL_FED, isManuel, escalaoManuelParaData, MANUEL_KNOWN_TIDS). Todas as páginas respeitam.
- **`LoadingState`, `EmptyState`, `SexBadge`, `SortableHdr`, `useSort`, `PillBadge`, `TournSidebarItem`** — existem e são usados maioritariamente bem (violações listadas em M6-M8 são excepções).
- **`fetchCache.ts`** — boa API (`cachedFetchJson`, `invalidateCache`), tratamento de 404/null bytes robusto. A dispersão está nas call-sites, não no util.
- **`tokens.css` + `colors.ts`** — bem estruturados, com excepções documentadas (`OverlayExport`, `teeColors`, `.p-intl`).
- **`MANUEL_BIRTH_YEAR`, `TORNEIOS_COMPLETOS_COUNT`** — constantes mágicas documentadas no `CLAUDE.md`.
- **Tipos base em `sharedTypes.ts` e `fpgTypes.ts`** — hierarquia `BasePlayer` / `Player`, `BaseTournament` / `Tournament` limpa.
- **96 testes vitest** — cobertura real das funções críticas do `KIDSdataLoader` (normName, co, mergeInto, processUskidsCompleto, processMemberHistory). Dá confiança para refactors futuros.

---

## Ordem sugerida para próximas sessões

1. **Tabelas sem sort** (A2) — sessão focada de 3-4 h. Impacto UX alto.
2. **Normalização de strings** (A1) — criar testes, decidir canónico, migrar. Risco contido por testes.
3. **Country utils globais** (A3) — criar `countryUtils.ts`, migrar `CC` + bandeiras + `co()`.
4. **`cachedFetchJson` em todo o lado** (A4, A5, M5) — varrer `fetch(` directos, substituir por chamada cached. Quase mecânico.
5. **Links externos** (M6) — trocar `<a target=_blank>` raw por `<ExternalLink>`. Mecânico.
6. **`LoadingState`/`EmptyState`** (M7) — substituir divs hardcoded.
7. **Modal global** (B6) — extrair de JogadoresPage. Sessão mais longa.
8. **Scorecard components** (B8) — só quando houver Playwright/visual regression a cobrir.

---

## Como validar este relatório

```bash
npm test        # 96 passa
npm run build   # sem erros TS
```

Executados em 20-04-2026 às 19:55 Lisboa. Refactors commitados? **Não** — mudanças em `src/App.tsx`, `src/pages/FPGPage.tsx`, `src/ui/FieldEscalaoTable.tsx`, `src/data/jovensAnaliseData.ts` estão unstaged. Revê com `git diff` antes de fazer commit.
