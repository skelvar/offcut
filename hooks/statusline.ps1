# Offcut statusline — prints the current mode. Validates OFFCUT_STATE_DIR before use.
$ErrorActionPreference = 'Stop'

$dir = if ($env:OFFCUT_STATE_DIR) { $env:OFFCUT_STATE_DIR } else { Join-Path $HOME '.offcut' }

# Refuse paths with shell metacharacters (backslash is a normal path sep on Windows).
if ($dir -match '[`$!&|;<>(){}\[\]''"*]') {
  Write-Output 'offcut:?'
  exit 0
}

$active = Join-Path $dir 'active'
$default = Join-Path $dir 'default'
$mode = 'full'

if (Test-Path -LiteralPath $active) {
  $mode = (Get-Content -LiteralPath $active -Raw).Trim().ToLowerInvariant()
} elseif (Test-Path -LiteralPath $default) {
  $mode = (Get-Content -LiteralPath $default -Raw).Trim().ToLowerInvariant()
}

if ($mode -notin @('off', 'lite', 'full', 'strict')) {
  $mode = 'full'
}

Write-Output "offcut:$mode"
