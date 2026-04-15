# 🏌️ DRIVE + AQUAPOR — Guia de Actualização Semanal

## Resumo

Há **2 sites** e **2 fases**. Cada fase = 1 script no terminal + 1 paste no browser.

| Fase | O quê | Site do browser | Resultado |
|------|--------|----------------|-----------|
| **1. Torneios** | Classificações + scorecards | `scoring.datagolf.pt` | `drive-data.json` |
| **2. Jogadores** | Perfis WHS + scorecards FPG | `scoring.fpg.pt` | `output/{fed}/` + SD lookup |

---

## Passo a Passo Semanal

### Fase 1 — Torneios (scoring.datagolf.pt)

```powershell
# 1. No terminal:
node update-torneios.js
```

```
# 2. No browser — abre: https://scoring.datagolf.pt/pt/Classifications.aspx?ccode=988&tcode=10292
#    (qualquer página de classificações serve)
#    F12 → Console → cola:
fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)
```

Espera até ver `CONCLUÍDO`. O ficheiro `public/data/drive-data.json` é actualizado automaticamente.

### Fase 2 — Jogadores (scoring.fpg.pt)

```powershell
# 3. No terminal (depois da fase 1 acabar):
node update-jogadores.js --new
#   ou para actualizar todos:
node update-jogadores.js --refresh
```

```
# 4. No browser — abre: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884
#    F12 → Console → cola:
fetch("http://localhost:3456/browser-script.js").then(r=>r.text()).then(eval)
```

Espera até ver `CONCLUÍDO`. Os perfis são guardados em `output/{fed}/`.
Depois o script corre automaticamente:
- `golf-all.js` (processar dados)
- `build-drive-sd-lookup.js` (cruzar SD)

### Fase 3 — Deploy

```powershell
# 5. Fazer deploy
git add -A && git commit -m "update semanal" && git push
```

---

## Adicionar Novos Torneios

Quando há um torneio novo (DRIVE ou AQUAPOR), tens de encontrar o `ccode` e `tcode`:

1. Vai a `scoring.datagolf.pt`
2. Encontra o torneio nas classificações
3. O URL terá: `?ccode=XXX&tcode=YYYYY`
4. Edita `update-torneios.js` e adiciona à lista `TOURNAMENTS`

Exemplo para AQUAPOR:
```javascript
{ name: "1º Circuito AQUAPOR - Morgado", ccode: "???", tcode: "?????",
  date: "2026-01-17", campo: "Morgado do Reguengo", circuit: "aquapor" },
```

---

## Opções do update-jogadores.js

| Opção | Descrição |
|-------|-----------|
| `--new` | Só jogadores que aparecem nos torneios mas ainda não têm perfil |
| `--refresh` | Todos os jogadores, mas salta se WHS count não mudou |
| `--force` | Re-descarregar tudo |
| `--feds 47078 59252` | Jogadores específicos |

---

## Recuperação de Erros

### "O drive-data.json ficou vazio!"
O script agora recusa gravar se tiver 0 jogadores. Mas se acontecer:
```powershell
# Restaurar do git
git checkout -- public/data/drive-data.json
```

### "O browser diz site errado!"
- Torneios → só funciona em `scoring.datagolf.pt`
- Jogadores → só funciona em `scoring.fpg.pt` ou `my.fpg.pt`

### "Alguns jogadores não têm SD na tabela"
- Primeiro precisam de ter perfil descarregado (Fase 2)
- Depois o `build-drive-sd-lookup.js` cruza por data+gross
- Se não houver match: SD é calculado por AGS (~) ou aproximado (≈)
