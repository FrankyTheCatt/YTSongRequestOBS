param(
  [string]$Version = "",
  [string]$NodeVersion = ""
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackageJson = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json

if (-not $Version) {
  $Version = $PackageJson.version
}

if (-not $NodeVersion) {
  $NodeVersion = (& node -p "process.version.slice(1)").Trim()
}

$ReleaseName = "YTSongRequestOBS-$Version-windows"
$DistDir = Join-Path $Root "dist"
$StageDir = Join-Path $DistDir $ReleaseName
$ZipPath = Join-Path $DistDir "$ReleaseName.zip"
$CacheDir = Join-Path $DistDir ".cache"
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeZipPath = Join-Path $CacheDir $NodeZipName
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
$NodeExtractDir = Join-Path $CacheDir "node-v$NodeVersion-win-x64"

function Copy-ProjectItem {
  param(
    [string]$Name
  )

  $Source = Join-Path $Root $Name
  $Target = Join-Path $StageDir $Name

  if (Test-Path $Source) {
    Copy-Item $Source $Target -Recurse -Force
  }
}

New-Item -ItemType Directory -Force -Path $DistDir, $CacheDir | Out-Null

if (Test-Path $StageDir) {
  Remove-Item $StageDir -Recurse -Force
}

if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}

New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  throw "No existe node_modules. Ejecuta npm install antes de crear el release."
}

if (-not (Test-Path $NodeZipPath)) {
  Write-Host "Descargando Node.js portable $NodeVersion..."
  Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath
}

if (-not (Test-Path $NodeExtractDir)) {
  Write-Host "Extrayendo Node.js portable..."
  Expand-Archive -Path $NodeZipPath -DestinationPath $CacheDir -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $StageDir "runtime") | Out-Null
Copy-Item (Join-Path $NodeExtractDir "*") (Join-Path $StageDir "runtime") -Recurse -Force

Copy-ProjectItem ".env.example"
Copy-ProjectItem "README.md"
Copy-ProjectItem "package.json"
Copy-ProjectItem "package-lock.json"
Copy-ProjectItem "node_modules"
Copy-ProjectItem "src"
Copy-ProjectItem "scripts"
Copy-ProjectItem "public"
Copy-ProjectItem "extensions"
Copy-ProjectItem "mizuki-mizuki-akiyama (1).gif"

@'
@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" copy ".env.example" ".env" > nul
notepad ".env"
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "config.bat")

@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%CD%\runtime;%PATH%"
"%CD%\runtime\node.exe" "%CD%\scripts\youtube-auth.js"
if errorlevel 1 (
  echo.
  echo Error ejecutando auth-youtube.bat
  echo Revisa que credentials.json exista en esta carpeta.
)
pause
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "auth-youtube.bat")

@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%CD%\runtime;%PATH%"
"%CD%\runtime\node.exe" "%CD%\src\check-config.js"
if errorlevel 1 (
  echo.
  echo Error ejecutando check-config.bat
  echo Revisa .env, credentials.json y token.json.
)
pause
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "check-config.bat")

@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%CD%\runtime;%PATH%"
"%CD%\runtime\node.exe" "%CD%\src\bot.js"
if errorlevel 1 (
  echo.
  echo Error ejecutando start.bat
  echo Revisa .env, credentials.json, token.json y que el puerto 8787 este libre.
)
pause
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "start.bat")

@'
@echo off
setlocal
start "" "http://127.0.0.1:8787/now"
start "" "http://127.0.0.1:8787/now-config"
start "" "http://127.0.0.1:8787/queue"
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "open-panels.bat")

@'
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%CD%\runtime;%PATH%"
echo Probando runtime portable...
"%CD%\runtime\node.exe" -v
echo.
echo Si ves una version de Node arriba, los .bat pueden ejecutar Node.
pause
endlocal
'@ | Set-Content -Encoding ASCII (Join-Path $StageDir "test-runtime.bat")

@'
YT Song Request OBS - Portable Windows
======================================

Este ZIP incluye Node.js portable. No necesitas instalar npm ni Node.

Primer uso:

1. Extrae el ZIP completo. No lo ejecutes dentro del ZIP.
2. Ejecuta test-runtime.bat.
3. Ejecuta config.bat y rellena .env.
4. Guarda tu credentials.json en esta misma carpeta.
5. Ejecuta auth-youtube.bat para crear token.json.
6. Ejecuta check-config.bat.
7. Ejecuta start.bat.

Links cuando start.bat esta abierto:

- Overlay OBS: http://127.0.0.1:8787/now
- Config overlay: http://127.0.0.1:8787/now-config
- Panel cola: http://127.0.0.1:8787/queue

Extension:

1. Abre chrome://extensions o edge://extensions.
2. Activa Developer mode / Modo desarrollador.
3. Load unpacked / Cargar descomprimida.
4. Selecciona extensions/youtube-session-player.
5. Abre una pestana de YouTube con tu cuenta iniciada.

Importante:

- No compartas tu .env, credentials.json ni token.json.
- Cada streamer debe usar sus propias credenciales de Twitch y YouTube.
- Si cambias PLAYER_PORT, tambien debes cambiarlo en la extension.
'@ | Set-Content -Encoding UTF8 (Join-Path $StageDir "README-PORTABLE.txt")

Write-Host "Comprimiendo release..."
Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "Release listo:"
Write-Host $ZipPath
