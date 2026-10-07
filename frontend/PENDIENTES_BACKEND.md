# Pendientes del backend para el frontend de escritorio

Actualizado el 07-10-2026, después de integrar el login por cookie y el registro de marcos en la inspección.

## 1. Detalle por marco en la inspección (bloquea el guardado)

El frontend ya registra los 10 marcos de la cámara de cría y, si la colmena tiene alza, los 10 del alza. Hoy el backend ignora esos datos porque `InspeccionCreate` no los define, así que **no se guardan**.

`POST /inspecciones/` recibe, además de los campos actuales:

```json
{
  "cantidad_marcos": 19,
  "tiene_alza": true,
  "marcos": [
    { "ubicacion": "CAMARA_CRIA", "numero": 1, "contenido": "SOLO_CRIA", "transferido_a_colmena_id": 2 },
    { "ubicacion": "CAMARA_CRIA", "numero": 2, "contenido": "SIN_MARCO", "transferido_a_colmena_id": null },
    { "ubicacion": "ALZA", "numero": 1, "contenido": "SOLO_MIEL", "transferido_a_colmena_id": null }
  ]
}
```

- `ubicacion`: `CAMARA_CRIA` o `ALZA`.
- `numero`: 1 a 10.
- `contenido`: `MIEL_Y_CRIA`, `SOLO_CRIA`, `SOLO_MIEL`, `CERA_ESTIRADA`, `CERA_ESTAMPADA` o `SIN_MARCO` (posición sin marco).
- `cantidad_marcos`: marcos presentes al revisar (no cuenta `SIN_MARCO`). Va `null` y `marcos` va vacío si no se registró el detalle.
- Si se registra una caja, van sus 10 posiciones.

Falta también devolver `tiene_alza` y `marcos` en `InspeccionResponse`, para mostrar el detalle en el historial y permitir editarlo.

## 2. Transferencias dentro de la inspección

Hoy el frontend crea la inspección y después hace un `POST /transferencias-marcos/` por cada marco marcado con «Transferir» (cantidad 1). Funciona, pero:

- **No es atómico:** si una transferencia falla, la inspección ya quedó guardada. Lo ideal es que el backend cree las transferencias a partir de `marcos[].transferido_a_colmena_id` en la misma transacción de la inspección.
- **Sin vínculo:** el frontend envía `inspeccion_id`, `ubicacion`, `numero_marco` y `contenido` en cada transferencia, pero `TransferenciaMarcoCreate` no los define y se pierden. Por ahora el detalle queda como texto en `observaciones`.
- **Tipo de marco:** se traduce el contenido a `tipo_marco` así: cría o miel y cría → `CRIA`; solo miel → `MIEL`; cera estirada o estampada → `VACIO`.

Si el backend pasa a crear las transferencias, avisar para quitar esas llamadas del frontend y no duplicarlas.

## 3. Otros pendientes

- **Contenido del QR:** sigue apuntando a `/colmenas/qr/{uuid}` del backend, que devuelve JSON. Definirlo con el equipo móvil antes de imprimir etiquetas.
- **Elementos inactivos (RF-45):** los listados no permiten consultar registros dados de baja.
- **Nombres de usuarios para el apicultor:** `/usuarios` es solo para ADMIN, así que un apicultor ve "Usuario #id" como responsable de registros ajenos.
- **Paginación de colmenas:** la respuesta no incluye el total de registros.
- **Campos de inspección sin pantalla todavía:** `miel`, `alimentacion_suministrada` y `postura` ya existen en el backend; el frontend aún no los pide.
