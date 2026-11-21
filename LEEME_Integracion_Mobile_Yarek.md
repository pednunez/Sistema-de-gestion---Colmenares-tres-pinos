# Integración móvil de Yarek sobre main

Este paquete integra únicamente archivos de `mobile/` sobre el commit oficial `f261842` de `main`. No modifica `backend/` ni `frontend/`. El parche fue comprobado contra la copia de `main` aportada por Yarek.

## Contenido

- `Integracion_Mobile_Main_Yarek.patch`: parche Git para aplicar en la rama local `integration/mobile-yarek-20261113`.
- Se incorporan los módulos de apiarios, auditoría, stock, transferencias, usuarios, tutorial por rol y sincronización de tratamientos.
- Se integran las versiones móviles de App, autenticación, dashboard, historial de inspecciones y tratamientos.
- Se conserva `RevisionesGrupos` de main. La opción de navegación está oculta por defecto para respetar el alcance móvil confirmado; se puede habilitar solo si el equipo lo aprueba con `EXPO_PUBLIC_ENABLE_REVISIONES_GRUPOS=true` en `mobile/.env`.

## Antes de aplicar

1. Guardar o respaldar los cambios sin guardar en VS Code.
2. Verificar que el repositorio esté en la rama `integration/mobile-yarek-20261113`, basada en `f261842`.
3. No continuar si hay modificaciones a archivos versionados que no se hayan revisado. Los archivos `.txt` y ZIP auxiliares sin seguimiento pueden permanecer.
4. Descargar el parche y colocarlo, por ejemplo, en Descargas. Usar la ruta real en los comandos.

```powershell
cd C:\Users\yarek\Repositorios\Sistema-de-gestion---Colmenares-tres-pinos
git branch --show-current
git status --short
git log -1 --oneline
git apply --check "$env:USERPROFILE\Downloads\Integracion_Mobile_Main_Yarek.patch"
```

Si el último comando devuelve un error, **no forzar la aplicación**. Enviar la salida para revisar por qué cambió la base o algún archivo.

## Aplicar y verificar

```powershell
git apply --whitespace=nowarn "$env:USERPROFILE\Downloads\Integracion_Mobile_Main_Yarek.patch"
git status --short
git -c core.whitespace=cr-at-eol diff --check
cd mobile
npx tsc --noEmit
npx expo lint
cd ..
```

Si `npx expo lint` solicita instalar herramientas o crear configuración, consultar al equipo antes de aceptar cambios adicionales en dependencias. No dar el trabajo por terminado sin verificar TypeScript.

## Pruebas funcionales pendientes en el dispositivo

- Iniciar sesión y cerrar sesión con ADMIN y APICULTOR, verificando los permisos y que no aparezcan datos del usuario anterior.
- Abrir, cerrar y reabrir el tutorial. Comprobar que la primera apertura se recuerda por usuario.
- Leer un QR oficial de una colmena y comparar su UUID con el catálogo.
- Guardar una inspección sin red, cerrar y reabrir la app, y comprobar persistencia.
- Registrar un tratamiento asociado a esa inspección sin red; al reconectar, sincronizar primero la inspección y después el tratamiento.
- Verificar desde FastAPI/web que se conservan `colmena_id`, `inspeccion_id`, usuario y `id_cliente`.
- Repetir la sincronización y comprobar que no se crean duplicados.
- Comprobar auditoría, transferencias, stock, menú por rol y cierre del panel lateral.
- Si se decide usar revisiones por grupo, habilitar la bandera localmente y probar el acceso; de lo contrario, mantenerla deshabilitada.

## Commit y subida (solo tras pasar las pruebas)

```powershell
git add mobile
git -c core.whitespace=cr-at-eol diff --cached --check
git diff --cached --stat
git commit -m "feat(mobile): integrar modulos offline y tutorial sobre main"
git push -u origin integration/mobile-yarek-20261113
```

No usar `git add .`, ya que hay archivos de diagnóstico y dos ZIP auxiliares que no deben formar parte del commit. No fusionar ni desplegar directamente en `main` o producción; José debe revisar el resultado y la compatibilidad final.

## Validaciones realizadas al preparar el parche

- Se compararon las dos versiones compartidas de la aplicación y los contratos de FastAPI de main.
- Se comprobó que el parche aplica limpiamente sobre el ZIP oficial de `main`.
- Se verificaron las referencias de archivos importados de forma relativa (130 referencias, sin destinos faltantes).
- No se modificó ningún archivo de backend ni frontend.
- **No se ejecutó TypeScript ni pruebas en dispositivo**: no hay paquetes de Expo instalados en el entorno de preparación y `npm ci --offline` no pudo obtener la caché necesaria. La aceptación queda condicionada a ejecutar las pruebas indicadas arriba.
