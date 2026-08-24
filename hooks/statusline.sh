#!/usr/bin/env bash
# Offcut statusline — prints the current mode. Validates OFFCUT_STATE_DIR before use.
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
default="$dir/default"
mode="full"

if [[ -f "$active" ]]; then
  mode=$(tr -d '\r\n' < "$active" | tr '[:upper:]' '[:lower:]')
elif [[ -f "$default" ]]; then
  mode=$(tr -d '\r\n' < "$default" | tr '[:upper:]' '[:lower:]')
fi

case "$mode" in
  off|lite|full|strict) printf 'offcut:%s\n' "$mode" ;;
  *) printf 'offcut:full\n' ;;
esac
