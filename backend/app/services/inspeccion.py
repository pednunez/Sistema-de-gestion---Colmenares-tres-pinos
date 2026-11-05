
from datetime import datetime, timezone

from sqlalchemy import select, inspect as sa_inspect
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.inspeccion_marco import InspeccionMarco
from app.models.usuario import Usuario

from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate,
    validar_posiciones_marcos,
)

from app.schemas.transferencia_marco import (
    TransferenciaMarcoCreate,
)

from app.schemas.inventario import (
    InventarioMovimientoCreate,
)

from app.schemas.auditoria import AuditoriaCreate

from app.services import (
    transferencia_marco as transferencia_service,
)

from app.services import (
    inventario_operaciones as inventario_service,
)

from app.services import auditoria as auditoria_service
from app.services import colmena_marcos as marcos_estado_service


# ==========================================================
# COLMENARES TRES PINOS
# SERVICIO DE INSPECCIONES
#
# S3-T05 - RETIRO DE MARCOS A BODEGA
# ==========================================================


# ==========================================================
# MATERIALES DE BODEGA POR CONTENIDO
# ==========================================================

MATERIAL_BODEGA_POR_CONTENIDO = {
    "CERA_ESTIRADA": "MARCO_CERA_ESTIRADA",
    "CERA_UNTADA": "MARCO_CERA_UNTADA",
    "CERA_ESTAMPADA": "MARCO_CERA_ESTAMPADA",
    "SOLO_MIEL": "MARCO_MIEL",
}


# ==========================================================
# TIPOS DE MARCO PARA TRANSFERENCIAS
# ==========================================================

TIPO_POR_CONTENIDO = {
    "MIEL_Y_CRIA": "CRIA",
    "SOLO_CRIA": "CRIA",
    "SOLO_MIEL": "MIEL",
    "CERA_ESTIRADA": "VACIO",
    "CERA_ESTAMPADA": "VACIO",
    "CERA_UNTADA": "VACIO",
}


# ==========================================================
# CONSULTAR INSPECCIONES
# ==========================================================

def listar_inspecciones(db: Session):
    return db.scalars(
        select(Inspeccion)
        .where(Inspeccion.activo.is_(True))
        .order_by(
            Inspeccion.fecha_inspeccion.desc(),
            Inspeccion.id.desc(),
        )
    ).all()


def obtener_inspeccion(
    db: Session,
    inspeccion_id: int,
):
    return db.scalar(
        select(Inspeccion).where(
            Inspeccion.id == inspeccion_id,
            Inspeccion.activo.is_(True),
        )
    )


def obtener_colmena_activa(
    db: Session,
    colmena_id: int,
):
    return db.scalar(
        select(Colmena).where(
            Colmena.id == colmena_id,
            Colmena.activo.is_(True),
        )
    )


def obtener_usuario_activo(
    db: Session,
    usuario_id: int,
):
    return db.scalar(
        select(Usuario).where(
            Usuario.id == usuario_id,
            Usuario.activo.is_(True),
        )
    )


# ==========================================================
# UTILIDADES
# ==========================================================

def ahora_utc():
    return datetime.now(timezone.utc)


def guardar_cambios(
    db: Session,
    *,
    commit: bool,
):
    if not commit:
        db.flush()
        return

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


# ==========================================================
# PROTEGER INSPECCIONES HISTORICAS
# ==========================================================
#
# No permitir generar movimientos nuevos
# editando una inspeccion antigua.
# ==========================================================

def comprobar_transferencias_pendientes(marcos):

    if any(
        marco.transferido_a_colmena_id is not None
        or marco.retirar_a_bodega
        for marco in marcos
    ):
        raise ValueError(
            "No se pueden agregar transferencias "
            "ni retiros a bodega editando "
            "una inspeccion historica."
        )


# ==========================================================
# CONSTRUIR OBJETOS DE MARCOS
# ==========================================================

def crear_objetos_marcos(marcos):

    return [
        InspeccionMarco(
            ubicacion=marco.ubicacion,
            numero=marco.numero,
            contenido=marco.contenido,
            transferido_a_colmena_id=(
                marco.transferido_a_colmena_id
            ),
            retirar_a_bodega=marco.retirar_a_bodega,
        )
        for marco in marcos
    ]


# ==========================================================
# VALIDAR DETALLE DE MARCOS
# ==========================================================

def validar_detalle_marcos(
    marcos,
    tiene_alza,
    cantidad_marcos,
):

    if not marcos:
        return

    if tiene_alza is None:
        raise ValueError(
            "Debes indicar si la colmena tiene alza."
        )

    validar_posiciones_marcos(
        marcos,
        tiene_alza,
        cantidad_marcos,
    )


# ==========================================================
# PREPARAR TRANSFERENCIA PARA AUDITORIA
# ==========================================================

def transferencia_a_dict(transferencia):

    resultado = {}

    for columna in sa_inspect(
        transferencia
    ).mapper.column_attrs:

        valor = getattr(
            transferencia,
            columna.key,
        )

        if isinstance(valor, datetime):
            valor = valor.isoformat()

        resultado[columna.key] = valor

    return resultado


# ==========================================================
# SINCRONIZACION MOVIL
# ==========================================================
#
# Evita duplicar inspecciones cuando el telefono
# reintenta el envio con el mismo UUID.
# ==========================================================

def obtener_por_id_cliente(
    db: Session,
    id_cliente,
) -> Inspeccion | None:

    return db.scalar(
        select(Inspeccion).where(
            Inspeccion.id_cliente == id_cliente
        )
    )


# ==========================================================
# CREAR INSPECCION
# ==========================================================
#
# Operaciones:
#
# 1. Validar marcos.
# 2. Identificar transferencias y retiros.
# 3. Bloquear colmenas involucradas.
# 4. Crear inspeccion y detalle historico.
# 5. Registrar retiros a bodega.
# 6. Registrar transferencias.
# 7. Confirmar una unica transaccion.
#
# Cuando commit=False, el router confirma
# junto con la auditoria de la inspeccion.
# ==========================================================

def crear_inspeccion(
    db: Session,
    datos: InspeccionCreate,
    *,
    commit: bool = True,
):

    # ======================================================
    # 1. VALIDAR DETALLE
    # ======================================================

    validar_detalle_marcos(
        datos.marcos,
        datos.tiene_alza,
        datos.cantidad_marcos,
    )

    # Marcos enviados a otra colmena.
    transferibles = [
        marco
        for marco in datos.marcos
        if marco.transferido_a_colmena_id is not None
    ]

    # Marcos retirados a bodega central.
    retirables = [
        marco
        for marco in datos.marcos
        if marco.retirar_a_bodega
    ]

    # ======================================================
    # 2. VALIDAR CANTIDADES
    # ======================================================

    if transferibles or retirables:

        if datos.cantidad_marcos is None:
            raise ValueError(
                "Debes registrar cantidad_marcos "
                "para transferir o retirar marcos."
            )

        cantidad_real = sum(
            marco.contenido != "SIN_MARCO"
            for marco in datos.marcos
        )

        if cantidad_real != datos.cantidad_marcos:
            raise ValueError(
                "La cantidad de marcos no coincide "
                "con el detalle registrado."
            )

        if (
            len(transferibles) + len(retirables)
            > cantidad_real
        ):
            raise ValueError(
                "Los movimientos superan "
                "los marcos disponibles."
            )

    # ======================================================
    # 3. VALIDAR COLMENAS DE DESTINO
    # ======================================================

    destinos = {
        marco.transferido_a_colmena_id
        for marco in transferibles
    }

    if datos.colmena_id in destinos:
        raise ValueError(
            "No se puede transferir "
            "a la misma colmena."
        )

    # Bloquear colmenas en orden estable.
    ids_colmenas = sorted({
        datos.colmena_id,
        *destinos,
    })

    colmenas = db.scalars(
        select(Colmena)
        .where(
            Colmena.id.in_(ids_colmenas),
            Colmena.activo.is_(True),
        )
        .order_by(Colmena.id.asc())
        .with_for_update()
    ).all()

    mapa = {
        colmena.id: colmena
        for colmena in colmenas
    }

    origen = mapa.get(datos.colmena_id)

    if origen is None:
        raise ValueError(
            "La colmena inspeccionada no existe "
            "o esta inactiva."
        )

    for destino_id in destinos:

        if destino_id not in mapa:
            raise ValueError(
                f"La colmena destino {destino_id} "
                "no existe o esta inactiva."
            )

    # ======================================================
    # 4. CREAR INSPECCION
    # ======================================================

    inspeccion = Inspeccion(
        colmena_id=datos.colmena_id,
        usuario_id=datos.usuario_id,
        estado_general=datos.estado_general,
        reina_observada=datos.reina_observada,
        presencia_cria=datos.presencia_cria,
        nivel_poblacion=datos.nivel_poblacion,
        reservas_alimento=datos.reservas_alimento,
        cantidad_marcos=datos.cantidad_marcos,
        tiene_alza=datos.tiene_alza,
        miel=datos.miel,
        alimentacion_suministrada=(
            datos.alimentacion_suministrada
        ),
        postura=datos.postura,
        signos_enfermedad=datos.signos_enfermedad,
        enfermedad_observada=datos.enfermedad_observada,
        tiras_medicamento=datos.tiras_medicamento,
        observaciones=datos.observaciones,
        id_cliente=datos.id_cliente,
    )

    if datos.fecha_inspeccion is not None:
        inspeccion.fecha_inspeccion = (
            datos.fecha_inspeccion
        )

    # Guardar posiciones observadas.
    inspeccion.marcos = crear_objetos_marcos(
        datos.marcos
    )

    db.add(inspeccion)

    # Obtener ID sin confirmar transaccion.
    db.flush()

    # ======================================================
    # 5. ACTUALIZAR CANTIDAD OBSERVADA
    # ======================================================
    #
    # Se registra primero el conteo observado.
    # Posteriormente se descuentan los movimientos.
    # ======================================================

    if datos.cantidad_marcos is not None:

        origen.cantidad_marcos = (
            datos.cantidad_marcos
        )

        origen.fecha_actualizacion = ahora_utc()

    # ======================================================
    # 6. S3-T05 - RETIRAR MARCOS A BODEGA
    # ======================================================

    if retirables:

        # El conteo corresponde a la inspeccion
        # antes de efectuar los retiros.
        if origen.cantidad_marcos < len(retirables):
            raise ValueError(
                "El retiro supera "
                "la cantidad de marcos disponibles."
            )

        for marco in retirables:

            material = MATERIAL_BODEGA_POR_CONTENIDO[
                marco.contenido
            ]

            # Se reutiliza el servicio existente
            # de ingreso al inventario central.
            #
            # commit=False: no confirmar aun.
            # La auditoria se registra en el mismo
            # servicio de inventario.
            inventario_service.registrar_movimiento_bodega(
                db=db,
                datos=InventarioMovimientoCreate(
                    material=material,
                    tipo_movimiento="INGRESO",
                    cantidad=1,
                    estado="BUENO",
                    origen_ubicacion=None,
                    colmena_origen_id=None,
                    destino_ubicacion="BODEGA",
                    colmena_destino_id=None,
                    observaciones=(
                        f"Retiro desde colmena "
                        f"{datos.colmena_id}; "
                        f"inspeccion {inspeccion.id}; "
                        f"marco {marco.numero} "
                        f"en {marco.ubicacion}"
                    ),
                ),
                usuario_id=datos.usuario_id,
                commit=False,
            )

        # Descontar del conteo actual de la colmena.
        origen.cantidad_marcos -= len(retirables)
        origen.fecha_actualizacion = ahora_utc()

    # ======================================================
    # S3-T06 - SINCRONIZAR POSICIONES ANTES DE TRANSFERIR
    # ======================================================
    # Las inspecciones con movimientos antiguos sin piso destino
    # conservan su comportamiento; sus posiciones no se inventan.
    # No mezclar movimientos detallados y legados en una inspeccion.

    duplicados_desplazado = [
        (m.transferido_a_colmena_id, m.ubicacion_destino,
         m.marco_desplazado_numero)
        for m in transferibles
        if m.marco_desplazado_numero is not None
    ]
    if len(duplicados_desplazado) != len(set(duplicados_desplazado)):
        raise ValueError("No se puede desplazar dos veces el mismo marco")

    pisos_informados = [
        marco.ubicacion_destino is not None
        for marco in transferibles
    ]
    if any(pisos_informados) and not all(pisos_informados):
        raise ValueError(
            "No mezcles transferencias con y sin ubicacion_destino "
            "en una misma inspeccion"
        )

    if datos.marcos and (
        not transferibles or all(pisos_informados)
    ):
        fotografia = marcos_estado_service.guardar_observacion_inspeccion(
            db,
            datos.colmena_id,
            datos.marcos,
            datos.tiene_alza,
        )
        if fotografia is not None:
            cantidad_calculada = marcos_estado_service.contar_marcos(
                fotografia
            )
            if origen.cantidad_marcos != cantidad_calculada:
                # Cuando no se indico cantidad_marcos pero si se enviaron
                # todas las posiciones, se toma el conteo real de ellas.
                if datos.cantidad_marcos is None:
                    origen.cantidad_marcos = cantidad_calculada
                else:
                    raise ValueError(
                        "El estado de marcos no coincide con la "
                        "cantidad despues de los retiros"
                    )

    # ======================================================
    # 7. REGISTRAR TRANSFERENCIAS ENTRE COLMENAS
    # ======================================================

    for marco in transferibles:

        transferencia_datos = TransferenciaMarcoCreate(
            colmena_origen_id=datos.colmena_id,
            colmena_destino_id=(
                marco.transferido_a_colmena_id
            ),
            usuario_id=datos.usuario_id,
            inspeccion_id=inspeccion.id,
            cantidad_marcos=1,
            tipo_marco=TIPO_POR_CONTENIDO[
                marco.contenido
            ],
            ubicacion=marco.ubicacion,
            numero_marco=marco.numero,
            contenido=marco.contenido,
            ubicacion_destino=marco.ubicacion_destino,
            marco_desplazado_numero=marco.marco_desplazado_numero,
            motivo=(
                "Transferencia registrada "
                "durante la inspeccion"
            ),
            observaciones=(
                f"Marco {marco.numero} "
                f"en {marco.ubicacion}"
            ),
        )

        transferencia = (
            transferencia_service.crear_transferencia(
                db,
                transferencia_datos,
                commit=False,
            )
        )

        # Auditoria de transferencia.
        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=datos.usuario_id,
                entidad="TRANSFERENCIA_MARCO",
                entidad_id=transferencia.id,
                accion="CREAR",
                datos_anteriores=None,
                datos_nuevos=transferencia_a_dict(
                    transferencia
                ),
            ),
            commit=False,
        )

    # ======================================================
    # 8. CONFIRMAR CAMBIOS
    # ======================================================
    #
    # Cuando el router usa commit=False:
    # inspeccion, retiros, transferencias y auditorias
    # permanecen en la misma transaccion.
    # ======================================================

    guardar_cambios(
        db,
        commit=commit,
    )

    if commit:
        db.refresh(inspeccion)

    return inspeccion


# ==========================================================
# ACTUALIZAR INSPECCION
# ==========================================================
#
# PATCH solamente modifica datos historicos.
# No genera nuevas transferencias ni ingresos a bodega.
# ==========================================================

def actualizar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    datos: InspeccionUpdate,
    *,
    commit: bool = True,
):

    cambios = datos.model_dump(
        exclude_unset=True
    )

    # Proteger relaciones historicas.
    cambios.pop("colmena_id", None)
    cambios.pop("usuario_id", None)

    marcos_enviados = "marcos" in cambios
    cambios.pop("marcos", None)

    nuevos_marcos = None

    if marcos_enviados:

        if datos.marcos is None:
            raise ValueError(
                "Para modificar marcos envia una lista. "
                "Utiliza [] para eliminar el detalle."
            )

        nuevos_marcos = datos.marcos

        # Prohibir movimientos nuevos por PATCH.
        comprobar_transferencias_pendientes(
            nuevos_marcos
        )

        # No permitir reemplazar posiciones con
        # movimientos historicos contabilizados.
        if any(
            marco.transferido_a_colmena_id is not None
            or marco.retirar_a_bodega
            for marco in inspeccion.marcos
        ):
            raise ValueError(
                "No puedes reemplazar marcos "
                "de una inspeccion con transferencias "
                "o retiros a bodega."
            )

        tiene_alza_final = cambios.get(
            "tiene_alza",
            inspeccion.tiene_alza,
        )

        if nuevos_marcos:

            cantidad_calculada = sum(
                marco.contenido != "SIN_MARCO"
                for marco in nuevos_marcos
            )

            cantidad_final = cambios.get(
                "cantidad_marcos",
                cantidad_calculada,
            )

            validar_detalle_marcos(
                nuevos_marcos,
                tiene_alza_final,
                cantidad_final,
            )

            cambios["cantidad_marcos"] = cantidad_final

    # Aplicar los campos recibidos.
    for campo, valor in cambios.items():
        setattr(
            inspeccion,
            campo,
            valor,
        )

    # Reemplazar el detalle si corresponde.
    if nuevos_marcos is not None:

        anteriores = list(
            inspeccion.marcos
        )

        for marco in anteriores:
            db.delete(marco)

        db.flush()

        inspeccion.marcos = crear_objetos_marcos(
            nuevos_marcos
        )

    inspeccion.fecha_actualizacion = ahora_utc()

    # No alterar inventario al editar registros antiguos.
    guardar_cambios(
        db,
        commit=commit,
    )

    if commit:
        db.refresh(inspeccion)

    return inspeccion


# ==========================================================
# ANULAR INSPECCION
# ==========================================================
#
# Conserva los registros historicos.
# No revierte automaticamente movimientos de inventario.
# ==========================================================

def eliminar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    *,
    commit: bool = True,
):

    ahora = ahora_utc()

    inspeccion.activo = False
    inspeccion.fecha_eliminacion = ahora
    inspeccion.fecha_actualizacion = ahora

    guardar_cambios(
        db,
        commit=commit,
    )

    if commit:
        db.refresh(inspeccion)

    return inspeccion
