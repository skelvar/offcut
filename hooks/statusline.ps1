# Offcut statusline — prints the current mode only when activation actually ran.
# Absent/corrupt active never looks like a healthy mode name.
$ErrorActionPreference = 'Stop'

$dir = if ($env:OFFCUT_STATE_DIR) { $env:OFFCUT_STATE_DIR } else { Join-Path $HOME '.offcut' }

# Refuse paths with shell metacharacters (backslash is a normal path sep on Windows).
if ($dir -match '[`$!&|;<>(){}\[\]''"*]') {
  Write-Output 'offcut:?'
  exit 0
}

$active = Join-Path $dir 'active'

# No active file → activation never ran. Do not fall back to default.
if (-not (Test-Path -LiteralPath $active)) {
  Write-Output 'offcut:-'
  exit 0
}

$mode = (Get-Content -LiteralPath $active -Raw).Trim().ToLowerInvariant()

if ($mode -in @('off', 'lite', 'full', 'strict')) {
  Write-Output "offcut:$mode"
} else {
  # Corrupt/unparseable — detectable, not silently "full".
  Write-Output 'offcut:!'
}
