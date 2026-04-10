# Auditoria Técnica — golf-fpg
**Data:** 10 Abril 2026

---

## P0 — Segurança (corrigir imediatamente)

### 1. Vulnerabilidades npm (4 CVEs, 3 HIGH)
`npm audit` detecta 3 vulnerabilidades altas (Vite path traversal + arbitrary file read via WebSocket, Rollup arbitrary file write, picomatch ReDoS) e 1 moderada (brace-expansion DoS).

**Acção:** `npm audit fix` hoje. Se não resolver o Vite, actualizar manualmente para >=6.4.2.

### 2. Secrets no console do dev server
`vite.config.ts` (linha ~31) faz `console.log()` de `DATAGOLF_SESSION` parcial durante o arranque. Em CI/CD sem masking de logs, expõe tokens de sessão.

**Acção:** Remover o `console.log` do `loadEnvLocal()`. Logs de debug de secrets nunca devem existir, mesmo truncados.

### 3. Dev server serve `/output/` sem validação rigorosa
O middleware custom em `vite.config.ts` faz `decodeURIComponent(url)` antes da verificação regex — potencial directory traversal.

**Acção:** Validar o path canonizado (via `path.resolve` + verificação de prefixo) antes de servir ficheiros.

---

## P1 — Dependências desactualizadas (esta semana)

| Pacote | Actual | Última | Risco |
|--------|--------|--------|-------|
| vite | 6.4.1 | 8.0.8 | Alto — CVEs activas |
| @vitejs/plugin-react | 5.1.4 | 6.0.1 | Médio — major gap |
| react-router-dom | 6.30.3 | 7.14.0 | Médio — v7 é o futuro |
| recharts | 3.7.0 | 3.8.1 | Baixo |
| playwright | 1.58.2 | 1.59.1 | Baixo |

**Prioridade:** Vite 8 (breaking changes mínimos no 6→8 path) > react-router-dom 7 (migração mais trabalhosa, planear sprint dedicado).

---

## P2 — Performance (próximas 2 semanas)

### 4. 120 MB de JSON em public/data/
O directório `public/data/` tem 109 ficheiros JSON totalizando ~120 MB. Ficheiros críticos: `uskids-member-history-slim.json` (20 MB), `pull-torneios001.json` (20 MB), `uskids-field-sizes.json` (6.2 MB).

**Acções:**
- Verificar se Vercel serve com Brotli/gzip (estes JSON comprimem 80-90%). Se não, configurar em `vercel.json`.
- Considerar dividir `uskids-member-history-slim.json` em chunks por torneio, carregando on-demand.
- Implementar loading progressivo: skeleton UI enquanto os dados carregam, em vez de bloquear a renderização.

### 5. ~1500 inline `style={{}}` no JSX
Cada `style={{ marginLeft: "auto" }}` cria um objecto novo por render, forçando re-renders desnecessários nos filhos.

**Acção:** Migrar para classes CSS (já existe App.css com 2841 linhas). Para os casos dinâmicos, usar `useMemo` ou constantes fora do componente.

### 6. ~140 closures `onClick={() => ...}` inline
Em componentes com muitas linhas de tabela (leaderboards), isto multiplica o garbage collection.

**Acção:** Extrair handlers com `useCallback` nos hot paths (tabelas grandes, listas de rivais).

---

## P3 — Arquitectura (planear nos próximos 1-2 meses)

### 7. Componentes monolíticos (4000+ linhas)
Os 4 maiores ficheiros: JogadoresPage (4461 loc), FPGPage (4195), USKIDSPage (3715), KIDSPage (3061). Misturam data fetching, transformação, state management e UI numa só unidade.

**Acção por fases:**
1. Extrair sub-componentes de apresentação (tabelas, scorecards, hero cards) — ~200-400 linhas cada.
2. Mover lógica de transformação de dados para custom hooks ou módulos no data layer.
3. Separar configs de torneios hardcoded (arrays `T`, `USKIDS_ID`, etc.) para ficheiros JSON ou módulos dedicados.

### 8. App.css monolítico (110 KB, 2841 linhas)
Ficheiro único com todas as classes. Sem scoping por componente, sem tree-shaking de CSS morto.

**Acção:** Não migrar para CSS modules de uma vez (demasiado disruptivo). Começar por:
1. Auditar classes não utilizadas com PurgeCSS ou similar.
2. Para componentes novos, usar CSS modules.
3. Gradualmente extrair blocos de App.css para ficheiros co-localizados.

### 9. Ausência de validação runtime dos JSON
Os tipos TypeScript validam em compile-time, mas um JSON malformado da pipeline de scraping causa falhas silenciosas em runtime.

**Acção:** Adicionar Zod schemas para os formatos críticos (`uskids-results.json`, `pull-torneiosNNN.json`, member-history). Validar no loader antes de processar. Começar pelo `KIDSdataLoader` onde a complexidade é maior.

### 10. Cobertura de testes limitada
Existe 1 ficheiro de testes (`KIDSdataLoader.test.ts`, 35 testes). As 4 páginas maiores (>15000 linhas combinadas) não têm testes.

**Acção:**
1. Extrair funções puras de transformação dos componentes → testar isoladamente.
2. Adicionar testes para `processUskidsCompleto` v2, `processDoral` 9H, `processPullTorneios`.
3. Considerar testes de snapshot para os componentes de scorecard.

---

## P4 — Dívida técnica menor (backlog)

### 11. Global mutable state nos data loaders
`_scorecards` Map e `_autoRivalsCache` em `KIDSdataLoader.ts` são estado global mutável. Funciona, mas dificulta testing e pode causar bugs subtis com hot module replacement.

**Acção futura:** Encapsular num store (Zustand seria lightweight e compatível) ou num React context dedicado.

### 12. Console warnings em produção
18 `console.warn`/`console.error` nos loaders. Aceitável para debugging, mas idealmente substituir por um logger com níveis configuráveis.

### 13. fetchCache sem TTL nem eviction
`fetchCache.ts` guarda Promises para sempre durante a sessão. Para sessões longas com muitos dados, o consumo de memória cresce monotonicamente.

**Acção futura:** Adicionar TTL (ex: 30 min) e/ou `WeakRef` para permitir garbage collection.

---

## Resumo prioritário

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 1 | `npm audit fix` | 10 min | Fecha 4 CVEs |
| 2 | Remover console.log de secrets | 5 min | Segurança |
| 3 | Validar paths no dev middleware | 30 min | Segurança |
| 4 | Actualizar Vite para 8.x | 2-4h | Segurança + performance |
| 5 | Verificar/activar Brotli no Vercel | 30 min | -80% transfer dos JSON |
| 6 | Migrar inline styles → classes | 1-2 dias | Render performance |
| 7 | Dividir componentes >3000 loc | 1-2 semanas | Manutenibilidade |
| 8 | Adicionar Zod validation | 2-3 dias | Robustez da pipeline |
| 9 | Aumentar cobertura de testes | Contínuo | Confiança em refactors |
| 10 | react-router-dom v7 | 1 semana | Futuro-proof |
