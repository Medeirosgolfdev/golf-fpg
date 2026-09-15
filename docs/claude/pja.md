# Ranking PJA (página standalone e regras)

> Detalhe tirado do CLAUDE.md a 2026-09-15 (o CLAUDE.md fica só com o essencial e
> aponta para aqui). Datas entre parênteses = quando a regra ou a medição foi feita.

## Ranking PJA — página standalone + fonte única de regras (2026-08-12)

**`ranking-pja.vercel.app` NÃO é a app principal** — é uma página standalone
(`ranking-pja/index.html`, HTML único com motor inline) num 2º projecto Vercel
(`ranking-pja`, root directory = `ranking-pja/`) do MESMO repo. Ambos os
projectos fazem deploy a cada push no `main`. A página busca os dados via
rewrite `/data/* → golf-fpg.vercel.app/data/*` (ver `ranking-pja/vercel.json`).

**As REGRAS do ranking (elegibilidade, classificação DT/Aquapor/GG, GF,
multiplicadores, pontos) vivem numa fonte ÚNICA: `ranking-pja/pja-rules.mjs`**
(ESM puro sem dependências, tipos em `pja-rules.d.mts`), consumida por:
- `src/pages/FPGPage.tsx` — `isPJACore()` no filtro do `pjaRankingList` (o
  wrapper local só acrescenta `_manual`/`_origin === "PJA"` e a exclusão SSerra);
- `src/ui/PJARankingView.tsx` — `classifyPJAEvent`/`isGFTournament`/
  `getTournMultiplier`/`pjaPts`;
- `src/pages/fpg/constants.ts` — `TOURN_PILLS` deriva de `PJA_TCODES`;
- `ranking-pja/index.html` — importa via `<script type="module">` (same-origin,
  a pasta é o root do projecto).

⚠ **Alterar regras do ranking SEMPRE em `pja-rules.mjs`** — nunca duplicar nos
consumidores (aconteceu 2026-08-12: o Amendoeira World Kids foi adicionado só
à FPGPage e a standalone ficou sem ele). Testes: `src/data/__tests__/pjaRules.test.ts`.
⚠ **`PJA_TCODES` é match por tcode SEM ccode** — não adicionar tcodes que a FPG
reutilize (ex: 10604-10606 = Amendoeira 2026 E Clube de Belas 2025 → o
Amendoeira entra por NOME em `isPJACore`, não por tcode).
O que fica FORA da fonte única: `shortTournName` (apresentação, cada superfície
tem a sua) e o motor de agregação/UI de cada lado.

### ⚠ O `pja-rules.mjs` é servido EM CRU ao browser (2026-08-31)

A standalone importa-o com `<script type="module">` **same-origin** — a pasta
`ranking-pja/` é o root do projecto Vercel — por isso o ficheiro é
descarregável tal e qual em `ranking-pja.vercel.app/pja-rules.mjs`,
**comentários incluídos**. Não é bundled nem minificado (ao contrário da app
principal, onde o Vite os deita fora).

Logo: **nada de notas internas nesse ficheiro** — processo interno, decisões
por confirmar, nomes de pessoas, raciocínio que fora de contexto se lê mal.
O que for preciso guardar vai para aqui (o CLAUDE.md nunca é servido).
Comentários curtos e neutros que expliquem o código chegam.

⚠ As restantes secções do ficheiro ainda têm comentários desse género
(o motivo do ×1.75 do Royal Óbidos, as notas do Amendoeira/Clube de Belas,
o "legacy confirmado contra o Excel oficial" de 2025). Ficaram como estavam —
limpar quando houver decisão sobre cada um.

### Notas públicas do ranking — `PJA_NOTAS` (2026-08-31)

O que o público lê sobre elegibilidade vive em `PJA_NOTAS` + `notasPJA(ano,
hoje)` no `pja-rules.mjs`, e é renderizado por AMBAS as superfícies
(`RankingNotas` na `PJARankingView`, `renderNotas()` na standalone). O texto
está na fonte única pela mesma razão que as regras: senão as duas páginas
acabam a dizer coisas diferentes.

- `tipo: "fora"` — prova do calendário que não conta (fica indefinidamente).
  ⚠ Só entram aqui as exclusões que alguém de fora **iria estranhar** (uma
  prova do calendário sem coluna no ranking). O Sub-10 do Miramar não tem nota
  pública de propósito: não há Sub-10 no circuito, ninguém dá pela falta, e a
  nota só levantava uma pergunta que não existia.
- `tipo: "info"` + `ate: "YYYY-MM-DD"` — nota de agenda, desaparece sozinha
  depois dessa data (senão o site fica a anunciar provas já jogadas).
- O bloco é desenhado ANTES do fetch dos dados — aparece mesmo que o
  carregamento falhe.

### ⚠ TOP-14 voltas: mostrar QUAIS caíram (2026-08-31)

O total é a soma das **14 MELHORES voltas** do ano — caem as piores. ⚠ São
**voltas, não provas**: uma prova de 3 rondas gasta 3 lugares, por isso o tecto
aperta muito antes das "14 provas" (medido a 31-08: João Rocha 13 voltas em 6
provas, Nuno Palmares 12 — o Torre e a Grande Final passam-nos os dois).

Os dois motores já ordenavam por pontos e cortavam no 14 — o que faltava era
**dizê-lo na tabela**. A `PJARankingView` chegava a calcular `inTop14` por
volta e nunca o usava no render; a standalone nem isso. Resultado: a partir da
15ª volta a linha deixava de somar para o total e não havia como perceber
porquê ("as contas não batem").

Agora, nas duas superfícies:
- volta fora do top-14 → **esbatida** (`opacity .35`) + tooltip "Fora das 14
  melhores voltas — não soma";
- colunas **Vlt** e **Total** mostram DOIS números quando o tecto morde: o que
  conta em tamanho normal e, a seguir, o que se jogou em pequeno e esbatido —
  `14/18` e `276/309`. Quem não passou as 14 mantém um número só.
  ⚠ **Na mesma linha, nunca empilhados** (`display:block`): empilhar punha a
  linha da tabela a **38-46px contra os 26px** das outras e dava muito nas
  vistas. Inline a altura fica igual à das restantes (medido: excesso 0);
- a linha de regras explica-o em texto.

⚠ Não confundir com o `excluded` (GG Main R1, Aquapor de quem joga Drive Tour),
que continua **riscado** — são coisas diferentes: uma regra tirou-a vs. jogou-se
e vale, mas há 14 melhores.

⚠ O "total de todas" soma só as voltas ELEGÍVEIS (as `excluded` ficam fora dos
dois números, como já ficavam da contagem de voltas) — senão os dois totais
falavam de universos diferentes.

Validado num browser com dados reais + um torneio fabricado a forçar 18 voltas:
`14/18` e `276/309`, com 276 + (12+9+7+5) = 309 a fechar, e as 4 esbatidas a
serem exactamente as 4 piores.

### Provas do calendário 2026 que NÃO contam — e porquê

| Prova | ccode/tcode | Porque fica fora |
|---|---|---|
| Camp. Juvenil — Taça Visconde Pereira Machado (6-7 Jul, Estoril) | 004/10580 (Esc. A) + 004/10581 (Esc. B) | Os tees de partida não foram os estabelecidos para as restantes provas do circuito (jogou-se das **brancas**) — resultados não comparáveis. **Exclusão deliberada — não re-adicionar.** ⚠ A nota pública fica-se pelo facto, em registo formal: não entra em cores de marcas nem na mecânica dos pontos. |
| Miramar Open — Sub-10 (19-21 Ago) | 003/10653 | Não há Sub-10 inscritos no PJA 2026 → nunca creditaria ninguém, só acrescentava uma coluna vazia. Do Miramar conta só o U25 (003/10652). Basta apagar a linha do `Sub 10` no `isPJACore` se um dia houver um. **Sem nota pública** (ver acima). |

⚠ Se alguma delas vier a entrar, entra **por NOME** em `isPJACore` — nunca por
`PJA_TCODES`. A FPG reutiliza os quatro números noutros clubes e anos: 10580 em
007/022/068, 10581 em 022, 10652 em 009/022, 10653 em 009/022. Pô-los na
whitelist por tcode arrastaria torneios que não têm nada a ver (mesma armadilha
do Amendoeira ↔ Clube de Belas).
