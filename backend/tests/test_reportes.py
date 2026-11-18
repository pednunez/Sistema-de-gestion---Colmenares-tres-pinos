import asyncio
import csv
from datetime import date, datetime, timezone
from io import BytesIO, StringIO
import json
import unittest
from unittest.mock import patch
from uuid import uuid4

from openpyxl import load_workbook
from pypdf import PdfReader
from sqlalchemy import select

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.tratamiento import Tratamiento
from app.models.auditoria import Auditoria
from app.services.reportes import COLUMNAS
from app.services.exportacion_reportes import generar_archivo
import test_auditoria_filtros as audit
from test_cookie_sessions import call


class ReportesTests(unittest.TestCase):
    restore_overrides = audit.AuditoriaFiltrosTests.restore_overrides
    login = audit.AuditoriaFiltrosTests.login

    def setUp(self):
        audit.AuditoriaFiltrosTests.setUp(self)
        for modelo in [Apiario, Colmena, Inspeccion, Tratamiento]:
            modelo.__table__.create(self.engine)
        self.db.add_all([Apiario(id=1, nombre="Mandinga"), Apiario(id=2, nombre="Popeta")])
        self.db.flush()
        for id_, estado, activo in [(1, "ACTIVA", True), (2, "ACTIVA", True),
                                    (3, "INACTIVA", True), (4, "ACTIVA", False),
                                    (10, "EN_OBSERVACION", True)]:
            self.db.add(Colmena(id=id_, codigo=f"COL-{id_}", codigo_qr=uuid4(),
                                apiario_id=2 if id_ == 2 else 1, estado=estado, activo=activo))
        self.db.flush()
        for id_, colmena, fecha, estado, activo in [
            (1, 1, "2026-11-17T02:59:59+00:00", "COMPLETA", True),
            (2, 1, "2026-11-17T03:00:00+00:00", "DEBIL", True),
            (3, 1, "2026-11-18T02:59:59.999999+00:00", "DONANTE", True),
            (4, 1, "2026-11-18T03:00:00+00:00", "COMPLETA", False),
            (5, 2, "2026-11-17T12:00:00+00:00", "DEBIL", True),
            (6, 4, "2026-11-17T12:00:00+00:00", "DEBIL", True),
        ]:
            self.db.add(Inspeccion(id=id_, colmena_id=colmena, usuario_id=self.user.id,
                fecha_inspeccion=datetime.fromisoformat(fecha), estado_general=estado,
                activo=activo, cantidad_marcos=8, tiene_alza=True, signos_enfermedad=True,
                enfermedad_observada="Varroa", observaciones="Árbol, revisión\nsegunda línea"))
        self.db.add_all([
            Tratamiento(id=1, colmena_id=1, usuario_id=self.user.id, tipo_tratamiento="CONTROL_SANITARIO",
                        fecha_inicio=date(2026, 11, 17), estado="EN_CURSO", producto="Producto", dosis="2 tiras"),
            Tratamiento(id=2, colmena_id=1, usuario_id=self.user.id, tipo_tratamiento="CONTROL_SANITARIO",
                        fecha_inicio=date(2026, 11, 16), fecha_fin=date(2026, 11, 17), estado="FINALIZADO"),
        ])
        self.db.commit()

    def descargar(self, tipo="inspecciones", formato="csv", filtros="", cookie=None, **kwargs):
        return asyncio.run(audit.descargar(f"/reportes/{tipo}?formato={formato}{filtros}", cookie, **kwargs))

    def filas(self, tipo="inspecciones", filtros="", cookie=None):
        status, body, _ = self.descargar(tipo, filtros=filtros, cookie=cookie)
        self.assertEqual(status, 200, body)
        return list(csv.reader(StringIO(body.decode("utf-8-sig"))))

    def eventos(self):
        return self.db.scalars(select(Auditoria).where(Auditoria.entidad == "REPORTE")).all()

    def test_tres_formatos_por_tipo_headers_y_auditoria(self):
        cookie = self.login()
        for tipo in COLUMNAS:
            for formato in ["pdf", "xlsx", "csv"]:
                with self.subTest(tipo=tipo, formato=formato):
                    status, body, headers = self.descargar(tipo, formato, cookie=cookie,
                                                         origin="http://localhost:5173")
                    self.assertEqual(status, 200, body)
                    self.assertEqual(headers["content-disposition"], f'attachment; filename="reporte-{tipo}.{formato}"')
                    self.assertEqual(headers["cache-control"], "no-store")
                    self.assertIn("Content-Disposition", headers["access-control-expose-headers"])
                    if formato == "pdf":
                        self.assertTrue(headers["content-type"].startswith("application/pdf"))
                        contenido = "\n".join(p.extract_text() for p in PdfReader(BytesIO(body)).pages)
                        self.assertIn("Colmena", contenido)
                        self.assertIn("COL-1", contenido)
                    elif formato == "xlsx":
                        self.assertIn("spreadsheetml", headers["content-type"])
                        hoja = load_workbook(BytesIO(body)).active
                        self.assertEqual([c.value for c in hoja[1]], COLUMNAS[tipo])
                        contenido = str(list(hoja.values))
                    else:
                        self.assertIn("text/csv", headers["content-type"])
                        contenido = body.decode("utf-8-sig")
                        self.assertEqual(next(csv.reader(StringIO(contenido))), COLUMNAS[tipo])
                    self.assertNotIn(self.user.email, contenido)
                    self.assertNotIn(self.user.password_hash, contenido)
        eventos = self.eventos()
        self.assertEqual(len(eventos), 9)
        self.assertTrue(all(e.usuario_id == self.user.id and e.datos_nuevos["evento"] == "DESCARGA" for e in eventos))
        self.assertNotIn(self.user.email, json.dumps([e.datos_nuevos for e in eventos]))

    def test_inspecciones_filtros_fecha_chile_y_bajas(self):
        cookie = self.login()
        filtros = "&desde=2026-11-17&hasta=2026-11-17&apiario_id=1&colmena_id=1"
        filas = self.filas(filtros=filtros, cookie=cookie)
        self.assertEqual(len(filas), 3)
        self.assertEqual([f[3] for f in filas[1:]], ["Donante", "Débil"])
        self.assertEqual(filas[1][0], "17-11-2026")
        self.assertEqual(filas[1][4:7], ["Sí: Varroa", "8", "Sí"])
        self.assertEqual(len(self.filas(filtros=filtros + "&estado=DEBIL", cookie=cookie)), 2)
        self.assertEqual(len(self.filas(filtros="&apiario_id=1&colmena_id=2", cookie=cookie)), 1)
        self.assertNotIn("COL-4", str(self.filas(cookie=cookie)))

    def test_tratamientos_periodo_inicio_y_estado(self):
        cookie = self.login()
        filas = self.filas("tratamientos", "&desde=2026-11-17&hasta=2026-11-17&estado=EN_CURSO", cookie)
        self.assertEqual(len(filas), 2)
        self.assertEqual(filas[1][:8], ["17-11-2026", "—", "COL-1", "Mandinga", "Control sanitario",
                                     "Producto", "2 tiras", "En curso"])

    def test_colmenas_ultima_activa_sin_periodo_orden_y_sin_inspeccion(self):
        cookie = self.login()
        filas = self.filas("colmenas", "&desde=2000-01-01&hasta=2000-01-02", cookie)
        self.assertEqual([f[0] for f in filas[1:]], ["COL-1", "COL-2", "COL-10"])
        self.assertEqual(filas[1][4], "Donante")
        self.assertEqual(filas[1][6], "1")
        self.assertEqual(self.filas("colmenas", "&estado=SIN", cookie)[1][0], "COL-10")
        self.assertEqual(self.filas("colmenas", "&estado=DONANTE", cookie)[1][0], "COL-1")

    def test_autenticacion_autorizacion_cookie_y_bearer(self):
        with patch("app.routers.reportes.reportes.armar_reporte") as servicio:
            for formato in ["pdf", "xlsx", "csv"]:
                self.assertEqual(self.descargar(formato=formato)[0], 401)
                cookie = self.login("APICULTOR")
                self.assertEqual(self.descargar(formato=formato, cookie=cookie)[0], 403)
            servicio.assert_not_called()
        self.login()
        status, body, _ = asyncio.run(call("/auth/token", {"email": self.user.email, "password": self.old_password}))
        self.assertEqual(status, 200)
        self.assertEqual(self.descargar(bearer=body["access_token"])[0], 200)

    def test_filtros_invalidos_no_generan_archivo_ni_evento(self):
        cookie = self.login()
        for tipo, formato, filtros in [("otro", "csv", ""), ("inspecciones", "exe", ""),
            ("inspecciones", "csv", "&estado=SIN"), ("tratamientos", "csv", "&estado=DEBIL"),
            ("colmenas", "csv", "&estado=ACTIVA"), ("inspecciones", "csv", "&apiario_id=0"),
            ("inspecciones", "csv", "&colmena_id=-1"), ("inspecciones", "csv", "&desde=no"),
            ("inspecciones", "csv", "&desde=2026-11-18&hasta=2026-11-17")]:
            with self.subTest(tipo=tipo, formato=formato, filtros=filtros):
                self.assertEqual(self.descargar(tipo, formato, filtros, cookie)[0], 422)
        self.assertEqual(self.eventos(), [])

    def test_reportes_vacios_validos(self):
        cookie = self.login()
        for formato in ["csv", "xlsx", "pdf"]:
            status, body, _ = self.descargar(formato=formato, filtros="&apiario_id=999", cookie=cookie)
            self.assertEqual(status, 200)
            self.assertTrue(body)
        self.assertTrue(all(e.datos_nuevos["filas"] == 0 for e in self.eventos()))

    def test_formulas_y_caracteres_especiales(self):
        filas = [["=HYPERLINK(\"https://example.invalid\")", "\t+1", "<b>Árbol & miel</b>\x00"]]
        csv_data = generar_archivo("csv", "Prueba", ["A", "B", "C"], filas).decode("utf-8-sig")
        datos = list(csv.reader(StringIO(csv_data)))[1]
        self.assertTrue(datos[0].startswith("'="))
        self.assertTrue(datos[1].startswith("'\t"))
        hoja = load_workbook(BytesIO(generar_archivo("xlsx", "Prueba", ["A", "B", "C"], filas))).active
        self.assertEqual(hoja["A2"].data_type, "s")
        self.assertEqual(hoja["A2"].value, filas[0][0])
        pdf = PdfReader(BytesIO(generar_archivo("pdf", "Prueba", ["A", "B", "C"], filas)))
        self.assertIn("<b>Árbol & miel</b>", pdf.pages[0].extract_text())

    def test_pdf_multipagina_y_observacion_larga(self):
        filas = [["COL-1", "Observación larga " * 800], *[[f"COL-{i}", "Miel"] for i in range(100)]]
        pdf = PdfReader(BytesIO(generar_archivo("pdf", "Prueba", ["Colmena", "Observaciones"], filas)))
        self.assertGreater(len(pdf.pages), 1)
        self.assertTrue(all("Colmena" in p.extract_text() for p in pdf.pages))
        self.assertIn("COL-99", pdf.pages[-1].extract_text())

    def test_fallo_generacion_o_auditoria_no_registra_descarga(self):
        cookie = self.login()
        with patch("app.routers.reportes.generar_archivo", side_effect=RuntimeError("fallo controlado")):
            with self.assertRaises(RuntimeError):
                self.descargar(cookie=cookie)
        self.assertEqual(self.eventos(), [])
        with patch.object(self.db, "commit", side_effect=RuntimeError("fallo controlado")):
            with self.assertRaises(RuntimeError):
                self.descargar(cookie=cookie)
        self.assertEqual(self.eventos(), [])
