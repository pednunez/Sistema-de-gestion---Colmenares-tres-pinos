# Colmenas Mobile: paridad de ficha e identificación QR

## Archivos modificados

- `ColmenasLocales.tsx`: filtros del listado, fecha de última inspección remota/local, descarga/exportación de QR, cambio de etiqueta mediante escaneo o ingreso manual, generación de código nuevo, detalle de inspección con marcos/tratamientos/transferencias, footer fijo y alertas con inspecciones avanzadas locales.
- `App.tsx`: pasa el ID de la colmena al módulo de tratamientos.
- `TratamientosLocales.tsx`: abre el formulario con la colmena seleccionada al entrar desde la ficha.
- `package.json` y `package-lock.json`: dependencias Expo SDK 58 para archivos y compartir.
- `app.json`: permiso y configuración del lector de códigos QR.

## Instalación en Windows

Abre PowerShell dentro de `mobile` y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\INSTALAR_PARIDAD_QR.ps1
```

El instalador ejecuta `npx expo install` para que npm resuelva las versiones compatibles con el Expo SDK del proyecto, actualice el lockfile y después comprueba TypeScript.

Si el script termina correctamente:

```powershell
npx expo start -c
```

No ejecutes esos comandos desde la raíz del repositorio: deben ejecutarse dentro de `mobile`.

## Comportamiento del QR

- **Descargar imagen** obtiene el PNG generado por FastAPI. En Android abre el selector de carpeta (elige `Download/Descargas`) y escribe el PNG. Si el selector se cancela o falla, abre la hoja de compartir. En iOS abre la hoja de compartir para guardar en Archivos o compartir.
- **Cambiar etiqueta** permite escanear una etiqueta QR impresa, pegar la URL/UUID si no se puede usar la cámara, o pedir al backend que genere un UUID nuevo.
- La asociación se realiza con `PUT /colmenas/{id}/qr`; la validación de unicidad sigue siendo responsabilidad de FastAPI.
- La app bloquea el cambio si hay inspecciones o tratamientos locales pendientes con el QR anterior, para evitar que queden registros sin asociación. Primero hay que sincronizarlos.
- La cámara solicita permiso al usuario. No se modifica el endpoint de QR ni la base de datos del backend.

## Pruebas manuales necesarias en teléfono

1. Abrir una ficha de colmena con conexión.
2. Pulsar **Descargar imagen** y comprobar que se creó un PNG válido en Descargas (Android) o que se puede guardar desde la hoja de compartir (iOS).
3. Pulsar **Cambiar etiqueta > Etiqueta ya impresa**, conceder cámara y escanear un QR libre. Comprobar que la ficha muestra el nuevo QR y que la web refleja el mismo UUID.
4. Probar un QR ya asociado a otra colmena: FastAPI debe rechazarlo y la app debe mostrar el error sin cerrar el modal.
5. Pulsar **Cambiar etiqueta > Generar código nuevo**. Comprobar que el código anterior deja de resolver y que el nuevo QR se puede descargar.
6. Abrir **Ver detalle** en una inspección del historial.
7. Desde el footer, registrar un tratamiento y confirmar que el formulario abre con esa colmena seleccionada.
8. Confirmar que la fecha de última inspección de cada tarjeta coincide con la web, aunque la inspección sea remota y no local.
9. Comprobar que las alertas consideran inspecciones avanzadas pendientes guardadas en SQLite.
10. Comprobar que las inspecciones avanzadas locales aparecen en el historial y cuentan para el filtro de atención.

## Nota de ejecución

El ZIP no incluye `node_modules` ni el entorno nativo del teléfono. Por eso la compilación TypeScript y la ejecución real de cámara/descarga deben confirmarse en el proyecto local después de instalar las dependencias. Expo Go incluye `expo-camera`, `expo-file-system` y `expo-sharing` en SDK 58; si la app se ejecuta con un development build propio, habrá que reconstruirlo para incorporar los módulos nativos y la configuración de cámara.
