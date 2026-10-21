#!/usr/bin/env bash
# scripts/ci/push-generated.sh — commit + push dos ficheiros que um workflow
# gerou, à prova de pushes concorrentes de outros workflows.
#
# Porquê (auditoria 20/10/2026): 27 workflows faziam `git pull --rebase` sobre
# ficheiros gerados e partiam ~4×/semana — o checkout é raso (depth 1), por isso
# quando o main avançava durante o scrape o git ficava sem base comum e dava
# ficheiros inteiros como conflito; e os agregados (juniors*.json, …) mudam em
# quase todos os runs, logo o rebase conflitava neles mesmo com histórico.
#
# O que faz (padrão do update-federados.yml, generalizado):
#   1. `git add -A` de cada pathspec (um a um: um pathspec inexistente não
#      aborta os outros; globs entre aspas para o git apanhar também deletions).
#   2. Guarda a versão NOSSA e a versão BASE (o commit do checkout) de cada
#      ficheiro alterado, fora da árvore.
#   3. Em cada tentativa: `git fetch --depth=1` + `git reset --hard FETCH_HEAD`
#      (o main mais recente) e repõe por cima as nossas alterações:
#        - o main não mexeu no ficheiro desde a base → fica a nossa versão;
#        - o main mexeu nele também → fusão a 3 (`git merge-file`), e um .json
#          fundido tem de continuar a ser JSON válido; se não der, o passo
#          FALHA (vermelho) em vez de deitar fora os dados de outro workflow;
#        - pathspecs `-o` (ours): a nossa versão ganha sempre (ficheiros que só
#          este workflow escreve, ou caches em que o mais recente manda);
#        - pathspecs `-g` (gerados/agregados): NÃO se repõem — correm-se os
#          comandos `-r` por cima do main + as nossas fontes, como manda o
#          CLAUDE.md («Conflitos de git nos ficheiros GERADOS»). Se o main não
#          avançou, repõem-se tal como estavam e não se regenera nada.
#   4. commit + `git push origin HEAD:<branch>`; se o push for recusado (outro
#      workflow empurrou entretanto), volta ao 3 — até N tentativas.
#
# Uso:
#   bash scripts/ci/push-generated.sh -m "mensagem" \
#        [-f família]... (agregador|major|tracking|ffgolf|pairings|simulador) \
#        [-g 'pathspec-gerado']... [-r 'comando de regeneração']... \
#        [-o 'pathspec-ours']... [-n tentativas] [-b branch] \
#        -- pathspec [pathspec...]
#
#   Os pathspecs -g e -o também têm de estar (ou estar cobertos) na lista
#   final — é ela que diz o que entra no commit.
#
# Saída: escreve `pushed=true|false` e `sha=<commit>` em $GITHUB_OUTPUT (se
# existir). Exit 0 = publicado ou nada a publicar; exit 1 = falhou (conflito
# real, regeneração falhou, ou push recusado N vezes).

set -uo pipefail

MSG=""
BRANCH="${GITHUB_REF_NAME:-main}"
TRIES=5
GEN=()
REGEN=()
OURS=()
PATHS=()

usage() { sed -n '2,40p' "$0" >&2; exit 64; }

# Famílias de ficheiros agregados: quem os gera e com que comando. Um só sítio
# — é a tabela «Conflitos de git nos ficheiros GERADOS» do CLAUDE.md.
#   -f agregador → kids2 (scripts/aggregator)
#   -f major     → catálogo MAJOR
#   -f tracking  → fpg-tournaments-tracking.json
#   -f ffgolf    → derivados FFG (índice, slim, roster FR)
#   -f pairings  → manuel-pairings.json (/draws)
#   -f simulador → simulador-players.json (/simulador)
family() {
  case "$1" in
    agregador)
      GEN+=('public/data/juniors.json' 'public/data/juniors-tournaments*.json'
            'public/data/tournament-catalog.json' 'public/data/hcp-listas-ligacoes.json'
            'public/data/juniors-form.json' 'public/data/juniors-scout.json')
      REGEN+=('node scripts/aggregator/index.js') ;;
    major)
      GEN+=('public/data/major-catalog.json' 'public/data/major-veterans.json')
      REGEN+=('node scripts/build-major-catalog.js') ;;
    tracking)
      GEN+=('public/data/fpg-tournaments-tracking.json')
      REGEN+=('node scripts/build-tournaments-tracking.js') ;;
    ffgolf)
      GEN+=('public/data/ffgolf-resultats-index.json' 'public/data/ffgolf-juniors-slim.json'
            'public/data/france-players.json' 'public/data/ffgolf-gg-twins.json'
            'public/data/ffgolf-player-tournaments.json')
      REGEN+=('node scripts/build-ffgolf-resultats-index.js'
              'node scripts/build-ffgolf-juniors-slim.js'
              'node scripts/build-france-players.js') ;;
    simulador)
      # Escrito pelo update-drive e pelo update-federados (Drive + cadastro).
      GEN+=('public/data/simulador-players.json')
      REGEN+=('node scripts/build-simulador-players.js') ;;
    pairings)
      # Se falhar, fica a versão do main (nada se perde) — não trava o push dos resultados.
      GEN+=('public/data/manuel-pairings.json')
      REGEN+=('node scripts/pairings-build.js || echo "::warning::pairings-build falhou — manuel-pairings.json fica como no main"') ;;
    *) echo "push-generated: família desconhecida: $1" >&2; exit 64 ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    -m) MSG="$2"; shift 2 ;;
    -f) family "$2"; shift 2 ;;
    -g) GEN+=("$2"); shift 2 ;;
    -r) REGEN+=("$2"); shift 2 ;;
    -o) OURS+=("$2"); shift 2 ;;
    -n) TRIES="$2"; shift 2 ;;
    -b) BRANCH="$2"; shift 2 ;;
    --) shift; PATHS=("$@"); break ;;
    -h|--help) usage ;;
    *) echo "push-generated: argumento desconhecido: $1" >&2; usage ;;
  esac
done

[ -n "$MSG" ] || { echo "push-generated: falta -m" >&2; exit 64; }
if [ ${#GEN[@]} -gt 0 ] && [ ${#REGEN[@]} -eq 0 ]; then
  echo "push-generated: -g sem -r — os gerados ficariam perdidos" >&2; exit 64
fi
# Os gerados entram sempre no commit (são regenerados sobre o main mais recente).
[ ${#GEN[@]} -gt 0 ] && PATHS+=("${GEN[@]}")
[ ${#PATHS[@]} -gt 0 ] || { echo "push-generated: faltam pathspecs depois de --" >&2; exit 64; }

out() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"; return 0; }

git config user.name  >/dev/null 2>&1 || git config user.name  "github-actions[bot]"
git config user.email >/dev/null 2>&1 || git config user.email "github-actions[bot]@users.noreply.github.com"

add_all() {
  local p
  for p in "${PATHS[@]}"; do git add -A -- "$p" 2>/dev/null || true; done
}

# Lista (uma por linha) dos ficheiros staged que batem nalgum dos pathspecs dados.
staged_matching() {
  [ $# -gt 0 ] || return 0
  git diff --staged --name-only --no-renames -- "$@"
}

in_list() { # in_list <ficheiro> <lista-com-quebras-de-linha>
  [ -n "$2" ] && printf '%s\n' "$2" | grep -qxF -- "$1"
}

add_all
if git diff --staged --quiet; then
  echo "ℹ️  Nada a publicar (nenhuma alteração nos pathspecs)."
  out "pushed=false"
  exit 0
fi

BASE=$(git rev-parse HEAD)
SAVE=$(mktemp -d)
CHANGED=$(git diff --staged --name-only --no-renames --diff-filter=d)
DELETED=$(git diff --staged --name-only --no-renames --diff-filter=D)
GEN_FILES=$(staged_matching "${GEN[@]+"${GEN[@]}"}")
OURS_FILES=$(staged_matching "${OURS[@]+"${OURS[@]}"}")
N_TOTAL=$(git diff --staged --name-only | wc -l | tr -d ' ')
echo "push-generated: ${N_TOTAL} ficheiros alterados (gerados a regenerar: $(printf '%s' "$GEN_FILES" | grep -c . || true))"

# Guardar a nossa versão e a da base.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  mkdir -p "$SAVE/ours/$(dirname "$f")" "$SAVE/base/$(dirname "$f")"
  cp "$f" "$SAVE/ours/$f"
  # a base só serve para a fusão a 3 — os -o e os gerados nunca se fundem
  if in_list "$f" "$OURS_FILES" || in_list "$f" "$GEN_FILES"; then continue; fi
  if git cat-file -e "$BASE:$f" 2>/dev/null; then git show "$BASE:$f" > "$SAVE/base/$f"; fi
done <<< "$CHANGED"

blob() { git rev-parse --verify -q "$1:$2" 2>/dev/null || echo "-"; }

json_ok() {
  case "$1" in
    *.json) node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null ;;
    *) return 0 ;;
  esac
}

# Põe a nossa alteração de um ficheiro por cima do FETCH_HEAD. 0 = ok, 1 = conflito.
apply_one() {
  local f="$1" deleted="$2"
  local b t
  b=$(blob "$BASE" "$f"); t=$(blob FETCH_HEAD "$f")
  if [ "$deleted" = "1" ]; then
    if [ "$t" = "-" ] || [ "$t" = "$b" ] || in_list "$f" "$OURS_FILES"; then
      git rm -q --cached --ignore-unmatch -- "$f"; rm -f -- "$f"; return 0
    fi
    echo "  ✗ $f: apagado aqui mas alterado no main entretanto"; return 1
  fi
  mkdir -p "$(dirname "$f")"
  if [ "$t" = "$b" ] || in_list "$f" "$OURS_FILES"; then
    cp "$SAVE/ours/$f" "$f"; return 0
  fi
  if [ "$t" != "-" ] && [ -f "$SAVE/base/$f" ]; then
    # o main também mexeu: fusão a 3 (o que um rebase faria, sem precisar de histórico)
    git show "FETCH_HEAD:$f" > "$SAVE/theirs.tmp"
    if git merge-file -q -p "$SAVE/ours/$f" "$SAVE/base/$f" "$SAVE/theirs.tmp" > "$SAVE/merged.tmp" 2>/dev/null \
       && cp "$SAVE/merged.tmp" "$f" && json_ok "$f"; then
      echo "  ↔ $f: fundido com alterações concorrentes do main"; return 0
    fi
    git checkout -q FETCH_HEAD -- "$f" 2>/dev/null || true
    echo "  ✗ $f: o main alterou as mesmas linhas — conflito real"; return 1
  fi
  if [ "$t" != "-" ] && cmp -s "$SAVE/ours/$f" <(git show "FETCH_HEAD:$f"); then
    return 0 # o main já tem exactamente isto
  fi
  echo "  ✗ $f: criado aqui e também no main, com conteúdo diferente"; return 1
}

for i in $(seq 1 "$TRIES"); do
  echo "── tentativa $i/$TRIES: sobre origin/$BRANCH"
  if ! git fetch -q --depth=1 origin "$BRANCH"; then
    echo "fetch falhou — retry em $((i * 5))s"; sleep $((i * 5)); continue
  fi
  HEAD_REMOTE=$(git rev-parse FETCH_HEAD)
  git reset -q --hard FETCH_HEAD

  CONFLICT=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if in_list "$f" "$GEN_FILES" && [ "$HEAD_REMOTE" != "$BASE" ]; then continue; fi
    if in_list "$f" "$GEN_FILES"; then cp "$SAVE/ours/$f" "$f"; continue; fi
    apply_one "$f" 0 || CONFLICT=1
  done <<< "$CHANGED"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if in_list "$f" "$GEN_FILES" && [ "$HEAD_REMOTE" != "$BASE" ]; then continue; fi
    apply_one "$f" 1 || CONFLICT=1
  done <<< "$DELETED"
  if [ "$CONFLICT" = "1" ]; then
    echo "❌ Conflito real com dados que outro workflow publicou entretanto — não se publica nada"
    echo "   para não apagar os dados dele. Corrigir à mão ou voltar a correr o workflow."
    git reset -q --hard FETCH_HEAD
    exit 1
  fi

  if [ "$HEAD_REMOTE" != "$BASE" ] && [ ${#REGEN[@]} -gt 0 ]; then
    for cmd in "${REGEN[@]}"; do
      echo "  ⟳ $cmd"
      bash -c "$cmd"; rc=$?
      # exit 2 = «nada a mudar» (convenção dos scripts do repo), não é erro
      if [ "$rc" != 0 ] && [ "$rc" != 2 ]; then echo "❌ Regeneração falhou (exit $rc): $cmd"; exit 1; fi
      # (o agregador também sai 2 quando a sanidade recusa gravar: fica a versão do main, que é coerente)
      [ "$rc" = 2 ] && echo "::warning::$cmd saiu 2 (nada a mudar ou gravação recusada) — os gerados ficam como no main"
    done
  fi

  add_all
  if git diff --staged --quiet; then
    echo "ℹ️  O main já tem estes dados — sem commit."
    out "pushed=false"
    exit 0
  fi
  git commit -q -m "$MSG"
  if git push -q origin "HEAD:$BRANCH"; then
    echo "✓ Publicado: $(git rev-parse --short HEAD) — $MSG"
    out "pushed=true"
    out "sha=$(git rev-parse HEAD)"
    exit 0
  fi
  echo "Push recusado (provável push concorrente) — retry em $((i * 5))s"
  sleep $((i * 5))
done

echo "❌ Push falhou após $TRIES tentativas"
exit 1
