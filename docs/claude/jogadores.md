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

### Sidebar de JogadoresPage — sem tecto fixo

Rendering progressivo (2026-08-15): `SIDEBAR_CHUNK = 300` + sentinel
IntersectionObserver que carrega mais ao chegar ao fim — todos os federados
(~17,9k) ficam alcançáveis. Substituiu o tecto fixo `MAX_SIDEBAR_ITEMS`
(500 → 2000 a 2026-04-15, porque "Joana Sousa" aparecia depois da 500ª posição).
Sem react-window, de propósito.
