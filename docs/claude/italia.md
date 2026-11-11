# Itália — Federgolf (/fig)

> Criado a 2026-11-02. Datas entre parênteses = quando a regra ou a medição foi feita.

## O que há

Página **`/fig`** (🇮🇹 na barra): as provas juvenis individuais da Federazione
Italiana Golf — Trofei Giovanili (Federali, U16, WAGR e os antigos), Campionati
Nazionali/Internazionali Baby/Pulcini/Cadetti/Ragazzi e qualquer outra com
escalão juvenil no nome. Fora: equipas, match play, qualificações e anuladas.
~45 por ano. Âmbito (02/11/2026): todas de 2022 em diante; 2018–2021 só com
portugueses inscritos; antes de 2018 não há classificação na API.

## API (pública, sem login nem nonce)

`POST https://www.federgolf.it/wp-admin/admin-ajax.php` (plugin `federgolf-crm`),
sempre com `competition_id` (GUID da página
`/attivita-agonistica/dettaglio-gara/{id}/`):

| action | o que dá |
|---|---|
| `competitions-search` (`anno`, `tipo=0`, `mese=0`, `keyword`) | calendário do ano (2006→): `competition_id, nome, data, club, tipo, annullata`. Vem **sem** `success` (só `data`) |
| `competition-tipologia-classifica` | classificações (`punteggio_lordo`…) e `giri_totali` |
| `competition-details-classifica` (+`tipologia_classifica`, `giro`) | linhas: pos, nome «APELIDO, NOME», cat, qual, hcp, G1…, tot, par, id |
| `competition-details-classifica-giri` (+`player_id`, `giro` = nº de voltas) | **todas** as voltas do jogador num pedido (22 valores: 1-9, OUT, 10-18, IN, TOT, ±par) e `par`/`mt` do campo |
| `competition-player-list` | inscritos: clube, **categoria** (B/P/C/R), qualificação, índice, ordem de mérito |
| `competition-hcp-report` | por jogador e volta: data, par, tee, CR, Slope, índice, HCP de jogo, gross ajustado, pontos, **SD oficial** |
| `competition-classifiche` / `competition-orari-partenze` | lista de PDFs; `download-allegato-gara` (+`allegato_id`) devolve o PDF em base64 |

⚠️ **~20 s por pedido** (às vezes 2–5 s); com 8 em paralelo devolve HTML «Si è
verificato un errore» e timeouts. O scraper usa 4 e repete com espera.

### Armadilhas medidas (02/11/2026)
- Volta não jogada vem como **cartão a zeros** (total 0) e o `par` da
  classificação conta-a a zero (Calini: −57) → sem ±par da fonte quando falta
  uma volta; o site conta pelas voltas jogadas.
- O gross do relatório de handicap é o **ajustado** (net double bogey): não
  serve para casar com o jogado → a volta N é o N.º dia da prova.
- Nomes da lista de inscritos trazem `&#039;` (D'Addabbo) → descodificar antes
  de casar com a classificação.
- **Categorias** (página de ranking juvenil da Federgolf): Under 12 Baby,
  Under 14 Pulcini, Under 16 Cadetti, Under 18 Ragazzi (e Pulcine, Cadette,
  Ragazze). Na tabela única `src/data/model/escalao.ts` com a fonte `"it"`.
- Os PDFs de classificação e horários **não trazem licença nem idade** — só
  «Cat.», «Qual.», «Odm» e HCP, o mesmo que a API.

## Scraper — `scripts/scrape-federgolf.js`

- `--anos 2026,2025…` (por omissão o ano corrente), `--ids`, `--max-min N`,
  `--refazer`, `--force`, `--so-indice`, `--futuras`, `--paralelo N` (cartões em
  paralelo; 4 por omissão — duas cargas ao mesmo tempo, 3 + 3).
- Prova de uma volta: a classificação não traz «G1», só o total (corrigido a
  02/11; as gravadas antes ficavam sem voltas).
- **`--sem-cartoes`**: passagem rápida (4 pedidos por prova, 3 provas de cada
  vez) que só grava provas novas; ficam `completo: false` e os cartões chegam
  nas passagens normais seguintes. Uma prova completa e jogada há mais de 10
  dias não se volta a pedir.
- Grava `public/data/federgolf/{id}.json` (uma prova = um sexo, guarda
  anti-encolhimento) e `public/data/federgolf-index.json` (de todos os
  ficheiros em disco; refeito de 20 em 20 provas durante a corrida).
- **Âmbito (02/11/2026, decisão da Mariana):** todas as provas de 2022 em diante;
  de 2018 a 2021 só as que têm portugueses inscritos (`--so-pt-antes 2022`: um
  pedido à lista de inscritos antes de tudo; português = «clube» POR/PRT).
- Workflow `update-federgolf.yml` (diário 01:00 UTC): provas que faltam desde
  2018 com essa regra (só totais, até 2 h), depois cartões até 2,5 h, do mais
  recente para trás.

## Site

- `src/data/federgolf/` — `types.ts`, `toTournament.ts` (`fgToTournament`:
  voltas com cartão, tee, CR/Slope e SD oficial em `roundScores[].sd`; escalão
  de cada jogador pela categoria; sem cartões ainda, a mesma prova marcada
  `format: "totals"` — mesmo Resumo, SD em cada volta, sem Scorecards), `entries.ts` (`buildFgEntries`: M e F da mesma prova numa
  entrada, `memberIds`; «Pulcine»/«Pulcini» do mesmo dia e clube juntam-se).
- `admissions.tsx` — a «Lista iscritti» (gravada em `inscritos[]` desde
  02/11/2026, com quem não chegou a jogar) → separador Inscrições
  (`AdmissionsTab`): escalão pela Cat., país dos estrangeiros, HCP, data e
  estado (ammesso/wildcard → confirmado, in attesa → pendente, cancellato →
  desistiu); Qual., OdM e WAGR entram como `extraCols`, que o CircuitShell
  passa por divisão (`CircuitDivision.admissionsExtraCols`).
- **Estrangeiros:** na Federgolf o «clube» é o país, com códigos próprios
  (SWI, DAN, SLK, IRE, SCO, ENG, WAL, LIT…) → `fgPais` (ISO-2) → bandeira e
  destaque PT.
- **Filtros ★ Manuel e 🇵🇹 PT** (os mesmos da /ffg e /rfeg): o índice grava
  `hasPt`/`hasManuel` por prova (`construirIndice`), contando a classificação
  **e** a lista de inscritos. Quem se inscreveu e não jogou (lista de espera,
  desistência) aparece numa nota por cima do Resumo (`fgNotaPtNaoJogaram` →
  `noticeNode`, a mesma peça do aviso do WAGR) — pedido dela, 02/11/2026: a
  prova aparece no filtro e diz que não conseguiu jogar.
- `src/pages/FedergolfPage.tsx` — só o `CircuitShell` (sem estilos próprios).
- Testes: `src/data/__tests__/federgolfConverters.test.ts`.

## Ranking juvenil nacional — `scripts/scrape-federgolf-ranking.js` (02/11/2026)

Página `/attivita-agonistica/attivita-giovanile/ranking/`, JS
`federgolf-crm-ranking-nazionale-2026.js`. `POST admin-ajax.php`
`action=ranking-nazionale-2026-search` com `anno` (2006→), `sesso` (1 M, 2 F),
`categoria` (18 Ragazzi, 16 Cadetti, 14 Pulcini, 12 Baby), `tipo_ranking=8`,
`zona` (8 nacional, 1–7), `anni_giocatore` (0 todos, 8–18). O `_wpnonce` da
página não é exigido. Rápido (~2 s). Linha: lugar, nome («APELIDO NOME», sem
vírgula), clube, zona, **idade**, qual., voltas, mínimo de voltas (pallino
verde/rosso), **média de (gross − CR)** das voltas que contam (mais baixa =
melhor), —, **id do jogador = o mesmo das classificações**.
`ranking-nazionale-2026-details` (`id`, `anno`) → `risultatiData`: as voltas do
jogador no ano (prova, data, clube, volta, gross, par, CR, gross − CR), também
Opens, provas de equipas e USKids em Itália (Venice Open).

- Grava `federgolf-ranking.json` (listas por ano → «M-12»…) e
  `federgolf-ranking-voltas.json` (voltas por ano → id; lido só ao abrir um
  jogador). Por omissão o ano corrente e o anterior; aditivo por ano.
- **Datas de nascimento:** a Federgolf não as publica em lado nenhum público
  (nem provas, nem listas, nem PDFs, nem ranking; a consulta de handicap é com
  login na app). Só a idade do ranking.

## Provas futuras — `scrape-federgolf.js --futuras`

As provas juvenis por jogar (ano corrente e seguinte) com a «Lista iscritti»,
refeitas em cada corrida → `federgolf/{id}.json` com `futura: true` e
`jogadores: []`. A 02/11/2026 não havia nenhuma: a época 2026 acabou a 31/10 e o
calendário de 2027 ainda não saiu.

## Anos sem dados na API

Até ~2016–2017 a `competition-tipologia-classifica` vem vazia: os resultados só
estão nos PDFs («classifica.pdf», por volta) e há a lista de inscritos. 2018 e
2021 já têm classificação na API (2019, 2020 e 2022 deram timeout no teste de
02/11 — o servidor estava sobrecarregado). Ler esses PDFs é trabalho à parte.

## Site — menu ⓘ Info (`src/pages/fig/FgInfoViews.tsx`)

As duas vistas usam as peças comuns com a /ffg e a /rfeg: `ui/info/CategoriasInfo`
(a página de categorias das três) e `ui/ranking/RankingListaView` (o ranking
juvenil da /fig e da /rfeg) — melhorar uma melhora as outras.

- `/fig/info/categorias` — categorias (Cat., escalão, idades, nascidos no ano,
  equivalentes FPG/RFEG/FFG, nº de provas), legenda das colunas (Cat., Qual.,
  WAGR, Hcp, OdM, Data, Stato, SD) e tipos de prova.
- `/fig/info/ranking` — ranking juvenil (`RankingTable`): ano, categoria, sexo,
  pesquisa; clique num jogador → `/fig/jogador/:id?ano=` (`RankingDetail`): lugar,
  idade, média, voltas e a tabela de todas as voltas do ano.
- Provas sem cartões: o Resumo de totais com «SD R1…» (`TotalsExtraCol`).

## Kids 2 (02/11/2026)
As provas da /fig entram no Kids 2 pela fonte `fig` do agregador (89 provas, ~1440 jogadores;
o Durando passou de 8 provas italianas pelo EGR para as 15). Regras do casamento e números em
[kids2-agregador.md](kids2-agregador.md#fonte-fig--itália-02112026). Nomes, país, chave da
prova e ano de nascimento vivem em `src/data/federgolf/nomes.ts` (sem imports de valores:
o agregador lê-o com o Node).

## Por fazer
- Ler os PDFs das provas antigas (até ~2017).
- Match play e equipas (Campionati a squadre, Match Play Ragazzi) ficaram de fora.
