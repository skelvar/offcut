# Offcut statusline — prefers the mode for the session supplied on stdin.
# Absent/corrupt state never looks like a healthy mode name.
$ErrorActionPreference = 'Stop'

$dir = if ($env:OFFCUT_STATE_DIR) { $env:OFFCUT_STATE_DIR } else { Join-Path $HOME '.offcut' }

# Refuse paths with shell metacharacters (backslash is a normal path sep on Windows).
if ($dir -match '[`$!&|;<>(){}\[\]''"*]') {
  Write-Output 'offcut:?'
  exit 0
}

$active = Join-Path $dir 'active'
$selected = $active

# Status integrations may send JSON on stdin, including session_id. Keep the
# legacy active mirror for direct/manual invocation and compatibility.
try {
  $inputJson = if ([Console]::IsInputRedirected) { [Console]::In.ReadToEnd() } else { '' }
  if ($inputJson.Trim()) {
    $payload = $inputJson | ConvertFrom-Json
    $session = [regex]::Replace([string]$payload.session_id, '[^a-zA-Z0-9_-]', '')
    if ($session.Length -gt 64) { $session = $session.Substring(0, 64) }
    if ($session) {
      $scoped = Join-Path $dir "mode-$session"
      if (Test-Path -LiteralPath $scoped) {
        $selected = $scoped
      } else {
        $ownerPath = Join-Path $dir 'active-session'
        if (Test-Path -LiteralPath $ownerPath) {
          $owner = [regex]::Replace(
            (Get-Content -LiteralPath $ownerPath -Raw).Trim(),
            '[^a-zA-Z0-9_-]',
            ''
          )
          if ($owner -and $owner -ne $session) { $selected = $null }
        }
      }
    }
  }
} catch {
  # Malformed/absent status input falls back to the legacy active mirror.
}

# No matching state → activation never ran for this session. Do not fall back
# to another session's mode or to the persisted default.
if (-not $selected -or -not (Test-Path -LiteralPath $selected)) {
  Write-Output 'offcut:-'
  exit 0
}

$mode = (Get-Content -LiteralPath $selected -Raw).Trim().ToLowerInvariant()

if ($mode -in @('off', 'lite', 'full', 'strict')) {
  Write-Output "offcut:$mode"
} else {
  # Corrupt/unparseable — detectable, not silently "full".
  Write-Output 'offcut:!'
}
