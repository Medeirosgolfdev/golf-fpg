# Cruzamento jogador↔campo (CamposPage) — ponto de situação

> Resumo para retomar noutra sessão. Contexto completo em **`CLAUDE.md` →
> secção "CamposPage — Quem jogou neste campo"** e na memória do projeto
> (`course_players_crossref.md`).

## O que foi feito (2026-06-13)

**Problema:** a secção "Jogadores" da CamposPage mostrava a informação de forma
confusa, e o cruzamento jogador↔campo perdia ~16% das voltas (nomes FPG não
batiam com o master).

**1. UI — `src/pages/CamposPage.tsx` (`CoursePlayersSection`)**
- Tabela ordenável por cabeçalho (Voltas/Melhor/Média/Última), Manuel fixo no topo.
- Duas linhas de estatística por jogador: **18b** e **9b** (nunca misturadas).
- Sentinelas (gross 0/998/999) excluídas das médias; cor só no texto do to-par.
- Linha expansível com as voltas individuais (info completa no hover).
- CSS novo em `src/App.css` (classes `cp-*`). Tipo `CoursePlayerRound` ganhou `holes?`.

**2. Cruzamento — `scripts/build-course-players.js` + novo `scripts/lib/course-aliases.cjs`**
- O `.cjs` é o ESPELHO Node do `src/utils/courseAliases.ts` (Node não importa .ts).
  **Manter os dois sincronizados.**
- Resolve courseKey por **par[]** (de `HOLES[scoreId].p`): Santo da Serra, multi-loop
  (Vila Sol / Pinheiros Altos / Castro Marim), Ribagolfe I→Lakes / II→Oaks (verificado
  100% por par). Nine isolado 9h → combo onde é front-nine. Fallbacks por nome para
  voltas sem scorecard. Aroeira II só por par (ambíguo sem par — deixado de propósito).
- Filtra sentinelas; guarda `holes` (9/18) por volta. Imprime diagnóstico no fim.

**3. Nomes — `scripts/build-course-player-names.js`**
- Passou a ler também `course-players.json` (antes só master/away), resolvendo os
  federados dos campos PT que apareciam como número.

**4. Campo em falta — `scripts/add-paco-do-lumiar.js` (novo)**
- Adiciona o Paço do Lumiar (9 buracos par-3 ×2 = par 58) ao master a partir dos
  scorecards. Idempotente. ~900 voltas órfãs recuperadas. Padrão reusável.

## A correr no PC (ordem importa — NÃO no sandbox Cowork, que trunca os JSON)

```bash
node scripts/add-paco-do-lumiar.js
node scripts/build-course-players.js
node scripts/build-course-player-names.js
npm test && npm run build
```

> Estado: a UI e os scripts foram validados isoladamente (sintaxe + lógica contra
> dados reais), mas o pipeline completo e o `npm test/build` ainda **não foram
> corridos de ponta a ponta no PC** — confirmar.

## Pendentes / ideias para continuar

- **Resolução final ~93%.** O que fica "sem casa" é esperado: nomes-lixo
  (`NONE`/`INTERNACIONAL`/`Campo desconhecido`), campos **internacionais** (pipeline
  *away*), e `Aroeira II` sem scorecard.
- **Santo da Serra - Desertas/Machico (9h) sem par** seguem o nome; as que têm par
  seguem o par (a FPG troca etiquetas — par manda). Pequena inconsistência aceitável.
- **Outros campos PT em falta no master** (se aparecerem no diagnóstico com muitas
  voltas): reusar o padrão do `add-paco-do-lumiar.js`.
- Possível melhoria UI: coluna de tendência (▲/▼) face à média do campo.

## Ficheiros-chave

| Ficheiro | Papel |
|---|---|
| `src/pages/CamposPage.tsx` | UI `CoursePlayersSection` (tabela 18b/9b) |
| `scripts/lib/course-aliases.cjs` | Canonização Node (espelho de courseAliases.ts) |
| `scripts/build-course-players.js` | Cruzamento → `public/data/course-players.json` |
| `scripts/build-course-player-names.js` | fed→nome → `course-player-names.json` |
| `scripts/add-paco-do-lumiar.js` | Campos PT manuais no master |
| `src/utils/courseAliases.ts` | Fonte de verdade dos aliases (app runtime) |
