# Página /england (arquivada a 2026-10-13)

A Mariana: o único torneio inglês com interesse é o **Reid Trophy** (English
Boys' U14). Passou para a /major com as edições todas (2023-2025 convertidas por
`scripts/import-england-reid-trophy.js` → `public/data/reidtrophy_{ano}.json`;
2026+ pelo GolfGenius, scope `reidtrophy`). A página saiu da barra.

**Os dados NÃO foram arquivados:** `public/data/england_*.json`,
`england/` e `england-golf-catalog.json` continuam a ser actualizados pelo
`update-england.yml` (segundas) e alimentam o kids2 (adapter `england`).

`/england` e `/england/t/<slug>` redireccionam para a /major (Reid Trophy do
ano do slug, ou 2026).

## Repor
`git mv scripts/_archive/england/EnglandGolfPage.tsx src/pages/`, voltar a pôr
o lazy import e as rotas `/england` e `/england/:source/:key` em `src/App.tsx`
e a entrada «England» em `NAV_ITEMS` (`src/ui/NavBar.tsx`).
