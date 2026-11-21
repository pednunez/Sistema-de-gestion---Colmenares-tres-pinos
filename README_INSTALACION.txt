COLMENARES TRES PINOS | IMPLEMENTACIÓN INTEGRAL DEL MÓDULO COLMENAS

CONTENIDO
- ColmenasLocales.tsx.new: reemplazo completo del módulo móvil.
- instalar_colmenas.ps1: instalador de una sola ejecución.

INSTALACIÓN ÚNICA
1. Extrae el contenido del ZIP directamente en la raíz del repositorio:
   C:\Users\yarek\Repositorios\Sistema-de-gestion---Colmenares-tres-pinos

   Debe quedar el archivo instalar_colmenas.ps1 junto a las carpetas backend,
   frontend y mobile.

2. Abre PowerShell en esa raíz y ejecuta:

   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\instalar_colmenas.ps1

3. El instalador crea una carpeta de respaldo dentro de mobile y aplica todos
   los cambios de una vez. No borra datos de SQLite ni modifica el backend.

4. Comprueba el proyecto:

   cd mobile
   npx tsc --noEmit
   npx expo start -c

FUNCIONALIDADES INCLUIDAS
- Listado de colmenas con búsqueda, filtro por apiario y estado.
- Ficha modal desde el listado y apertura directa desde el Dashboard.
- Fecha de instalación, estado, cantidad de marcos y observaciones.
- Historial unificado de inspecciones, tratamientos y transferencias.
- Filtros de historial por tipo y rango de fechas.
- QR oficial desde el endpoint existente y cambio de etiqueta QR para ADMIN.
- Crear, editar y dar de baja colmenas para ADMIN.
- Caché SQLite del listado y del historial consultado.
- Fallback a catálogo e historial local cuando no hay conexión.
- Acceso desde la ficha a los flujos existentes de inspección y tratamientos.

NOTAS
- Las operaciones administrativas (crear, editar, baja y cambio QR) requieren
  conexión con FastAPI y rol ADMIN, tal como lo exige el backend.
- El backend no se modifica.
- El instalador modifica App.tsx, api/cliente.ts, api/colmenas.ts y reemplaza
  ColmenasLocales.tsx. Todos los archivos originales quedan respaldados.
- La imagen QR se muestra desde el endpoint autenticado del backend. La
  descarga como archivo no se incorpora porque el proyecto mobile actual no
  tiene una dependencia de almacenamiento/compartición de archivos instalada.
