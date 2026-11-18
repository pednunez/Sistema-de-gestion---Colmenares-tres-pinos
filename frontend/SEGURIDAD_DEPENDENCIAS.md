# Seguridad de las dependencias del frontend

Registro de los avisos de `npm audit` del frontend y de cómo se resolvió cada uno. Se revisa en cada sprint y antes de cada publicación.

## Estado al 18-11-2026

| Dónde | Avisos | Estado |
|---|---|---|
| Código que se publica (lo que llega al navegador) | 0 | Sin avisos |
| Herramientas de desarrollo (compilación, pruebas y revisión de código) | 0 | `npm audit` ya no informa avisos, pero RA-01 sigue abierto (ver abajo) |

Comando para revisarlo: `npm.cmd audit` (Windows) o `npm audit`, dentro de `frontend`.

## Corregidos

| Fecha | Aviso | Paquete | Cómo se corrigió |
|---|---|---|---|
| 18-11-2026 | GHSA-g3hv-75wg-m249 (moderado, 3 avisos) | `minimatch` 7.0.0 a 11.0.0, vía ESLint | ESLint actualizado de 10.11 a 10.15 |

## Riesgos aceptados

### RA-01 · `picomatch` ≤ 4.0.7: ReDoS con extglobs repetidos

- **Aviso:** [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), gravedad alta (CVSS 7.5), publicado el 19-10-2026.
- **Paquetes afectados (6 avisos):** `picomatch` y quienes lo usan: `fdir`, `tinyglobby`, `vite`, `vitest` y `@vitejs/plugin-react`.
- **Qué es:** un patrón de búsqueda de archivos armado a propósito puede dejar a `picomatch` calculando mucho tiempo (denegación de servicio por expresión regular).
- **Por qué no hay corrección:** el fallo afecta hasta la versión 4.0.7, que es la última publicada. La corrección está propuesta en el pull request micromatch/picomatch#194, pero todavía no sale en ninguna versión.
- **Por qué se acepta el riesgo:**
  - Solo lo usan Vite y Vitest para buscar archivos del proyecto al compilar, al correr `npm run dev` o al ejecutar las pruebas en el computador del desarrollador.
  - Para aprovecharlo, alguien tendría que escribir un patrón malicioso dentro de la configuración del proyecto. Los usuarios del sistema no pueden enviar nada que llegue ahí.
  - En el servidor publicado, Vite no corre: Nginx entrega los archivos ya compilados (`dist`), que no incluyen `picomatch`.
- **Lo que no se debe hacer:**
  - `npm audit fix --force`: baja Vite o Vitest a versiones antiguas, rompe el proyecto y no corrige el aviso.
  - Forzar con `overrides` el código sin publicar del pull request: incorpora código que nadie ha revisado ni publicado.
- **Cuándo se cierra:** apenas se publique `picomatch` 4.0.8 o superior. Se actualiza con `npm.cmd update picomatch`, se verifica con `npm.cmd audit`, `npm.cmd run lint`, `npm.cmd test` y `npm.cmd run build`, y se hace commit del `package-lock.json`.
- **Aceptado por:** Pedro Núñez (Product Owner y frontend), 18-11-2026.
- **Seguimiento 18-11-2026 (noche):** `npm audit` pasó a informar 0 avisos sin que cambiara ninguna dependencia: el proyecto sigue usando `picomatch` 4.0.7 y no existe una versión 4.0.8. El aviso sigue publicado, pero GitHub lo tiene como «no revisado» y sin rango de versiones afectadas, por eso `npm audit` dejó de detectarlo. **El riesgo no está corregido**: RA-01 sigue abierto y se cierra solo cuando se publique `picomatch` 4.0.8 o superior y se actualice como se indica arriba. Mientras tanto, revisar en cada sprint la página del aviso y `npm view picomatch version`.
