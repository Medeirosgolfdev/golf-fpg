# 🔍 Investigação: Scraping FPG em GitHub Actions

## O problema

O workflow actual exige **dois processos em simultâneo** — terminal e browser — porque o
Node.js não consegue aceder directamente às APIs da FPG. As cookies de sessão (ASP.NET_SessionId,
userToken, etc.) só existem no browser após login manual SSO.

```
Arquitectura actual:
┌─────────────────┐    HTTP :3456    ┌──────────────────────┐    HTTPS    ┌──────────────┐
│ Node.js (bridge)│ ◄──────────────► │  Browser (manual)    │ ──────────► │ scoring.fpg.pt │
│ fpg-bridge-drive│                  │  console paste       │             │ scoring.datagolf│
└─────────────────┘                  └──────────────────────┘             └──────────────┘
```

Isto é impossível de automatizar no GitHub Actions porque:
1. Não há browser interactivo
2. As cookies expiram (ASP.NET_SessionId = expires: -1 = session cookie)
3. O login SSO (`area.my.fpg.pt`) parece requerer interacção manual

---

## A solução: Playwright headless

O Playwright já está no projecto (`login.js`). Em vez de um bridge server, usamos
`page.evaluate()` para correr o código de scraping *dentro* do browser headless, com as
cookies injectadas a partir do `session.json`.

```
Nova arquitectura:
┌──────────────────────────────────────────────────────────────┐
│  Node.js — scraper-headless.js                               │
│                                                              │
│  browser = chromium.launch({ headless: true })               │
│  context = browser.newContext({ storageState: session.json })│
│                                                              │
│  page.goto(scoring.datagolf.pt) → page.evaluate(scraper)    │
│  page.goto(scoring.fpg.pt) → page.evaluate(player-fetcher)  │
│                                                              │
│  → escreve drive-data.json, output/{fed}/...                 │
└──────────────────────────────────────────────────────────────┘
```

---

## O desafio das sessões

O `session.json` actual tem:
- `ASP.NET_SessionId` → `expires: -1` → **session cookie, expira ao fechar o browser**
- `userToken` → `expires: -1` → idem
- `.AspNet.ApplicationCookie` → `expires: -1` → idem
- `PlayerArea` → expira 2025-12-XX → **persistente** ✓

Cada GitHub Actions run seria uma sessão nova → as cookies de sessão já não são válidas.

### Três opções

---

### Opção A — Credentials como Secrets (automação total) ⭐ Recomendada

Guardas `FPG_USER` e `FPG_PASSWORD` como GitHub Secrets. O scraper faz login
automático via Playwright antes de iniciar o scraping.

**Prós:**
- Zero intervenção manual
- Funciona indefinidamente

**Contras:**
- Depende da estrutura da página de login SSO (`area.my.fpg.pt`)
- Se o login tem CAPTCHA ou MFA → não funciona sem ajustes

**Investigar:** Abrir DevTools no `area.my.fpg.pt/login/` e verificar se é um form
standard (input[type=email] + input[type=password] → submit). Se sim, é trivial de
automatizar.

```javascript
// Em scraper-headless.js, adicionar antes do scraping:
async function loginFPG(page, user, password) {
  await page.goto("https://area.my.fpg.pt/login/");
  await page.fill("input[type='email'], #email, #username", user);
  await page.fill("input[type='password'], #password", password);
  await page.click("button[type='submit'], input[type='submit']");
  await page.waitForNavigation({ timeout: 15000 });

  // Navegar para scoring para activar as cookies
  await page.goto("https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884");
  await page.waitForLoadState("domcontentloaded");
}
```

```yaml
# Em update-drive.yml:
- name: Login FPG
  run: node scraper-headless.js --login-only
  env:
    FPG_USER: ${{ secrets.FPG_USER }}
    FPG_PASSWORD: ${{ secrets.FPG_PASSWORD }}
```

---

### Opção B — session.json como Secret (semi-manual)

Guardas o conteúdo do `session.json` como Secret `FPG_SESSION_JSON`. Quando a sessão
expira, actualizas manualmente o Secret a partir da tua máquina.

**Prós:**
- Simples de implementar
- Não depende da estrutura da página de login

**Contras:**
- Precisas de renovar o Secret manualmente (~cada semana ou menos)
- Se te esqueceres → o workflow falha

**Quando renova:** As cookies `ASP.NET_SessionId` são session cookies, mas em prática o
servidor pode manter a sessão activa por dias desde que sejam usadas regularmente. Se
correres o workflow semanalmente, é possível que a sessão dure mais do que uma semana.
**Vale a pena testar.**

```powershell
# Workflow local para renovar o Secret:
node login.js
# (faz login manual e guarda session.json)

# Depois actualiza o Secret no GitHub:
gh secret set FPG_SESSION_JSON < session.json
# ou via GitHub UI: Settings → Secrets → FPG_SESSION_JSON
```

---

### Opção C — Self-hosted runner (mais simples localmente)

Instalas o GitHub Actions runner na tua própria máquina. O workflow corre localmente
com o teu browser profile e a sessão é mantida.

**Prós:**
- Sessão sempre activa (o teu browser tem as cookies)
- Não precisas de gerir secrets de sessão
- O Playwright usa o teu perfil Chrome existente

**Contras:**
- A tua máquina tem de estar ligada quando o workflow corre
- Menos "cloud native"

```yaml
# Em update-drive.yml:
jobs:
  update:
    runs-on: self-hosted  # em vez de ubuntu-latest
```

```powershell
# Instalar runner na tua máquina:
# GitHub → Settings → Actions → Runners → New self-hosted runner
```

---

## Plano de implementação recomendado

### Fase 1 — Provar conceito (1-2 horas)

1. **Investigar o login SSO:**
   Abre `https://area.my.fpg.pt/login/` com DevTools → Network → verifica o POST de login:
   - Qual é o endpoint?
   - Quais são os campos do formulário?
   - Há redirect SSO externo?

2. **Testar `scraper-headless.js` localmente:**
   ```powershell
   # Com sessão existente:
   node scraper-headless.js --tournaments
   # Deve funcionar exactamente como o workflow actual mas sem browser manual
   ```

3. **Verificar se as cookies persistem:**
   Depois do passo 2, verificar se o `session.json` foi actualizado com cookies válidas.

### Fase 2 — GitHub Actions (2-3 horas)

4. **Escolher estratégia de autenticação** (A, B ou C)
5. **Configurar o repositório:**
   ```
   .github/
     workflows/
       update-drive.yml
   scraper-headless.js
   ```
6. **Configurar Secrets no GitHub:**
   - `GH_PAT` — Personal Access Token com permissão `repo` (para o bot poder fazer push)
   - `FPG_SESSION_JSON` (Opção B) ou `FPG_USER` + `FPG_PASSWORD` (Opção A)

7. **Primeiro teste manual:**
   GitHub → Actions → "Actualização DRIVE Semanal" → Run workflow → modo: `tournaments-only`

### Fase 3 — Activar cron (15 min)

8. Remover o `#` do cron no workflow
9. Verificar o primeiro run automático na segunda-feira

---

## Ficheiros a criar/alterar

| Ficheiro | Acção | Descrição |
|----------|-------|-----------|
| `scraper-headless.js` | **Criar** | Substitui `fpg-bridge-drive.js` + browser manual |
| `.github/workflows/update-drive.yml` | **Criar** | Workflow GitHub Actions |
| `login.js` | Manter | Continua a ser usado para renovar a sessão localmente |
| `fpg-bridge-drive.js` | Manter (legado) | Continua a funcionar se precisares do workflow manual |
| `WORKFLOW.md` | Actualizar | Adicionar secção sobre GitHub Actions |

---

## Risco: estrutura do scraping de torneios

O `drive-scraper-v6.js` usa jQuery (`$.ajax`, `$()`) que é injectado pelo próprio site
`scoring.datagolf.pt`. Com Playwright headless, o jQuery estará disponível depois de
`page.waitForFunction(() => typeof jQuery !== "undefined")`.

O código de scraping pode ser portado quase literalmente para `page.evaluate()` — a
única diferença é que `return` devolve dados ao Node.js em vez de fazer download directo.

---

## Próximos passos imediatos

1. Corre `node scraper-headless.js --tournaments` localmente para confirmar que funciona
2. Verifica a estrutura da página de login SSO
3. Decide entre Opção A, B, ou C
4. Cria o GH_PAT e configura os Secrets
