#!/usr/bin/env bash
# Changelog da sprint em formato WhatsApp depois do deploy do beta (pedido do PO, 2026-10-21).
# PostToolUse do Bash: dispara quando a saída de um comando traz o "no ar: https://..." que o
# deploy/vps/install.sh só imprime com todos os containers saudáveis (direto ou lendo o log de um
# deploy em segundo plano). Confere a versão servida contra o package.json e lembra a última
# versão já anunciada, para não pedir o mesmo changelog duas vezes.
set -u
dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
state="$dir/.claude/hooks/.changelog-version"
out=$(jq -r '.tool_response | tostring' 2>/dev/null) || exit 0
url=$(printf '%s' "$out" | grep -oE 'no ar: https://[A-Za-z0-9.-]+' | tail -1 | sed 's/^no ar: //')
[ -n "$url" ] || exit 0
expected=$(jq -r .version "$dir/package.json" 2>/dev/null)
[ "$expected" = "$(cat "$state" 2>/dev/null)" ] && exit 0
live=$(curl -fsS --max-time 15 "$url/api/openapi.json" 2>/dev/null | jq -r '.info.version' 2>/dev/null)
if [ "$live" != "$expected" ]; then
  jq -n --arg m "Deploy terminou, mas $url serve a versão '${live:-?}' e o repositório está na $expected: confira o servidor antes do changelog." \
    '{systemMessage: $m, hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
  exit 0
fi
printf '%s\n' "$expected" > "$state"
jq -n --arg v "$expected" --arg u "$url" '{
  systemMessage: ("Versão " + $v + " no ar em " + $u + ": gerando o changelog da sprint."),
  hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: ("A versão " + $v + " está no ar e saudável em " + $u + ". Gere agora o changelog da sprint que entrou nessa versão (cards do quadro do PLAN com Sprint dessa versão e os commits desde a tag anterior), para a comunidade de jogadores: em português, formato WhatsApp (*negrito*, _itálico_, emojis com moderação, itens com •, frases curtas, nada de jargão técnico nem números de card), título com a versão, agrupado em novidades e correções, fechando com o link " + $u + ". Entregue o texto pronto para colar, num bloco de código, e não peça confirmação antes.")}
}'
