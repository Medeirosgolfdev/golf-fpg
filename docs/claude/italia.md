# Itália — Federgolf (/fig)

> Criado a 2026-11-02. Datas entre parênteses = quando a regra ou a medição foi feita.

## O que há

Página **`/fig`** (🇮🇹 na barra): todas as provas juvenis individuais da
Federazione Italiana Golf desde 2006 — Trofei Giovanili (Federali, U16, WAGR e
os antigos), Campionati Nazionali/Internazionali Baby/Pulcini/Cadetti/Ragazzi e
qualquer outra com escalão juvenil no nome. Fora: equipas, match play,
qualificações e anuladas. ~1000 provas (1003 a 02/11/2026; ~45 por ano).

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
  `--refazer`, `--force`, `--so-indice`.
- **`--sem-cartoes`**: passagem rápida (4 pedidos por prova, 3 provas de cada
  vez) que só grava provas novas; ficam `completo: false` e os cartões chegam
  nas passagens normais seguintes. Uma prova completa e jogada há mais de 10
  dias não se volta a pedir.
- Grava `public/data/federgolf/{id}.json` (uma prova = um sexo, guarda
  anti-encolhimento) e `public/data/federgolf-index.json` (de todos os
  ficheiros em disco; refeito de 20 em 20 provas durante a corrida).
- Workflow `update-federgolf.yml` (diário 01:00 UTC): provas que faltam desde
  2006 (só totais, até 2 h), depois cartões até 2,5 h, do mais recente para trás.

## Site

- `src/data/federgolf/` — `types.ts`, `toTournament.ts` (`fgToTournament`:
  voltas com cartão, tee, CR/Slope e SD oficial em `roundScores[].sd`; escalão
  de cada jogador pela categoria; `fgTotais` para as provas ainda sem cartões
  → `TotalsResumo`), `entries.ts` (`buildFgEntries`: M e F da mesma prova numa
  entrada, `memberIds`; «Pulcine»/«Pulcini» do mesmo dia e clube juntam-se).
- `src/pages/FedergolfPage.tsx` — só o `CircuitShell` (sem estilos próprios).
- Testes: `src/data/__tests__/federgolfConverters.test.ts`.

## Por fazer
- Ligar ao agregador do Kids 2 (rivais italianos do Manuel).
- Match play e equipas (Campionati a squadre, Match Play Ragazzi) ficaram de fora.
