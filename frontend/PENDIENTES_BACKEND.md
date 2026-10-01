# Pendientes del backend detectados al integrar el frontend

## Afectan requisitos
1. **Marcos por colmena (RF-25, RF-40, RF-41):** la tabla `colmena` no guarda cantidad de marcos y la inspección no los registra. Sin ese dato no se puede validar que el origen tenga marcos suficientes ni actualizar cantidades tras una transferencia.
2. **Campos de inspección faltantes (RF-27, RF-28, RF-31):** no existen miel, alimentación suministrada ni postura.
3. **Recuperar o cambiar contraseña (RF-03):** no hay endpoint, y `UsuarioUpdate` tampoco permite que el administrador la restablezca.
4. **Contenido del QR (RF-20):** el QR apunta a `/colmenas/qr/{uuid}` del backend, que devuelve JSON. Al escanearlo con la cámara del celular se ve texto técnico en vez del formulario. Debería apuntar a una URL del frontend, por ejemplo `https://<frontend>/colmena/{uuid}`.

## Seguridad (OWASP: control de acceso)
5. Los GET de apiarios, colmenas, inspecciones, tratamientos, transferencias, historial e imagen QR no piden token: cualquiera con la URL puede leer los datos. Agregar `Depends(obtener_usuario_actual)`.
6. Crear, editar y dar de baja apiarios y colmenas lo puede hacer cualquier usuario autenticado. Según el StRS es tarea del administrador: usar `requerir_admin`. El frontend ya oculta esas acciones al apicultor, pero la regla debe estar en el backend.
7. Editar o anular inspecciones y tratamientos ajenos está permitido para cualquier usuario. El frontend lo limita al autor o al administrador.

## Consistencia
8. Dar de baja un apiario deja sus colmenas activas apuntando a un apiario inactivo. El frontend lo impide si tiene colmenas, pero conviene validarlo también en el backend.
9. Los cambios en usuarios (crear, editar, dar de baja) no quedan en la auditoría (RF-63).
10. No hay forma de consultar elementos inactivos (RF-45): todos los listados filtran `activo == True`. Un parámetro `?incluir_inactivos=true` lo resolvería.
