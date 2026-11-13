# Peonie installer (Windows / PowerShell)
#   irm https://raw.githubusercontent.com/MAXIVA11/Peonie/main/install.ps1 | iex
# or from a clone:
#   .\install.ps1            # full install (launcher + model)
#   .\install.ps1 model      # (re)build the Peonie model only
param([string]$Mode = "all")
$ErrorActionPreference = "Stop"

# [char]27 (ESC) works in both Windows PowerShell 5.1 and PowerShell 7.
# The `e escape only exists in 7, so 5.1 would print a literal "e[..m".
$ESC  = [char]27
$Pink = "$ESC[38;5;211m"; $Purp = "$ESC[38;5;141m"; $Dim = "$ESC[2m"
$Grn  = "$ESC[32m"; $Ylw = "$ESC[33m"; $Cyn = "$ESC[36m"; $Bold = "$ESC[1m"; $Rst = "$ESC[0m"

function Show-Banner {
  $art = @'
   ____  _____ ___  _   _ ___ _____
  |  _ \| ____/ _ \| \ | |_ _| ____|
  | |_) |  _|| | | |  \| || ||  _|
  |  __/| |__| |_| | |\  || || |___
  |_|   |_____\___/|_| \_|___|_____|
'@
  Write-Host ""
  Write-Host "$Pink$art$Rst"
  Write-Host "  ${Dim}the open-source cyber model . local . no tokens$Rst"
  Write-Host ""
}
function Step($n, $total, $msg) { Write-Host "  ${Pink}[$n/$total]$Rst $Bold$msg$Rst" }
function Ok($msg)   { Write-Host "        ${Grn}ok$Rst  $msg" }
function Info($msg) { Write-Host "        $Dim$msg$Rst" }
function Warn($msg) { Write-Host "        ${Ylw}! $msg$Rst" }

function Find-Ollama {
  $c = Get-Command ollama -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe")) { if (Test-Path $p) { return $p } }
  return $null
}

Show-Banner

# Resolve the repo root (folder that holds bin/ and models/)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $Root "models"))) {
  $Root = Join-Path $env:LOCALAPPDATA "Peonie"
  if (-not (Test-Path $Root)) { git clone --depth 1 https://github.com/MAXIVA11/Peonie $Root | Out-Null }
  else { git -C $Root pull --ff-only | Out-Null }
}

$total = if ($Mode -eq "model") { 1 } else { 4 }

if ($Mode -ne "model") {
  # 1. Prerequisites
  Step 1 $total "Prerequisites"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn "Node.js 18+ is required. Install it, then re-run."; exit 1 }
  Ok "node    $((Get-Command node).Source)"
  $Ol = Find-Ollama
  if (-not $Ol) {
    Info "installing Ollama (winget)..."
    winget install --id Ollama.Ollama --exact --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $Ol = Find-Ollama
  }
  if ($Ol) { Ok "ollama  $Ol" } else { Warn "Ollama not found after install; build will be skipped." }

  # 2. Launcher
  Step 2 $total "Launcher"
  $BinDir = Join-Path $env:USERPROFILE ".local\bin"
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $Cli = Join-Path $Root "bin\peonie.mjs"
  $Node = (Get-Command node).Source
  $Launcher = Join-Path $BinDir "peonie.cmd"
  "@echo off`r`n`"$Node`" `"$Cli`" %*" | Set-Content -Encoding ASCII $Launcher
  Ok "peonie -> $Launcher"

  # 3. PATH
  Step 3 $total "PATH"
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$BinDir;$userPath", 'User')
    Ok "added $BinDir"
    Info "open a new terminal for 'peonie' to be on PATH"
  } else { Ok "already on PATH" }
}

# 4. Model
Step $total $total "Model"
$Ol = Find-Ollama
if (-not $Ol) { Warn "Ollama not found; skipping model build."; exit 0 }
try { Invoke-WebRequest -UseBasicParsing http://localhost:11434/api/version -TimeoutSec 3 | Out-Null }
catch { Start-Process $Ol -ArgumentList "serve" -WindowStyle Hidden; Start-Sleep 4 }

$mf = Join-Path $Root "models\Modelfile"
$basePresent = @(& $Ol list) -match 'qwen3-coder:30b'
# Native stderr merged with 2>&1 becomes a terminating error under -EA Stop,
# so relax the preference just around the build and drive it off $LASTEXITCODE.
$prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
if ($basePresent) {
  Info "building peonie from qwen3-coder:30b ..."
  & $Ol create peonie -f $mf 2>&1 | Out-Null
} else {
  Info "downloading the base model (~18 GB). This happens once."
  & $Ol create peonie -f $mf 2>&1 | Where-Object { $_ -match 'pulling|%|success|error' }
}
$buildRc = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($buildRc -eq 0) { Ok "built (base qwen3-coder:30b)" }
else { Warn "build failed (base pull may be incomplete). Re-run: .\install.ps1 model"; exit 1 }

# Done panel (padded by visible width; ANSI codes have zero display width)
$W = 50
$border = "  $Purp+" + ('-' * ($W + 2)) + "+$Rst"
function Row($plain, $colored) {
  $pad = $W - $plain.Length; if ($pad -lt 0) { $pad = 0 }
  Write-Host ("  $Purp|$Rst " + $colored + (' ' * $pad) + " $Purp|$Rst")
}
Write-Host ""
Write-Host $border
Row "Peonie is ready." "${Grn}${Bold}Peonie is ready.$Rst"
Row "" ""
Row "peonie doctor   check tools, server, model" "${Cyn}peonie doctor$Rst   check tools, server, model"
Row "peonie claude   start on the local model" "${Cyn}peonie claude$Rst   start on the local model"
Write-Host $border
Write-Host ""
