#!/usr/bin/env bash
# Offcut statusline — prints the current mode only when activation actually ran.
# Absent/corrupt active never looks like a healthy mode name.
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

# No active file → activation never ran. Do not fall back to default.
if [[ ! -f "$active" ]]; then
  printf 'offcut:-\n'
  exit 0
fi

mode=$(tr -d '\r\n' < "$active" | tr '[:upper:]' '[:lower:]')

case "$mode" in
  off|lite|full|strict) printf 'offcut:%s\n' "$mode" ;;
  # Corrupt/unparseable — detectable, not silently "full".
  *) printf 'offcut:!\n' ;;
esac
