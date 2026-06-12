# Melhorias propostas — /campos e /simulador

> Investigação 2026-06-13. Baseada em auditoria do código actual (CamposPage.tsx 695 linhas, SimuladorPage.tsx 1542 linhas) e pesquisa de referências externas: BlueGolf Yardage Book, GolfLogix, Arccos Caddie/AI Strategy, Clippd, calculadoras WHS (USGA, intelligentgolf, National Club Golfer) e Longleaf Tee System (US Kids Golf + ASGCA).

---

## Diagnóstico rápido

| | /campos | /simulador |
|---|---|---|
| Gráficos (recharts) | **0** | **0** |
| Deep-link URL | ✓ (`/campos/:courseKey`) | **✗ — perde tudo ao refrescar** |
| Persistência de inputs | n/a | **✗ (HI, PCC, allowance, campo, tee)** |
| Usa dados de jogadores | Parcial (`_players` só nomes+datas) | **✗ (HI digitado à mão)** |
| Contexto/pedagogia | Quase nula | Boa (notices AGS/NDB) mas dispersa |
| Estilo | Classes App.css ✓ | **Muito inline style** (MultiTeeSDTable viola convenção do projecto) |

As duas páginas têm dados ricos por baixo (master-courses com holes/par/SI/distância por tee, `_players`, ratings F9/B9; whsCalc completo) mas apresentam quase tudo em tabelas cruas, sem visualização nem ligação ao resto do site.

---

## /campos — recomendações

### P1 — Alto impacto

**1. Hero KPI cards no detalhe do campo.**
Hoje o header é título + `courseKey` cru (ex: `away-marco-simone` — jargão interno exposto ao utilizador). Substituir por cards: Par · Distância (range entre tees, ex: 4 712–6 092 m) · CR/Slope do tee de referência · N.º tees · País · N.º jogadores que lá jogaram. Padrão já usado em DrivePage/USKIDSPage.

**2. Perfil do campo em gráfico (recharts).**
Barras por buraco (1–18 em X, distância em Y, cor por par 3/4/5, linha/badge de SI). É o formato "yardage book" que BlueGolf e GolfLogix usam — vê-se num relance onde estão os buracos longos e os SI baixos. Respeita a preferência "buracos em colunas".

**3. Secção "Como se jogou aqui" — cruzar com resultados.**
`_players` já lista quem jogou e quando, mas não mostra *como*. Cruzando com `{fed}/analysis/data.json` (HOLES por scoreId): melhor volta no campo, média vs par, e — a jóia — **média por buraco do Manuel** sobreposta no gráfico do ponto 2 (par tracejado vs média real). Identifica imediatamente os buracos-problema do campo. É exactamente o que a Arccos faz no round history por campo.

**4. Tee recomendado (Longleaf Tee System).**
O sistema da US Kids Golf/ASGCA recomenda a yardage total em função da distância de drive (ex: drive 140y → campo ~3 800y). O projecto já tem a tab "Vantagem de Tee" em /comparar — reutilizar a lógica: badge "Tee sugerido para o Manuel" na lista de tees, com link para /comparar. Para um júnior, escolher o tee certo é a decisão n.º 1.

### P2 — Médio impacto

**5. Dificuldade relativa entre campos.** Vista agregada (scatter CR−Par vs Slope, pontos = campos, cor PT/INTL) acessível por toggle na toolbar — responde a "qual é o campo mais difícil que já jogámos?". Slope 113 = baseline; intervalo 55–155.
**6. Sidebar mais informativa.** Por campo: par + distância do tee principal + ✓ se o Manuel lá jogou + data da última volta (já se calcula em `_players`). Ordenação opcional por "jogado recentemente".
**7. Botão "Simular neste campo"** no detalhe → deep-link para /simulador (exige o ponto 1 do simulador).
**8. Localização**: cidade/região + link Google Maps quando existir; hoje só há país (e só para INTL).

### P3 — Polimento

**9.** Substituir `courseKey` no subtítulo por meta legível; manter a key só em tooltip/title.
**10.** Toggle m ↔ jardas no scorecard (dados USKids vêm em jardas; pais/treinadores comparam).
**11.** Linha "Distância média por pancada esperada" ou marcação visual dos pares 5 alcançáveis em 2 — opcional, derivável da distância de drive configurada.

---

## /simulador — recomendações

### P1 — Alto impacto

**1. URL routing + persistência.**
`/simulador/:courseKey?/:teeIdx?` + query (`?hi=&pcc=&allow=&holes=`) e/ou localStorage. Hoje um refresh apaga tudo — é a queixa de UX mais óbvia. CamposPage já tem o padrão implementado.

**2. Selector de jogador em vez de HI digitado.**
Dropdown (players.json → `exact_hcp`), default Manuel. Um clique substitui digitar "15,4". Mantém input manual como fallback. Elimina a fricção de entrada principal da página.

**3. Simulador "E se?" sobre os 20 últimos SDs — killer feature.**
O site já tem todos os SDs reais (data.json/WHS). Com os 20 últimos do jogador:
- "Que SD entra no top-8?" → **score-alvo amanhã neste campo/tee para o HI descer** (e para descer para um valor X escolhido);
- projecção do HI após a volta simulada (recalcular best-8-of-20 com o novo SD);
- qual SD "cai" da janela na próxima volta (rondas a expirar).
É o que distingue as boas calculadoras WHS (intelligentgolf, NCG) — e aqui há dados reais, não inputs manuais. Para <20 resultados aplicar a tabela 5.2a (regras júnior já documentadas no projecto).

**4. Gráfico Score → SD.**
A relação score→SD hoje são 3 tabelas (2 escondidas em `<details>`). Uma linha recharts por tee (X = score, Y = SD), com marcadores: par, course HCP, HI actual, e (com o ponto 3) a linha "SD necessário para baixar o HI". As tabelas ficam como detalhe.

### P2 — Médio impacto

**5. Consolidar pedagogia.** Notices WHS/AGS/NDB dispersos → painel único colapsável "Como funciona o WHS" com os passos HI → CH → PH → AGS → SD; tooltips nos termos (CR, Slope, PCC, SD) no HcpStrip. Para pais/treinadores é a parte "informação ao utilizador" mais valiosa.
**6. Promover a MultiTeeSDTable.** É das melhores vistas da página e está escondida em `<details>` fechado. Mostrar por defeito em desktop (colapsada só em mobile). Inclui hoje apenas tees M — respeitar o sexFilter.
**7. Tee sugerido (Longleaf)** também aqui: input "distância média de drive" → destacar o tee recomendado no selector.
**8. Extrair inline styles** da MultiTeeSDTable/AgsSection para classes em App.css (convenção do projecto; facilita temas/tokens).

### P3 — Polimento

**9.** Mobile: inputs por buraco minúsculos — aumentar tap targets, `enterKeyHint="next"`/auto-advance ao preencher.
**10.** Banner HI: desaparece quando o ponto 2 estiver feito (HI vem do jogador).
**11.** Mostrar Low HI e soft/hard caps quando o histórico do jogador estiver carregado (dados já existem via ViewWHSCalc).

---

## Ordem sugerida de implementação

1. Simulador: routing/persistência + selector de jogador (fundação para tudo o resto)
2. Simulador: simulador "E se?" com SDs reais + gráfico Score→SD
3. Campos: hero cards + gráfico de perfil do campo
4. Campos: "Como se jogou aqui" (cruzamento com data.json)
5. Ambos: tee recomendado Longleaf + cross-links Campos ↔ Simulador
6. Polimento (pedagogia, mobile, inline styles)

## Fontes

- [BlueGolf Yardage Book](https://www.bluegolf.com/info/yardagebook.html) — overlay de distâncias por buraco
- [GolfLogix](https://www.golflogix.com/blog/whats-best-golf-yardage-app/) — visualização de dificuldade/terreno por buraco
- [Arccos AI Strategy](https://www.arccosgolf.com/blogs/community/introducing-arccos-ai-strategy-beta) e [Arccos Caddie Preview](https://www.arccosgolf.com/blogs/community/plot-your-golf-strategy-on-your-next-golf-trip) — estratégia pré-volta por campo, histórico por campo
- [Clippd Review — Golf Monthly](https://www.golfmonthly.com/reviews/golf-tech-and-training-aids/clippd-review) — Shot/Player Quality, dashboards de insights
- [intelligentgolf — WHS calculations](https://www.intelligentgolf.co.uk/whs_calculations) e [National Club Golfer — WHS index](https://www.nationalclubgolfer.com/whs/world-handicap-system-index-calculation/) — simuladores what-if sobre best-8-of-20
- [USGA Course Handicap](https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system/topics/course-handicap.html) e [Calculator](https://www.usga.org/course-handicap-calculator.html)
- [Longleaf Tee System](http://www.longleafteesystem.com/) + [Which Tee is Right For Me?](https://womensgolf.com/tee-options) + [US Kids Age Groups and Yardages](https://tournaments.uskidsgolf.com/tournaments/info/age-groups-and-yardages) — tee por distância de drive
- [Practical Golf — Birdie Golf](https://practical-golf.com/birdie-golf) — expectativas realistas de scoring por tipo de buraco
