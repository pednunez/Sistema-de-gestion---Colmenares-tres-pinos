$ErrorActionPreference = 'Stop'

$raiz = $PSScriptRoot
$mobile = Join-Path $raiz 'mobile'
$archivoNuevo = Join-Path $raiz 'ColmenasLocales.tsx.new'

$rutas = @(
    (Join-Path $mobile 'App.tsx'),
    (Join-Path $mobile 'ColmenasLocales.tsx'),
    (Join-Path $mobile 'api\cliente.ts'),
    (Join-Path $mobile 'api\colmenas.ts')
)

foreach ($ruta in $rutas) {
    if (-not (Test-Path $ruta -PathType Leaf)) {
        throw "No se encontró el archivo requerido: $ruta. Extrae el paquete en la raíz del repositorio."
    }
}
if (-not (Test-Path $archivoNuevo -PathType Leaf)) {
    throw "No se encontró ColmenasLocales.tsx.new junto al instalador."
}

$appPath = Join-Path $mobile 'App.tsx'
$clientePath = Join-Path $mobile 'api\cliente.ts'
$apiColmenasPath = Join-Path $mobile 'api\colmenas.ts'
$app = [System.IO.File]::ReadAllText($appPath).Replace("`r`n", "`n")
$cliente = [System.IO.File]::ReadAllText($clientePath)
$apiColmenas = [System.IO.File]::ReadAllText($apiColmenasPath)

$marcadorModulo = "else if (pantalla === 'colmenas-locales')"
$indiceModulo = $app.IndexOf($marcadorModulo, [System.StringComparison]::Ordinal)
if ($indiceModulo -lt 0) {
    throw 'No se encontró el bloque de ColmenasLocales en App.tsx. No se modificó ningún archivo.'
}
$bloqueCallback = @'
        onVerInspecciones={() => {
          setPantalla('mis-inspecciones');
        }}
'@
$bloqueCallback = $bloqueCallback.Replace("`r`n", "`n")
$indiceCallback = $app.IndexOf($bloqueCallback, $indiceModulo, [System.StringComparison]::Ordinal)
if ($indiceCallback -lt 0) {
    throw 'No se encontró el punto de integración de callbacks en App.tsx. No se modificó ningún archivo.'
}

$metodoAnterior = "method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';"
$metodoNuevo = "method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';"
if (-not $cliente.Contains($metodoAnterior) -and -not $cliente.Contains($metodoNuevo)) {
    throw 'No se encontró la definición esperada de OpcionesPeticion en api/cliente.ts. No se modificó ningún archivo.'
}

$backup = Join-Path $mobile ("_backup_colmenas_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item (Join-Path $mobile 'App.tsx') $backup
Copy-Item (Join-Path $mobile 'ColmenasLocales.tsx') $backup
Copy-Item $clientePath $backup
Copy-Item $apiColmenasPath $backup

# 1. Habilitar PUT en el cliente HTTP para el endpoint oficial de asociación QR.
if ($cliente.Contains($metodoAnterior)) {
    $cliente = $cliente.Replace($metodoAnterior, $metodoNuevo)
    [System.IO.File]::WriteAllText($clientePath, $cliente, [System.Text.UTF8Encoding]::new($false))
}

# 2. Añadir la operación QR al servicio de colmenas sin duplicarla.
if (-not $apiColmenas.Contains('export function asociarQrColmena')) {
    $helper = @'

// ASOCIAR UNA ETIQUETA QR EXISTENTE O GENERAR UNA NUEVA.
// codigoQr = null solicita al backend un UUID nuevo.
export function asociarQrColmena(
  id: number,
  codigoQr: string | null,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    `/colmenas/${id}/qr`,
    {
      method: 'PUT',
      body: { codigo_qr: codigoQr },
      token,
    }
  );
}
'@
    $apiColmenas += $helper
    [System.IO.File]::WriteAllText($apiColmenasPath, $apiColmenas, [System.Text.UTF8Encoding]::new($false))
}

# 3. Conectar la ficha con los flujos existentes de inspecciones y tratamientos.
$bloqueNuevo = @'
        onVerInspecciones={() => {
          setPantalla('mis-inspecciones');
        }}

        onInspeccionar={(colmenaId) => {
          void inspeccionarDesdeDashboard(colmenaId);
        }}

        onAbrirTratamientos={() => {
          setPantalla('tratamientos-locales');
        }}
'@
$app = $app.Remove($indiceCallback, $bloqueCallback.Length).Insert($indiceCallback, $bloqueNuevo)
[System.IO.File]::WriteAllText($appPath, $app, [System.Text.UTF8Encoding]::new($false))

# 4. Instalar el módulo completo.
Copy-Item $archivoNuevo (Join-Path $mobile 'ColmenasLocales.tsx') -Force

Write-Host ''
Write-Host 'Implementación integral del módulo Colmenas instalada.' -ForegroundColor Green
Write-Host "Respaldo de los archivos anteriores: $backup" -ForegroundColor Cyan
Write-Host ''
Write-Host 'Siguiente comprobación:' -ForegroundColor Yellow
Write-Host '  cd mobile'
Write-Host '  npx tsc --noEmit'
Write-Host '  npx expo start -c'
