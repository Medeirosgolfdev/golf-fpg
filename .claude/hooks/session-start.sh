#!/bin/bash
#
# SessionStart — prepara o contentor das sessões Claude Code na web.
#
# Objectivo: quando a sessão arranca, `npm test`, `npm run typecheck`,
# `npm run build` e `npm run dev` funcionam sem mais nenhum passo manual.
#
# Só corre em ambiente remoto: em local o node_modules já existe e não vale a
# pena atrasar o arranque.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# O contentor já traz o Chromium em /opt/pw-browsers; sem isto o postinstall do
# pacote `playwright` volta a descarregar ~200 MB de browsers a cada sessão.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1'
    echo 'export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers'
  } >> "$CLAUDE_ENV_FILE"
fi

# `npm install` e não `npm ci`: o estado do contentor é cacheado depois do hook,
# e o install reaproveita o node_modules que já lá esteja. O `npm ci` apagava-o
# sempre e obrigava a uma instalação completa a cada arranque.
echo "[session-start] npm install…"
npm install --no-audit --no-fund

echo "[session-start] pronto — node $(node -v), npm $(npm -v)"
