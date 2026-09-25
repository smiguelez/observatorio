#!/bin/bash
# Levanta la SPA VIEJA (código de `src/` de la raíz, SIN modificar) en http://localhost:5180 con Firebase
# reemplazado por stubs con datos sintéticos, en un directorio temporal (no toca el repo).
# Uso: bash frontend/tests/visual/spa-vieja/run.sh [directorio-temporal]
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../../.." && pwd)"
DIR="${1:-/tmp/spa-vieja}"
rm -rf "$DIR" && mkdir -p "$DIR"
cp -r "$RAIZ/src" "$RAIZ/public" "$RAIZ/index.html" "$RAIZ/package.json" "$RAIZ/package-lock.json" \
      "$RAIZ/tailwind.config.js" "$RAIZ/postcss.config.js" "$DIR/"
cp "$AQUI/vite.config.js" "$DIR/vite.config.js"
cd "$DIR" && npm install --no-audit --no-fund >/dev/null
STUBS_DIR="$AQUI" exec npx vite --port 5180 --strictPort
