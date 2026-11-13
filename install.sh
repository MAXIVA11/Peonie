#!/usr/bin/env bash
# Peonie installer (Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/MAXIVA11/Peonie/main/install.sh | bash
# or from a clone:
#   ./install.sh            # full install (launcher + model)
#   ./install.sh model      # (re)build the Peonie model only
set -euo pipefail
MODE="${1:-all}"

PINK=$'\e[38;5;211m'; PURP=$'\e[38;5;141m'; DIM=$'\e[2m'; BOLD=$'\e[1m'
GRN=$'\e[32m'; YLW=$'\e[33m'; CYN=$'\e[36m'; RST=$'\e[0m'

banner() {
  printf '\n%s' "$PINK"
  cat <<'EOF'
   ____  _____ ___  _   _ ___ _____
  |  _ \| ____/ _ \| \ | |_ _| ____|
  | |_) |  _|| | | |  \| || ||  _|
  |  __/| |__| |_| | |\  || || |___
  |_|   |_____\___/|_| \_|___|_____|
EOF
  printf '%s  %sthe open-source cyber model . local . no tokens%s\n\n' "$RST" "$DIM" "$RST"
}
step() { printf '  %s[%s/%s]%s %s%s%s\n' "$PINK" "$1" "$2" "$RST" "$BOLD" "$3" "$RST"; }
ok()   { printf '        %sok%s  %s\n' "$GRN" "$RST" "$1"; }
info() { printf '        %s%s%s\n' "$DIM" "$1" "$RST"; }
warn() { printf '        %s! %s%s\n' "$YLW" "$1" "$RST"; }
row()  { local plain="$1" colored="$2" w=50 pad; pad=$(( w - ${#plain} )); (( pad < 0 )) && pad=0
         printf '  %s|%s %s%*s %s|%s\n' "$PURP" "$RST" "$colored" "$pad" '' "$PURP" "$RST"; }

banner

# Resolve repo root
if [ -d "$(dirname "$0")/models" ]; then
  ROOT="$(cd "$(dirname "$0")" && pwd)"
else
  ROOT="${HOME}/.local/share/Peonie"
  if [ -d "$ROOT/.git" ]; then git -C "$ROOT" pull --ff-only >/dev/null; else git clone --depth 1 https://github.com/MAXIVA11/Peonie "$ROOT" >/dev/null; fi
fi

TOTAL=4; [ "$MODE" = "model" ] && TOTAL=1

if [ "$MODE" != "model" ]; then
  step 1 "$TOTAL" "Prerequisites"
  command -v node >/dev/null || { warn "Node.js 18+ is required."; exit 1; }
  ok "node    $(command -v node)"
  if ! command -v ollama >/dev/null; then info "installing Ollama..."; curl -fsSL https://ollama.com/install.sh | sh >/dev/null; fi
  command -v ollama >/dev/null && ok "ollama  $(command -v ollama)" || warn "Ollama not found; build will be skipped."

  step 2 "$TOTAL" "Launcher"
  BIN_DIR="${HOME}/.local/bin"; mkdir -p "$BIN_DIR"
  LAUNCHER="${BIN_DIR}/peonie"
  cat > "$LAUNCHER" <<EOF
#!/bin/sh
exec node "${ROOT}/bin/peonie.mjs" "\$@"
EOF
  chmod +x "$LAUNCHER"
  ok "peonie -> $LAUNCHER"

  step 3 "$TOTAL" "PATH"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ok "already on PATH" ;;
    *) info "add to PATH:  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi

step "$TOTAL" "$TOTAL" "Model"
command -v ollama >/dev/null || { warn "Ollama not found; skipping model build."; exit 0; }
curl -fsS http://localhost:11434/api/version >/dev/null 2>&1 || { (ollama serve >/dev/null 2>&1 &) ; sleep 4; }

if ollama list | grep -q 'llama3.1:8b'; then
  info "building peonie from llama3.1:8b ..."
  ollama create peonie -f "${ROOT}/models/Modelfile" >/dev/null 2>&1
else
  info "downloading the base model (~5 GB). This happens once."
  ollama create peonie -f "${ROOT}/models/Modelfile"
fi
ok "built (base llama3.1:8b)"

BORDER="  ${PURP}+$(printf '%0.s-' $(seq 1 52))+${RST}"
printf '\n%s\n' "$BORDER"
row "Peonie is ready." "${GRN}${BOLD}Peonie is ready.${RST}"
row "" ""
row "peonie doctor   check tools, server, model" "${CYN}peonie doctor${RST}   check tools, server, model"
row "peonie claude   start on the local model" "${CYN}peonie claude${RST}   start on the local model"
printf '%s\n\n' "$BORDER"
