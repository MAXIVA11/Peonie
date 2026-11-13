#!/usr/bin/env bash
# Peonie installer (Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/MAXIVA11/Peonie/main/install.sh | bash
# or from a clone:
#   ./install.sh            # full install (launcher + models)
#   ./install.sh models     # (re)build Peonie models only
set -euo pipefail
MODE="${1:-all}"
PINK=$'\e[38;5;211m'; DIM=$'\e[2m'; RST=$'\e[0m'; GRN=$'\e[32m'; YLW=$'\e[33m'
say() { printf '%s peonie %s %s\n' "$PINK" "$RST" "$1"; }

# Resolve repo root
if [ -d "$(dirname "$0")/models" ]; then
  ROOT="$(cd "$(dirname "$0")" && pwd)"
else
  ROOT="${HOME}/.local/share/Peonie"
  if [ -d "$ROOT/.git" ]; then git -C "$ROOT" pull --ff-only; else git clone --depth 1 https://github.com/MAXIVA11/Peonie "$ROOT"; fi
fi

if [ "$MODE" != "models" ]; then
  command -v node >/dev/null || { echo "${YLW}Node.js 18+ is required.${RST}"; exit 1; }
  if ! command -v ollama >/dev/null; then say "installing Ollama…"; curl -fsSL https://ollama.com/install.sh | sh; fi

  BIN_DIR="${HOME}/.local/bin"; mkdir -p "$BIN_DIR"
  LAUNCHER="${BIN_DIR}/peonie"
  cat > "$LAUNCHER" <<EOF
#!/bin/sh
exec node "${ROOT}/bin/peonie.mjs" "\$@"
EOF
  chmod +x "$LAUNCHER"
  say "launcher -> $LAUNCHER"
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "${YLW}Add $BIN_DIR to PATH:  export PATH=\"\$HOME/.local/bin:\$PATH\"${RST}";; esac
fi

command -v ollama >/dev/null || { echo "${YLW}Ollama not found; skipping model build.${RST}"; exit 0; }
curl -fsS http://localhost:11434/api/version >/dev/null 2>&1 || { (ollama serve >/dev/null 2>&1 &) ; sleep 4; }

build() { say "building $1 ${DIM}(pulls base on first run)${RST}"; ollama create "$1" -f "${ROOT}/models/$2" || echo "${YLW}  $1 failed — re-run: ./install.sh models${RST}"; }
build peonie-code  Modelfile.code
build peonie-cyber Modelfile.cyber
build peonie-sec   Modelfile.sec
echo "${GRN}Peonie is ready.  Try:  peonie doctor   then   peonie claude${RST}"
