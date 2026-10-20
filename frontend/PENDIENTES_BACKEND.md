# Pendientes del backend para el frontend de escritorio

Actualizado el 20-10-2026, al iniciar el módulo Stock (sección 5).

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
- `contenido`: `MIEL_Y_CRIA`, `SOLO_CRIA`, `SOLO_MIEL`, `CERA_ESTIRADA`, `CERA_ESTAMPADA`, `CERA_UNTADA` o `SIN_MARCO` (posición sin marco).
- `cantidad_marcos`: marcos presentes al revisar (no cuenta `SIN_MARCO`). Va `null` y `marcos` va vacío si no se registró el detalle.
- Si se registra una caja, van sus 10 posiciones.

Falta también devolver `tiene_alza` y `marcos` en `InspeccionResponse`, para mostrar el detalle en el historial y permitir editarlo.

## 2. Tiras de medicamento en la inspección (bloquea el guardado)

Cuando la inspección registra signos de enfermedad, el frontend pide cuántas tiras de medicamento se aplicaron y envía en `POST` y `PATCH /inspecciones/`:

```json
{ "tiras_medicamento": 2 }
```

- Entero de 1 a 3, o `null` si no se aplicaron o no hay signos de enfermedad.
- Hoy el backend lo ignora porque `InspeccionCreate` e `InspeccionUpdate` no lo definen. Falta agregarlo al modelo, a los esquemas (con validación de 1 a 3) y a `InspeccionResponse`.

## 3. Transferencias dentro de la inspección

Hoy el frontend crea la inspección y después hace un `POST /transferencias-marcos/` por cada marco marcado con «Transferir» (cantidad 1). Funciona, pero:

- **No es atómico:** si una transferencia falla, la inspección ya quedó guardada. Lo ideal es que el backend cree las transferencias a partir de `marcos[].transferido_a_colmena_id` en la misma transacción de la inspección.
- **Sin vínculo:** el frontend envía `inspeccion_id`, `ubicacion`, `numero_marco` y `contenido` en cada transferencia, pero `TransferenciaMarcoCreate` no los define y se pierden. Por ahora el detalle queda como texto en `observaciones`.
- **Tipo de marco:** se traduce el contenido a `tipo_marco` así: cría o miel y cría → `CRIA`; solo miel → `MIEL`; cera estirada, estampada o untada → `VACIO`.

Si el backend pasa a crear las transferencias, avisar para quitar esas llamadas del frontend y no duplicarlas.

## 4. Otros pendientes

- **Contenido del QR:** sigue apuntando a `/colmenas/qr/{uuid}` del backend, que devuelve JSON. Definirlo con el equipo móvil antes de imprimir etiquetas.
- **Elementos inactivos (RF-45):** los listados no permiten consultar registros dados de baja.
- **Nombres de usuarios para el apicultor:** `/usuarios` es solo para ADMIN, así que un apicultor ve "Usuario #id" como responsable de registros ajenos.
- **Paginación de colmenas:** la respuesta no incluye el total de registros.
- **Escala de miel:** el frontend guarda en `miel` uno de estos valores: `SIN_MIEL`, `POCA`, `MEDIA` o `ABUNDANTE`. Si el backend o la app móvil definen otra escala, avisar para alinearla.

## 5. Módulo Stock (nuevo)

El frontend tiene la pantalla Stock. Mientras `/stock/` no exista, muestra el aviso "El inventario todavía no está disponible". Se controla una sola bodega.

**Permisos:** ADMIN y APICULTOR consultan; solo ADMIN registra movimientos y cambia mínimos.

### Materiales (`material`)

| Valor | Material | Lleva dañados |
|---|---|---|
| `ALZA` | Alzas | Sí |
| `MARCO_VACIO` | Marcos vacíos (los dañados son los marcos rotos) | Sí |
| `MARCO_CERA_ESTIRADA` | Marcos con cera estirada | No |
| `MARCO_CERA_UNTADA` | Marcos con cera untada | No |
| `TECHO_AMERICANO` | Techos americanos | Sí |
| `ENTRETAPA` | Entretapas | Sí |
| `PISO` | Pisos | Sí |

### Paso 1 (ya en el frontend): inventario

`GET /stock/` devuelve una fila por material:

```json
[
  { "material": "ALZA", "disponible": 12, "danado": 3, "minimo": 5, "actualizado_en": "2026-10-20T15:00:00" },
  { "material": "MARCO_CERA_UNTADA", "disponible": 15, "danado": 0, "minimo": null, "actualizado_en": "2026-10-20T15:00:00" }
]
```

Si falta un material, el frontend lo muestra con 0.

### Paso 2 (siguiente commit): movimientos

`POST /stock/movimientos/` (solo ADMIN):

```json
{ "material": "ALZA", "tipo": "ENVIO", "cantidad": 2, "apiario_id": 1, "colmena_id": null, "observaciones": "Colmena nueva en Mandinga" }
```

| `tipo` | Efecto | Valida |
|---|---|---|
| `INGRESO` | + disponible | — |
| `ENVIO` | − disponible (a apiario o colmena; `apiario_id` obligatorio) | disponible suficiente |
| `DANO` | − disponible, + dañado | disponible suficiente |
| `REPARACION` | − dañado, + disponible | dañado suficiente |
| `DESCARTE` | − dañado | dañado suficiente |

- `cantidad`: entero mayor que 0. El stock nunca queda negativo: si no alcanza, responder 409 o 422 con un mensaje en español.
- `DANO` de `MARCO_CERA_ESTIRADA` o `MARCO_CERA_UNTADA` descuenta ese material y suma al dañado de `MARCO_VACIO`.
- `REPARACION` y `DESCARTE` no aplican a los marcos con cera (sin dañados propios).
- Registrar `usuario_id` y la fecha, y dejarlo en auditoría.
- Responder el movimiento creado y el inventario actualizado del material.

`GET /stock/movimientos/?material=&tipo=&desde=&hasta=&offset=&limit=` devuelve el historial, el más reciente primero:

```json
{ "id": 1, "material": "ALZA", "tipo": "ENVIO", "cantidad": 2, "apiario_id": 1, "colmena_id": null, "observaciones": "...", "usuario_id": 1, "fecha": "2026-10-20T15:00:00" }
```

### Paso 3: mínimos

`PATCH /stock/{material}` (solo ADMIN) con `{ "minimo": 5 }` (entero ≥ 0 o `null`). El frontend avisa cuando `disponible` < `minimo`.
