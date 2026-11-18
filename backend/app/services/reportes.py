"""Filas compatibles con frontend/src/utils/reportes.js (S4-T07/T11)."""
from datetime import datetime, time, timezone
import re
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, raiseload

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.tratamiento import Tratamiento
from app.models.usuario import Usuario
from app.schemas.reporte import FiltrosReporte, TipoReporte

ZONA = ZoneInfo("America/Santiago")
ESTADOS = {
    "COMPLETA": "Completa", "EN_DESARROLLO": "En desarrollo",
    "DONANTE": "Donante", "DEBIL": "Débil", "REQUIERE_REVISION": "Requiere revisión",
    "BUENO": "Bueno (escala anterior)", "REGULAR": "Regular (escala anterior)",
    "CRITICO": "Crítico (escala anterior)", "ACTIVA": "Activa",
    "EN_OBSERVACION": "En observación", "INACTIVA": "Inactiva", "BAJA": "Dada de baja",
    "PLANIFICADO": "Planificado", "EN_CURSO": "En curso", "FINALIZADO": "Finalizado",
    "CANCELADO": "Cancelado",
}
COLUMNAS = {
    "inspecciones": ["Fecha", "Colmena", "Apiario", "Estado", "Signos de enfermedad",
                     "Marcos", "Alza", "Responsable", "Observaciones"],
    "tratamientos": ["Inicio", "Término", "Colmena", "Apiario", "Tipo", "Producto",
                     "Dosis", "Estado", "Responsable"],
    "colmenas": ["Colmena", "Apiario", "Estado de la colmena", "Última inspección",
                 "Estado según inspección", "Días sin inspección", "Tratamientos en curso"],
}
TITULOS = {"inspecciones": "Inspecciones", "tratamientos": "Tratamientos",
           "colmenas": "Estado de las colmenas"}


def fecha_utc(valor):
    # SQLite no conserva el tzinfo; PostgreSQL sí. Los instantes se guardan en UTC.
    return valor.replace(tzinfo=timezone.utc) if valor.tzinfo is None else valor.astimezone(timezone.utc)


def fecha_texto(valor):
    if isinstance(valor, datetime):
        valor = fecha_utc(valor).astimezone(ZONA).date()
    return valor.strftime("%d-%m-%Y")


def humanizar(valor):
    return valor.replace("_", " ").lower().capitalize() if re.fullmatch(r"[A-Z0-9_]+", valor) else valor


def armar_reporte(db: Session, tipo: TipoReporte, filtros: FiltrosReporte):
    criterios = [Colmena.activo.is_(True)]
    if filtros.apiario_id is not None:
        criterios.append(Colmena.apiario_id == filtros.apiario_id)
    if filtros.colmena_id is not None:
        criterios.append(Colmena.id == filtros.colmena_id)
    if tipo == "colmenas":
        criterios.append(Colmena.estado.not_in(["INACTIVA", "BAJA"]))
    colmenas = db.execute(select(Colmena, Apiario.nombre, Apiario.activo)
                         .join(Apiario, Colmena.apiario_id == Apiario.id).where(*criterios)).all()
    catalogo = {c.id: (c, nombre if activo else "Apiario dado de baja")
                for c, nombre, activo in colmenas}
    if not catalogo:
        return COLUMNAS[tipo], []
    # Subconsulta en lugar de una lista de IDs: no depende del límite de parámetros SQL.
    ids = select(Colmena.id).where(*criterios)
    if tipo == "colmenas":
        ordenadas = select(
            Inspeccion.colmena_id, Inspeccion.fecha_inspeccion, Inspeccion.estado_general,
            func.row_number().over(partition_by=Inspeccion.colmena_id,
                                   order_by=(Inspeccion.fecha_inspeccion.desc(), Inspeccion.id.desc())).label("rn"),
        ).where(Inspeccion.activo.is_(True), Inspeccion.colmena_id.in_(ids)).subquery()
        ultimas = {r.colmena_id: r for r in db.execute(select(ordenadas).where(ordenadas.c.rn == 1))}
        en_curso = dict(db.execute(select(Tratamiento.colmena_id, func.count())
                                  .where(Tratamiento.colmena_id.in_(ids), Tratamiento.estado == "EN_CURSO")
                                  .group_by(Tratamiento.colmena_id)).all())
        ahora = datetime.now(timezone.utc)
        filas = []
        def orden(item):
            return [int(p) if p.isdigit() else p.casefold() for p in re.split(r"(\d+)", item[0].codigo)]
        for c, apiario in sorted(catalogo.values(), key=orden):
            ultima = ultimas.get(c.id)
            estado = (ultima.estado_general if ultima else None) or "SIN"
            if filtros.estado and estado != filtros.estado:
                continue
            filas.append([c.codigo, apiario, ESTADOS.get(c.estado, c.estado),
                          fecha_texto(ultima.fecha_inspeccion) if ultima else "Nunca",
                          ESTADOS.get(ultima.estado_general, "Sin estado") if ultima else "—",
                          (ahora - fecha_utc(ultima.fecha_inspeccion)).days if ultima else "—",
                          en_curso.get(c.id, 0)])
        return COLUMNAS[tipo], filas

    modelo = Inspeccion if tipo == "inspecciones" else Tratamiento
    fecha = modelo.fecha_inspeccion if tipo == "inspecciones" else modelo.fecha_inicio
    consulta = select(modelo, Usuario.nombre, Usuario.apellido, Usuario.activo).options(raiseload("*")).outerjoin(
        Usuario, modelo.usuario_id == Usuario.id).where(modelo.colmena_id.in_(ids))
    if tipo == "inspecciones":
        consulta = consulta.where(Inspeccion.activo.is_(True))
    for valor, inicio in [(filtros.desde, True), (filtros.hasta, False)]:
        if valor is not None:
            limite = (datetime.combine(valor, time.min if inicio else time.max, tzinfo=ZONA)
                      .astimezone(timezone.utc)) if tipo == "inspecciones" else valor
            consulta = consulta.where(fecha >= limite if inicio else fecha <= limite)
    if filtros.estado:
        campo = Inspeccion.estado_general if tipo == "inspecciones" else Tratamiento.estado
        consulta = consulta.where(campo == filtros.estado)
    filas = []
    for registro, nombre, apellido, activo in db.execute(consulta.order_by(fecha.desc(), modelo.id.desc())):
        c, apiario = catalogo[registro.colmena_id]
        responsable = " ".join(v for v in [nombre, apellido] if v) if activo else f"Usuario #{registro.usuario_id}"
        if tipo == "inspecciones":
            enfermedad = "No"
            if registro.signos_enfermedad:
                enfermedad = "Sí" + (f": {registro.enfermedad_observada}" if registro.enfermedad_observada else "")
            filas.append([fecha_texto(registro.fecha_inspeccion), c.codigo, apiario,
                          ESTADOS.get(registro.estado_general, "Sin estado"), enfermedad,
                          registro.cantidad_marcos if registro.cantidad_marcos is not None else "—",
                          "—" if registro.tiene_alza is None else ("Sí" if registro.tiene_alza else "No"),
                          responsable, registro.observaciones or ""])
        else:
            filas.append([fecha_texto(registro.fecha_inicio), fecha_texto(registro.fecha_fin) if registro.fecha_fin else "—",
                          c.codigo, apiario, humanizar(registro.tipo_tratamiento), registro.producto or "—",
                          registro.dosis or "—", ESTADOS.get(registro.estado, registro.estado), responsable])
    return COLUMNAS[tipo], filas
