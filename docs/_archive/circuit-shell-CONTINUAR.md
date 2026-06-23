# CircuitShell — o que continuar amanhã

_Última sessão: 2026-05-20_

Objectivo geral: unificar as páginas de circuito numa **página-mãe super rica**
(`CircuitShell`) que todas as outras "copiam", fornecendo apenas os seus dados.
Mesma navegação, mesmos filtros, mesmo aspecto — independentemente da fonte de dados.

---

## ✅ Feito nesta sessão

1. **Auditoria completa** das 7 páginas (RFEG, FFG, Doral, BJGT, England, GlobalJunior, BJGTAnalysis) — inventário de toda a riqueza.
2. **Spec do superset** fechado, com as decisões dos toggles (ver abaixo).
3. **Renames da navbar** (`src/ui/NavBar.tsx`):
   - FFG → **France**
   - England → bandeira correcta de Inglaterra (🏴󠁧󠁢󠁥󠁮󠁧󠁿, GB-ENG)
   - **Títulos** → só o troféu 🏆 (com tooltip), movido para **entre DRIVE e FPG**
4. **Contrato** do shell: `src/ui/circuit/types.ts`
5. **Página-mãe completa**: `src/ui/circuit/CircuitShell.tsx`
6. **Carregamento LAZY** das divisões (sessão 2026-05-20): `CircuitEntry` pode trazer
   `divisions` (eager: Doral/BJGT/England/GJGL) **ou** metadados leves para a sidebar
   (`escalao`, `sex`, `playerCount`, `roundsCount`, `divisionCount`) + `loadDivisions()`
   que o shell chama na selecção, com cache e LoadingState (lazy: RFEG/FFG, centenas de
   torneios). Toggle Veteranos em páginas lazy usa `config.veteranIndex` (Map pré-calculado).
   Baseline (antes destas edições) passou `tsc --noEmit` com **0 erros**.

### Decisão final dos toggles (barra de filtros)
- **★ Manuel** — só o Manuel (universal)
- **🇵🇹 PT** — todos os portugueses, mesma mecânica do Manuel (universal; usa `player._isPortuguese`)
- **🏆 Top 10** — top 10 por gross (universal)
- **✦ Veteranos** — jogadores presentes em ≥ N torneios (universal; conta em todo o `entries[]`; N = `config.veteranoThreshold`, default 3)
- **↻ Regressados** e **⬆ Subiram** — só séries anuais (Doral/BJGT/MAJOR); o shell lê `(player as any)._regressado` / `._subiu`, que o **adaptador da página** tem de marcar a partir dos dados de evolução.

### BJGT-Analysis fica FORA da página-mãe
Não é um navegador de torneios — é análise de um jogador (padrões por buraco, métricas mensais, coaching). As suas análises ricas podem virar **módulo opcional** mais tarde, mas não devem moldar o shell.

---

## 📄 Como uma página alimenta o shell

Cada página passa a ser: **loader + adaptador → `<CircuitShell entries={...} config={...} />`**.

```tsx
export default function RFEGPage() {
  const { entries, config, loading } = useRfegCircuitData(); // adapta dados → contrato
  return <CircuitShell entries={entries} config={config} loading={loading} />;
}
```

- `CircuitEntry` = um torneio na sidebar (id, year, name, series?, source?, course, datas, federation, sourceUrl, hcpLimit?, hasManuel, `divisions[]`).
- `CircuitDivision` = um escalão (tab `.tab-under`): escalao, sex, hasManuel + secções (`results?: FPGTournament`, `inscritos?`, `draw?`) + `scOptions`, `roundLabels`, `siLabel` + slots avançados (`evoCols`, `accHeader`, `roundExtra`, `accExtra`).
- `CircuitConfig` = personalidade: `routeBase`, `title`, `color`/`textColor`, `grouping` ("year" | "series-year" | "source-year"), `seriesOrder?`, `sourceColors?`, `specialItems?`, `filters` (search/year/escalao/sex/source/liga + `toggles[]`), `veteranoThreshold?`, `loadingMessage?`.

O leaderboard continua a ser desenhado pelo `IntlTournView` (round tabs + scorecards). O shell trata de sidebar + toolbar + tabs de secção/escalão + filtros + toggles.

---

## ⚠️ Limitação do sandbox nesta sessão (importante)

O espelho do repo no sandbox Linux ficou com **cache congelada** em ficheiros já existentes que foram **editados** (sync só funciona bem para ficheiros NOVOS). Consequências:
- `NavBar.tsx` aparece truncado no `esbuild`/`tsc` do sandbox, **mas o ficheiro real (`C:\golf-fpg`) está correcto** — confirmado pelas file-tools e por compilar uma cópia isolada (esbuild exit 0).
- Por isso **não foi possível correr `npm run build` completo** (ele leria o NavBar em cache truncado).

**Antes de dar QUALQUER coisa como concluída (regra do projecto):**
```bash
npm test          # 0 falhas
npm run build     # compila sem erros
```
Correr numa sessão com o mount fresco (reabrir o workspace deve resolver a cache).

**Lixo a apagar:** ficou um `__synctest.txt` na raiz do repo (probe de diagnóstico). Não consegui apagá-lo pelo sandbox (mount read-only). Apagar manualmente.

---

## 🔜 Próximos passos (por ordem)

### 1. RFEG — CONVERTIDA (2026-05-20) ⚠ verificação pendente
Feita de forma **aditiva** em `src/pages/RFEGPage.tsx`:
- Novo `export default function RFEGPage()` assente no `CircuitShell` (lazy loading).
- A componente antiga ficou como `export function RFEGPageLegacy()` (preservada, exportada → nada órfão sob `noUnusedLocals`). Remover quando o novo for validado.
- Helpers novos no fim do ficheiro: `rfegSex`, `rfegInscritoRow`, `rfegSourceUrl`, `rfegLoadDivisions`, `buildRfegEntries`, `RFEG_CONFIG`. Reusam os conversores/adaptadores existentes (adaptNextCaddy/adaptLgs/adaptFcg, nc/lgs/rfegolf/fcgToFPGTournament).
- `config`: `grouping: "year"`, `sourceColors`, filtros search/year/escalao/sex/source + toggles `["manuel","pt","top10"]`, `scOptions: lgsScorecardOptions()`.

**⚠ VERIFICAR (não foi possível em sessão — mount congelado nos ficheiros editados):**
```
npm run build      # confirmar 0 erros TS no RFEGPage + CircuitShell + types
npm test
```
Depois abrir `/rfeg` e validar: sidebar por ano, filtros, selecção carrega detalhe (lazy), Resultados + Inscritos, toggles Manuel/PT/Top10.

**Polish aplicado (2026-05-20, após 1ª revisão da utilizadora):**
- Toolbar do shell passou a usar `.input` (coerente com as outras páginas) + espaçamento.
- Sidebar: removidos os dots coloridos confusos → **chip com o nome da fonte** (RFEGolf/LGS/NextCaddy/FCG) à cor da fonte (`config.sourceLabels` + `sourceColors`). Adicionada a **data do evento** (📅) e o item ficou mais rico (nome, fonte, escalão, sexo, rondas, data, campo, nº jog) ao estilo FPGPage.
- Decisão: **não** mexer no leaderboard partilhado (`AllRoundsScorecardLB`). Os filtros de escalão/sexo só aparecem em torneios multi-escalão — RFEG é single-category, por isso ali só há a pesquisa (by design, não é bug).
- **Datas uniformes**: o adaptador RFEG passa `dateStartIso`/`dateEndIso` (não o `dateStart` cru, que vinha por extenso nalgumas fontes); o shell formata via `fmtDate` → DD/MM/AAAA em todo o lado.
- **Tabela de inscritos** (`InscritosTable` no CircuitShell): reescrita com `.sc-lb` + `.bjgt-chart-scroll` e **ordenável** (`useSort` + `SortableHdr`) — antes era `<table>` HTML simples. Colunas: #, Nome, Escalão, Sx, Clube, HCP, Nasc., Estado.
- **Título do detalhe**: passou a ser o NOME do torneio em destaque (DetailHeader `title={cur.name}`); escalão/campo/federação na sub-linha. Antes mostrava "ano · escalão".
- **Menu INFO na toolbar** (mecanismo de vista especial): `config.specialItems` deixou de renderizar inline na sidebar — agora é um `<select>` "ⓘ Info" na toolbar; ao escolher, o detalhe mostra `specialItem.render()`. A RFEG liga aqui Categorías de edad (`RFEGCategoriesView`) e Federaciones (`RFEGFederationsView`). Padrão reutilizável para France (catégories d'âge) etc.

**Follow-ups da RFEG (ficaram de fora do protótipo):**
- **Categorías de edad** e **Federaciones** (special views): o shell precisa de um mecanismo de "special detail view" (botão na sidebar que troca o detalhe). Hoje `config.specialItems` só renderiza inline na sidebar. Reusar `RFEGCategoriesView` / `RFEGFederationsView`.
- **Draw** (NextCaddy horarios → `division.draw.rounds`): não mapeado ainda.
- **Filtro de categoria com aliases** (Sub-12 ↔ Alevín): o shell faz match exacto; falta o merge de aliases.
- **Inscritos rico**: `InscritosView` do shell é tabela simples; a RFEG legacy usa `ScorecardLeaderboard` ordenável (regra do projecto: tabelas ordenáveis). Enriquecer.
- **Veteranos**: precisa de `config.veteranIndex` pré-calculado (lazy não tem todos os jogadores). Derivar de um lookup de licenças.

### 2. Propagar às restantes
- **England** (`EnglandGolfPage`) — simples. Catalog → entries; divisões via `player.divisions[]`; `grouping: "year"`; sem inscritos/draw; toggles `["manuel","pt","top10","veteranos"]`. Reusar `bjgtScorecardOptions()`. Manter HoleDiff/ManuelDay como `roundExtra` (slot avançado).
- **GJGL** (`GlobalJuniorPage`) — divisões U14/U18/U23. ⚠ Tem fallback `SimpleLeaderboard` quando não há hole-by-hole; o shell usa `IntlTournView`. Decidir: ou garantir `results` como `FPGTournament` sempre (mesmo só com totais), ou estender o contrato com um modo "totais". `IntlTournView` já lida com torneios de 1 ronda — provavelmente basta adaptar.
- **France/FFG** (`FFGPage`) — a mais complexa (3 fontes: FFG-oficial, LGPIDF-PDF, GolfGenius). Usar `grouping: "series-year"` (séries: FFG / LGPIDF) **ou** repensar. Tem filtros extra (Liga, INTL toggle) → pode exigir estender `CircuitConfig.filters` com `liga` (já previsto) e um toggle/predicado INTL. As tabs internas (Leaderboard/Inscritos/Tee-times/Course-map/PDFs) mapeiam parcialmente para secções; PDFs/course-map podem ficar como secção extra ou links no header.

### 3. Página MAJOR — fundir Doral + BJGT (tarefa #7)
- Nova página-shell com **sub-barra de séries no topo**: DORAL / BJGT / (mais tarde) JOB.
- Cada série é um conjunto de `entries` próprio; a sub-barra troca o dataset passado ao `CircuitShell` (ou usar `grouping: "series-year"` com as três séries).
- **Navbar**: substituir as duas entradas (Doral, BJGT) por uma única **"MAJOR"**; manter `/doral` e `/bjgt` como **redirects** para a MAJOR (não deixar links partidos).
- Toggles `regressados`/`subiram`: o adaptador Doral/BJGT marca `player._regressado` / `player._subiu` a partir da comparação de evolução (`useEvoComparison`).
- Preservar os módulos ricos da BJGT (HoleDiff, ManuelDay, Field Stats, cartões de evolução do Manuel) via `roundExtra`/`accExtra`/`accHeader` + `evoCols`.

---

## 🛠️ Afinações conhecidas no shell (rever durante a conversão)
- `InscritosView` e `DrawView` são **v1 simples** (tabela básica). A RFEG real usa `ScorecardLeaderboard` com células custom e ordenação por cabeçalho — considerar enriquecer para paridade (regra do projecto: **todas as tabelas ordenáveis por clique no cabeçalho**).
- `sidebar-year-label` não tem regra CSS própria — uso estilos inline (igual às páginas actuais), ok.
- Sidebar do entry mostra `EscPill` da 1ª divisão + nº escalões + nº jog + RoundPill. Afinar se ficar pesado.
- Verificar visualmente o `DetailHeader` (badges de sexo Mixed mostram dois SexBadge).

## Ficheiros desta feature
- `src/ui/circuit/types.ts` — contrato
- `src/ui/circuit/CircuitShell.tsx` — página-mãe
- `src/ui/NavBar.tsx` — renames (France, England flag, Títulos)
