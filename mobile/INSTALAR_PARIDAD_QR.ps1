$ErrorActionPreference = "Stop"

$mobile = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $mobile

Write-Host "Instalando módulos compatibles con Expo SDK 58..." -ForegroundColor Cyan
npx expo install expo-camera expo-file-system expo-sharing

if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron instalar expo-file-system y expo-sharing."
}

Write-Host "`nComprobando TypeScript..." -ForegroundColor Cyan
npx tsc --noEmit

if ($LASTEXITCODE -ne 0) {
    throw "TypeScript detectó errores. No inicies Expo todavía."
}

Write-Host "`nInstalación y comprobación terminadas." -ForegroundColor Green
Write-Host "Para iniciar: npx expo start -c" -ForegroundColor Yellow
