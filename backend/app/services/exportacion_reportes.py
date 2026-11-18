"""Generación en memoria: nunca interpreta fórmulas ni HTML del usuario."""
import csv
from io import BytesIO, StringIO
import re
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle

MIME = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv; charset=utf-8"}


def texto_seguro(valor):
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(valor))


def generar_archivo(formato, titulo, columnas, filas):
    if formato == "csv":
        salida = StringIO(newline="")
        escritor = csv.writer(salida)
        for fila in [columnas, *filas]:
            valores = []
            for valor in fila:
                texto = texto_seguro(valor)
                if isinstance(valor, str) and (texto.lstrip().startswith(("=", "+", "-", "@"))
                                               or texto.startswith(("\t", "\r", "\n"))):
                    texto = "'" + texto
                valores.append(texto)
            escritor.writerow(valores)
        return salida.getvalue().encode("utf-8-sig")
    salida = BytesIO()
    if formato == "xlsx":
        libro = Workbook()
        hoja = libro.active
        hoja.title = "Reporte"
        for fila in [columnas, *filas]:
            hoja.append([texto_seguro(v) if isinstance(v, str) else v for v in fila])
            for celda in hoja[hoja.max_row]:
                if isinstance(celda.value, str):
                    celda.data_type = "s"
                celda.alignment = Alignment(vertical="top", wrap_text=True)
        for celda in hoja[1]:
            celda.font = Font(bold=True, color="FFFFFF")
            celda.fill = PatternFill("solid", fgColor="245548")
            hoja.column_dimensions[celda.column_letter].width = 24
        hoja.freeze_panes = "A2"
        hoja.auto_filter.ref = hoja.dimensions
        libro.save(salida)
        return salida.getvalue()
    estilo = ParagraphStyle("celda", fontName="Helvetica", fontSize=8, leading=10,
                            splitLongWords=True)
    encabezado = ParagraphStyle("titulo", fontName="Helvetica-Bold", fontSize=16, leading=20)
    documento = SimpleDocTemplate(salida, pagesize=landscape(A4), leftMargin=24,
                                 rightMargin=24, topMargin=24, bottomMargin=30, title=titulo)
    celdas = [[Paragraph(escape(texto_seguro(v)).replace("\n", "<br/>"), estilo)
               for v in fila] for fila in [columnas, *filas]]
    tabla = LongTable(celdas, colWidths=[documento.width / len(columnas)] * len(columnas),
                      repeatRows=1, splitInRow=1)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DBE9E2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), .3, colors.lightgrey),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    def pie(canvas, doc):
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(doc.pagesize[0] - 24, 15, f"Página {doc.page}")
    documento.build([Paragraph(escape(titulo), encabezado), Spacer(1, 12), tabla],
                    onFirstPage=pie, onLaterPages=pie)
    return salida.getvalue()
