# RFEGolf — scripts do site antigo (arquivados a 2026-10-30)

Em Set/2026 a RFEG passou o `rfegolf.es` para WordPress. Os endereços antigos
(`CompetenciaPaginas/CompetitionMicrosite.aspx?CompId=…`, `AllCompetitions.aspx`,
`LiveScoring.aspx`) redireccionam para a página inicial — e, a partir do GitHub,
respondem 403. A 12/10/2026 o `scrape-rfegolf-node.js` gravou a página inicial
como se fosse prova e a 19/10 o erro por cima (9 provas futuras repostas a 30/10).

Substituídos por `scripts/scrape-rfeg-competiciones.js` (calendário novo +
inscritos do GolfBox espanhol), que escreve os mesmos
`public/data/rfegolf-resultats/{compId}.json`. Os ficheiros antigos (CompId de
5 dígitos) continuam lá e são actualizados quando a prova volta a aparecer no
calendário; as provas novas usam o id do post WordPress (6 dígitos).

- `discover-rfegolf-comps.js` — descoberta por força bruta de CompId.
- `discover-rfegolf-calendar.js` — descoberta pelo calendário WebForms antigo.
- `scrape-rfegolf-node.js` — microsite: meta, inscritos, palmarés e resultados em PDF.
- `rfegolf-scope.json` — o último scope (26/10/2026, 530 provas).

Não se correm: o site que liam já não existe.
