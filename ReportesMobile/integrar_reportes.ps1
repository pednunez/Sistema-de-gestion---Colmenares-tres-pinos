# Colmenares Tres Pinos: integra Reportes en la aplicación móvil.
# Ejecutar desde la carpeta ReportesMobile, después de descomprimir el ZIP
# dentro de la raíz del repositorio (sin modificar backend/frontend).
$ErrorActionPreference = 'Stop'

$origen = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $origen
$mobile = Join-Path $raiz 'mobile'
$appPath = Join-Path $mobile 'App.tsx'

if (-not (Test-Path -LiteralPath $appPath)) {
    throw "No encontré mobile\App.tsx en $raiz. Descomprime ReportesMobile en la raíz del repositorio."
}
foreach ($nombre in @('ReportesLocales.tsx', 'reportes.ts')) {
    if (-not (Test-Path -LiteralPath (Join-Path $origen $nombre))) {
        throw "Falta $nombre dentro de ReportesMobile."
    }
}

$texto = [System.IO.File]::ReadAllText($appPath)
$texto = $texto.Replace("`r`n", "`n")

function InsertarDespues([string]$actual, [string]$ancla, [string]$insercion, [string]$comprobacion) {
    if ($actual.Contains($comprobacion)) { return $actual }
    if (-not $actual.Contains($ancla)) {
        throw "No se encontró la sección de App.tsx: $ancla. No se modificó nada."
    }
    return $actual.Replace($ancla, $ancla + $insercion)
}

function InsertarAntes([string]$actual, [string]$ancla, [string]$insercion, [string]$comprobacion) {
    if ($actual.Contains($comprobacion)) { return $actual }
    if (-not $actual.Contains($ancla)) {
        throw "No se encontró la sección de App.tsx: $ancla. No se modificó nada."
    }
    return $actual.Replace($ancla, $insercion + $ancla)
}

$texto = InsertarDespues $texto "import StockLocales from './StockLocales';" "`nimport ReportesLocales from './ReportesLocales';" "import ReportesLocales from './ReportesLocales';"
$texto = InsertarDespues $texto "  | 'stock-locales'" "`n  | 'reportes-locales'" "  | 'reportes-locales'"
$texto = InsertarDespues $texto "  | 'stock'" "`n  | 'reportes'" "  | 'reportes'"

$menu = @'
  {
    id: 'reportes',
    nombre: 'Reportes',
    icono: '📑',
    roles: SOLO_ADMIN,
    destino: 'reportes-locales',
    disponible: true,
  },

'@
$texto = InsertarAntes $texto "  {`n    id: 'qr'," ($menu + "`n") "    id: 'reportes',"

$texto = InsertarDespues $texto "    case 'stock-locales':`n      return 'stock';" "`n`n    case 'reportes-locales':`n      return 'reportes';" "    case 'reportes-locales':"

$render = @'
  // REPORTES
  else if (pantalla === 'reportes-locales') {
    contenido = (
      <ReportesLocales
        onVolver={volverInicio}
        rol={usuario.rol}
      />
    );
  }

'@
$texto = InsertarAntes $texto "  // AUDITORÍA`n  else if (pantalla === 'auditoria')" ($render + "`n") "else if (pantalla === 'reportes-locales')"

$marca = Get-Date -Format 'yyyyMMdd-HHmmss'
$copia = "$appPath.bak-reportes-$marca"
Copy-Item -LiteralPath $appPath -Destination $copia
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($appPath, $texto.Replace("`n", "`r`n"), $utf8)
Copy-Item -LiteralPath (Join-Path $origen 'ReportesLocales.tsx') -Destination (Join-Path $mobile 'ReportesLocales.tsx') -Force
Copy-Item -LiteralPath (Join-Path $origen 'reportes.ts') -Destination (Join-Path $mobile 'api\reportes.ts') -Force

Write-Host 'Reportes integrado en el menú móvil.' -ForegroundColor Green
Write-Host "Respaldo: $copia"
Write-Host 'Ahora ejecuta: cd mobile; npx expo install expo-file-system expo-sharing; npx tsc --noEmit; npx expo start -c'
