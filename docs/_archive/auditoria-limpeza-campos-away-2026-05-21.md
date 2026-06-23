# Auditoria — Limpeza de campos away (2026-05-21)

Commits: `29f481df1` (limpeza campos away) + `f127a0a05` + `2abc407ea`. 
`away-courses.json`: **313 → 220 campos** (93 removidos). `master-courses.json`: sem alterações de conteúdo. 
Nenhum tee foi removido de campos que ficaram — só campos inteiros. 
Backups commitados: `away-courses.backup-20260521.json` e `master-courses.backup-20260521.json` no commit `29f481df1`.

**Importante:** as rondas/scorecards dos jogadores ({fed}/analysis/data.json) nunca foram tocadas — o que se perdeu foi apenas o catálogo da página /campos.

## 1. Duplicados consolidados (26) — dados preservados sob o nome canónico

Entradas criadas a partir do course_description do WHS que duplicavam campos já existentes.

| Campo | Tees | Buracos | Distâncias | Notas |
|---|---|---|---|---|
| Aroeira I | 12 | 207 | 64842m | PGA Aroeira No.1 (master) |
| Aroeira II | 20 | 279 | 81720m | PGA Aroeira No.2 (master) |
| Castro Marim-Grouse+Atlantico | 7 | 81 | 19195m | Castro Marim-Atlântico+Grouse (master) |
| Club de Golf Sotogrande (Cádiz) | 1 | 18 | sem distâncias | Real Club de Sotogrande (away) |
| Glen Golf Course | 1 | 18 | sem distâncias | Glen Golf Club (extraCourses) |
| Golden Palm | 1 | 18 | sem distâncias | Golden Palm Doral (extraCourses) |
| Golfe do Morgado | 3 | 54 | 18655m | Morgado Golf (master) |
| Golfe dos Álamos | 1 | 18 | 5055m | Álamos Golf (master) |
| Internacional | 77 | 1350 | 283267m | Academia Internacional (master) |
| Isla Canela Links | 2 | 36 | sem distâncias | Isla Canela Golf (away) |
| León Golf | 1 | 18 | sem distâncias | Campo Ii Abierto Ciudad de León (away)? |
| Lisbon | 3 | 54 | 15330m | Lisbon Sports Club (master) |
| Oceânico Faldo | 7 | 117 | 35670m | Faldo Course (master) |
| Oitavos | 3 | 54 | 17427m | Oitavos Dunes (master) |
| Oitavos Dunes Natural Links | 6 | 108 | 33210m | Oitavos Dunes (master) |
| PGA  Aroeira No.2 - CNJ FPG | 6 | 99 | 28915m | PGA Aroeira No.2 (master) |
| Porto Santo | 3 | 54 | 18244m | Porto Santo Golfe (master) |
| Ribagolfe I | 11 | 180 | 59431m | Ribagolfe Lakes (master) |
| Royal Golf Club | 1 | 18 | 6045m | Royal Golf Club of Belgium (away) |
| Rwgc la Marache | 1 | 18 | sem distâncias | Royal Waterloo Golf Club (away) |
| Santo da Serra - Machico-Serras | 3 | 45 | 14009m | Santo da Serra - * (master) |
| Santo Estevão | 6 | 99 | 33285m | Santo Estevão Golf (master) |
| Sedgefleld Country Club - Donald Ross Course | 1 | 18 | sem distâncias | Sedgefield Country Club (away) |
| Tróia | 7 | 126 | 39839m | Troia Golf (master) |
| Vidago Palace Golf | 1 | 18 | sem distâncias | Vidago Palace (master) |
| Vilamoura - The Old Course | 3 | 54 | 16912m | Vilamoura - Old Course (master) |

## 2. Nome de torneio (33) — scorecard real mas mal catalogado

O "campo" era o nome do evento. Têm par/SI/CR e nalguns casos distâncias reais por buraco. As rondas correspondentes continuam nos data.json dos jogadores.

| Campo | Tees | Buracos | Distâncias | Notas |
|---|---|---|---|---|
| 1° Puntuable Zonal de Galícia- Astúrias 2024 | 1 | 18 | 5418m |  |
| 2023 European Boys' Team Championship, Div. 2 | 1 | 18 | 6467m |  |
| 2025 European Ladies Team Championship | 1 | 18 | 5841m |  |
| American Junior Golf Association | 1 | 18 | sem distâncias |  |
| Belgian International Golf Championship Boys & Girls | 4 | 72 | 22257m |  |
| Campeonato Absoluto - Aberto Ciudad de León | 1 | 18 | 6325m |  |
| Campeonato Andalucia Individuales - Almerimar | 1 | 18 | sem distâncias |  |
| Campeonato Andalucia Sub 16 | 1 | 18 | sem distâncias |  |
| Campeonato Andalucía Sub 18 | 2 | 36 | sem distâncias |  |
| Campeonato de Galicia Sub-14 | 2 | 36 | sem distâncias |  |
| Campeonato Internacional de España Sub18 Masculino | 1 | 18 | 6486m |  |
| Campionato Internazionale D'italia Maschile - 2026 | 1 | 18 | 5732m |  |
| Circuito Infantil Sevilha | 1 | 18 | 6185m |  |
| Cognizant Cup - Finnish International Junior Championship | 2 | 36 | 6111m |  |
| Copa de Andalucia Femenina | 2 | 36 | sem distâncias |  |
| Copa de Andalucia Masculina | 1 | 18 | sem distâncias |  |
| Copa S.M. El Rey 2024 - Alcanada | 1 | 18 | sem distâncias |  |
| Daily Mail World Junior Golf Championship | 1 | 18 | 3485m |  |
| English Girls Under 16/14 Open Amateur Championshi | 1 | 18 | 5658m |  |
| esp | 1 | 18 | sem distâncias |  |
| European Boys Team Championship 2021 | 1 | 18 | 5905m |  |
| European Girls Team Championship 2021 | 1 | 18 | 5582m |  |
| European Young Masters | 2 | 36 | 10278m |  |
| GADGET Golf Trophy | 1 | 18 | 5239m |  |
| INTERNACIONAL de França Sub 14 | 1 | 18 | 5960m |  |
| Internationaux de France U14 - Challenge Alexis GO | 2 | 36 | sem distâncias |  |
| Junior Cup 12-17 Ans | 1 | 18 | 5442m |  |
| Open Amateur Champioship 2018 | 1 | 18 | sem distâncias |  |
| Open Championship Scottish Girls U16 Loretto 2018 | 1 | 18 | sem distâncias |  |
| Portustewart Golf Cup | 1 | 18 | 6972m |  |
| Sothwind Golf & Dining 2024 | 1 | 18 | 6935m |  |
| South Carolina Golf Association | 1 | 18 | 6620m |  |
| St Andrews Links Trophy 2025 | 1 | 18 | 6735m |  |

## 3. Campos estrangeiros reais removidos (28)

Quase todos com tee único "BRANCAS": par+SI+CR/slope mas **sem distâncias** (distance=0). A única excepção com dados completos é o **Venice Open (Frassanelle)** — 2 tees × 18 buracos com metros reais.

| Campo | Tees | Buracos | Distâncias | Notas |
|---|---|---|---|---|
| Armada Golf Club - Polonia | 1 | 9 | sem distâncias |  |
| Berkhamsted Golf Course | 1 | 18 | sem distâncias |  |
| Clonmel Golf Club | 2 | 36 | sem distâncias |  |
| Colony Club Gutenhof | 3 | 54 | sem distâncias |  |
| Costa Navarino - The Dunes | 1 | 18 | sem distâncias |  |
| Fairmont, Kittocks | 2 | 36 | sem distâncias |  |
| Golf de Saint Cloud | 1 | 18 | sem distâncias |  |
| Golf Resort Lipiny public course - Republica Checa | 1 | 9 | sem distâncias |  |
| Golfclub Hofgut Georgenthal | 1 | 18 | sem distâncias |  |
| Hunstanton Golf Club | 1 | 18 | sem distâncias |  |
| La Galiana | 1 | 18 | sem distâncias |  |
| La Monacilla Golf Club | 2 | 18 | sem distâncias |  |
| La Toja | 1 | 18 | sem distâncias |  |
| Lincoln | 1 | 18 | sem distâncias |  |
| Luffness New Golf Club | 2 | 36 | sem distâncias |  |
| Lyme Regis Golf Club | 1 | 18 | sem distâncias |  |
| PortersPark GC | 1 | 18 | sem distâncias |  |
| Purbeck Golf Course | 2 | 36 | sem distâncias |  |
| Real Golf de Pedreña | 1 | 18 | sem distâncias |  |
| Roganstown Golf Club | 1 | 18 | sem distâncias |  |
| Royal Niagara Golf Club - Canadá | 1 | 18 | sem distâncias |  |
| Santa Marina Golf | 1 | 18 | sem distâncias |  |
| Temecula Golf Club | 1 | 18 | sem distâncias |  |
| The Woodlands Country Club - Tournament Course | 1 | 18 | sem distâncias |  |
| Trinity Forest Golf Club | 1 | 18 | sem distâncias |  |
| Venice Open | 2 | 36 | 10253m |  |
| Watters Creek | 1 | 18 | sem distâncias |  |
| West Essex Golf Club | 1 | 18 | sem distâncias |  |

## 4. Esqueletos vazios (6) — sem buracos

Só nome + CR/slope. Inclui o "Golf Club Della Montecchia" (BRANCAS, CR 74.1/124).

| Campo | Tees | Buracos | Distâncias | Notas |
|---|---|---|---|---|
| El Rompido | 1 | 0 | sem distâncias |  |
| Golf Club Della Montecchia | 1 | 0 | sem distâncias |  |
| Gullane Golf Club | 2 | 0 | sem distâncias |  |
| NONE | 41 | 0 | sem distâncias |  |
| Preston Golf Club | 1 | 0 | sem distâncias |  |
| Woodhall Spa Golf Course - Hotchkin | 1 | 0 | sem distâncias |  |

## Recomendações

- **Restaurar:** Venice Open / Frassanelle (2 tees completos com metros) — único campo removido com dados verdadeiramente ricos.
- **Opcional:** os 12 torneios da categoria 2 com distâncias reais (>0m) se quiseres os percursos no catálogo — exigem renomear para o nome do campo verdadeiro.
- **Sem perda:** categorias 1 e 4, e os campos da categoria 3 sem distâncias (apenas par/SI/CR — recuperáveis do backup a qualquer momento).
- A página da Montecchia White/Red nunca teve mais de 1 tee nos dados commitados; os outros percursos do Venice 2025 (Boys 9/10/12) existem em `uskidsData.ts` e podem ser adicionados via `extraCourses.ts` como no Glen.