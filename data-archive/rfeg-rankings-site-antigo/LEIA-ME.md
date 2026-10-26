# Rankings da RFEG do site antigo (até 22/10/2026)

Os 42 rankings que o scraper antigo (RankingList.aspx) tinha gravado em
`public/data/rfeg-rankings/`, com o índice da altura (`_index_ate-2026-10-22.json`).

Saíram da pasta pública a 26/10/2026, ao juntar o ramo `ramos-rfeg` (commit
`4c368e2608`): a RFEG mudou de site em Setembro, o scraper novo
(`scripts/scrape-rfeg-ranking.js`) grava os rankings juvenis com o id do post no
nome, e o agregador (`scripts/aggregator/util/rfeg-oficial.js`) lê TODOS os
ficheiros da pasta — os antigos têm outro formato e incluem rankings de adultos
(Sénior, Mid-Amateur, Sub-18, Boy) que o site novo não tem equivalente.

Guardados aqui para nada se perder (fora do deploy). Nenhum script os lê.
