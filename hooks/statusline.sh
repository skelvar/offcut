#!/usr/bin/env bash
# Offcut statusline — prefers the mode for the session supplied on stdin.
# Absent/corrupt state never looks like a healthy mode name.
set -euo pipefail

dir="${OFFCUT_STATE_DIR:-$HOME/.offcut}"

# Refuse paths with shell metacharacters before embedding in any command.
case "$dir" in
  *[\`\$\!\&\|\;\<\>\(\)\{\}\[\]\'\"*]*)
    printf 'offcut:?\n'
    exit 0
    ;;
esac

active="$dir/active"
selected="$active"

# Status integrations may send JSON on stdin, including session_id. Parse only
# that bounded identifier without requiring jq; direct/manual invocation keeps
# using the legacy active mirror.
input=''
if [[ ! -t 0 ]]; then
  input=$(cat 2>/dev/null || true)
fi
session=$(
  printf '%s' "$input" |
    tr '\r\n' '  ' |
    sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n 1 |
    tr -cd 'a-zA-Z0-9_-'
)
session=${session:0:64}
if [[ -n "$session" ]]; then
  scoped="$dir/mode-$session"
  if [[ -f "$scoped" ]]; then
    selected="$scoped"
  elif [[ -f "$dir/active-session" ]]; then
    owner=$(tr -cd 'a-zA-Z0-9_-' < "$dir/active-session" | head -c 64)
    if [[ -n "$owner" && "$owner" != "$session" ]]; then
      selected=""
    fi
  fi
fi

# No matching state → activation never ran for this session. Do not fall back
# to another session's mode or to the persisted default.
if [[ -z "$selected" || ! -f "$selected" ]]; then
  printf 'offcut:-\n'
  exit 0
fi

mode=$(tr -d '\r\n' < "$selected" | tr '[:upper:]' '[:lower:]')

case "$mode" in
  off|lite|full|strict) printf 'offcut:%s\n' "$mode" ;;
  # Corrupt/unparseable — detectable, not silently "full".
  *) printf 'offcut:!\n' ;;
esac
