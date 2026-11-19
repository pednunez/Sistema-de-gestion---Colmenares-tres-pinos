# Actualización visual · Colmenares Tres Pinos Mobile

## Cambios incluidos

- Nueva identidad visual alineada con la web: verde bosque, dorado y fondos cálidos.
- Logo oficial incorporado en el menú lateral y en el inicio de sesión.
- Icono de aplicación, iconos adaptativos de Android y favicon actualizados.
- Menú lateral móvil con espacio superior para la barra de estado y espacio inferior para la navegación del sistema.
- Botón **Cerrar sesión** ampliado y con mayor área táctil para facilitar su uso en teléfonos.
- Paleta centralizada en `theme.ts` para mantener consistencia entre los módulos.

## Archivos principales

- `App.tsx`: menú, marca, paleta, estados y zona inferior del menú.
- `Login.tsx`: logo y estilos de acceso.
- `AppAutenticado.tsx`: colores del contenedor y carga.
- `theme.ts`: tokens de color compartidos.
- `assets/`: logo oficial y recursos de marca.

## Qué se conservó

No se modificaron los servicios de autenticación, las rutas de API, SQLite, la cola de sincronización, los formularios ni la lógica de negocio. Los cambios son de presentación y adaptación de interfaz.

## Comprobación local

Desde esta carpeta (`mobile/`):

```powershell
npx tsc --noEmit
npx expo start -c
```

Probar en un teléfono Android y en una tablet, abriendo el menú lateral y comprobando que **Cerrar sesión** quede por encima de la barra de navegación del dispositivo.

Para generar un nuevo APK se debe ejecutar el flujo EAS que ya utiliza el proyecto, porque los cambios de logo, icono y código requieren una nueva compilación de la aplicación instalada.

> El archivo `.env` local no se incluye en este paquete. Se conserva el `.env` que ya existe en el equipo al copiar los cambios sobre la carpeta actual.
