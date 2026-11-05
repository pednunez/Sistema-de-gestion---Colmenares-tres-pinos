# API para la app móvil

Guía para conectar la app de Expo con el backend. Actualizada el 27-10-2026 (main `adfc80c`, migración `b3d7f9a2c5e8` aplicada en Neon TESTING).

La app ya puede iniciar sesión con token, descargar lo necesario para trabajar sin señal, sincronizar inspecciones y tratamientos sin duplicarlos y hacer la revisión por grupo (D-07, "Colmena n de 5").

## 1. Conectarse desde el teléfono

El teléfono no llega a `localhost` del computador. Levanta el backend escuchando en la red local y usa la IP del computador:

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- URL base en la app: `http://<IP del computador>:8000` (en Windows, `ipconfig` → "Dirección IPv4").
- El teléfono y el computador deben estar en la misma red Wi-Fi; si no responde, revisa el firewall de Windows para el puerto 8000.
- CORS no aplica a la app nativa. `GET /health` debe responder `{"status":"ok"}`.

## 2. Iniciar sesión

`POST /auth/token` con `{"email": "...", "password": "..."}` devuelve:

```json
{ "access_token": "eyJ...", "token_type": "bearer", "expira_en": 3600,
  "usuario": { "id": 4, "nombre": "Yarek", "email": "...", "rol": "APICULTOR" } }
```

- Guarda `access_token` con `expo-secure-store` y envíalo en cada petición: `Authorization: Bearer <access_token>`.
- Con Bearer no hace falta el `x-csrf-token` (eso es solo para la cookie de la web).
- El token dura `expira_en` segundos (hoy 60 minutos). Si una petición responde 401, pide de nuevo correo y contraseña; lo guardado sin conexión se conserva y se sincroniza después.
- Si la petición lleva el header `Origin` responde 403: este acceso es solo para la app nativa (Expo web usa `/auth/login`).
- `POST /auth/logout` cierra todas las sesiones de la cuenta, también la web.

## 3. Catálogo para trabajar sin señal

`GET /movil/catalogo` (ADMIN y APICULTOR). Descárgalo al iniciar sesión y cuando haya señal; guárdalo en SQLite.

| Campo | Para qué sirve en la app |
|---|---|
| `generado_en` | Hora del servidor: mostrar "Datos al …" |
| `usuario` | Quién inició sesión y su rol |
| `apiarios` | Apiarios activos (`id`, `nombre`, `ubicacion`) |
| `colmenas` | Colmenas activas con `codigo_qr`: resolver un QR a `colmena_id` sin red, y elegir destinos de transferencia |
| `grupos` | Grupos activos con `colmena_ids` en el orden en que se recorren |
| `tratamientos_en_curso` | Tratamientos `EN_CURSO` por colmena, para finalizarlos al inspeccionar |
| `opciones` | Valores que acepta la API: `estado_general`, `nivel`, `nivel_miel`, `contenido_marco`, `ubicacion_marco`, `estado_tratamiento` |

**Estado general:** usa la escala de `opciones.estado_general` (`COMPLETA`, `EN_DESARROLLO`, `DONANTE`, `DEBIL`, `REQUIERE_REVISION`). La app hoy ofrece `BUENO`, `REGULAR` y `CRITICO`, que la API solo acepta para leer inspecciones antiguas.

**Leer el QR:** la etiqueta impresa hoy contiene una URL que termina en `/colmenas/qr/<uuid>`. Toma el último segmento, búscalo en `colmenas[].codigo_qr` y usa ese `id`. El formato definitivo de la etiqueta sigue pendiente (D-02).

## 4. Sincronizar sin duplicar

Genera un UUID por registro al guardarlo en el teléfono (por ejemplo `Crypto.randomUUID()` de `expo-crypto`) y envíalo como `id_cliente`:

| Envío | Respuesta |
|---|---|
| Primera vez | `201` con el registro creado |
| El mismo `id_cliente` otra vez (se cortó la señal antes de la respuesta) | `200` con el mismo registro; no crea otro |
| Un `id_cliente` que usó otra persona | `409` |

Vale para `POST /inspecciones/`, `POST /tratamientos/` y `POST /revisiones/`. Guarda el `id` que devuelve el servidor junto al registro local y márcalo `SINCRONIZADO` con 200 o 201.

**Inspección** (`POST /inspecciones/`), campos principales:

```json
{ "colmena_id": 12, "usuario_id": 4, "id_cliente": "6f1c…",
  "fecha_inspeccion": "2026-10-27T10:15:00-03:00",
  "estado_general": "COMPLETA", "reina_observada": true, "presencia_cria": true,
  "nivel_poblacion": "ALTO", "reservas_alimento": "MEDIO", "miel": "MEDIA",
  "signos_enfermedad": false, "tiras_medicamento": null,
  "tiene_alza": false, "cantidad_marcos": 9,
  "marcos": [ { "ubicacion": "CAMARA_CRIA", "numero": 1, "contenido": "SOLO_CRIA", "transferido_a_colmena_id": null } ],
  "observaciones": "" }
```

- `fecha_inspeccion` es la hora en que se hizo en terreno, con zona horaria y no futura. Así una inspección guardada sin señal conserva su fecha real.
- `usuario_id` es obligatorio, pero el servidor lo reemplaza por el del token.
- `marcos`: si registras una caja van sus 10 posiciones; `SIN_MARCO` para una posición vacía. Un marco con `transferido_a_colmena_id` crea la transferencia en la misma transacción: no envíes además `POST /transferencias-marcos/`.
- `tiras_medicamento`: de 1 a 3, o `null`.

**Tratamiento** (`POST /tratamientos/`): `colmena_id`, `usuario_id`, `tipo_tratamiento` (2 a 100 caracteres), `fecha_inicio` (`AAAA-MM-DD`), opcionales `producto`, `dosis`, `motivo`, `fecha_fin`, `estado`, `observaciones`, `inspeccion_id` y `id_cliente`.

**Finalizar un tratamiento al inspeccionar:** `PATCH /tratamientos/{id}` con solo `{"estado": "FINALIZADO", "fecha_fin": "2026-10-27"}`. Cualquier apicultor puede hacerlo sobre un tratamiento `EN_CURSO`, aunque lo haya registrado otra persona.

## 5. Revisión por grupo (D-07)

| Paso | Petición | Respuesta |
|---|---|---|
| Iniciar | `POST /revisiones/` con `{"grupo_id": 3, "id_cliente": "…"}` | La sesión con sus colmenas en orden, `siguiente_colmena_id` y `progreso` |
| Guardar y siguiente | `POST /inspecciones/` con los datos de la inspección + `"sesion_revision_id": <id>` | La inspección; la colmena queda `REVISADA` |
| Omitir | `POST /revisiones/{id}/omitir` con `{"colmena_id": 12, "motivo": "lluvia"}` | La sesión actualizada; una omitida se puede revisar después |
| Ver avance | `GET /revisiones/{id}` | `progreso`, `siguiente_colmena_id`, `resumen_estados` |
| Finalizar | `POST /revisiones/{id}/finalizar` | La sesión `FINALIZADA`; se permite con colmenas pendientes |

- "Colmena n de 5" = `orden` de la colmena y `progreso.total`.
- La lista de colmenas se fija al iniciar; reasignar colmenas del grupo después no cambia el recorrido.
- Una sola sesión en curso por grupo (409 si ya hay una). Solo quien la inició o un ADMIN puede guardar, omitir o finalizar en ella.
- Sin conexión: guarda la sesión y sus inspecciones en el teléfono; al sincronizar, crea primero la sesión (con su `id_cliente`) para obtener su `id` y luego envía las inspecciones con ese `sesion_revision_id`.

## 6. Errores

| Código | Cuándo |
|---|---|
| 401 | Sin token, token vencido o sesión cerrada |
| 403 | Sin permiso (por ejemplo, otra persona en una revisión ajena) |
| 404 | El registro no existe o está dado de baja |
| 409 | Conflicto: revisión ya finalizada, colmena ya revisada, `id_cliente` de otra persona |
| 422 | Datos inválidos; `detail[].loc` indica el campo |

Envía un `X-Correlation-ID` (un UUID) en cada petición: el servidor lo devuelve y lo registra en sus logs, así un error se puede rastrear.

## 7. Pendiente de definir

- D-02: contenido definitivo del QR antes de imprimir etiquetas.
- La duración del token (60 minutos) para jornadas largas en terreno.
