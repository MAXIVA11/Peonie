# Peonie installer (Windows / PowerShell)
#   irm https://raw.githubusercontent.com/MAXIVA11/Peonie/main/install.ps1 | iex
# or from a clone:
#   .\install.ps1            # full install (launcher + models)
#   .\install.ps1 models     # (re)build Peonie models only
param([string]$Mode = "all")
$ErrorActionPreference = "Stop"
$Pink = "`e[38;5;211m"; $Dim = "`e[2m"; $Rst = "`e[0m"; $Grn = "`e[32m"; $Ylw = "`e[33m"
function Say($m) { Write-Host "$Pink peonie $Rst $m" }

# Resolve the repo root (folder that holds bin/ and models/)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $Root "models"))) {
  # running via iex: clone into LOCALAPPDATA
  $Root = Join-Path $env:LOCALAPPDATA "Peonie"
  if (-not (Test-Path $Root)) { git clone --depth 1 https://github.com/MAXIVA11/Peonie $Root }
  else { git -C $Root pull --ff-only }
}

function Find-Ollama {
  $c = Get-Command ollama -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe")) { if (Test-Path $p) { return $p } }
  return $null
}

if ($Mode -ne "models") {
  # 1. Node check
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "${Ylw}Node.js 18+ is required. Install it, then re-run.${Rst}"; exit 1 }

  # 2. Ollama
  if (-not (Find-Ollama)) {
    Say "installing Ollama…"
    winget install --id Ollama.Ollama --exact --silent --accept-package-agreements --accept-source-agreements
  }

  # 3. Launcher: %USERPROFILE%\.local\bin\peonie.cmd  ->  node bin\peonie.mjs
  $BinDir = Join-Path $env:USERPROFILE ".local\bin"
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $Cli = Join-Path $Root "bin\peonie.mjs"
  $Node = (Get-Command node).Source
  $Launcher = Join-Path $BinDir "peonie.cmd"
  "@echo off`r`n`"$Node`" `"$Cli`" %*" | Set-Content -Encoding ASCII $Launcher
  Say "launcher -> $Launcher"

  # 4. PATH hint
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$BinDir;$userPath", 'User')
    Write-Host "${Ylw}Added $BinDir to your PATH. Open a new terminal to use 'peonie'.${Rst}"
  }
}

# 5. Build models
$Ol = Find-Ollama
if (-not $Ol) { Write-Host "${Ylw}Ollama not found; skipping model build.${Rst}"; exit 0 }
# ensure server
try { Invoke-WebRequest -UseBasicParsing http://localhost:11434/api/version -TimeoutSec 3 | Out-Null }
catch { Start-Process $Ol -ArgumentList "serve" -WindowStyle Hidden; Start-Sleep 4 }

$models = @(
  @{ tag = "peonie-code";  file = "Modelfile.code" },
  @{ tag = "peonie-cyber"; file = "Modelfile.cyber" },
  @{ tag = "peonie-sec";   file = "Modelfile.sec" }
)
foreach ($m in $models) {
  $mf = Join-Path $Root "models\$($m.file)"
  Say "building $($m.tag) $Dim(pulls base on first run)$Rst"
  & $Ol create $m.tag -f $mf
  if ($LASTEXITCODE -ne 0) { Write-Host "${Ylw}  build of $($m.tag) failed (base pull may be incomplete) — re-run: .\install.ps1 models${Rst}" }
}
Write-Host "${Grn}Peonie is ready.  Try:  peonie doctor   then   peonie claude${Rst}"
