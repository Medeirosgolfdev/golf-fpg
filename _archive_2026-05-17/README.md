# Arquivo — 2026-05-17

Ficheiros movidos para aqui durante a auditoria de limpeza de 17 de Maio 2026.
**Nenhum destes ficheiros é referenciado por código activo** no `src/` ou
`scripts/`. Movidos (não apagados) para preservar para consulta futura.

## Como reverter

Se algum destes ficheiros voltar a ser preciso, basta movê-lo de volta para
o caminho original (estrutura abaixo espelha o original).

```powershell
# Exemplo: restaurar fpgLoaders.ts
Move-Item _archive_2026-05-17\src\data\fpgLoaders.ts src\data\fpgLoaders.ts
```

## Estrutura

```
_archive_2026-05-17/
├── src/                          # mantém estrutura de pastas original
│   ├── data/
│   │   ├── doralLegacyLoader.ts
│   │   ├── fpgLoaders.ts         # ⚠ tem loadMonthlyTournaments (duplicado de loadAllFiles em DrivePage)
│   │   └── tournamentMerge.ts
│   ├── hooks/
│   │   ├── useCachedFiles.ts
│   │   ├── usePersistedState.ts
│   │   └── usePlayerStats.ts     # só usado por NacionaisPage
│   ├── pages/
│   │   ├── NacionaisPage.tsx     # 66 KB — substituído por NacionaisJovensPage
│   │   ├── kids2/
│   │   │   └── .fuse_hidden0000000500000001  # cópia antiga de data.ts (FUSE)
│   │   └── nacionais/
│   │       ├── AroeiraBurTable.tsx     # só usado por NacionaisPage
│   │       └── FieldIntelligence.tsx   # só usado por NacionaisPage
│   ├── ui/
│   │   ├── TournLayout.tsx
│   │   └── USKidsLink.tsx
│   ├── utils/
│   │   └── tournamentClassification.ts
│   └── KIDSdataLoaderV2.ts       # explicitamente marcado DEPRECATED no header
│
└── public-data/                  # = public/data/
    ├── brjgt2431_contest_9.json
    ├── fpg-calendario-drive-tour.json
    ├── fpg-calendario-madeira.json
    ├── fpg-calendario-santo-da-serra.json
    ├── gg_champ_france_u12_filles_2025.json
    ├── gg_champ_france_u12_gar_ons_2025.json
    ├── gg_internationaux_france_u21_filles_2026.json
    ├── gg_junior_invitational_2026.json
    ├── tournaments-index.json           # snapshot de inspecção 2026-05-05
    ├── tournaments-index-full.json      # idem (versão completa)
    └── uskids-flights-cache.json        # cache antiga, sem leitores
```

**NOTA:** o `src/pages/nacionais/types.ts` original **não** foi arquivado —
é ainda usado por `src/ui/InscricoesComponents.tsx` (depois do fix de path
aplicado na mesma sessão).

## Métricas

- Total: 24 ficheiros (13 src + 11 public/data)
- Espaço: ~15 MB
- Maiores: `tournaments-index-full.json` (7.3 MB), `uskids-flights-cache.json` (6.2 MB), `NacionaisPage.tsx` (66 KB)

## Verificação pós-arquivamento

Após mover tudo:
- `npm test` → 132 passados, 0 falhas (mesmo total da baseline)
- 8 suites de testes intactas
