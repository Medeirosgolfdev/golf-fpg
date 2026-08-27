# Trabalhar no golf-fpg a partir do computador de casa

Guia para pôr o projecto e o Claude Code a correr noutra máquina (a de casa),
com acesso a todos os ficheiros.

---

## 0. Antes de tudo: onde estão realmente os ficheiros

Há três "computadores" nesta história e vale a pena não os confundir:

| Máquina | O que tem | Chega-se lá de casa? |
|---|---|---|
| **PC de trabalho** (`C:\golf-fpg\`) | Tudo: repo + segredos + caches + `node_modules` | Só com acesso remoto (ver §5) |
| **Contentor da sessão Claude Code na web** | **Só o que está no Git** — clone fresco, sem segredos, sem `node_modules` | Não. É efémero e é reciclado. |
| **PC de casa** | O que lá puser | — |

⚠ **O contentor das sessões web não tem nada de exclusivo.** Foi verificado:
árvore de trabalho limpa, zero ficheiros ignorados presentes, sem
`node_modules`, sem cookies. Tudo o que lá existe está no repositório do
GitHub. Portanto **não é preciso "ligar-se" a essa máquina** — basta clonar o
repo em casa e tem exactamente os mesmos ficheiros.

O que **não** está no Git está descrito em §4 e vive apenas no PC de trabalho.

---

## 1. Claude Code em casa

Três formas, da mais simples à mais completa.

### 1a. Pelo browser — zero instalação (recomendado para começar)

Ir a **[claude.ai/code](https://claude.ai/code)**, entrar com a mesma conta
(`mariana.tomass@gmail.com`) e abrir/criar uma sessão sobre o repositório
`Medeirosgolfdev/golf-fpg`.

- Funciona em qualquer computador, tablet ou telemóvel — nada para instalar.
- É exactamente o tipo de sessão em que este guia foi escrito.
- Cada sessão clona o repo de fresco num contentor na cloud. **O que não for
  commitado e feito push perde-se** quando o contentor é reciclado.
- As sessões anteriores ficam listadas — pode retomá-las de qualquer sítio.

Limitações reais: não tem os segredos (§4), por isso os scrapers que precisam
de cookies FPG não correm lá sem os configurar; e não tem acesso a
`C:\golf-fpg\`.

### 1b. Claude Code instalado no PC de casa (CLI)

Para trabalhar sobre uma cópia local dos ficheiros, com terminal a sério.

**Windows** (PowerShell):
```powershell
irm https://claude.ai/install.ps1 | iex
```

**macOS / Linux**:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Depois:
```bash
cd caminho/para/golf-fpg
claude
```
No primeiro arranque pede login pelo browser — mesma conta.

### 1c. Cowork

Cowork corre a partir de **claude.ai** com a mesma conta; as competências
(skills) e plugins que tiver activos seguem a conta, não a máquina. Entrar em
casa com o mesmo login dá o mesmo ambiente.

---

## 2. Trazer os ficheiros para o PC de casa

Tudo o que interessa está em `https://github.com/Medeirosgolfdev/golf-fpg`
(repositório privado — é preciso estar autenticado no GitHub).

### Números reais deste repositório

| Pasta | Tamanho | Precisa dela? |
|---|---|---|
| `output/` (697 pastas por federado) | **8,2 GB** | Só para as páginas de jogador em dev |
| `public/` (inclui `public/data`, ~191 MB de JSON) | **1,1 GB** | **Sim** — a app não arranca sem |
| `data-archive/` | 962 MB | Não, para desenvolver |
| `.git` | 676 MB | — |
| `src` + `scripts` + `lib` + `api` + `docs` | ~37 MB | **Sim** |
| **Total** | **~11 GB** | |

### Opção A — clone leve (~1,3 GB) ⭐ recomendado

Deixa de fora `output/` e `data-archive/`, que são 9 GB de dados que raramente
se editam.

```bash
git clone --filter=blob:none --sparse https://github.com/Medeirosgolfdev/golf-fpg
cd golf-fpg
git sparse-checkout set --cone src public scripts lib api docs shared ranking-pja .github .claude
```

Os ficheiros da raiz (`package.json`, `vite.config.ts`, `CLAUDE.md`,
`pipeline.js`, `players.json`, `melhorias.json`, …) vêm sempre, mesmo em modo
cone.

Depois, se precisar das páginas de um jogador em `/jogadores/:fed`, traz só
esse:
```bash
git sparse-checkout add output/52884      # Manuel
```

### Opção B — clone completo (~11 GB)

```bash
git clone https://github.com/Medeirosgolfdev/golf-fpg
```

Mais rápido de raciocinar, mas descarrega os 8,2 GB de `output/`. Só vale a
pena se for mesmo trabalhar em cima dos dados por federado.

### ⚠ Não sincronize a pasta por Dropbox/OneDrive

Com `node_modules` e 11 GB de JSON, a sincronização de ficheiros parte o repo
Git e demora horas. O Git **é** o mecanismo de sincronização entre as duas
máquinas.

---

## 3. Pôr a correr

```bash
npm install          # ~5-10 min à primeira
npm run dev          # servidor local Vite  → http://localhost:5173
```

Validação antes de dar qualquer coisa por concluída (regra do `CLAUDE.md`):
```bash
npm test             # vitest — tem de dar 0 falhas
npm run build        # tsc --noEmit + build Vite
```

Notas:
- Node testado neste ambiente: **v22.22.2** / npm 10.9.7. O `package.json` não
  fixa `engines`; use Node 20 ou 22 LTS.
- `npm run build` escreve para `output/` (é o `outDir` do Vite) e copia lá para
  dentro todo o `public/`. Isso é normal e está ignorado pelo `.gitignore` —
  mas não se assuste com o `git status` depois de um build.
- Em dev, um middleware do `vite.config.ts` serve `output/` na raiz do site.
  Sem essa pasta, as páginas `/jogadores/:fed` dão 404 nos dados — o resto da
  aplicação funciona.

---

## 4. O que NÃO está no Git (e só existe no PC de trabalho)

Estes ficheiros são precisos para correr **scrapers**; a aplicação web e os
testes não precisam deles. Têm de ser copiados à mão de `C:\golf-fpg\` para a
máquina de casa (pen, ou um gestor de palavras-passe — **nunca por email nem
por commit**):

| Ficheiro | Para quê |
|---|---|
| `api/.datagolf-cookies.json` | WHS / scorecards (`my.fpg.pt`) |
| `api/.scoring-datagolf-cookies.json` | Torneios, federados (`scoring.datagolf.pt`) |
| `api/.fpg-admissions-cookies.json` | Inscrições e draws |
| `api/.callmebot-config.json`, `api/.email-config.json` | Notificações |
| `session.json` | Sessão do `npm run login` (regenerável) |
| `data-archive/uskids-member-history.json` (~392 MB) | Fonte do `build-member-history-slim.js` |
| `chrome-profile-automation/`, `logs/`, `reports/` | Locais, descartáveis |

Alternativa aos cookies em ficheiro: as mesmas credenciais existem como
**GitHub Secrets** (`FPG_COOKIES`, `DATAGOLF_SCORING_COOKIES`,
`FPG_ADMISSIONS_COOKIES`) e os scripts também as lêem de variáveis de ambiente.
Para uma corrida pontual em casa, exportar a variável evita andar com ficheiros
de cookies entre máquinas.

Validar que ficaram bons:
```bash
node scripts/test-fpg-auth.js        # deve devolver Result:"OK"
node scripts/test-datagolf-node.js   # idem
```

### ⚠ Achado de segurança a tratar

O ficheiro **`.env.local` está versionado no Git** (aparece no `.gitignore`,
mas foi commitado antes disso e o `.gitignore` não desversiona o que já lá
está). Contém a chave `DATAGOLF_SESSION` com um valor de sessão.

O repositório é privado, mas o valor está no histórico e vai para todas as
cópias — incluindo cada contentor de sessão web. Recomendado:

```bash
git rm --cached .env.local
git commit -m "remover .env.local do versionamento"
```
…e **rodar a sessão** (novo login) para invalidar o valor exposto. Limpar o
histórico é possível (`git filter-repo`) mas reescreve todos os commits — só
vale a pena se o valor for de longa duração.

---

## 5. Se quiser mesmo aceder ao PC de trabalho a partir de casa

Só é preciso se quiser os ficheiros que **não** estão no Git (§4) sem os
copiar, ou correr coisas que só funcionam nessa máquina — como o **Chrome 90**
da captura de cookies, ou a Scheduled Task diária.

Configura-se **nessa máquina**, não daqui. Duas opções sensatas:

**Tailscale + Ambiente de Trabalho Remoto** (mais robusto)
1. Instalar o [Tailscale](https://tailscale.com/download) nos dois computadores,
   com a mesma conta. Cria uma rede privada entre eles, sem abrir portas no
   router.
2. No PC de trabalho: Definições → Sistema → Ambiente de Trabalho Remoto → ligar.
   (Requer Windows Pro; no Home não existe.)
3. De casa: Ligação ao Ambiente de Trabalho Remoto → o nome Tailscale do PC.
4. O PC tem de ficar **ligado e sem suspensão** (Definições → Energia → Suspensão: Nunca).

**Chrome Remote Desktop** (mais simples, funciona no Windows Home)
1. [remotedesktop.google.com/access](https://remotedesktop.google.com/access) no
   PC de trabalho → configurar acesso remoto → definir PIN.
2. De casa, o mesmo endereço com a mesma conta Google.

Para transferir **só ficheiros**, sem controlar o ecrã, o Tailscale traz
`taildrop` (`tailscale file cp ficheiro maquina:`), que é bastante mais prático
do que abrir uma sessão de ambiente de trabalho.

---

## 6. Fluxo do dia-a-dia entre duas máquinas

O Git é a ponte. Em qualquer das máquinas, antes de começar:
```bash
git pull origin main
```
E ao acabar:
```bash
git add -A && git commit -m "..." && git push origin main
```

⚠ **Ficheiros gerados dão conflito quase sempre.** Os workflows do GitHub
regeneram e commitam os mesmos ficheiros que gera em local. Nestes quatro,
nunca fundir à mão — regenerar (secção própria do `CLAUDE.md`):

```bash
git checkout --theirs public/data/major-catalog.json public/data/juniors.json \
  public/data/juniors-tournaments.json public/data/tournament-catalog.json
node scripts/build-major-catalog.js && node scripts/aggregator/index.js
git add public/data/major-catalog.json public/data/juniors*.json public/data/tournament-catalog.json
git commit
```

Deixar um conflito por resolver nestes ficheiros **parte a aplicação inteira**
(os marcadores `<<<<<<<` tornam o JSON inválido).
