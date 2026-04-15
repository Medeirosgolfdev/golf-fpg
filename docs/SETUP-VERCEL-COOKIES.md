# Configurar `DATAGOLF_COOKIES` no Vercel (produção)

Para que `golf-fpg.vercel.app` funcione para **todos os federados** (não só os pré-calculados), o proxy `/api/datagolf` precisa dos cookies FPG em produção.

## Passos (5 minutos)

### 1. Abrir o dashboard do Vercel

https://vercel.com/dashboard → projeto **golf-fpg**.

### 2. Ir a Settings → Environment Variables

Na barra lateral esquerda: **Settings** → **Environment Variables**.

### 3. Adicionar `DATAGOLF_COOKIES`

Carrega em **"Add New"** e preenche:

- **Name:** `DATAGOLF_COOKIES`
- **Value:** *(cola aqui o cookieHeader completo — o mesmo que está em `api/.datagolf-cookies.json` campo `cookieHeader`)*
- **Environments:** marca **Production** (e opcional **Preview** se quiseres que branches também funcionem)
- **Type:** **Sensitive** (para ser encriptado e não visível após save)

Carrega **Save**.

### 4. (Opcional) Adicionar `DATAGOLF_HOST`

Se capturaste os cookies do `my.fpg.pt` (o caso normal), adiciona também:

- **Name:** `DATAGOLF_HOST`
- **Value:** `my.fpg.pt`
- **Environments:** Production

### 5. Redeploy

Environment variables só aplicam ao próximo deploy. Vai a **Deployments** → mais recente → **⋯** → **Redeploy** → confirmar.

Alternativa: fazer push de qualquer commit pequeno (ex: README) que dispara auto-deploy.

### 6. Testar

Abre `https://golf-fpg.vercel.app/api/datagolf?action=whs&fed=52884` — deve devolver JSON com `data: [...]` (rondas do Manuel), sem Param_Errors.

## Refrescar cookies expirados

Quando o proxy começar a falhar em produção com erros recorrentes (o watchdog do `api/datagolf.js` escreve avisos nos runtime logs do Vercel):

1. Abrir Firefox (ou Chrome 90 se ainda funcionar) → `https://my.fpg.pt/Home/PlayerWHS.aspx?no=52884`
2. F12 → Network → reload → direito num XHR `HCPWhsFederLST` → Copy as cURL
3. Extrair o header `cookie: ...` do cURL
4. No Vercel dashboard → Settings → Environment Variables → editar `DATAGOLF_COOKIES` → colar novo valor → Save
5. Redeploy

Também atualizar `api/.datagolf-cookies.json` localmente para manter consistência em dev.

## Monitorização

Para ver se o proxy está a chegar ao `my.fpg.pt` ou ao `golf-portugal.pt`:

- Vercel dashboard → projeto → **Logs** → filtrar por `[datagolf]`
- Verás mensagens como:
  - `[datagolf] cookies lidos de env DATAGOLF_COOKIES (host=my.fpg.pt)` — o que queres
  - `[datagolf] sessão obtida via golf-portugal` — fallback, indica cookies expirados
  - `⚠️  WATCHDOG: datagolf falhou 5 vezes em 10 min` — alerta automático

## Segurança

Os cookies incluem o `.AspNet.ApplicationCookie` que é um token de autenticação da tua conta FPG. **Ninguém com acesso a ver isto pode fazer-se passar por ti no site da FPG.** Por isso:

- ✅ Sempre como "Sensitive" no Vercel
- ✅ `api/.datagolf-cookies.json` está em `.gitignore`
- ❌ **NUNCA** commitar o ficheiro com cookies ao repo público
- ❌ **NUNCA** partilhar o cookieHeader em screenshots/chat públicos

Se desconfiares que vazaram, faz logout em `area.my.fpg.pt` (invalida imediatamente) e faz novo login.
