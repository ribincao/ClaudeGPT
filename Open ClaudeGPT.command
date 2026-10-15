#!/bin/zsh
set -e
claudex_root="${0:A:h}"
cd "$claudex_root"
if [[ -x /opt/homebrew/bin/node ]]; then
  claudex_node=/opt/homebrew/bin/node
else
  claudex_node="$(command -v node)"
fi
"$claudex_node" web/scripts/service.mjs start
open http://localhost:4317
