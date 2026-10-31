$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$node = Get-Command node.exe -ErrorAction SilentlyContinue
$cloudflared = Get-Command cloudflared.exe -ErrorAction SilentlyContinue

if (-not $node) {
  throw "Node.js 24 or newer is required. Install Node.js, then try again."
}
$nodeMajor = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
  throw "RETURNO requires Node.js 24 or newer."
}
if (-not $cloudflared) {
  throw "cloudflared was not found. Install Cloudflare Tunnel, reopen this window, and try again."
}

# Read only PORT from .env; do not display or otherwise handle secret values.
$port = 3000
if ($env:PORT) {
  if ($env:PORT -notmatch '^\d+$') { throw "PORT must be a number between 1 and 65535." }
  $port = [int]$env:PORT
} elseif (Test-Path -LiteralPath (Join-Path $projectRoot ".env")) {
  $portLine = Get-Content -LiteralPath (Join-Path $projectRoot ".env") |
    Where-Object { $_ -match '^\s*PORT\s*=\s*\d+\s*$' } |
    Select-Object -First 1
  if ($portLine -match '^\s*PORT\s*=\s*(\d+)\s*$') {
    $port = [int]$Matches[1]
  }
}
if ($port -lt 1 -or $port -gt 65535) {
  throw "PORT must be between 1 and 65535."
}

$localUrl = "http://127.0.0.1:$port"
$serverProcess = $null
$previousCookieSecure = $env:COOKIE_SECURE
$previousOpenBrowser = $env:OPEN_BROWSER

try {
  # Public Quick Tunnel traffic uses HTTPS, so set the session cookie Secure.
  $env:COOKIE_SECURE = "true"
  $env:OPEN_BROWSER = "false"
  $serverProcess = Start-Process -FilePath $node.Source `
    -ArgumentList @("scripts/start.js") `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($serverProcess.HasExited) {
      throw "RETURNO stopped before becoming ready. Check your local setup and .env configuration."
    }
    try {
      $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2
      if ($health.service -eq "retorno") { $ready = $true; break }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ready) {
    throw "RETURNO did not become ready at $localUrl. Check whether that port is already in use."
  }

  Write-Host "RETURNO is ready. Starting a temporary Cloudflare link..." -ForegroundColor Green
  Write-Host "Share the https:// URL printed by cloudflared. Anyone with the link can reach sign-in and registration." -ForegroundColor Yellow
  Write-Host "Keep this window and your computer running. Press Ctrl+C to stop sharing." -ForegroundColor Yellow
  & $cloudflared.Source tunnel --url $localUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare Tunnel stopped with exit code $LASTEXITCODE."
  }
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $env:COOKIE_SECURE = $previousCookieSecure
  $env:OPEN_BROWSER = $previousOpenBrowser
}
