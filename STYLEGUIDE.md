# STYLEGUIDE — Golf Portugal

Guia de tokens de design e componentes globais. Objetivo: **coerência visual**
e **uma única fonte de verdade** para cores, tipografia, espaçamento e padrões
de UI. Em código novo, usar sempre os tokens e os componentes daqui — nunca
valores hardcoded nem implementações locais duplicadas.

> Fonte de cor única: `src/tokens.css` (espelhado em JS por `src/utils/colors.ts`).
> Classes utilitárias e de componente: `src/App.css`.
> Referência visual: `src/design-system.html`.

---

## 1. Design tokens (`src/tokens.css`)

Todas as variáveis CSS vivem em `:root` no `tokens.css`. Para mudar a paleta ou
a escala, editar **apenas** esse ficheiro.

### Cor

Paleta completa por temas semânticos (não usar hex em componentes):

| Grupo | Exemplos de token |
|---|---|
| Base / fundos | `--bg`, `--bg-card`, `--bg-muted`, `--bg-header`, `--bg-hover` |
| Texto | `--text`, `--text-1/2/3`, `--text-muted`, `--text-inv` |
| Accent (verde FPG) | `--accent`, `--accent-light`, `--accent-hover`, `--link-color` |
| Semânticas | `--color-good`, `--color-warn`, `--color-danger`, `--color-info` (+ `-dark`/`-vivid`/`-alpha`) |
| Score ramp | `--score-eagle`, `--score-birdie`, `--score-bogey`… |
| Charts (10 séries) | `--chart-1` … `--chart-10` |
| Tiers | `--tier-exceptional/good/fair/weak/bad` |
| Escalões | `--esc-sub10-bg/fg` … `--esc-sub24-bg/fg`, `--esc-absoluto/senior…` |
| Medalhas | `--medal-gold/silver/bronze` (+ `-bg`/`-fg`/`-strong`) |
| Circuitos | `--color-eowagr-*`, `--color-doral-*`, `--color-ffg-*`, `--color-bjgt-*` |
| Borders | `--border`, `--border-light`, `--border-success/warn/info/danger` |

Em JS/TS (recharts, arrays de dados), importar de `colors.ts` (`C.accent`, etc.).
Alterar primeiro o token CSS, depois espelhar em `colors.ts`.

**Exceção documentada:** `src/ui/overlay/*` usa hex hardcoded de propósito
(`html-to-image` não resolve CSS custom properties). Não tokenizar.

**Não "corrigir":** `--pill-intl-bg: #00FF00` (verde néon) é intencional.

### Tipografia

```css
--font-sans   /* 'DM Sans' — corpo */
--font-mono   /* 'JetBrains Mono' — código/números monospace */

/* Tamanhos (nomeados por px = 1:1 com as classes .fs-N) */
--fs-8 … --fs-64

/* Aliases semânticos (preferir em componentes novos) */
--fs-body (14)  --fs-sm (12)  --fs-xs (11)  --fs-micro (10)
--fs-h-sm (12)  --fs-h-md (14)  --fs-h-lg (16)  --fs-display (24)

/* Pesos */
--fw-400…900  +  --fw-normal/medium/semibold/bold/heavy

/* Alturas de linha */
--lh-tight (1.15)  --lh-snug (1.3)  --lh-normal (1.5)  --lh-relaxed (1.7)
```

As classes utilitárias `.fs-10…24` e `.fw-400…900` (em App.css) estão ligadas a
estes tokens. **Não usar `fontSize:` inline com px** — usar a classe `.fs-N`
ou `style={{ fontSize: "var(--fs-N)" }}`.

### Espaçamento

```css
--space-1 … --space-40   /* nomeados por px: 1,2,3,4,6,8,10,12,14,16,18,20,24,32,40 */
--space-section (=12)  --space-inner (=14)   /* aliases de uso */
```

As classes `.mb-N`, `.mt-N`, `.gap-N`, `.p-N` cobrem os mesmos valores. Em código
novo, preferir classe utilitária ou `var(--space-N)`; evitar px avulsos.

### Overlays (alpha)

```css
--overlay-white-10/15/25
--overlay-black-08
```

### Raios · Sombras · Z-index

```css
--radius-xs/sm/-/lg/xl/pill
--shadow-sm/-/lg
--shadow-inset-sm      /* inset 0 1px 2px rgba(0,0,0,0.05) — fundos de input/toggle */
--shadow-accent-sm     /* sombra accent-color (verde FPG) */
--shadow-sticky-col    /* separador de coluna sticky */
--shadow-float / --shadow-float-hover / --shadow-float-active
--shadow-focus-blue    /* anel de foco azul */
--bg-gold-subtle / --bg-gold-hover   /* linha de campeão / destaque ouro */
--z-base (1)  --z-raised (2)  --z-sticky (6)  --z-dropdown (50)
--z-sidebar (100)  --z-overlay (1000)  --z-modal (9999)
```

Para empilhamento novo, usar a escala `--z-*` em vez de inventar números.

---

## 2. Componentes globais (`src/ui/`)

Antes de criar UI nova, verificar se já existe um componente. **Não duplicar.**

### Layout / contentores

| Componente | Para quê |
|---|---|
| `Card` | Contentor genérico (wrapper tipado da `.card`). Props: `pad`, `overflowHidden`, `title`, `actions`, `as`. |
| `Toolbar` (+ `ToolbarTitle/Meta/Sep`) | Barra superior das páginas. |
| `DetailHeader` | Cabeçalho de painel de detalhe: `title`, `sub`, `actions`. |
| `CircuitShell` | Casca comum das páginas de circuito (sidebar + detalhe). |

### Tabelas (regra absoluta: ordenáveis por clique no cabeçalho)

| Ferramenta | Para quê |
|---|---|
| `useSort(defaultKey, defaultDir?, dirMap?)` | Estado `sortKey`/`sortDir` + `toggleSort`. |
| `SortableHdr` | `<th>` clicável com seta. Combinar com `useSort`. |

```tsx
const { sortKey, sortDir, toggleSort } = useSort<"pos"|"nome"|"hcp">("pos");
<SortableHdr k="pos" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>#</SortableHdr>
```

Toda a tabela nova **tem** de ser ordenável (regra do projeto).

### Tabs

| Componente | Para quê |
|---|---|
| `TabRow` | Linha de tabs com estado ativo. `tabs=[{key,label,count,disabled}]` + `active` + `onChange`, ou children `<TabRow.Tab>`. |

### Estados

| Componente | Para quê |
|---|---|
| `LoadingState` | Carregamento (`size` sm/md/lg, `message`, `icon`). Default "A carregar…". |
| `EmptyState` | Sem dados (`size`, `icon`, `message`/children). |
| `SectionErrorBoundary` | Isolar erros de secção. |

Nunca escrever `<div>A carregar…</div>` à mão — usar `LoadingState`.

### Dados / indicadores

| Componente | Para quê |
|---|---|
| `KpiCard` | **Fonte única** de KPI cards. Todos os outros delegam aqui. |
| `PillBadge` & cia. | Fonte única de pills: `EscPill`, `RoundPill`, `TcodePill`, `ManuelPill`, `YearPill`, `ClubePill`, `NacionalPill`… |
| `SexBadge` | **Sempre** em vez de ♂/♀ Unicode. |
| `ChartFrame` | Moldura de gráficos SVG: rótulo + gráfico + caption + estado vazio. |

### Formatação (utils)

`format.ts` (`fmtToPar`, `MONTHS_PT*`), `scoreDisplay.ts` (`scClass`, `toParClass`),
`mathUtils.ts` (`zTier`, `getTrend`, `linearSlope`).

---

## 3. Acessibilidade

- Contraste: validar AA para texto pequeno (os tokens de medalha/escalão já o
  consideram — ver comentários no `tokens.css`).
- Foco visível: não remover `outline` sem alternativa; alvos clicáveis usam
  `cursor: pointer`.
- `aria-label` em elementos só-ícone (gráficos SVG via `ChartFrame.ariaLabel`,
  botões só com emoji).
- Idioma da UI: **Português de Portugal**.

---

## 4. Regras de ouro

1. Cor → token (`var(--…)` / `C.*`), nunca hex (exceto `ui/overlay/`).
2. Tamanho de fonte → classe `.fs-N` ou `var(--fs-N)`, nunca px inline.
3. Espaçamento → classe utilitária ou `var(--space-N)`.
4. Padrão repetido → componente global em `src/ui/`, nunca cópia local.
5. Tabela → sempre ordenável (`useSort` + `SortableHdr`).
6. Validar sempre no PC: `npm test` + `npm run build` (o sandbox Cowork não
   compila este repo de forma fiável — ver CLAUDE.md).

---

## 5. Backlog de migração (mecânico — fazer em lotes com build verde)

A camada de tokens e os componentes globais já existem. Falta **adoção** nos
ficheiros legados. Cada lote: editar → `npm test` → `npm run build` → commit.

### 5.1 Tabelas sem `SortableHdr` (cabeçalho de sort à mão)

Migrar para `useSort` + `SortableHdr` (manter a lógica de comparação existente):

~~`DrivePage`~~ ✅ (4 colunas migradas nesta sessão),
`kids/FieldRivaisDashboard`, `kids/H2HSortableTable`,
`ClubesCategoriasView`, `ClubesGruposView` ✅ (PHdr visual uniformizado),
`InscricoesComponents`,
`MultiRoundLeaderboard`, `PJARankingView`, `ResumoTable`, `RivaisDashboard`,
`ScorecardLeaderboard`, `TabelaGlobal`, `TournamentGrid`.

> `ScorecardLeaderboard` é ele próprio um primitivo com sort embutido — avaliar
> se vale extrair em vez de migrar.

### 5.2 Cabeçalho de detalhe à mão → `DetailHeader` — CONCLUÍDO ✅

~~`CamposPage`~~, ~~`DrivePage`~~ — migrados nesta sessão.
Restantes com baixo retorno: `fpg/TournamentDetail`, `TabCampoDetalhe`, `TabResultados`.

### 5.3 Cores hex hardcoded → tokens — passagem "limpa" CONCLUÍDA (≈444 → ≈290)

A passagem de substituições value-equal com token de nome adequado está feita
nos piores ficheiros (ver "Já feito"). Os ~290 hex que restam são **intencionais
ou sem token genérico**:
- `#fff`/`#ffffff` (branco) — não tokenizar.
- `src/ui/overlay/*` e `RoundSimulator` (export `html-to-image` — exceção).
- `PillBadge` `YEAR_PALETTE` e paletas de pills — definições canónicas (a fonte).
- Cores de marca/fonte sem token (FCG `#123/#125`, livegolfscoring `#0a5`,
  golfdirecto `#0066cc`, slates `#e2e8f0/#94a3b8/#64748b`, cinzas de eixo de
  sparkline `#4b5563/#6b7280`). Criar tokens dedicados se quiseres erradicá-los.

**Histórico (referência):** piores antes desta ronda:

Substituir por `var(--…)` (CSS) ou `C.*` (JS) — só quando o valor é IGUAL a um
token existente e o nome do token encaixa no contexto (evitar nomes enganadores
tipo `--score-bogey` para um azul genérico). Piores ficheiros restantes:
`JogadoresPage` (18).

Os restantes hex em `RFEGPage`, `rfeg/FederationsView` e `FFGPage` são **cores de
marca/fonte de dados** (azul FCG `#123/#125`, livegolfscoring `#0a5`, golfdirecto
`#0066cc`, etc.) — sem token genérico. Se recorrentes, criar tokens dedicados
(ex.: `--color-fcg-*`, `--source-*`) à imagem de `--color-rfeg-*`/`--color-ffg-*`.
`ClubesGruposView`: 11× `#fff` (branco) — nada a tokenizar.

**NÃO tocar** (exceção `html-to-image` / documento exportado — os tokens CSS
não existem nesse contexto, `var()` ficaria por resolver):
- `src/ui/overlay/*`
- `src/ui/RoundSimulator.tsx` — 50 dos 52 hex estão na STRING de HTML de
  exportação/impressão (linhas ~692–962). Manter hardcoded.

### 5.4 `fontSize:` px inline → `var(--fs-N)` — CONCLUÍDO ✅ (810 ocorrências migradas)

Feito em lote nesta sessão: `fontSize: N` → `fontSize: "var(--fs-N)"` em 89 ficheiros.
`OverlayExport.tsx` excluído (limitação html-to-image — ver exceção documentada).

**⚠️ Excepção recharts:** props `tick=`, `contentStyle=`, `wrapperStyle=`, `labelStyle=` do recharts
recebem o estilo como objecto passado à biblioteca — não é CSS do browser, logo `var()` não é
resolvido. Nestes contextos usar **número** (`fontSize: 10`), nunca `"var(--fs-10)"`.
Ficheiros onde foi revertido: `DrivePage`, `JogadoresPorAnoPage`, `kids/RivalCharts`,
`kids2/EvolutionChart`, `TabelaGlobal`. Todos os outros usos em `style={{}}` React são seguros.

**9 ocorrências que ficaram como estão (intencionalmente):**
- Decimais sem token: `fontSize: 11.5` (TeeAdvisorView), `fontSize: 12.5` (TeeAdvisorView, DrawsPage).
- Tamanhos de display sem token na escala: `17` (TeeAdvisorView input, ScorecardModal título), `26` (RivalDetail nome hero), `30/38` (HeroIdentity hero), `40` (CompararPage emoji ⚔️), `56` (RivalDetail flag emoji). São tamanhos de contexto único, não componentes reutilizáveis — não vale criar tokens só para eles.

### 5.5 Z-index inline → escala `--z-*` — CONCLUÍDO ✅

Novos tokens adicionados: `--z-float: 3`, `--z-panel-hdr: 10`, `--z-topmost: 10000`.
18 ocorrências em 12 ficheiros migradas. Overlay/ excluído (contexto de exportação).

### 5.6 (Opcional) Utility-classes de espaçamento (`.mb-N`, `.gap-N`, `.p-N`)
ligar a `var(--space-N)` no App.css — indireção pura, sem mudança visual.

### Já feito
- Tokens de tipografia/espaçamento/z-index em `tokens.css`.
- `App.css`: fonte global, mono, `.fs-*`, `.fw-*` ligados a tokens.
- Novos componentes: `Card`, `ChartFrame`.
- `LoadingState` adotado em: `CompararPage`, `kids/FieldRivaisDashboard`,
  `kids/HistoricScorecardsTab`, `Aroeira2AnaliseView`.
- `SortableHdr` adotado (helper local → componente partilhado) em:
  `kids/H2HSortableTable`, `MultiRoundLeaderboard`.
- `CompararPage`: séries de cor de gráfico via `colors.ts`.
- `Aroeira2AnaliseView`: ~31 hex → tokens (`--color-good`, `--color-good-dark`,
  `--color-danger`, `--color-danger-dark`, `--color-info`, `--bg-muted`).
  Restam cores de limiar/neutras sem token exato (#ea580c, #65a30d, #000…).
- `kids/RivalDetail`: 8 valores (16 ocorrências) → tokens (`--bg-warn-strong`,
  `--color-warn-dark`, `--color-info`, `--bg-info-strong`, `--color-warn`,
  `--color-amber`, `--bg-info`, `--bg-success-subtle`). Restam tints/customs.
- `kids2/components/HeroIdentity`: 10/12 → tokens (`--color-navy`,
  `--color-warn-dark`, `--bg-warn`, `--bg-info`). Restam 2× #ecfdf5 (sem token).
- `kids2/ScoutView`: 16 ocorrências → tokens (`--color-navy`, `--bg-info`,
  `--color-warn-dark`, `--bg-warn`, `--color-amber`, `--bg-pink`, `--border-info`).
- Novos tokens de marca RFEG em `tokens.css`: `--color-rfeg-red` (#aa151b),
  `--color-rfeg-yellow` (#f1bf00) — a par de `--color-ffg-*`/`--color-doral-*`.
  Adotados em `RFEGPage` (11), `rfeg/FederationsView` (1); `FFGPage` passou
  `#002654` → `--color-ffg-dark` (4).
- **Sessão 2026-06-19 — Revisão:** bug recharts corrigido (`fontSize: "var(--fs-N)"` em props `tick`/`contentStyle`/`wrapperStyle` revertido para número em 5 ficheiros). 18 `zIndex` inline → `var(--z-*)` (3 tokens novos: `--z-float`, `--z-panel-hdr`, `--z-topmost`). `#92400e` (9×) → `--color-warn-dark`, `#fffbeb` (3×) → `--bg-warn` (RoundSimulator HTML string revertida). `ConsistencySection.C_EAGLE` → `var(--score-eagle)`. Greys neutros (#e5e7eb, #94a3b8, #6b7280) sem token semântico correspondente — ficam como estão.
- **Sessão 2026-06-19:** 11 tokens novos (`--bg-gold-*`, `--overlay-white-25`,
  `--overlay-black-08`, `--shadow-inset-sm/accent-sm/sticky-col/float/float-hover/float-active/focus-blue`);
  8 rgba() hardcoded → tokens em `App.css`; 4 ficheiros de página migrados
  (`CompararPage`, `RivalDetail`, `EnglandGolfPage`, `rfeg/FederationsView`, `GlobalJuniorPage`).
  `DrivePage` + `CamposPage` → `DetailHeader`; 4 colunas `DrivePage` → `SortableHdr`.
  `ClubesGruposView.PHdr` visual uniformizado com `SortableHdr`.
  **810 ocorrências** `fontSize: N` → `fontSize: "var(--fs-N)"` em 89 ficheiros.

### Notas sobre 5.1/5.2 (porque ficaram em backlog)
- As tabelas restantes (`ResumoTable`, `TabelaGlobal`, `ClubesCategoriasView`,
  `ClubesGruposView`, `InscricoesComponents`, `PJARankingView`, `TournamentGrid`,
  `RivaisDashboard`, `DrivePage`) usam CSS de cabeçalho próprio (`rivais-th`,
  `lb-esc`, `cs-grp`, `sortArrow()`); migrar muda classes e pode alterar o
  visual — fazer com build/visual check.
- Os blocos `detail-header` à mão (`TabResultados`, `TabCampoDetalhe`, etc.)
  embrulham KPIs e têm bytes de emoji frágeis; a migração é só interna (mesmo
  CSS) — baixo retorno, fazer com cuidado e validação local.
