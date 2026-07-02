# Auditoria de incongruências CSS — 2026-07-02

> **ESTADO (2026-07-02, mesmo dia): correcções aplicadas** — ver commit "fix(css): ...".
> - ✅ §1 corrigido na íntegra (tokens inexistentes sem fallback). Grande parte resolveu-se
>   por remoção de CSS morto: as secções `.njov-*`/`.hoc-*` (NacionaisJovensPage removida)
>   e `.compare-page`/`.selector-*`/`.scorecard-table*`/`.sim-NN`/`.comparison-legend`
>   (nenhuma usada em TSX) foram apagadas do App.css (−560 linhas; só `.tab-bar` sobreviveu).
> - ✅ §2 corrigido (tokens fantasma → tokens reais; +6 tokens novos em tokens.css:
>   `--color-portugal`, `--color-portugal-light`, `--bg-portugal-pale`, `--color-orange`,
>   `--overlay-black-02`; `C.orange` e `C.yearPalette` em colors.ts).
> - ✅ §3 corrigido via codemod (258 fallbacks mortos removidos em 45 ficheiros).
> - ✅ §4 resolvido (a 2ª `.legend-item` fazia parte do bloco morto removido).
> - ✅ §5 parcial: Aroeira2AnaliseView, HcpEvolution (→ C.charts), PillBadge YEAR_PALETTE
>   (→ C.yearPalette), ScoutView, RankingPage, RivalDetail, USKIDSPage, CourseHeroCard,
>   ComparePage. Bloco `.sim-*` do App.css era morto → removido.
> - ✅ §6 toggles de scorecard convertidos para `<span>`.
> - ⏳ Por fazer (decisões de design, não bugs): padrão transversal `#fff` literal,
>   `sourceColors` das páginas de circuito, extracção de classes partilhadas (§7),
>   limpeza de tokens mortos (§8), documentação da excepção PDF do RoundSimulator.
> - Validado: `npm test` (217 passed) + `npm run build` (limpo).

Varrimento completo de `src/pages/**`, `src/ui/**`, `src/App.css` e `src/tokens.css`
contra as regras do projecto (CLAUDE.md): cores só via tokens, `SexBadge` em vez de ♂/♀,
`.tab-under` para tabs, toggles de scorecard em `<span>`, `PillBadge` sem inline styles.

Excepções documentadas respeitadas (não reportadas): `OverlayExport.tsx` + `src/ui/overlay/**`,
`teeColors.ts`, `.p-intl`/`--pill-intl-bg` verde néon, `design-system.html`.

---

## 1. 🔴 Bugs silenciosos — `var(--token)` para token INEXISTENTE, sem fallback

O token não existe em `tokens.css` → o `var()` é inválido → a propriedade cai para
`initial`/`inherit` (fundo transparente, raio 0, sombra desaparece). **Prioridade máxima.**

### Em App.css

| Token inexistente | Linhas | Efeito | Substituto provável |
|---|---|---|---|
| `--bg-1` | 3594, 3620, 3680, 3694 (bloco `.njov-*`) | background transparente | `--bg-card` / `--bg` |
| `--bg-base` | 3887, 3903, 3959 (`.input-select`, `.selector-dropdown`, `.scorecard-table-wrapper`) | background transparente | `--bg-card` |
| `--bg-overlay` | 3970 (`.scorecard-table thead`) | background transparente | `--bg-header` |
| `--radius-md` | 1125, 1139, 1161, 3885, 3902 | border-radius 0 | `--radius` (a escala tem xs/sm/base/lg/xl, não `md`) |
| `--accent-rgb` | 3895 (`.input-select:focus`) | `rgba(var(--accent-rgb),0.1)` inválido → **anel de foco nunca aparece** | criar `--accent-rgb: 45, 106, 48` (existe precedente: `--rgb-success`) |

### Em componentes (.tsx)

| Token inexistente | Onde |
|---|---|
| `--bg-1` | `comparar/PerfilJogadorSection.tsx:158,574` · `comparar/ConsistencySection.tsx:250,412` |
| `--bg-2` | `FPGPage.tsx:269,270,529` |
| `--bg-page` | `ui/InscricoesComponents.tsx:274` |
| `--border-medium` | `comparar/ConsistencySection.tsx:13` |
| `--border-soft` | `ui/RotatedNotice.tsx:36` |

**Fix recomendado:** substituir pelos tokens equivalentes existentes (ou criar os tokens
em falta, se a intenção era uma nova camada `--bg-1/--bg-2`).

---

## 2. 🟠 Token inexistente COM fallback — o fallback arbitrário é sempre usado

Funciona por acaso, mas a cor real vem do hex do fallback (fora do sistema de tokens):

- `ui/RotatedNotice.tsx:55` — `var(--color-accent, #5b8ff9)`: o token real chama-se `--accent`
  e é **verde**; renderiza sempre o **azul** #5b8ff9. Cor errada garantida.
- `ui/RotatedNotice.tsx:54` — `var(--bg-soft, rgba(255,255,255,0.04))` — token inexistente.
- `ui/RivaisDashboard.tsx:332` — `var(--surface-2, var(--bg-secondary, #f7f6f1))` — ambos inexistentes.
- `pages/GlobalJuniorPage.tsx:347` — `var(--bg-selected, #e5f0ff)`.
- `pages/kids/RivalDetail.tsx:673` — `--bg-portugal-pale`, `--color-portugal`, `--color-portugal-light` (3 tokens inexistentes).
- `pages/kids/HistoricScorecardsTab.tsx:670` — `--bg-muted-alt`.
- `kids2/components/HcpSparkline.tsx:125` — `--bg-default`; `:55` — `--success` (o alias real é `--color-success`).
- `ui/JovensAnaliseView.tsx:140` — `--bg-muted-subtle`.
- `pages/kids/CourseTab.tsx:353`, `PrevisaoTab.tsx:178,196` — `--bg-warn-alpha` (existe `--color-warn-alpha`).
- `App.css:2543,3472` — `var(--border-strong, #999)` — token inexistente; usar `--border`.

---

## 3. 🟠 Fallbacks desactualizados/enganadores (token existe, hex do fallback diverge)

O token ganha, mas o hex literal mente a quem lê e vira cor errada se o token falhar:

- **Sexo com cores erradas no fallback**: `var(--badge-male, #2563eb)` / `var(--badge-female, #ec4899)`
  em `ui/MultiRoundLeaderboard.tsx:146-147` e `ui/PlayerFilterBar.tsx:158,163` — os tokens
  oficiais são `#6A93A8`/`#B87D8B`; os fallbacks são azul/rosa genéricos.
- **Accent azul numa marca verde**: `var(--accent, #2563eb)` em `FFGPage.tsx:749,1326`;
  `var(--accent, #0d61a8)` em `App.css:3835`.
- `var(--color-warn, #e07b00)` ×7 em `ui/RoundSimulator.tsx` (1010, 1245, 1525, 1534, 1578, 1582, 1949) — token é `#d97706`.
- `var(--bg-muted, #e5e7eb)` em `MultiRoundLeaderboard.tsx:598,610,622`, `ScorecardLB.tsx:398,424`
  (+ variantes `#eee`/`#f5f5f5`/`#fafafa`/`#f7f7f7` em DORALPage, FFGPage, RFEGPage, FPGPage, FederationsView) — token é `#f3f4f6`.
- Medalhas stale em `ui/SantoDaSerraPanel.tsx:125-127` e `ui/AtletaSearchPanel.tsx:153-155`
  (gold-bg/silver-bg/bronze-bg/silver-fg todos divergentes dos tokens).
- Família kids2: `var(--color-info-dark, #1e3a8a)` (token `#0369a1`) em USKIDSPage:916,
  RankingPage:66, ResultsTimeline:448,507-508, kids2/data.ts:400, ScoutView:1179;
  `var(--bg-info-subtle, #eff6ff)` (token `#e0f2fe`); `var(--bg-success-subtle, #ecfdf5)`
  (token `#d1fae5`) em ScoutView, PalmaresSection:170, ResultsTimeline:269,466,
  HistoryByTournament:343,565,577, HeroIdentity:501,510; `var(--border-success, #97c459)`
  (token `#bbf7d0`); `var(--color-purple, #6b21a8)` (token `#9c27b0`) em ScoutView:87.
- Redundância circular: `var(--badge-pp, var(--badge-pp))` em `JogadoresPage.tsx:1718,3718,4437`,
  `JogadoresListPage.tsx:675`, `jogadores/PPHistoryView.tsx:159`.

**Fix recomendado:** remover os fallbacks (tokens.css é global, o fallback nunca dispara)
ou sincronizá-los. Removê-los elimina a fonte de drift de vez.

---

## 4. 🟠 Conflito de classe em App.css

- **`.legend-item` definida 2×, ambas top-level**: `App.css:2168`
  (`display:inline-flex; gap:2px`) vs `App.css:4103` (`display:flex; gap:6px; font-size:var(--fs-12)`).
  A segunda vence silenciosamente para TODOS os `.legend-item`. Renomear uma delas
  (ex.: a de 4103 pertence ao contexto sim/password-gate).
- Menor: `.sc-lb .lb-par-row .sticky-col-1` — `background: transparent` (2597) e logo a seguir
  `background: var(--bg-hover)` (2601); a 2ª vence (provável layering intencional — confirmar).

---

## 5. 🟡 Hex hardcoded que duplicam tokens (violações da regra "cores só via tokens")

### App.css — bloco `.sim-*` (linhas 4029-4078)
~7 cores literais: `#22c55e` (=`--score-par-seg`), `#86efac` (=`--border-best`),
`#dc2626` (=`--color-danger`), `#ef4444` (=`--tier-bad`), e **drifts**:
`#15803d` (≈`--color-good-dark` #166534), `#ca8a04` (≈`--color-warn-vivid` #c17a00), `#ea580c` (sem token).

### Componentes
- `ui/HcpEvolution.tsx:32-33` — paleta de gráfico hardcoded que duplica `--chart-*`;
  devia importar `C.charts` de colors.ts (`#9333ea` nem tem token).
- `ui/Aroeira2AnaliseView.tsx` — maior infractor (~17): `#65a30d`(=chart-8), `#60a5fa`(=score-double),
  `#1d4ed8`(=score-quad), `rgba(0,0,0,.15)`(=overlay-black-15), `rgba(220,38,38,.12)`(=color-danger-alpha),
  mais `#ea580c`, `#000`, `#d4d4d4`, `#525252`, `#15803d` sem token.
- `ui/PillBadge.tsx:335-340` — `YEAR_PALETTE` com hex dentro do próprio PillBadge
  (2 pares duplicam tokens; 8 cores sem token). Viola a regra específica do componente.
- `kids2/ScoutView.tsx:496,498,530` — `#dc2626`/`#f59e0b`/`#e2e8f0` (todos com token).
- `kids2/RankingPage.tsx:208` — `#b45309` (=`--medal-bronze`).
- `kids/RivalDetail.tsx:699,706,735,746` — `#93c5fd` (=`--score-bogey-border`) e `#fcd34d` (sem token).
- `ScotlandPage.tsx:53` — `SCOTLAND_BLUE = "#0065bf"` sem token (padrão dos circuitos manda `--color-*`).
- **sourceColors literais** apesar de existirem tokens `--source-*`: `MajorPage.tsx:402`,
  `RFEGPage.tsx:2439-2440,3144`, `FFGPage.tsx:2599`.
- `ComparePage.tsx:672` — `#fff`/`#111` (=`--grey-900`).
- `ui/CourseHeroCard.tsx:68` — `#1c2617` (=`--text`).

### Padrão transversal: `#fff` literal
40+ ocorrências de `color:"#fff"`/`textColor:"#fff"` espalhadas por ~15 páginas
(Calendario, Drive, KIDS, USKIDS, FFG, England, GlobalJunior, RankingPage, ClubesGruposView,
InscricoesComponents, TabelaGlobal, FilterPills, TabRow, AnoEscalaoPill…). Não existe token
de branco puro (`--text-inv` é #e8eddf). **Sugestão:** criar `--white` / `C.white` (já existe
em colors.ts!) e usá-lo, ou default `textColor` no `CircuitShell` em vez de repetir por página.

### rgba com token equivalente
- `USKIDSPage.tsx:1000` — `rgba(255,255,255,0.25)` = `--overlay-white-25`.
- `HcpSparkline.tsx:114,132` — `rgba(0,0,0,0.5)` = `--overlay-black-50`, `0.3` = `--overlay-black-30`.
- `CalendarioPage.tsx:513` — `rgba(0,0,0,0.15)` = `--overlay-black-15`.
- Sombras inline `rgba(0,0,0,.06-.12)` em FPGPage:265,340,525, JogadoresPage:1993,
  CalendarioPage:886 → usar `--shadow-sm`/`--shadow`.

---

## 6. 🟡 Violações de convenções de componentes

- **Toggle de scorecard em `<button>`** (regra: `<span>`):
  - `ui/ScorecardLeaderboard.tsx:208` — o toggle canónico "Ver/Ocultar scorecard".
  - `ui/AllRoundsScorecardLB.tsx:162` — idem.
- **Pills reimplementadas inline** em vez de classe/PillBadge:
  - `kids2/components/CircuitFilterPills.tsx:104` — `pillStyle()` + `<button>`.
  - `ComparePage.tsx:667` — `pillStyle()` com `hsl()`/`#fff`/`#111`.
  - `kids/RivalDetail.tsx:768` — objecto pill via spread.
- **Tabs sem `.tab-under`**: `USKIDSPage.tsx:1000-1001` — tabs inline com rgba/`#fff`.
- **♂/♀ Unicode**: ✅ limpo (0 ocorrências em UI; só comentários).
- **RoundSimulator.tsx:684-976 (export PDF/print)** — ~40 hex que replicam classes
  `.p-sd-*` e tokens. Legítimo-por-contexto (documento standalone sem tokens.css),
  mas a excepção **não está documentada** como a do OverlayExport — documentar no
  CLAUDE.md ou extrair uma paleta JS partilhada de colors.ts.

---

## 7. 🟢 Duplicações inline candidatas a classe partilhada (App.css)

- Pill "sucesso" `{bg-success-subtle + color-good-dark + border-success}` — 7 sítios em kids2
  (ScoutView:1108, PalmaresSection:170, ResultsTimeline:269,466, HistoryByTournament:343,
  HeroIdentity:501,510) → `.pill-success`.
- Pill "aviso laranja" — `NextTournamentsGlobal.tsx:151-152`, `NextTournamentsSection.tsx:78-79` → `.pill-warn-orange`.
- Filter-pill activo `{background: accent, color: #fff}` — JogadoresPage:4388,4414,4424,4503,
  JogadoresPorAnoPage:492,503,524, rfeg/PlayersView:359,421 → `.filter-pill.active`.
- Lane tints do draw: array de 6 rgba **duplicado** entre `ui/DrawTab.tsx:127-132` e
  `ui/UskidsDrawTab.tsx:31-36` → extrair para módulo partilhado.
- Badge muted `{bg-muted + text-2 + border transparent}` — MultiRoundLeaderboard:598,610,622,
  ScorecardLB:398,424 → classe utilitária.
- Botão de erro `{color-warn-vivid + #fff}` — JogadoresPage:4336,4562, JogadoresPorAnoPage:416,469.

---

## 8. 🟢 Tokens mortos em tokens.css (nunca referenciados em App.css nem .tsx)

~35 tokens, sobretudo a camada de aliases:
- Tipografia: `--fs-64`, `--fs-body`, `--fs-display`, `--fs-h-sm/md/lg`, `--fs-micro`, `--fs-sm`, `--fs-xs`.
- Pesos: `--fw-normal/medium/semibold/bold/heavy`.
- Line-height: `--lh-tight`, `--lh-snug`, `--lh-relaxed`.
- Espaçamento: `--space-1/2/3/6/8/10/18/20/24/32/40`.
- Greyscale: `--grey-200/300/500/700` — **irónico**: os valores `#999`/`#ddd`/`#374151`
  aparecem hardcoded em App.css enquanto os tokens estão mortos.
- Outros: `--border-current-good`, `--color-ffg-text`, `--rgb-success`.

Decidir: ou adoptar os aliases no código, ou removê-los (o CLAUDE.md diz para preferir os canónicos).

---

## 9. ✅ tokens.css ↔ colors.ts — EM SINCRONIA

Verificação mecânica: todos os pares espelhados (accent, semantic, charts 1-10, tiers,
escalões, score ramp, medalhas, circuitos, greyscale, backgrounds) batem certo byte a byte.

35 hex existem **só** em colors.ts sem token CSS — são as paletas JS-only documentadas
(`C.cal` calendário, `C.vagas`, acentos de sidebar `sidebarSserra/Tour/...`, `onDark`,
`charts[10..11]` extra). Aceitável como data-layer, mas registar que não têm token.

Nota: o CLAUDE.md diz `src/tokens/colors.ts`; o ficheiro real é `src/utils/colors.ts`.

---

## Prioridades sugeridas

1. **§1** — corrigir os 10 `var()` de tokens inexistentes sem fallback (bugs visuais reais: focus ring ausente, fundos transparentes, raios a 0).
2. **§4** — resolver o conflito `.legend-item`.
3. **§2 + §3** — remover/sincronizar fallbacks (a forma mais barata: apagar os fallbacks, os tokens são globais).
4. **§5** — substituir hex por `var(--...)`/`C.*` (começar por Aroeira2AnaliseView, HcpEvolution, PillBadge YEAR_PALETTE, bloco `.sim-*`).
5. **§6-§8** — convenções, classes partilhadas e limpeza de tokens mortos.
