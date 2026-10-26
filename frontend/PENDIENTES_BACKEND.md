# Pendientes del backend para el frontend de escritorio

Actualizado el 26-10-2026: estado de la colmena (sección 6) y finalizar tratamientos desde la inspección (sección 7).

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

## 5. Módulo Stock

Actualizado el 21-10-2026 con el documento de José del 20-10 y lo definido por el cliente.

**Alcance:** el stock es solo de la **bodega central** (centro de operaciones). No se lleva stock por apiario; el material que hay en cada apiario se podrá calcular más adelante a partir de las colmenas.

**Permisos:** ADMIN y APICULTOR consultan; solo ADMIN registra movimientos y cambia mínimos.

### Materiales (`material`)

| Valor | Material | Pasa por dañado y reparación |
|---|---|---|
| `CAJON` | Cajones (cajón con piso) — **nuevo** | Sí |
| `ALZA` | Alzas (cajón sin piso) | Sí |
| `PISO` | Pisos | Sí |
| `TECHO` | Techos (techo normal) — **nuevo** | Sí |
| `TECHO_AMERICANO` | Techos americanos | Sí |
| `ENTRETAPA` | Entretapas | Sí |
| `MARCO_VACIO` | Marcos vacíos (sus dañados son los marcos rotos) | Sí |
| `MARCO_CERA_ESTIRADA` | Marcos con cera estirada | No |
| `MARCO_CERA_UNTADA` | Marcos con cera untada | No |

### Estados

Cada unidad está en **un solo estado**, para que nada se cuente dos veces:

```
DISPONIBLE --DANO--> DANADO --ENVIO_REPARACION--> EN_REPARACION --REPARACION--> DISPONIBLE
                        \                              \
                         +-------- DESCARTE (merma) -----+--> MERMA
```

- **Disponible:** usable.
- **Dañado:** roto, esperando ir a reparación. No es usable.
- **En reparación:** se llevó a reparar. Deja de contar como dañado y tampoco es usable.
- **Merma:** sin arreglo, se bota. Se informa el total acumulado.

El estado `ROTO` del backend se debe tratar como `DANADO` (o unificarse), porque en pantalla hay un solo concepto de "dañado".

### GET /stock/

Una fila por material:

```json
{ "material": "ALZA", "disponible": 12, "danado": 3, "en_reparacion": 2, "merma": 1, "minimo": 5, "actualizado_en": "2026-10-21T15:00:00" }
```

- **Cambio:** `danado` debe contar solo lo dañado que espera reparación (hoy suma `DANADO`, `ROTO` y `EN_REPARACION`).
- **Nuevos:** `en_reparacion` (unidades en reparación) y `merma` (total acumulado).

### POST /stock/movimientos/ (solo ADMIN)

```json
{ "material": "ALZA", "tipo": "ENVIO_REPARACION", "cantidad": 2, "apiario_id": null, "colmena_id": null, "estado_origen": null, "observaciones": "Al taller" }
```

| `tipo` | En pantalla | Efecto | Valida |
|---|---|---|---|
| `INGRESO` | Ingreso | + disponible | — |
| `ENVIO` | Salida | − disponible | disponible suficiente |
| `DANO` | Daño | disponible → dañado | disponible suficiente |
| `ENVIO_REPARACION` | A reparación — **nuevo** | dañado → en reparación | dañado suficiente |
| `REPARACION` | Reparado | en reparación → disponible (**cambia**: hoy sale de dañado) | en reparación suficiente |
| `DESCARTE` | Merma | dañado o en reparación → merma | según `estado_origen` |

- `cantidad`: entero mayor que 0. El stock nunca queda negativo: responder 409 con un mensaje en español.
- `DANO` de marcos con cera descuenta ese material y suma al dañado de `MARCO_VACIO`.
- `ENVIO_REPARACION`, `REPARACION` y `DESCARTE` no aplican a los marcos con cera.
- `DESCARTE` exige `estado_origen`: `DANADO` o `EN_REPARACION`. En los demás tipos va `null`.
- **`ENVIO` (salida de bodega):** `apiario_id` y `colmena_id` son **opcionales**, solo para saber a dónde fue el material. Si viene `colmena_id`, validar que pertenezca al apiario. No suma stock en ningún apiario. Mientras no esté listo, el 501 se muestra como "Esta opción todavía no está disponible en el servidor".
- El orden por antigüedad (FIFO) de las incidencias que ya implementaste sirve igual.
- La respuesta puede ser solo el movimiento creado: la pantalla vuelve a consultar `GET /stock/` y el historial después de guardar.

### GET /stock/movimientos/

Parámetros opcionales: `material`, `tipo`, `desde`, `hasta`, `offset` y `limit`. Ordenado del más reciente al más antiguo. Cada movimiento devuelve:

```json
{ "id": 1, "material": "ALZA", "tipo": "DESCARTE", "cantidad": 1, "apiario_id": null, "colmena_id": null, "estado_origen": "EN_REPARACION", "observaciones": "...", "usuario_id": 1, "fecha": "2026-10-21T15:00:00" }
```

### PATCH /stock/{material} (solo ADMIN)

`{ "minimo": 5 }`: entero ≥ 0, o `null` para quitarlo. El frontend avisa cuando `disponible` < `minimo`.

## 6. Estado de la colmena en la inspección (PB-08, bloquea el guardado)

El cliente cambió la escala de `estado_general` (H005-E4). El frontend ya ofrece solo los valores nuevos:

| Valor | En pantalla |
|---|---|
| `COMPLETA` | Completa |
| `EN_DESARROLLO` | En desarrollo |
| `DONANTE` | Donante |
| `DEBIL` | Débil |
| `REQUIERE_REVISION` | Requiere revisión |

- Hoy `EstadoGeneral` en `schemas/inspeccion.py` solo acepta `BUENO`, `REGULAR` y `CRITICO`, así que `POST` y `PATCH /inspecciones/` responden **422** con los valores nuevos. Falta agregarlos al `Literal` y, si existe, a la restricción de la columna en la base.
- **Inspecciones antiguas:** el frontend sigue mostrando `BUENO`, `REGULAR` y `CRITICO` como "escala anterior", y al editar una obliga a elegir el estado nuevo. Conviene que el backend siga aceptándolos en lectura. Si se decide migrarlos, acordar antes la equivalencia con el cliente.
- **Alertas en el frontend:** `REQUIERE_REVISION` es prioridad alta y `DEBIL` es "revisar".

## 7. Finalizar tratamientos desde la inspección

Al registrar o editar una inspección, el frontend lista los tratamientos `EN_CURSO` de la colmena. Los que el apicultor marca se finalizan después de guardar la inspección con:

```
PATCH /tratamientos/{id}
{ "estado": "FINALIZADO", "fecha_fin": "AAAA-MM-DD" }
```

- **Regla definida por el Product Owner (26-10):** los apicultores rotan entre apiarios, así que **cualquier APICULTOR o ADMIN que inspecciona la colmena puede finalizar su tratamiento**, aunque lo haya registrado otra persona.
- Hoy `verificar_autor_o_admin` responde **403** si el apicultor no es el autor. Falta permitir este caso (por ejemplo, que un APICULTOR pueda pasar un tratamiento `EN_CURSO` a `FINALIZADO` con `fecha_fin`, dejando el resto de la edición solo para el autor o un ADMIN). Registrar en auditoría quién lo finalizó.
- Mientras tanto, si el backend lo rechaza, la inspección queda guardada y el frontend avisa que falta finalizar el tratamiento.
- Opcional: guardar la inspección en la que se finalizó, para mostrarlo en el detalle.
